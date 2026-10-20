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

type Opcoes = { falhaUpload?: boolean; falhaRpc?: boolean; falhaAdmins?: boolean; falhaRemover?: boolean };

/** Um banco com um grupo cancelado há 100 dias (vence) e um há 10 (não vence). */
function cenario(opcoes: Opcoes = {}) {
  const banco = bancoFalso({
    grupos: [
      { id: "g-velho", slug: "velho", cancelado_em: "2026-07-12T06:00:00Z", dados_apagados_em: null, tentativa_de_apagar_em: null },
      { id: "g-novo", slug: "novo", cancelado_em: "2026-10-10T06:00:00Z", dados_apagados_em: null, tentativa_de_apagar_em: null },
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
  /** O Storage falso: cada `bucket/caminho` que existe. */
  const arquivos = new Set<string>([
    "documentos-clientes/l1/rg.jpg",
    "documentos-clientes/l1/whatsapp/m1.jpg",
    "documentos-clientes/l2/cpf.pdf",
    "contabilidade/g-velho/2026-05.xlsx",
    "contabilidade/g-novo/2026-05.xlsx",
  ]);
  const rpcs: { nome: string; args: unknown }[] = [];
  const loginsApagados: string[] = [];
  const cliente = banco.cliente as unknown as Record<string, unknown>;
  cliente.storage = {
    from: (bucket: string) => ({
      upload: async (caminho: string, corpo: Buffer) => {
        if (opcoes.falhaUpload) return { data: null, error: { message: "sem espaço" } };
        enviados.push({ caminho: `${bucket}/${caminho}`, tamanho: corpo.length });
        arquivos.add(`${bucket}/${caminho}`);
        return { data: { path: caminho }, error: null };
      },
      list: async (pasta: string, o?: { limit?: number; offset?: number }) => {
        const prefixo = pasta ? `${bucket}/${pasta}/` : `${bucket}/`;
        const itens = new Map<string, string | null>();
        for (const a of arquivos) {
          if (!a.startsWith(prefixo)) continue;
          const [primeiro, ...mais] = a.slice(prefixo.length).split("/");
          itens.set(primeiro, mais.length > 0 ? null : `id-${a}`);
        }
        const lista = [...itens].map(([name, id]) => ({ name, id }));
        const de = o?.offset ?? 0;
        return { data: lista.slice(de, de + (o?.limit ?? 100)), error: null };
      },
      remove: async (caminhos: string[]) => {
        if (opcoes.falhaRemover) return { data: null, error: { message: "fora do ar" } };
        for (const c of caminhos) arquivos.delete(`${bucket}/${c}`);
        return { data: [], error: null };
      },
    }),
  };
  if (opcoes.falhaAdmins) {
    const original = cliente.from as (t: string) => unknown;
    cliente.from = (tabela: string) => {
      if (tabela !== "administradores_da_plataforma") return original(tabela);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq"]) q[m] = () => q;
      q.then = (ok: (r: unknown) => unknown) =>
        Promise.resolve({ data: null, count: null, error: { message: "504" } }).then(ok);
      return q;
    };
  }
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
  return { banco, enviados, arquivos, rpcs, loginsApagados, servico: banco.cliente as never };
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

  it("anota o instante da cópia no grupo (o banco recusa se entrou dado depois dela)", async () => {
    const c = cenario();
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(c.banco.tabelas.grupos.find((g) => g.id === "g-velho")?.exportacao_final_em).toEqual(expect.any(String));
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

  it("se não deu para saber quem é administrador da plataforma, nenhum login e nada do grupo é apagado", async () => {
    const c = cenario({ falhaAdmins: true });
    const r = await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(r).toMatchObject({ ligada: true, erro: expect.stringMatching(/administradores/) });
    expect(c.loginsApagados).toEqual([]);
    expect(c.rpcs).toEqual([]);
  });

  it("apaga os arquivos privados do grupo (documentos dos leads e pacotes do contador) e não toca no vizinho", async () => {
    const c = cenario();
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect([...c.arquivos].sort()).toEqual([
      "contabilidade/g-novo/2026-05.xlsx",
      "documentos-clientes/l2/cpf.pdf",
      "exportacoes-de-grupos/g-velho/final-2026-10-20.xlsx",
    ]);
  });

  it("se os arquivos privados não saem, as linhas ficam (para tentar de novo)", async () => {
    const c = cenario({ falhaRemover: true });
    const r = await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(r).toMatchObject({ erro: expect.stringMatching(/arquivos privados/) });
    expect(c.rpcs).toEqual([]);
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

  it("um grupo que falha fica anotado e vai para o fim da fila, sem travar os outros", async () => {
    const c = cenario({ falhaRpc: true });
    c.banco.tabelas.grupos.push({
      id: "g-outro",
      slug: "outro",
      cancelado_em: "2026-07-15T06:00:00Z",
      dados_apagados_em: null,
      tentativa_de_apagar_em: null,
    });
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    const velho = c.banco.tabelas.grupos.find((g) => g.id === "g-velho");
    expect(velho?.tentativa_de_apagar_em).toBe(AGORA.toISOString());
    expect(velho?.falha_ao_apagar).toMatch(/prazo_nao_venceu/);
    expect(eventos(c.banco).find((e) => e.acao === "falha_ao_apagar_dados_do_grupo")).toMatchObject({
      grupo_id: null,
      detalhes: { origem: "plataforma", slug: "velho" },
    });

    // No dia seguinte a vez é do outro, que nunca falhou.
    await apagarGruposCanceladosVencidos({ env: LIGADA, agora: new Date("2026-10-21T06:00:00Z"), servico: c.servico });
    expect(c.rpcs.map((r) => (r.args as { p_grupo: string }).p_grupo)).toEqual(["g-velho", "g-outro"]);
  });

  it("apaga a cópia final guardada 30 dias depois dos dados, e só ela", async () => {
    const c = cenario();
    c.banco.tabelas.grupos.push(
      {
        id: "g-apagado",
        slug: "apagado",
        cancelado_em: "2026-05-01T00:00:00Z",
        dados_apagados_em: "2026-09-10T06:00:00Z",
        exportacao_final_caminho: "g-apagado/final-2026-09-10.xlsx",
      },
      {
        id: "g-recente",
        slug: "recente",
        cancelado_em: "2026-06-01T00:00:00Z",
        dados_apagados_em: "2026-10-01T06:00:00Z",
        exportacao_final_caminho: "g-recente/final-2026-10-01.xlsx",
      },
    );
    c.arquivos.add("exportacoes-de-grupos/g-apagado/final-2026-09-10.xlsx");
    c.arquivos.add("exportacoes-de-grupos/g-recente/final-2026-10-01.xlsx");
    const r = await apagarGruposCanceladosVencidos({ env: LIGADA, agora: AGORA, servico: c.servico });
    expect(r).toMatchObject({ copiasApagadas: 1 });
    expect(c.arquivos.has("exportacoes-de-grupos/g-apagado/final-2026-09-10.xlsx")).toBe(false);
    expect(c.arquivos.has("exportacoes-de-grupos/g-recente/final-2026-10-01.xlsx")).toBe(true);
    expect(c.banco.tabelas.grupos.find((g) => g.id === "g-apagado")).toMatchObject({
      exportacao_final_caminho: null,
      copia_final_apagada_em: AGORA.toISOString(),
    });
    expect(eventos(c.banco).find((e) => e.acao === "copia_final_apagada")).toMatchObject({ grupo_id: null });
  });
});
