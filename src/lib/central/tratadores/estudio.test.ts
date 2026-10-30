import { describe, expect, it, vi } from "vitest";
import type { ResultadoDaArte } from "@/lib/estudio/artePeloCentral";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { criarTratadoresDoEstudio, formatoDaArte, canalDoVideo, objetivoDoVideo } = await import("./estudio");
const { criarExecutor, executarProposta } = await import("../executar");
const { responderNoCentral, responderNoCentralComArquivos } = await import("../conversa");
type Dependencias = import("../conversa").Dependencias;
type EstadoDoCentral = import("../conversa").EstadoDoCentral;
type ImovelDoCatalogo = import("./imoveis").ImovelDoCatalogo;

const G = "g1";
const ctx = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };

const imovel = (id: string, nome: string, extra: Partial<ImovelDoCatalogo> = {}): ImovelDoCatalogo => ({
  id,
  nome,
  slug: nome.toLowerCase().replace(/\s+/g, "-"),
  nomesAlternativos: [],
  cidade: "Barueri",
  bairro: "Alphaville",
  endereco: null,
  construtora: null,
  precoAPartir: null,
  status: "lancamento",
  publicado: true,
  entregaPrevista: null,
  plantas: [],
  ...extra,
});

const CATALOGO = [imovel("e1", "Vitta Residencial"), imovel("e2", "Royal Park I"), imovel("e3", "Royal Park II"), imovel("e4", "Dom Parque Barueri")];
const URL_DA_ARTE = "https://exemplo.supabase.co/storage/v1/object/public/empreendimentos/corretores/c1/criacoes/abc.png";

function montar(arte: () => Promise<ResultadoDaArte> = async () => ({ ok: true, url: URL_DA_ARTE, imagemId: "i1", ressalva: "aplicada" })) {
  const espioes = { catalogoDe: [] as string[], gerou: [] as unknown[], conferiu: 0, videos: [] as unknown[] };
  let arteLiberada = true;
  const tratadores = criarTratadoresDoEstudio({
    catalogo: async (grupoId) => (espioes.catalogoDe.push(grupoId), CATALOGO),
    conferirArte: async () => (espioes.conferiu++, arteLiberada ? { ok: true, restamHoje: 20 } : { ok: false, erro: "Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º." }),
    gerarArte: async (p) => (espioes.gerou.push(p), arte()),
    conferirVideo: async () => ({ ok: true, disponiveis: 4 }),
    criarVideo: async (p) => (espioes.videos.push(p), { ok: true, jobId: "job-1" }),
    esperaDaArteMs: 30,
  });
  return { tratadores, espioes, esgotarArte: () => (arteLiberada = false) };
}

describe("régua do pedido (a do Estúdio)", () => {
  it("formato da arte, canal e objetivo do vídeo", () => {
    expect(formatoDaArte("post pro Instagram")).toEqual({ tamanho: "quadrado", nome: "post" });
    expect(formatoDaArte("story")).toMatchObject({ tamanho: "retrato" });
    expect(formatoDaArte("Reels")).toMatchObject({ tamanho: "retrato" });
    expect(formatoDaArte("capa do Facebook")).toMatchObject({ tamanho: "paisagem", nome: "capa" });
    expect(canalDoVideo("")).toMatchObject({ canal: "story" });
    expect(canalDoVideo("pro feed")).toMatchObject({ canal: "feed" });
    expect(objetivoDoVideo("pronto_para_morar")).toBe("pronto_para_morar");
    expect(objetivoDoVideo("em_construcao")).toBe("lancamento");
  });
});

