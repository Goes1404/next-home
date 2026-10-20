import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("o teste passa o cliente");
  },
}));

import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import { apagarGruposCanceladosVencidos } from "./encerramento";

const AGORA = new Date("2026-10-20T06:00:00Z");
const LIGADA = { APAGAR_GRUPOS_CANCELADOS: "1" };

/** Um banco com um grupo cancelado há 100 dias (vence) e um há 10 (não vence). */
function cenario(opcoes: { falhaUpload?: boolean; falhaRpc?: boolean } = {}) {
  const banco = bancoFalso({
    grupos: [
      { id: "g-velho", slug: "velho", cancelado_em: "2026-07-12T06:00:00Z", dados_apagados_em: null },
      { id: "g-novo", slug: "novo", cancelado_em: "2026-10-10T06:00:00Z", dados_apagados_em: null },
    ],
    leads: [
      { id: "l1", grupo_id: "g-velho", nome: "Ana", etapa: "novo", created_at: "2026-06-01T00:00:00Z" },
      { id: "l2", grupo_id: "g-novo", nome: "Beto", etapa: "novo", created_at: "2026-06-01T00:00:00Z" },
    ],
    empreendimentos: [],
    corretores: [
      { id: "c1", grupo_id: "g-velho", nome: "Gestor velho", user_id: "u1", papel: "gestor", ativo: true },
      { id: "c2", grupo_id: "g-novo", nome: "Gestor novo", user_id: "u2", papel: "gestor", ativo: true },
    ],
    vendas: [],
    administradores_da_plataforma: [],
    admin_eventos: [],
  });
  const enviados: { caminho: string; tamanho: number }[] = [];
  const rpcs: { nome: string; args: unknown }[] = [];
  const loginsApagados: string[] = [];
  const cliente = banco.cliente as unknown as Record<string, unknown>;
  cliente.storage = {
    from: (bucket: string) => ({
      upload: async (caminho: string, corpo: Buffer) => {
        if (opcoes.falhaUpload) return { data: null, error: { message: "sem espaço" } };
        enviados.push({ caminho: `${bucket}/${caminho}`, tamanho: corpo.length });
        return { data: { path: caminho }, error: null };
      },
    }),
  };
  cliente.rpc = async (nome: string, args: { p_grupo: string }) => {
    rpcs.push({ nome, args });
    if (opcoes.falhaRpc) return { data: null, error: { message: "prazo_nao_venceu" } };
    banco.tabelas.leads = banco.tabelas.leads.filter((l) => l.grupo_id !== args.p_grupo);
    banco.tabelas.corretores = banco.tabelas.corretores.filter((l) => l.grupo_id !== args.p_grupo);
    return { data: { linhas: 2, tabelas: { leads: 1, corretores: 1 } }, error: null };
  };
  cliente.auth = {
    admin: {
      deleteUser: async (id: string) => {
        loginsApagados.push(id);
        return { error: null };
      },
    },
  };
  return { banco, enviados, rpcs, loginsApagados, servico: banco.cliente as never };
}

function eventos(banco: BancoFalso) {
  return banco.tabelas.admin_eventos;
}

describe("rotina dos 90 dias", () => {
  it("desligada, não lê nem apaga nada", async () => {
    const c = cenario();
    const r = await apagarGruposCanceladosVencidos({ env: {}, agora: AGORA, servico: c.servico });
    expect(r).toEqual({ ligada: false });
    expect(c.banco.consultas).toEqual([]);
    expect(c.rpcs).toEqual([]);
  });

  it("ligada, grava a cópia ANTES e só então apaga o grupo vencido", async () => {
    const c = cenario();
    const r = await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });

    expect(r).toMatchObject({ ligada: true, apagado: "velho", pendentes: 0 });
    expect(c.enviados).toEqual([{ caminho: "exportacoes-de-grupos/g-velho/final-2026-10-20.xlsx", tamanho: expect.any(Number) }]);
    expect(c.rpcs).toEqual([{ nome: "apagar_dados_do_grupo", args: { p_grupo: "g-velho" } }]);
    // O grupo que ainda não venceu fica inteiro.
    expect(c.banco.tabelas.leads.map((l) => l.id)).toEqual(["l2"]);
    expect(c.banco.tabelas.grupos.find((g) => g.id === "g-velho")?.exportacao_final_caminho).toBe("g-velho/final-2026-10-20.xlsx");
  });

  it("apaga os logins de quem era do grupo, menos administrador da plataforma", async () => {
    const c = cenario();
    c.banco.tabelas.administradores_da_plataforma.push({ user_id: "u1" });
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(c.loginsApagados).toEqual([]);

    const d = cenario();
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: d.servico });
    expect(d.loginsApagados).toEqual(["u1"]);
  });

  it("registra um evento da plataforma sem nome de ninguém", async () => {
    const c = cenario();
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    const evento = eventos(c.banco).find((e) => e.acao === "dados_do_grupo_apagados");
    expect(evento).toMatchObject({ grupo_id: null, detalhes: { origem: "plataforma", slug: "velho" } });
    expect(JSON.stringify(evento)).not.toMatch(/Ana|Gestor/);
  });

  it("sem a cópia gravada, não apaga", async () => {
    const c = cenario({ falhaUpload: true });
    const r = await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(r).toMatchObject({ ligada: true, erro: expect.stringMatching(/cópia/) });
    expect(c.rpcs).toEqual([]);
    expect(c.loginsApagados).toEqual([]);
  });

  it("se o banco recusa, os logins ficam", async () => {
    const c = cenario({ falhaRpc: true });
    const r = await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(r).toMatchObject({ ligada: true, erro: expect.stringMatching(/prazo_nao_venceu/) });
    expect(c.loginsApagados).toEqual([]);
  });
});
