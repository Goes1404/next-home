import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipanteDoGrupo } from "@/lib/whatsapp/participantesDoGrupo";

/**
 * A resposta com ARQUIVO do número central (4.5; onda 3, Frente M), do
 * webhook ao provedor de verdade (`fetch` falso na Evolution):
 * - o texto vai antes, e o arquivo sai por `sendMedia` (mídia nativa, por URL);
 * - quem só devolve texto segue só com `sendText`;
 * - a entrega que chega depois espera em segundo plano (o `after` do Next) e
 *   entra no histórico do central sem a URL;
 * - no grupo, o arquivo obedece a `respostaSoNoPrivado`, como o texto.
 */

const historico: { corretorId: string; texto: string }[] = [];
vi.mock("./avisos", async () => ({
  ...(await vi.importActual<object>("./avisos")),
  registrarAvisoNoHistorico: async (_s: unknown, corretorId: string, texto: string) => void historico.push({ corretorId, texto }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const { enviarRespostaDoCentral } = await import("./webhook");
const { esquecerParticipantes, tratarMensagemDoGrupoNoCentral } = await import("./grupo");
type DependenciasDoGrupo = import("./grupo").DependenciasDoGrupo;
type RespostaDoCentral = import("./conversa").RespostaDoCentral;

const URL_DA_ARTE = "https://cdn.exemplo/corretores/c1/criacoes/abc.png";
const destino = { instanceName: "central", telefone: "5511987654321" };

type Chamada = { rota: string; corpo: Record<string, unknown> };
let chamadas: Chamada[] = [];

describe("webhook: resposta com arquivo chega ao provedor de mídia", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    chamadas = [];
    historico.length = 0;
    vi.stubEnv("WHATSAPP_API_URL", "https://evolution.exemplo");
    vi.stubEnv("WHATSAPP_API_KEY", "chave");
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      chamadas.push({ rota: new URL(String(url)).pathname, corpo: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ key: { id: `msg-${chamadas.length}` } }));
    }) as never;
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("texto primeiro, depois a imagem por sendMedia (URL, sem legenda)", async () => {
    await enviarRespostaDoCentral(destino, { textos: ["Pronto, o post do Vitta."], soNoPrivado: true, arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] }, () => {
      throw new Error("sem pendência, nada em segundo plano");
    });
    expect(chamadas.map((c) => c.rota)).toEqual(["/message/sendText/central", "/message/sendMedia/central"]);
    expect(chamadas[1].corpo).toEqual({ number: "5511987654321", mediatype: "image", media: URL_DA_ARTE });
  });

  it("só texto: o mesmo de sempre, nenhum sendMedia", async () => {
    await enviarRespostaDoCentral(destino, { textos: ["um", "dois"], soNoPrivado: false });
    expect(chamadas.map((c) => c.rota)).toEqual(["/message/sendText/central", "/message/sendText/central"]);
  });

  it("entrega depois: espera em segundo plano, manda texto e arquivo e anota no histórico sem a URL", async () => {
    const tarefas: (() => Promise<void>)[] = [];
    let terminar: (e: { texto: string; arquivos: { tipo: "imagem"; url: string }[] }) => void = () => {};
    const resposta: RespostaDoCentral = {
      textos: ["Estou gerando o post do Vitta; te mando aqui em instantes."],
      soNoPrivado: true,
      depois: [{ corretorId: "c1", entrega: new Promise((ok) => (terminar = ok)) }],
    };
    await enviarRespostaDoCentral(destino, resposta, (t) => void tarefas.push(t));
    expect(chamadas.map((c) => c.rota)).toEqual(["/message/sendText/central"]);
    expect(tarefas).toHaveLength(1);

    terminar({ texto: "Pronto, o post do Vitta.", arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] });
    await tarefas[0]();
    expect(chamadas.map((c) => c.rota)).toEqual(["/message/sendText/central", "/message/sendText/central", "/message/sendMedia/central"]);
    expect(historico).toEqual([{ corretorId: "c1", texto: "Pronto, o post do Vitta.\n[imagem]" }]);
  });
});

// ── No grupo da equipe ──────────────────────────────────────────────────────