describe("gerar_arte", () => {
  it("preparar acha o imóvel no grupo de quem pede, propõe e NÃO gera nem gasta", async () => {
    const { tratadores, espioes } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    const r = (await executor.executar("gerar_arte", { imovel: "Vitta", formato: "post pro Instagram" })) as Record<string, unknown>;
    expect(r.proposto).toBe(true);
    expect(espioes.catalogoDe).toEqual([G]);
    expect(espioes.gerou).toEqual([]);
    const [item] = executor.itensPropostos;
    expect(item.resumo).toContain("post do Vitta Residencial");
    expect(item.resumo).toContain("consome cota de IA");
    expect(item.resumo).toContain("não tem como desfazer");
    expect(item.dados).toMatchObject({ imovelId: "e1", formato: "quadrado" });
  });

  it("imóvel ambíguo vira pergunta; desconhecido, erro; nada é proposto", async () => {
    const { tratadores } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    expect(await executor.executar("gerar_arte", { imovel: "Royal" })).toMatchObject({ pergunta: expect.any(String) });
    expect(await executor.executar("gerar_arte", { imovel: "Edifício Inexistente" })).toMatchObject({ erro: expect.any(String) });
    expect(executor.itensPropostos).toEqual([]);
  });

  it("cota de arte esgotada: diz o motivo e não propõe", async () => {
    const { tratadores, espioes, esgotarArte } = montar();
    esgotarArte();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    expect(await executor.executar("gerar_arte", { imovel: "Vitta" })).toEqual({
      erro: "Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º.",
    });
    expect(executor.itensPropostos).toEqual([]);
    expect(espioes.gerou).toEqual([]);
  });

  it('"sim" gera com o corretor e o grupo da identificação e devolve a imagem como arquivo', async () => {
    const { tratadores, espioes } = montar();
    const r = await tratadores.acoes.gerar_arte.executar(ctx, { imovelId: "e1", imovelNome: "Vitta Residencial", formato: "retrato", peca: "story", pedido: "Story do Vitta" });
    expect(espioes.gerou).toEqual([{ corretorId: "c1", grupoId: G, empreendimentoId: "e1", formato: "retrato", texto: "Story do Vitta" }]);
    expect(r).toMatchObject({ ok: true, arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] });
    expect(r.texto).toMatch(/Pronto, o story do Vitta Residencial/);
    expect(r.desfazer).toBeUndefined();
  });

  it("arte sem a ressalva avisa; falha vira texto, sem arquivo", async () => {
    const semRessalva = montar(async () => ({ ok: true, url: URL_DA_ARTE, imagemId: null, ressalva: "falhou" }));
    const r1 = await semRessalva.tratadores.acoes.gerar_arte.executar(ctx, { imovelId: "e1", imovelNome: "Vitta", formato: "quadrado", peca: "post", pedido: "x" });
    expect(r1.texto).toMatch(/não publique sem ele/);

    const falha = montar(async () => ({ ok: false, erro: "Seu plano tem 30 artes por mês e elas acabaram." }));
    const r2 = await falha.tratadores.acoes.gerar_arte.executar(ctx, { imovelId: "e1", imovelNome: "Vitta", formato: "quadrado", peca: "post", pedido: "x" });
    expect(r2).toMatchObject({ ok: false });
    expect(r2.arquivos).toEqual([]);
    expect(r2.texto).toContain("acabaram");
  });

  it("geração lenta: responde 'te mando em instantes' e a MESMA geração chega depois", async () => {
    let terminar: (r: ResultadoDaArte) => void = () => {};
    const { tratadores, espioes } = montar(() => new Promise((ok) => (terminar = ok)));
    const r = await tratadores.acoes.gerar_arte.executar(ctx, { imovelId: "e1", imovelNome: "Vitta", formato: "quadrado", peca: "post", pedido: "x" });
    expect(r.texto).toBe("Estou gerando o post do Vitta; te mando aqui em instantes.");
    expect(r.arquivos).toBeUndefined();
    expect(r.depois).toBeInstanceOf(Promise);
    terminar({ ok: true, url: URL_DA_ARTE, imagemId: "i1", ressalva: "aplicada" });
    expect(await r.depois).toEqual({ texto: expect.stringMatching(/^Pronto/), arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] });
    expect(espioes.gerou).toHaveLength(1);
  });

  it("executarProposta leva o arquivo e o depois adiante", async () => {
    const { tratadores } = montar();
    const feito = await executarProposta(ctx, [{ ferramenta: "gerar_arte", argumentos: {}, resumo: "r", dados: { imovelId: "e1", imovelNome: "Vitta", formato: "quadrado", peca: "post", pedido: "x" } }], {
      consultas: {},
      acoes: tratadores.acoes,
    });
    expect(feito.resultados[0].arquivos).toEqual([{ tipo: "imagem", url: URL_DA_ARTE }]);
    expect(feito.desfaziveis).toEqual([]);
  });
});

