import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dadosDaMensagem,
  ehConfirmacao,
  referenciaAtiva,
  referenciasAtivas,
  referenciasDaConversa,
  tituloDaConversa,
  type MensagemDoEstudio,
} from "./contrato";

/**
 * O Estúdio em forma de chat — o que NÃO pode regredir.
 *
 * O chat é uma casca sobre o motor que já existe. O risco é a casca virar um
 * segundo motor: importar `gerarImagem` direto (contornando a cláusula
 * anti-invenção e o teto diário), inserir em `video_jobs` (contornando o
 * crédito), ou mandar texto de IA cru para a tela (o markdown e o "Excelente
 * pergunta!" que o WhatsApp já ensinou a cortar). Tudo isso falha CALADO —
 * a tela continua funcionando, só passa a gastar sem controle ou a soar robô.
 */

const ler = (rel: string) =>
  readFileSync(join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const LIB = ["src/lib/estudio/turno.ts", "src/lib/estudio/repositorio.ts", "src/lib/estudio/contrato.ts"];
const ACOES = "src/app/corretor/(painel)/estudio/acoes.ts";
const TELAS = [
  "src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx",
  "src/app/corretor/(painel)/marketing/video/ChatDeVideo.tsx",
];

describe("o chat não vira um segundo motor", () => {
  it.each([...LIB, ACOES, ...TELAS])("%s não importa gerarImagem nem toca em video_jobs", (arq) => {
    const f = ler(arq);
    expect(f).not.toMatch(/from "@\/lib\/imagens\/gerarImagem"/);
    expect(f).not.toMatch(/\.from\("video_jobs"\)/);
    expect(f).not.toMatch(/\.from\("imagens_geradas"\)/);
  });

  it("arte gasta SÓ pela rota /api/imagens/gerar, chamada da tela", () => {
    // É a rota que confere o teto, aplica a cláusula e compõe. `arte.test.ts`
    // fixa o caminho dela lendo o código; aqui se garante que o chat a usa.
    const tela = ler(TELAS[0]);
    expect(tela).toMatch(/fetch\("\/api\/imagens\/gerar"/);
    expect((tela.match(/fetch\(/g) ?? []).length).toBe(1);
    expect(tela).toMatch(/modo: "livre"/);
  });

  it("vídeo gasta SÓ por criarVideo, e uma vez", () => {
    const a = ler(ACOES);
    expect((a.match(/await criarVideo\(/g) ?? []).length).toBe(1);
    expect(a).not.toMatch(/enfileirarVideo/);
    expect(a).not.toMatch(/reservar_credito_video/);
  });

  it("confirmar vídeo exige que a proposta esteja NA conversa", () => {
    // Sem isto a tela podia mandar qualquer slug/objetivo/canal e gerar sem
    // proposta — o "só depois do OK" viraria só depois de um POST.
    const a = ler(ACOES);
    // A conferência tem de BARRAR: `if (!propostaValida) return { erro`. Só a
    // variável existir não prova nada — a primeira versão desta guarda
    // aceitou um `void propostaValida` (mordida provocada, não mordeu).
    expect(a).toMatch(/if \(!propostaValida\) return \{ erro/);
    expect(a).toMatch(/m\.dados\.slug === params\.proposta\.slug/);
    // E a conferência vem ANTES do gasto.
    expect(a.indexOf("if (!propostaValida)")).toBeLessThan(a.indexOf("await criarVideo("));
  });
});

describe("a voz da IA passa pelo saneamento da casa", () => {
  it("turno.ts usa soarHumano no texto que vai para a tela", () => {
    const t = ler(LIB[0]);
    expect(t).toMatch(/import \{ soarHumano \}/);
    expect((t.match(/soarHumano\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("uma pergunta por turno, não as três do engenheiro", () => {
    const t = ler(LIB[0]);
    // A adaptação de ritmo: pega a PRÓXIMA não feita, nunca devolve a lista.
    expect(t).toMatch(/perguntas\.find\(/);
    expect(t).not.toMatch(/alternativas: perguntas/);
  });
});

/*
 * Regressão de 10/09/2026. A escolha de chip é gravada como `dados.tipo ===
 * "escolha"`, e `ideiaAcumulada` a EXCLUI de propósito (senão o texto solto
 * "Pôr do sol" viraria uma frase do corretor). Enquanto `montarPromptFinal`
 * existia, ela voltava por `respostas`; ao trocá-lo pelo tradutor, a coleta
 * ficou e o consumo sumiu — o corretor respondia e nada mudava.
 *
 * Falha CALADA: a tela continua perguntando, o chip continua sendo tocado, a
 * imagem continua saindo. Só o resultado ignora a resposta.
 */
describe("a resposta de chip não pode ser coletada e jogada fora", () => {
  it("o turno de arte manda as respostas ao tradutor", () => {
    const t = ler(LIB[0]);
    expect(t).toMatch(/traduzirPedido\(\{[\s\S]*?respostas,[\s\S]*?\}\)/);
  });

  it("as heurísticas de tamanho e receita leem a escolha, não só o que foi digitado", () => {
    const t = ler(LIB[0]);
    // "Story" tocado no chip tem de virar retrato; lendo só `ideia`, virava quadrado.
    expect(t).toMatch(/tamanhoDoTexto\(textoDaHeuristica\)/);
    expect(t).toMatch(/receitaDoTexto\(textoDaHeuristica,/);
  });

  it("o imóvel continua saindo do que o corretor DIGITOU", () => {
    // Alternativa curta ("Alta", "Manhã") casaria com nome de empreendimento
    // por acidente — falso positivo já medido nesta base.
    const t = ler(LIB[0]);
    expect(t).toMatch(/imovelPorTexto\(ideia,/);
  });
});

describe("contrato", () => {
  it("recusa dados sem forma em vez de derrubar a conversa", () => {
    expect(dadosDaMensagem(null)).toBeNull();
    expect(dadosDaMensagem({ tipo: "pergunta", texto: "x", alternativas: ["a"] })).toBeNull();
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte" })).toBeNull();
    expect(dadosDaMensagem({ tipo: "inventado" })).toBeNull();
  });

  it("aceita o que tem forma", () => {
    expect(
      dadosDaMensagem({ tipo: "pergunta", id: "p0", texto: "Que hora do dia?", alternativas: ["Manhã", "Pôr do sol"] }),
    ).toMatchObject({ tipo: "pergunta", alternativas: ["Manhã", "Pôr do sol"] });
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte", prompt: "uma fachada", qualidade: "medium" })).toMatchObject({
      modo: "arte",
      qualidade: "medium",
    });
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte", prompt: "uma fachada", qualidade: "high" })).toMatchObject({
      qualidade: "low",
    });
  });

  it("confirmação curta é confirmação; frase de ajuste não é", () => {
    for (const s of ["ok", "Ok!", "pode gerar", "sim", "tá bom", "bora"]) expect(ehConfirmacao(s)).toBe(true);
    for (const s of ["ok mas mais claro", "tira a piscina", "quero um story"]) expect(ehConfirmacao(s)).toBe(false);
  });

  it("título corta em 48 sem quebrar palavra no meio do reticência", () => {
    expect(tituloDaConversa("")).toBe("Nova conversa");
    expect(tituloDaConversa("fachada do Eternity")).toBe("fachada do Eternity");
    const longo = tituloDaConversa("a".repeat(80));
    expect(longo.length).toBeLessThanOrEqual(48);
    expect(longo.endsWith("…")).toBe(true);
  });
});

describe("foto de referência no chat (06/09/2026)", () => {
  const msg = (papel: "corretor" | "ia", dados: unknown): MensagemDoEstudio => ({
    id: crypto.randomUUID(),
    papel,
    conteudo: "x",
    dados: dadosDaMensagem(dados),
    imagemId: null,
    videoJobId: null,
    createdAt: "2026-09-06T00:00:00Z",
  });

  it("o contrato aceita referência com forma e recusa sem", () => {
    expect(dadosDaMensagem({ tipo: "referencia", path: "corretores/x/referencias/a.jpg", url: "https://u" }))
      .toMatchObject({ tipo: "referencia", path: "corretores/x/referencias/a.jpg" });
    expect(dadosDaMensagem({ tipo: "referencia", path: "", url: "https://u" })).toBeNull();
    expect(dadosDaMensagem({ tipo: "referencia", path: "a.jpg" })).toBeNull();
  });

  it("a proposta de arte carrega o referenciaPath pelo parse", () => {
    expect(
      dadosDaMensagem({ tipo: "proposta", modo: "arte", prompt: "uma fachada", referenciaPath: "corretores/x/r/a.jpg" }),
    ).toMatchObject({ referenciaPath: "corretores/x/r/a.jpg" });
    expect(dadosDaMensagem({ tipo: "proposta", modo: "arte", prompt: "uma fachada" })).toMatchObject({
      referenciaPath: null,
      referenciaPaths: [],
    });
  });

  it("a proposta de vídeo carrega fotosExtras pelo parse", () => {
    expect(
      dadosDaMensagem({ tipo: "proposta", modo: "video", slug: "s", fotosExtras: ["https://a", "", "https://b"] }),
    ).toMatchObject({ fotosExtras: ["https://a", "https://b"] });
  });

  it("a referência ativa é a ÚLTIMA anexada — anexar outra é trocar", () => {
    const h = [
      msg("corretor", { tipo: "referencia", path: "corretores/x/r/1.jpg", url: "u1" }),
      msg("ia", null),
      msg("corretor", { tipo: "referencia", path: "corretores/x/r/2.jpg", url: "u2" }),
    ];
    expect(referenciaAtiva(h)?.path).toBe("corretores/x/r/2.jpg");
    expect(referenciaAtiva([msg("ia", null)])).toBeNull();
  });

  it("um único anexo pode carregar até quatro fotos para a mesma proposta", () => {
    const h = [
      msg("corretor", {
        tipo: "referencia",
        path: "corretores/x/r/1.jpg",
        url: "u1",
        referencias: [
          { path: "corretores/x/r/1.jpg", url: "u1" },
          { path: "corretores/x/r/2.jpg", url: "u2" },
        ],
      }),
    ];
    expect(referenciasAtivas(h).map((r) => r.path)).toEqual(["corretores/x/r/1.jpg", "corretores/x/r/2.jpg"]);
  });

  it("as referências da conversa deduplicam por path, na ordem", () => {
    const h = [
      msg("corretor", { tipo: "referencia", path: "p1", url: "u1" }),
      msg("corretor", { tipo: "referencia", path: "p2", url: "u2" }),
      msg("corretor", { tipo: "referencia", path: "p1", url: "u1" }),
    ];
    expect(referenciasDaConversa(h).map((r) => r.path)).toEqual(["p1", "p2"]);
  });

  it("a action valida o prefixo da pasta do corretor — caminho forjado não entra", () => {
    const a = ler(ACOES);
    expect(a).toMatch(/referencia\.path\.startsWith\(`corretores\/\$\{corretor\.id\}\/`\)/);
  });

  it("a foto do catálogo viaja como ID, nunca como URL", () => {
    const tela = ler(TELAS[0]);
    // URL escolhida pelo cliente faria o servidor baixar qualquer endereço da
    // internet. Com o id, quem recorta é a RLS sobre `midias`.
    expect(tela).toMatch(/midiaId: midiaId/);
    expect(tela).not.toMatch(/midiaUrl|fotoUrl:/);
  });

  it("o upload do navegador só escreve na pasta do próprio corretor", () => {
    const u = ler("src/app/corretor/(painel)/estudio/uploadReferencia.ts");
    expect(u).toMatch(/corretores\/\$\{corretorId\}\/referencias\//);
  });

  /*
   * Reescrita em 10/09/2026, não afrouxada. A invariante continua a MESMA — o
   * caminho sai da proposta, nunca de uma variável solta —, mas a linha ganhou
   * o caso da foto do catálogo: quando o corretor escolhe uma foto do imóvel
   * na faixa, ela substitui a anexada, e aí o `referenciaPath` não vai.
   */
  it("'Gerar assim' manda as referencias da PROPOSTA, não um caminho solto", () => {
    const tela = ler(TELAS[0]);
    expect(tela).toMatch(/referenciaPaths:[^;]*p\.referenciaPaths/);
  });

  it("as fotos extras do vídeo saem da proposta GRAVADA, nunca do POST da tela", () => {
    const a = ler(ACOES);
    expect(a).toMatch(/gravada\.dados\.fotosExtras/);
    expect(a).not.toMatch(/params\.proposta\.fotosExtras/);
  });
});
