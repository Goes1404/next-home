import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A roleta dos anúncios escolhe COMO o corretor sorteado fica sabendo do
 * lead (0218): mensagem do número dele ou aviso no grupo, pelo número
 * central. O modo "grupo" só vale se o grupo ligou o envio de leads para os
 * grupos; o parâmetro vem do navegador, então a action confere no banco.
 */

const GRUPO = "00000000-0000-0000-0000-00000000000a";
const OUTRO_GRUPO = "00000000-0000-0000-0000-00000000000b";

type Linha = Record<string, unknown>;
type Gravacao = { tabela: string; valores: Linha; opcoes?: unknown };

let tabelas: Record<string, Linha[]>;
let gravacoes: Gravacao[];
let tabelaComErro: string | null;
let sessao: { id: string; papel: "corretor" | "gestor"; grupoId: string } | null;

/** Cliente mínimo: aplica eq/in de verdade (o recorte por grupo é o que se mede) e registra o upsert. */
function clienteFalso() {
  return {
    from: (tabela: string) => {
      const predicados: ((l: Linha) => boolean)[] = [];
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          predicados.push((l) => l[col] === v);
          return q;
        },
        in: (col: string, vs: unknown[]) => {
          predicados.push((l) => vs.includes(l[col]));
          return q;
        },
        maybeSingle: async () =>
          tabela === tabelaComErro
            ? { data: null, error: { message: "falha de leitura" } }
            : { data: (tabelas[tabela] ?? []).filter((l) => predicados.every((p) => p(l)))[0] ?? null, error: null },
        upsert: async (valores: Linha, opcoes?: unknown) => {
          gravacoes.push({ tabela, valores, opcoes });
          return { error: null };
        },
        then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) =>
          Promise.resolve({ data: (tabelas[tabela] ?? []).filter((l) => predicados.every((p) => p(l))), error: null }).then(ok, falha),
      };
      return q;
    },
  };
}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado: async () => sessao }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => clienteFalso() }));

const { salvarRoleta } = await import("./roletaAcoes");

const base = {
  corretorId: "ana",
  ligada: true,
  destinos: ["ana", "beto"],
  textoPassagem: "",
  textoAbertura: "",
  textoBoasVindas: "",
};

function semear(envioAtivo: boolean, roletaSalva?: Linha) {
  tabelas = {
    grupos: [
      { id: GRUPO, envio_grupo_leads_ativo: envioAtivo },
      { id: OUTRO_GRUPO, envio_grupo_leads_ativo: !envioAtivo },
    ],
    corretores: [
      { id: "ana", grupo_id: GRUPO, ativo: true },
      { id: "beto", grupo_id: GRUPO, ativo: true },
      { id: "caio", grupo_id: OUTRO_GRUPO, ativo: true },
    ],
    roleta_anuncios: roletaSalva ? [roletaSalva] : [],
  };
}