// ── A frase e o pedido livre (conversa da Bruna, 30/10/2026) ────────────────

const FRASE = "Visite e ganhe um champanhe somente este final de semana";

describe("gerar_arte: a frase na arte e a arte livre", () => {
  it("preparar mostra a frase no resumo, guarda-a intacta e NÃO gera nem gasta", async () => {
    const { tratadores, espioes } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    const r = (await executor.executar("gerar_arte", { imovel: "Dom Parque Barueri", formato: "post", texto_na_arte: FRASE })) as Record<string, unknown>;
    expect(r.proposto).toBe(true);
    expect(espioes.gerou).toEqual([]);
    const [item] = executor.itensPropostos;
    expect(item.resumo).toContain(`post do Dom Parque Barueri com a frase "${FRASE}"`);
    expect(item.resumo).toContain("consome cota de IA");
    expect(item.dados).toMatchObject({ imovelId: "e4", textoNaArte: FRASE });
    // O tradutor recebe a frase entre aspas (a convenção do ditado da tela).
    expect(item.dados.pedido).toContain(`"${FRASE}"`);
  });

  it("aspas que o cérebro pôs em volta saem; dentro da frase nada muda", async () => {
    const { tratadores } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    await executor.executar("gerar_arte", { imovel: "Vitta", texto_na_arte: '  “Últimas unidades: ENTRADA em 60x!”  ' });
    expect(executor.itensPropostos[0].dados.textoNaArte).toBe("Últimas unidades: ENTRADA em 60x!");
  });

  it('"sim": a frase chega ao gerador exatamente como pedida, e a entrega pede para conferir', async () => {
    const { tratadores, espioes } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    await executor.executar("gerar_arte", { imovel: "Dom Parque", texto_na_arte: FRASE });
    const r = await tratadores.acoes.gerar_arte.executar(ctx, executor.itensPropostos[0].dados);
    expect(espioes.gerou).toHaveLength(1);
    expect(espioes.gerou[0]).toMatchObject({ empreendimentoId: "e4", textoNaArte: FRASE });
    expect(r.texto).toMatch(/^Pronto, o post do Dom Parque Barueri\./);
    expect(r.texto).toContain("Confira a frase");
  });

  it("pedido livre sem imóvel: arte livre, sem ler o catálogo; o 'sim' gera sem imóvel", async () => {
    const { tratadores, espioes } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    const r = (await executor.executar("gerar_arte", { pedido: "imagem futurística de um prédio flutuante" })) as Record<string, unknown>;
    expect(r.proposto).toBe(true);
    expect(espioes.catalogoDe).toEqual([]);
    expect(espioes.gerou).toEqual([]);
    const [item] = executor.itensPropostos;
    expect(item.resumo).toMatch(/^Gerar com IA um post \(imagem futurística de um prédio flutuante\) e te mandar a imagem/);
    expect(item.resumo).not.toMatch(/Midjourney|DALL/);
    expect(item.dados).toMatchObject({ imovelId: null, imovelNome: null, textoNaArte: null });
    expect(item.dados.pedido).toBe("Post para redes sociais. O que mostrar: imagem futurística de um prédio flutuante.");

    const feito = await tratadores.acoes.gerar_arte.executar(ctx, item.dados);
    expect(espioes.gerou).toEqual([{ corretorId: "c1", grupoId: G, empreendimentoId: null, formato: "quadrado", texto: item.dados.pedido }]);
    expect(feito).toMatchObject({ ok: true, texto: expect.stringMatching(/^Pronto, o post\. É só encaminhar/), arquivos: [{ tipo: "imagem", url: URL_DA_ARTE }] });
  });

  it("arte livre também confere a cota antes de propor", async () => {
    const { tratadores, esgotarArte } = montar();
    esgotarArte();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    expect(await executor.executar("gerar_arte", { pedido: "prédio flutuante" })).toMatchObject({ erro: expect.stringContaining("acabaram") });
    expect(executor.itensPropostos).toEqual([]);
  });

  it("sem imóvel, pedido nem frase: pergunta; imóvel ambíguo com frase: pergunta; frase longa: pede para encurtar", async () => {
    const { tratadores, espioes } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    expect(await executor.executar("gerar_arte", { formato: "post" })).toMatchObject({ pergunta: expect.any(String) });
    expect(await executor.executar("gerar_arte", { imovel: "Royal", texto_na_arte: FRASE })).toMatchObject({ pergunta: expect.any(String) });
    expect(await executor.executar("gerar_arte", { imovel: "Vitta", texto_na_arte: "x".repeat(161) })).toMatchObject({
      pergunta: expect.stringContaining("encurtar"),
    });
    expect(executor.itensPropostos).toEqual([]);
    expect(espioes.gerou).toEqual([]);
  });

  it("pela conversa: a proposta mostra a frase e o 'sim' a leva intacta", async () => {
    const { tratadores, espioes } = montar();
    const c = conversa(tratadores);
    c.deps.pensar = async (e) => {
      await e.executar("gerar_arte", { imovel: "Dom Parque Barueri", texto_na_arte: FRASE });
      return { ok: true, texto: "ok", chamadas: [{ nome: "gerar_arte", argumentos: {} }], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0.01 } as never;
    };
    const [proposta] = await responderNoCentral(c.msg("cria uma arte do Dom Parque Barueri com a frase"), c.deps);
    expect(proposta).toContain(`Gerar com IA um post do Dom Parque Barueri com a frase "${FRASE}"`);
    expect(espioes.gerou).toEqual([]);
    const r = await responderNoCentralComArquivos(c.msg("sim"), c.deps);
    expect(r.arquivos).toEqual([{ tipo: "imagem", url: URL_DA_ARTE }]);
    expect(espioes.gerou[0]).toMatchObject({ textoNaArte: FRASE });
  });
});

