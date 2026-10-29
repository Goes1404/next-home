// Fase A do financeiro (0232), medida no banco local (`npm run db:teste`).
//
// O que só o gestor faz (parcela recebida, distrato, "recebe direto") tem de
// ser recusado pelo BANCO, não só pela tela: a regressão seria calada. E
// `salvar_venda` não pode apagar recebimento nem desfazer a marcação do
// gestor quando o corretor reenvia o formulário.
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  criarUsuario,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
  type GrupoDeTeste,
} from "@/lib/grupos/apoioDoBanco";

type ParcelaDeTeste = { numero: number; valor: number; vence_em?: string | null; recebida_em?: string | null };

/** Venda gravada como `postgres` (fora da RLS): o cenário, não o que se testa. */
async function novaVenda(
  sql: Conexao,
  g: GrupoDeTeste,
  p: { comissao?: number; repasse?: number; parcelas?: ParcelaDeTeste[] } = {},
): Promise<{ vendaId: string; parcelaIds: string[] }> {
  const comissao = p.comissao ?? 10000;
  const [{ id: vendaId }] = await sql<{ id: string }[]>`
    insert into public.vendas (corretor_id, imovel_descricao, data_venda, valor_venda, comissao_valor)
    values (${g.corretorId}, 'Dom Parque', '2026-10-01', 400000, ${comissao})
    returning id
  `;
  await sql`
    insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_valor)
    values (${vendaId}, ${g.corretorId}, 100, ${p.repasse ?? 4000})
  `;
  const parcelas = p.parcelas ?? [{ numero: 1, valor: comissao }];
  const parcelaIds: string[] = [];
  for (const pc of parcelas) {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into public.venda_parcelas (venda_id, numero, valor, vence_em, recebida_em)
      values (${vendaId}, ${pc.numero}, ${pc.valor}, ${pc.vence_em ?? null}, ${pc.recebida_em ?? null})
      returning id
    `;
    parcelaIds.push(id);
  }
  return { vendaId, parcelaIds };
}

/** A mensagem do erro (as funções levantam códigos como 'so_gestor'), ou null. */
async function erroDe(f: () => Promise<unknown>): Promise<string | null> {
  try {
    await f();
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return err.code === "42501" ? "sem_permissao" : (err.message ?? "erro");
  }
}

const dados = (comissao: number) => ({
  imovel_descricao: "Dom Parque",
  data_venda: "2026-10-01",
  valor_venda: 400000,
  comissao_valor: comissao,
});

describe.skipIf(!process.env.DB_TESTE_URL)("financeiro Fase A (0232)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("distrato: corretor é recusado; gestor distrata e cancela as parcelas abertas", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-distrato" });
      const { vendaId } = await novaVenda(tx, g, {
        parcelas: [
          { numero: 1, valor: 5000, recebida_em: "2026-10-05" },
          { numero: 2, valor: 5000, vence_em: "2026-11-05" },
        ],
      });

      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) => eu`select public.distratar_venda(${vendaId}, '2026-10-20', 'cliente desistiu', 'cancelar')`),
        ),
      ).toBe("so_gestor");

      await comoUsuario(tx, g.gestorUserId, async (eu) => {
        const [{ ok }] = await eu<{ ok: boolean }[]>`
          select public.distratar_venda(${vendaId}, '2026-10-20', 'cliente desistiu', 'cancelar') as ok`;
        expect(ok).toBe(true);
        const ps = await eu<{ numero: number; recebida_em: string | null; cancelada_em: string | null }[]>`
          select numero, recebida_em::text, cancelada_em::text from public.venda_parcelas where venda_id = ${vendaId} order by numero`;
        expect(ps).toEqual([
          { numero: 1, recebida_em: "2026-10-05", cancelada_em: null },
          { numero: 2, recebida_em: null, cancelada_em: "2026-10-20" },
        ]);
      });
    }));

  it("distrato exige motivo", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-motivo" });
      const { vendaId } = await novaVenda(tx, g);
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.gestorUserId, (eu) => eu`select public.distratar_venda(${vendaId}, '2026-10-20', '  ', 'manter')`),
        ),
      ).toBe("distrato_sem_motivo");
    }));

  it("desfazer o distrato reabre só as parcelas que ele cancelou", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-desfazer" });
      const { vendaId } = await novaVenda(tx, g, { parcelas: [{ numero: 1, valor: 10000, vence_em: "2026-11-05" }] });
      await comoUsuario(tx, g.gestorUserId, async (eu) => {
        await eu`select public.distratar_venda(${vendaId}, '2026-10-20', 'cliente desistiu', 'cancelar')`;
        await eu`select public.desfazer_distrato(${vendaId})`;
        const [v] = await eu<{ status: string; distrato_motivo: string | null }[]>`
          select status, distrato_motivo from public.vendas where id = ${vendaId}`;
        expect(v).toEqual({ status: "ativa", distrato_motivo: null });
        const [p] = await eu<{ cancelada_em: string | null }[]>`select cancelada_em from public.venda_parcelas where venda_id = ${vendaId}`;
        expect(p.cancelada_em).toBeNull();
      });
    }));

  it("corretor não marca parcela recebida nem pela API; o gestor marca", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-recebida" });
      const { parcelaIds } = await novaVenda(tx, g);
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) => eu`update public.venda_parcelas set recebida_em = '2026-10-10' where id = ${parcelaIds[0]}`),
        ),
      ).toBe("sem_permissao");
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) => eu`select public.marcar_parcela_recebida(${parcelaIds[0]}, '2026-10-10')`),
        ),
      ).toBe("so_gestor");
      await comoUsuario(tx, g.gestorUserId, async (eu) => {
        const [{ ok }] = await eu<{ ok: boolean }[]>`select public.marcar_parcela_recebida(${parcelaIds[0]}, '2026-10-10') as ok`;
        expect(ok).toBe(true);
      });
    }));

  it("parcela cancelada pelo distrato não recebe", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-cancelada" });
      const { vendaId, parcelaIds } = await novaVenda(tx, g);
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.gestorUserId, async (eu) => {
            await eu`select public.distratar_venda(${vendaId}, '2026-10-20', 'cliente desistiu', 'cancelar')`;
            await eu`select public.marcar_parcela_recebida(${parcelaIds[0]}, '2026-10-21')`;
          }),
        ),
      ).toBe("parcela_cancelada");
    }));

  it("recebe direto: corretor é recusado; gestor marca", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-direto" });
      const participantes = (forma?: string) => [
        { corretor_id: g.corretorId, parte_percentual: 100, repasse_valor: 4000, ...(forma ? { forma_recebimento: forma } : {}) },
      ];
      const parcelas = [{ numero: 1, valor: 6000 }];
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) =>
            eu`select public.salvar_venda(null, ${eu.json(dados(10000))}, ${eu.json(participantes("direto"))}, ${eu.json(parcelas)})`,
          ),
        ),
      ).toBe("so_gestor");

      // Gestor registra uma venda dele com o corretor recebendo direto.
      await comoUsuario(tx, g.gestorUserId, async (eu) => {
        const [{ id }] = await eu<{ id: string }[]>`
          select public.salvar_venda(null, ${eu.json(dados(10000))}, ${eu.json(participantes("direto"))}, ${eu.json(parcelas)}) as id`;
        const [p] = await eu<{ forma_recebimento: string }[]>`
          select forma_recebimento from public.venda_participantes where venda_id = ${id}`;
        expect(p.forma_recebimento).toBe("direto");
      });
    }));

  // Review Focus 3.
  it("corretor reenvia o formulário sem a forma: a marcação do gestor fica", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-reenvio" });
      const { vendaId } = await novaVenda(tx, g, { parcelas: [{ numero: 1, valor: 6000 }] });
      await tx`update public.venda_participantes set forma_recebimento = 'direto' where venda_id = ${vendaId}`;

      await comoUsuario(tx, g.corretorUserId, async (eu) => {
        await eu`select public.salvar_venda(
          ${vendaId},
          ${eu.json(dados(10000))},
          ${eu.json([{ corretor_id: g.corretorId, parte_percentual: 100, repasse_valor: 4000 }])},
          ${eu.json([{ numero: 1, valor: 6000 }])}
        )`;
        const [p] = await eu<{ forma_recebimento: string }[]>`
          select forma_recebimento from public.venda_participantes where venda_id = ${vendaId}`;
        expect(p.forma_recebimento).toBe("direto");
      });
    }));

  // Revisão de segurança: apagar e reinserir a linha trazia o `repasse`
  // padrão de volta, e a imobiliária passaria a dever o que o corretor já
  // recebe direto do pagador.
  it("corretor não apaga participante marcado direto, nem pela API nem pelo salvar_venda", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-apaga-direto" });
      const { vendaId } = await novaVenda(tx, g, { parcelas: [{ numero: 1, valor: 6000 }] });
      await tx`update public.venda_participantes set forma_recebimento = 'direto' where venda_id = ${vendaId}`;
      const outroUser = await criarUsuario(tx, "outro@fa-apaga-direto.teste");
      const [{ id: outroId }] = await tx<{ id: string }[]>`
        insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
        values ('Outro', 'TESTE-fa-apaga-outro', '5511900000002', 'fa-apaga-direto-outro', 'corretor', ${outroUser}, ${g.grupoId})
        returning id
      `;

      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) => eu`delete from public.venda_participantes where venda_id = ${vendaId}`),
        ),
      ).toBe("so_gestor");
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) =>
            eu`select public.salvar_venda(
              ${vendaId},
              ${eu.json(dados(10000))},
              ${eu.json([{ corretor_id: outroId, parte_percentual: 100, repasse_valor: 4000 }])},
              ${eu.json([{ numero: 1, valor: 10000 }])}
            )`,
          ),
        ),
      ).toBe("so_gestor");
    }));

  it("o registrador ainda exclui a venda inteira (a divisão vai junto)", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-exclui" });
      const { vendaId } = await novaVenda(tx, g, { parcelas: [{ numero: 1, valor: 6000 }] });
      await tx`update public.venda_participantes set forma_recebimento = 'direto' where venda_id = ${vendaId}`;
      await comoUsuario(tx, g.corretorUserId, async (eu) => {
        await eu`delete from public.vendas where id = ${vendaId}`;
        const [{ n }] = await eu<{ n: number }[]>`select count(*)::int as n from public.vendas where id = ${vendaId}`;
        expect(n).toBe(0);
      });
    }));

  it("parcelas que não somam o que a imobiliária recebe são recusadas", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-soma" });
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.corretorUserId, (eu) =>
            eu`select public.salvar_venda(
              null,
              ${eu.json(dados(10000))},
              ${eu.json([{ corretor_id: g.corretorId, parte_percentual: 100, repasse_valor: 4000 }])},
              ${eu.json([{ numero: 1, valor: 5000 }, { numero: 2, valor: 4999.98 }])}
            )`,
          ),
        ),
      ).toBe("parcelas_nao_somam");
    }));

  // Review Focus 2.
  it("gestor mudando parcelas de venda com parcela recebida é recusado, e o recebimento fica", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-congela" });
      const { vendaId } = await novaVenda(tx, g, {
        parcelas: [
          { numero: 1, valor: 5000, recebida_em: "2026-10-05" },
          { numero: 2, valor: 5000 },
        ],
      });
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.gestorUserId, (eu) =>
            eu`select public.salvar_venda(
              ${vendaId},
              ${eu.json(dados(10000))},
              ${eu.json([{ corretor_id: g.corretorId, parte_percentual: 100, repasse_valor: 4000 }])},
              ${eu.json([{ numero: 1, valor: 10000 }])}
            )`,
          ),
        ),
      ).toBe("parcela_ja_recebida");
      const [p] = await tx<{ recebida_em: string }[]>`
        select recebida_em::text from public.venda_parcelas where venda_id = ${vendaId} and numero = 1`;
      expect(p.recebida_em).toBe("2026-10-05");
    }));

  it("trocar as parcelas de venda com parcela cancelada pelo distrato é recusado", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-cancelada-troca" });
      const { vendaId } = await novaVenda(tx, g, { parcelas: [{ numero: 1, valor: 10000, vence_em: "2026-11-05" }] });
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.gestorUserId, async (eu) => {
            await eu`select public.distratar_venda(${vendaId}, '2026-10-20', 'cliente desistiu', 'cancelar')`;
            await eu`select public.salvar_venda(
              ${vendaId},
              ${eu.json(dados(10000))},
              ${eu.json([{ corretor_id: g.corretorId, parte_percentual: 100, repasse_valor: 4000 }])},
              ${eu.json([{ numero: 1, valor: 5000 }, { numero: 2, valor: 5000 }])}
            )`;
          }),
        ),
      ).toBe("parcela_cancelada");
    }));

  it("gestor edita a venda sem mexer nas parcelas: passa, mesmo com parcela recebida", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-edita" });
      const { vendaId } = await novaVenda(tx, g, {
        parcelas: [
          { numero: 1, valor: 5000, recebida_em: "2026-10-05" },
          { numero: 2, valor: 5000 },
        ],
      });
      await comoUsuario(tx, g.gestorUserId, async (eu) => {
        await eu`select public.salvar_venda(
          ${vendaId},
          ${eu.json({ ...dados(10000), observacao: "corrigido" })},
          ${eu.json([{ corretor_id: g.corretorId, parte_percentual: 100, repasse_valor: 4000 }])},
          ${eu.json([{ numero: 1, valor: 5000 }, { numero: 2, valor: 5000 }])}
        )`;
        const [p] = await eu<{ recebida_em: string }[]>`
          select recebida_em::text from public.venda_parcelas where venda_id = ${vendaId} and numero = 1`;
        expect(p.recebida_em).toBe("2026-10-05");
      });
    }));

  it("avisar distrato: quem participa avisa; corretor de fora não", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-aviso" });
      const { vendaId } = await novaVenda(tx, g);
      const outroUser = await criarUsuario(tx, "outro@fa-aviso.teste");
      await tx`
        insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
        values ('Outro', 'TESTE-fa-aviso-outro', '5511900000001', 'fa-aviso-outro', 'corretor', ${outroUser}, ${g.grupoId})
      `;
      const [{ ok: deFora }] = await comoUsuario(tx, outroUser, (eu) =>
        eu<{ ok: boolean }[]>`select public.avisar_distrato(${vendaId}, 'soube pelo cliente') as ok`,
      );
      expect(deFora).toBe(false);
      await comoUsuario(tx, g.corretorUserId, async (eu) => {
        const [{ ok }] = await eu<{ ok: boolean }[]>`select public.avisar_distrato(${vendaId}, 'cliente desistiu') as ok`;
        expect(ok).toBe(true);
        const [v] = await eu<{ aviso: string | null; avisado: boolean }[]>`
          select distrato_aviso as aviso, distrato_avisado_em is not null as avisado from public.vendas where id = ${vendaId}`;
        expect(v).toEqual({ aviso: "cliente desistiu", avisado: true });
      });
    }));

  it("parâmetros fiscais: todo logado lê, ninguém escreve", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "fa-param" });
      await comoUsuario(tx, g.gestorUserId, async (eu) => {
        const [{ teto }] = await eu<{ teto: string }[]>`
          select valor::text as teto from public.parametros_fiscais where chave = 'inss_teto' and vigente_desde = '2026-01-01'`;
        expect(Number(teto)).toBe(8475.55);
      });
      expect(
        await erroDe(() =>
          comoUsuario(tx, g.gestorUserId, (eu) =>
            eu`insert into public.parametros_fiscais (chave, vigente_desde, valor, fonte) values ('inss_teto', '2027-01-01', '9999', 'x')`,
          ),
        ),
      ).toBe("sem_permissao");
    }));
});