describe("salvarRoleta: modo do aviso", () => {
  beforeEach(() => {
    gravacoes = [];
    tabelaComErro = null;
    sessao = { id: "ana", papel: "corretor", grupoId: GRUPO };
    semear(true);
  });

  it("com o envio para grupos ligado, grava modo_aviso 'grupo'", async () => {
    const r = await salvarRoleta({ ...base, modoAviso: "grupo" });
    expect(r.erro).toBeUndefined();
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].valores).toMatchObject({ corretor_id: "ana", grupo_id: GRUPO, modo_aviso: "grupo" });
  });

  it("grava a boas-vindas do modo grupo; em branco vira nulo (nada sai)", async () => {
    await salvarRoleta({ ...base, modoAviso: "grupo", textoBoasVindas: "  Oi! {corretor} vai te ligar.  " });
    expect(gravacoes[0].valores).toMatchObject({ texto_boas_vindas: "Oi! {corretor} vai te ligar." });
    await salvarRoleta({ ...base, modoAviso: "grupo", textoBoasVindas: "   " });
    expect(gravacoes[1].valores).toMatchObject({ texto_boas_vindas: null });
  });

  it("sem o envio para grupos, recusa 'grupo' e não grava nada", async () => {
    semear(false);
    const r = await salvarRoleta({ ...base, modoAviso: "grupo" });
    expect(r.erro).toBe("Peça ao gestor para ligar o envio de leads para os grupos.");
    expect(gravacoes).toHaveLength(0);
  });

  it("a conferência olha o grupo da sessão: com o envio ligado só no grupo da sessão, 'grupo' passa", async () => {
    // semear(false): GRUPO desligado e OUTRO_GRUPO ligado. Sessão no OUTRO_GRUPO.
    semear(false);
    sessao = { id: "caio", papel: "corretor", grupoId: OUTRO_GRUPO };
    const r = await salvarRoleta({ ...base, corretorId: "caio", destinos: ["caio"], modoAviso: "grupo" });
    expect(r.erro).toBeUndefined();
    expect(gravacoes[0].valores).toMatchObject({ grupo_id: OUTRO_GRUPO, modo_aviso: "grupo" });
  });

  it("erro ao ler o grupo: escolher 'grupo' é recusado e nada é gravado", async () => {
    tabelaComErro = "grupos";
    const r = await salvarRoleta({ ...base, modoAviso: "grupo" });
    expect(r.erro).toBe("Não foi possível salvar agora. Tente de novo.");
    expect(gravacoes).toHaveLength(0);
  });

  it("modo 'mensagem' grava mesmo com o envio desligado (a roleta de hoje não muda)", async () => {
    semear(false);
    const r = await salvarRoleta({ ...base, modoAviso: "mensagem" });
    expect(r.erro).toBeUndefined();
    expect(gravacoes[0].valores).toMatchObject({ modo_aviso: "mensagem" });
  });

  it("roleta que já estava em 'grupo' e perdeu o envio continua salva em 'grupo' (não troca sozinho)", async () => {
    semear(false, { corretor_id: "ana", grupo_id: GRUPO, modo_aviso: "grupo" });
    const r = await salvarRoleta({ ...base, modoAviso: "grupo" });
    expect(r.erro).toBeUndefined();
    expect(gravacoes[0].valores).toMatchObject({ modo_aviso: "grupo" });
  });

  it("valor de modo desconhecido (POST direto) é recusado", async () => {
    const r = await salvarRoleta({ ...base, modoAviso: "qualquer" as never });
    expect(r.erro).toBeTruthy();
    expect(gravacoes).toHaveLength(0);
  });

  it("no modo grupo a lista aceita quem está sem WhatsApp: só precisa estar ativo e no grupo", async () => {
    const r = await salvarRoleta({ ...base, modoAviso: "grupo", destinos: ["beto"] });
    expect(r.erro).toBeUndefined();
  });

  it("destino de outro grupo continua recusado no modo grupo", async () => {
    const r = await salvarRoleta({ ...base, modoAviso: "grupo", destinos: ["caio"] });
    expect(r.erro).toBeTruthy();
    expect(gravacoes).toHaveLength(0);
  });
});

describe("salvarRoleta: permissão (não mudou)", () => {
  beforeEach(() => {
    gravacoes = [];
    tabelaComErro = null;
    semear(true);
  });

  it("corretor comum só mexe no próprio número", async () => {
    sessao = { id: "beto", papel: "corretor", grupoId: GRUPO };
    const r = await salvarRoleta({ ...base, corretorId: "ana", modoAviso: "grupo" });
    expect(r.erro).toBe("Você só configura a roleta do seu número.");
    expect(gravacoes).toHaveLength(0);
  });

  it("gestor configura o número de qualquer corretor do grupo", async () => {
    sessao = { id: "beto", papel: "gestor", grupoId: GRUPO };
    const r = await salvarRoleta({ ...base, corretorId: "ana", modoAviso: "grupo" });
    expect(r.erro).toBeUndefined();
    expect(gravacoes[0].valores).toMatchObject({ corretor_id: "ana", atualizado_por: "beto" });
  });

  it("gestor não alcança corretor de outro grupo", async () => {
    sessao = { id: "beto", papel: "gestor", grupoId: GRUPO };
    const r = await salvarRoleta({ ...base, corretorId: "caio", destinos: [], ligada: false, modoAviso: "mensagem" });
    expect(r.erro).toBe("Corretor não encontrado.");
    expect(gravacoes).toHaveLength(0);
  });
});