describe("criar_video", () => {
  it("preparar propõe com o saldo e não enfileira; o 'sim' enfileira e avisa que manda quando ficar pronto", async () => {
    const { tratadores, espioes } = montar();
    const executor = criarExecutor(ctx, { consultas: {}, acoes: tratadores.acoes }, 3);
    await executor.executar("criar_video", { imovel: "Vitta" });
    const [item] = executor.itensPropostos;
    expect(item.resumo).toContain("vídeo vertical (Reels/Story) do Vitta Residencial");
    expect(item.resumo).toContain("1 dos seus 4 vídeos do mês");
    expect(item.resumo).toContain("não tem como desfazer");
    expect(espioes.videos).toEqual([]);

    const r = await tratadores.acoes.criar_video.executar(ctx, item.dados);
    expect(espioes.videos).toEqual([{ corretorId: "c1", grupoId: G, empreendimentoId: "e1", canal: "story", objetivo: "lancamento" }]);
    expect(r).toEqual({ ok: true, texto: "Pedi o vídeo do Vitta Residencial. Costuma levar alguns minutos; te mando aqui quando ficar pronto." });
  });
});

// ── Pela conversa inteira: proposta, "sim", arquivo ─────────────────────────

const AGORA = new Date("2026-10-30T15:00:00Z");

