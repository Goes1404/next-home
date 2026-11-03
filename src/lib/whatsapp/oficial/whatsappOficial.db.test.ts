// A API oficial no banco (0254), medida no banco local (`npm run db:teste`).
//
// O que precisa ser verdade NO BANCO, e não só no código:
//   1. uma lista não aponta para o número ou o modelo oficial de outro grupo,
//      nem por uma chamada direta à API com a sessão do corretor (a coluna é
//      gravável pela RLS do dono da lista);
//   2. o canal é coerente: lista oficial tem número e modelo; lista do
//      WhatsApp do corretor não tem nenhum dos dois;
//   3. as tabelas novas são só do servidor: o logado não lê conversa nem o
//      token do número (o gestor nunca lê conversa, 0134);
//   4. o consentimento de marketing no WhatsApp entra na preferência e no
//      histórico juntos, e só a chave de serviço o grava;
//   5. a mensagem da lista oficial não come a cota de mensagens do plano
//      (0214): quem paga essa é a imobiliária, à Meta.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
} from "@/lib/grupos/apoioDoBanco";

async function recusa(tx: TransactionSql, fn: (t: TransactionSql) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (erro) {
    return (erro as Error).message;
  }
}

function comoServico<T>(tx: Conexao, fn: (s: TransactionSql) => Promise<T>): Promise<T> {
  return (tx as TransactionSql).savepoint(async (s) => {
    await s`set local role service_role`;
    await s`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
    return fn(s);
  }) as Promise<T>;
}

async function numeroOficial(tx: Conexao, grupoId: string, sufixo: string) {
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.whatsapp_numeros_oficiais (grupo_id, waba_id, phone_number_id, numero)
    values (${grupoId}, ${`waba-${sufixo}`}, ${`pnid-${sufixo}`}, '5511900000000')
    returning id
  `;
  return id;
}

async function modeloAprovado(tx: Conexao, grupoId: string, numeroId: string, nome: string) {
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.whatsapp_modelos_oficiais (grupo_id, numero_oficial_id, nome, corpo, estado)
    values (${grupoId}, ${numeroId}, ${nome}, 'Oi {{nome}}, tudo bem?', 'aprovado')
    returning id
  `;
  return id;
}

describe.skipIf(!process.env.DB_TESTE_URL)("API oficial da Meta no banco (0254)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("a lista do corretor nasce no canal do WhatsApp dele, sem número oficial", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-padrao" });
      await comoUsuario(tx, a.corretorUserId, async (u) => {
        const [lista] = await u<{ canal: string; numero_oficial_id: string | null }[]>`
          insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base, status)
          values (${a.corretorId}, 'Lista comum', 'Oi', 'em_andamento')
          returning canal, numero_oficial_id
        `;
        expect(lista.canal).toBe("evolution");
        expect(lista.numero_oficial_id).toBeNull();
      });
    });
  });

  it("a lista oficial aponta para o número e o modelo DO PRÓPRIO grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-a" });
      const b = await criarGrupo(tx, { slug: "oficial-b" });
      const numeroA = await numeroOficial(tx, a.grupoId, "a");
      const modeloA = await modeloAprovado(tx, a.grupoId, numeroA, "boas_vindas_a");
      const numeroB = await numeroOficial(tx, b.grupoId, "b");
      const modeloB = await modeloAprovado(tx, b.grupoId, numeroB, "boas_vindas_b");

      await comoUsuario(tx, a.corretorUserId, async (u) => {
        const [lista] = await u<{ canal: string }[]>`
          insert into public.whatsapp_campanhas
            (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id, modelo_oficial_id)
          values (${a.corretorId}, 'Oficial', 'Oi', 'em_andamento', 'oficial', ${numeroA}, ${modeloA})
          returning canal
        `;
        expect(lista.canal).toBe("oficial");
      });

      // O corretor de A, pela API, tentando o número (e o modelo) de B.
      const numeroAlheio = await recusa(tx, (t) =>
        comoUsuario(t, a.corretorUserId, (u) => u`
          insert into public.whatsapp_campanhas
            (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id, modelo_oficial_id)
          values (${a.corretorId}, 'Forjada', 'Oi', 'em_andamento', 'oficial', ${numeroB}, ${modeloB})
        `),
      );
      expect(numeroAlheio).toMatch(/grupo da linha difere|row-level security/);

      // E trocando depois, numa lista que já existe.
      const [{ id: listaA }] = await tx<{ id: string }[]>`
        insert into public.whatsapp_campanhas
          (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id, modelo_oficial_id)
        values (${a.corretorId}, 'Oficial 2', 'Oi', 'em_andamento', 'oficial', ${numeroA}, ${modeloA})
        returning id
      `;
      const trocaDeModelo = await recusa(tx, (t) =>
        comoUsuario(t, a.corretorUserId, (u) => u`
          update public.whatsapp_campanhas set modelo_oficial_id = ${modeloB} where id = ${listaA}
        `),
      );
      expect(trocaDeModelo).toMatch(/grupo da linha difere|row-level security/);
    });
  });

  it("o canal é coerente: oficial tem número e modelo; o do corretor não tem nenhum", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-canal" });
      const numeroA = await numeroOficial(tx, a.grupoId, "canal");
      const modeloA = await modeloAprovado(tx, a.grupoId, numeroA, "canal_a");

      const oficialSemModelo = await recusa(tx, (t) => t`
        insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id)
        values (${a.corretorId}, 'Sem modelo', 'Oi', 'em_andamento', 'oficial', ${numeroA})
      `);
      expect(oficialSemModelo).toMatch(/whatsapp_campanhas_canal_valido/);

      // Rascunho oficial pode ficar sem modelo (ainda está sendo escrito).
      await tx`
        insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id)
        values (${a.corretorId}, 'Rascunho', 'Oi', 'rascunho', 'oficial', ${numeroA})
      `;

      const comumComNumero = await recusa(tx, (t) => t`
        insert into public.whatsapp_campanhas
          (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id, modelo_oficial_id)
        values (${a.corretorId}, 'Mista', 'Oi', 'em_andamento', 'evolution', ${numeroA}, ${modeloA})
      `);
      expect(comumComNumero).toMatch(/whatsapp_campanhas_canal_valido/);

      const canalInventado = await recusa(tx, (t) => t`
        insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base, status, canal)
        values (${a.corretorId}, 'Outro', 'Oi', 'em_andamento', 'sms')
      `);
      expect(canalInventado).toMatch(/whatsapp_campanhas_canal_valido/);
    });
  });

  it("as tabelas do número oficial são só do servidor: nem o gestor lê", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-leitura" });
      const numeroA = await numeroOficial(tx, a.grupoId, "leitura");
      const [{ id: conversa }] = await tx<{ id: string }[]>`
        insert into public.whatsapp_oficial_conversas (grupo_id, numero_oficial_id, telefone)
        values (${a.grupoId}, ${numeroA}, '5511988887777')
        returning id
      `;
      await tx`
        insert into public.whatsapp_oficial_mensagens (grupo_id, conversa_id, remetente, conteudo)
        values (${a.grupoId}, ${conversa}, 'cliente', 'oi')
      `;

      for (const tabela of [
        "whatsapp_numeros_oficiais",
        "whatsapp_modelos_oficiais",
        "whatsapp_oficial_conversas",
        "whatsapp_oficial_mensagens",
        "whatsapp_oficial_eventos",
      ]) {
        for (const userId of [a.gestorUserId, a.corretorUserId]) {
          const leitura = await recusa(tx, (t) =>
            comoUsuario(t, userId, (u) => u`select * from ${u(`public.${tabela}`)} limit 1`),
          );
          expect(leitura, tabela).toMatch(/permission denied/);
        }
      }
    });
  });

  it("a mensagem não muda de grupo pela conversa: a conversa é a mãe", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-msg-a" });
      const b = await criarGrupo(tx, { slug: "oficial-msg-b" });
      const numeroA = await numeroOficial(tx, a.grupoId, "msg-a");
      const [{ id: conversaA }] = await tx<{ id: string }[]>`
        insert into public.whatsapp_oficial_conversas (grupo_id, numero_oficial_id, telefone)
        values (${a.grupoId}, ${numeroA}, '5511977776666')
        returning id
      `;
      const outroGrupo = await recusa(tx, (t) => t`
        insert into public.whatsapp_oficial_mensagens (grupo_id, conversa_id, remetente, conteudo)
        values (${b.grupoId}, ${conversaA}, 'cliente', 'oi')
      `);
      expect(outroGrupo).toMatch(/grupo da linha difere/);

      // Sem dizer o grupo, ele vem da conversa.
      const [msg] = await tx<{ grupo_id: string }[]>`
        insert into public.whatsapp_oficial_mensagens (conversa_id, remetente, conteudo)
        values (${conversaA}, 'cliente', 'oi')
        returning grupo_id
      `;
      expect(msg.grupo_id).toBe(a.grupoId);
    });
  });

  it("um número ativo por grupo; o desligado não conta", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-unico" });
      const primeiro = await numeroOficial(tx, a.grupoId, "unico-1");
      const segundo = await recusa(tx, (t) => numeroOficial(t, a.grupoId, "unico-2"));
      expect(segundo).toMatch(/whatsapp_numeros_oficiais_um_por_grupo/);

      await tx`update public.whatsapp_numeros_oficiais set estado = 'desligado' where id = ${primeiro}`;
      await numeroOficial(tx, a.grupoId, "unico-3");
    });
  });

  it("consentimento de marketing no WhatsApp: preferência e histórico juntos, só pela chave de serviço", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-consentimento" });
      const [{ id: lead }] = await tx<{ id: string }[]>`
        insert into public.leads (nome, telefone, corretor_id)
        values ('Carla', '11988887777', ${a.corretorId})
        returning id
      `;

      const peloCorretor = await recusa(tx, (t) =>
        comoUsuario(t, a.corretorUserId, (u) => u`
          select public.registrar_consentimento_marketing_whatsapp(${lead}, true, 'painel_corretor')
        `),
      );
      expect(peloCorretor).toMatch(/permission denied/);

      await comoServico(tx, async (s) => {
        await s`select public.registrar_consentimento_marketing_whatsapp(${lead}, true, 'formulario_site')`;
        await s`select public.registrar_consentimento_marketing_whatsapp(${lead}, false, 'botao_parar')`;
      });

      const [preferencia] = await tx<{ permitido: boolean; grupo_id: string }[]>`
        select permitido, grupo_id from public.marketing_preferencias
         where lead_id = ${lead} and finalidade = 'marketing' and canal = 'whatsapp'
      `;
      expect(preferencia.permitido).toBe(false);
      expect(preferencia.grupo_id).toBe(a.grupoId);

      const historico = await tx<{ estado: string; origem: string }[]>`
        select estado, origem from public.marketing_consentimentos
         where lead_id = ${lead} and finalidade = 'marketing' and canal = 'whatsapp'
         order by criado_em, estado desc
      `;
      expect(historico.map((h) => `${h.estado}:${h.origem}`).sort()).toEqual([
        "concedido:formulario_site",
        "revogado:botao_parar",
      ]);
    });
  });
  it("a mensagem da lista oficial não conta na cota de mensagens do plano; a do corretor conta", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "oficial-cota" });
      const numero = await numeroOficial(tx, a.grupoId, "cota");
      const modelo = await modeloAprovado(tx, a.grupoId, numero, "cota_do_plano");
      const [{ id: comum }] = await tx<{ id: string }[]>`
        insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base, status)
        values (${a.corretorId}, 'Pelo número do corretor', 'Oi', 'em_andamento')
        returning id
      `;
      const [{ id: oficial }] = await tx<{ id: string }[]>`
        insert into public.whatsapp_campanhas
          (corretor_id, titulo, mensagem_base, status, canal, numero_oficial_id, modelo_oficial_id)
        values (${a.corretorId}, 'Pelo número oficial', 'Oi', 'em_andamento', 'oficial', ${numero}, ${modelo})
        returning id
      `;
      const usoDoMes = async () => {
        const [linha] = await tx<{ mensagens_lista: number }[]>`
          select coalesce(sum(mensagens_lista), 0)::int as mensagens_lista
            from public.uso_da_ia where grupo_id = ${a.grupoId}
        `;
        return linha.mensagens_lista;
      };
      const antes = await usoDoMes();

      await tx`
        insert into public.whatsapp_campanhas_fila (campanha_id, telefone, mensagem_personalizada)
        values (${oficial}, '5511911110001', 'Oi'), (${oficial}, '5511911110002', 'Oi')
      `;
      expect(await usoDoMes()).toBe(antes);

      // A falha do item oficial também não desconta o que nunca somou.
      await tx`update public.whatsapp_campanhas_fila set status = 'erro' where campanha_id = ${oficial}`;
      expect(await usoDoMes()).toBe(antes);

      await tx`
        insert into public.whatsapp_campanhas_fila (campanha_id, telefone, mensagem_personalizada)
        values (${comum}, '5511911110003', 'Oi')
      `;
      expect(await usoDoMes()).toBe(antes + 1);
    });
  });
});