const CENTRAL = "5511968671127";
const CAROL = "5511987654321";
const participante = (numero: string): ParticipanteDoGrupo => ({ id: `${numero}@s.whatsapp.net`, numero, lid: null });

function grupo(resposta: RespostaDoCentral) {
  const enviados = { noGrupo: [] as string[], noPrivado: [] as string[] };
  const deps: DependenciasDoGrupo = {
    telefoneDoCentral: CENTRAL,
    jaTratada: async () => false,
    participantes: async () => [participante(CENTRAL), participante(CAROL)],
    equipe: async () => [
      { id: "c1", nome: "Carol", papel: "corretor", grupoId: "g1", imobiliaria: "Next Home", whatsapp: CAROL, whatsappLid: null, ligado: true },
    ],
    registrarTentativa: async () => {},
    responder: async () => resposta,
    enviarNoGrupo: async (t) => (enviados.noGrupo.push(`texto:${t}`), true),
    enviarNoPrivado: async (_tel, t) => (enviados.noPrivado.push(`texto:${t}`), true),
    enviarArquivoNoGrupo: async (a) => (enviados.noGrupo.push(`arquivo:${a.url}`), true),
    enviarArquivoNoPrivado: async (_tel, a) => (enviados.noPrivado.push(`arquivo:${a.url}`), true),
  };
  const mensagem = {
    grupoJid: "120363000@g.us",
    mensagem: { mensagemId: `g-${Math.random()}`, telefone: CAROL, lid: null, tipo: "texto" as const, texto: "manda a foto do Vitta" },
    autor: { telefone: CAROL, lid: null },
    mencionados: [`${CENTRAL}@s.whatsapp.net`],
    citado: null,
  };
  return { deps, enviados, mensagem };
}

describe("grupo: o arquivo segue a regra do privado", () => {
  beforeEach(() => esquecerParticipantes());

  it("resposta só no privado: texto e arquivo no privado; o grupo ouve 'Te mandei no privado'", async () => {
    const g = grupo({ textos: ["Aqui a arte."], soNoPrivado: true, arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] });
    expect(await tratarMensagemDoGrupoNoCentral(g.mensagem, g.deps, 3)).toEqual({ tipo: "respondido", noGrupo: 1, noPrivado: 2 });
    expect(g.enviados.noPrivado).toEqual(["texto:Aqui a arte.", `arquivo:${URL_DA_ARTE}`]);
    expect(g.enviados.noGrupo).toEqual(["texto:Te mandei no privado."]);
  });

  it("resposta que pode ir ao grupo: o arquivo vai junto, no grupo", async () => {
    const g = grupo({ textos: ["Fotos do Vitta."], soNoPrivado: false, arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] });
    expect(await tratarMensagemDoGrupoNoCentral(g.mensagem, g.deps, 3)).toEqual({ tipo: "respondido", noGrupo: 2, noPrivado: 0 });
    expect(g.enviados.noGrupo).toEqual(["texto:Fotos do Vitta.", `arquivo:${URL_DA_ARTE}`]);
    expect(g.enviados.noPrivado).toEqual([]);
  });
});

describe("consulta que devolve arquivo (ex.: fotos do imóvel)", () => {
  it("o arquivo sai do que vai ao cérebro e fica para a conversa mandar; lixo não passa", async () => {
    const { criarExecutor } = await import("./executar");
    const ctx = { corretorId: "c1", grupoId: "g1", papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
    const executor = criarExecutor(
      ctx,
      {
        consultas: {
          informacao_de_imovel: async () => ({
            nome: "Vitta",
            arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }, { tipo: "imagem", url: "data:image/png;base64,AAAA" }, { tipo: "pdf", url: "https://x/y.pdf" }],
          }),
        },
        acoes: {},
      },
      3,
    );
    expect(await executor.executar("informacao_de_imovel", { imovel: "Vitta" })).toEqual({ nome: "Vitta", arquivosQueVaoJunto: 1 });
    expect(executor.arquivosColetados).toEqual([{ tipo: "imagem", url: URL_DA_ARTE }]);
  });
});