function conversa(tratadores: ReturnType<typeof criarTratadoresDoEstudio>) {
  let estado: EstadoDoCentral = { historico: [], proposta: null, boasVindasEm: "2026-10-01T00:00:00Z" };
  const comandos: Record<string, unknown>[] = [];
  const deps: Dependencias = {
    agora: () => AGORA,
    identificar: async () => ({ tipo: "pessoa", ...ctx }),
    jaTratada: async () => false,
    registrarTentativa: async () => {},
    lerEscolhaPendente: async () => null,
    guardarEscolha: async () => {},
    cotaEsgotada: async () => false,
    lerEstado: async () => structuredClone(estado),
    salvarEstado: async (_id, e) => void (estado = e),
    transcrever: async () => null,
    pensar: async (e) => {
      await e.executar("gerar_arte", { imovel: "Vitta", formato: "post" });
      return { ok: true, texto: "ok", chamadas: [{ nome: "gerar_arte", argumentos: { imovel: "Vitta" } }], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0.01 } as never;
    },
    registrarComando: async (r) => void comandos.push(r as never),
    tratadores: { consultas: {}, acoes: tratadores.acoes },
    onda: 3,
  };
  const msg = (texto: string) => ({ mensagemId: `m-${texto}-${comandos.length}`, telefone: "5511987654321", lid: null, tipo: "texto" as const, texto });
  return { deps, msg, comandos, estado: () => estado };
}

describe("conversa: a arte volta como arquivo", () => {
  it("proposta, 'sim', imagem no fim; o histórico e o registro guardam só a marca", async () => {
    const { tratadores } = montar();
    const c = conversa(tratadores);
    const [proposta] = await responderNoCentral(c.msg("faz um post do Vitta pro Instagram"), c.deps);
    expect(proposta).toMatch(/Vou fazer isto:\nGerar com IA um post do Vitta Residencial/);

    const r = await responderNoCentralComArquivos(c.msg("sim"), c.deps);
    expect(r.textos[0]).toMatch(/^Pronto, o post do Vitta Residencial/);
    expect(r.arquivos).toEqual([{ tipo: "imagem", url: URL_DA_ARTE }]);
    expect(r.depois).toBeUndefined();

    const salvo = JSON.stringify(c.estado().historico) + JSON.stringify(c.comandos);
    expect(salvo).toContain("[imagem]");
    expect(salvo).not.toContain(URL_DA_ARTE);
    expect(salvo).not.toMatch(/base64|data:image/);
  });

  it("arte lenta: o 'sim' responde na hora e entrega a pendência à parte, de quem pediu", async () => {
    let terminar: (r: ResultadoDaArte) => void = () => {};
    const { tratadores } = montar(() => new Promise((ok) => (terminar = ok)));
    const c = conversa(tratadores);
    await responderNoCentral(c.msg("faz um post do Vitta"), c.deps);
    const r = await responderNoCentralComArquivos(c.msg("sim"), c.deps);
    expect(r.textos).toEqual(["Estou gerando o post do Vitta Residencial; te mando aqui em instantes."]);
    expect(r.arquivos).toBeUndefined();
    expect(r.depois).toHaveLength(1);
    expect(r.depois?.[0].corretorId).toBe("c1");
    terminar({ ok: true, url: URL_DA_ARTE, imagemId: "i1", ressalva: "aplicada" });
    expect((await r.depois?.[0].entrega)?.arquivos).toEqual([{ tipo: "imagem", url: URL_DA_ARTE }]);
  });

  it("quem só devolve texto não muda: responderNoCentral segue com os textos", async () => {
    const { tratadores } = montar();
    const c = conversa(tratadores);
    c.deps.pensar = async () => ({ ok: true, texto: "só texto", chamadas: [], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0 }) as never;
    expect(await responderNoCentral(c.msg("oi tudo bem"), c.deps)).toEqual(["só texto"]);
    const completa = await responderNoCentralComArquivos(c.msg("e aí"), c.deps);
    expect(completa).toEqual({ textos: ["só texto"], soNoPrivado: false });
  });
});
