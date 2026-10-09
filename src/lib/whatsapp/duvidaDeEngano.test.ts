import { describe, expect, it } from "vitest";
import { duvidaSobreOContato, ofereceuParar, semADuvidaDeEngano } from "./duvidaDeEngano";
import { detectarRecusa } from "./recusaDoCliente";
import { montarPromptDeRecusa, temSinalNegativo } from "./recusaEmCamadas";
import { blocoDaJogada, estadoDaConversa, planejarJogada, travaDeQualificacao } from "./jogada";
import type { Fala } from "./rajada";

/**
 * "Acho que você mandou errado" virou pedido para parar em 08/10/2026: a IA
 * se despediu e o lead foi marcado "não contatar" (ver `duvidaDeEngano.ts`).
 */

const bot = (texto: string): Fala => ({ remetente: "bot", texto });
const cliente = (texto: string): Fala => ({ remetente: "cliente", texto });

const COMECO = { falasAnterioresDoCliente: 0 };
const MEIO = { falasAnterioresDoCliente: 5 };

const LISTA = bot(
  "Bom dia! Saiu o lançamento do Vitra Alphaville, com 2 e 3 dormitórios perto do shopping. Quer que eu te mande as plantas?",
);

describe("dúvida sobre o contato", () => {
  it("o caso medido: 'acho que você mandou errado' é dúvida, e não vai à IA de recusa", () => {
    const fala = "Bom dia.. acho que você mandou errado";
    expect(detectarRecusa(fala)).toBeNull();
    expect(temSinalNegativo(fala)).toBe(false);
    expect(duvidaSobreOContato(fala, COMECO)).not.toBeNull();
  });

  it.each([
    "quem é?",
    "Oi, quem é?",
    "quem é você?",
    "quem são vocês?",
    "quem fala?",
    "quem tá falando?",
    "de onde você tirou meu número?",
    "como conseguiu meu contato?",
    "quem te passou meu número?",
    "é pra mim essa mensagem?",
    "essa mensagem é pra mim?",
    "é comigo?",
    "não te conheço",
  ])("pergunta de quem escreve vale em qualquer ponto da conversa: %s", (fala) => {
    expect(duvidaSobreOContato(fala, MEIO)).not.toBeNull();
    expect(detectarRecusa(fala)).toBeNull();
    expect(temSinalNegativo(fala)).toBe(false);
  });

  it.each(["foi engano?", "acho que mandou errado", "acho que é engano", "mensagem errada", "me cadastrei por engano"])(
    "suspeita de engano vale no começo da conversa: %s",
    (fala) => {
      expect(duvidaSobreOContato(fala, COMECO)).not.toBeNull();
      expect(duvidaSobreOContato(fala, { falasAnterioresDoCliente: 1 })).not.toBeNull();
    },
  );

  it("no meio do atendimento, 'mandou errado' é sobre o que foi mandado, não sobre o contato", () => {
    expect(duvidaSobreOContato("acho que você mandou errado", MEIO)).toBeNull();
    expect(duvidaSobreOContato("acho que você mandou errado", { falasAnterioresDoCliente: 2 })).toBeNull();
  });

  it("com a foto, a planta ou o link logo depois, a queixa é do conteúdo, mesmo no começo", () => {
    expect(duvidaSobreOContato("você mandou errado a planta, essa não é do Vitra", COMECO)).toBeNull();
    expect(duvidaSobreOContato("acho que mandou errado o link", COMECO)).toBeNull();
  });

  it("'não foi engano' confirma o interesse", () => {
    expect(duvidaSobreOContato("não foi engano não, quero saber mais", COMECO)).toBeNull();
  });

  it("frase com 'quem é' ou 'pra mim' que não é sobre o contato fica de fora", () => {
    expect(duvidaSobreOContato("quem é a construtora do Vitra?", MEIO)).toBeNull();
    expect(duvidaSobreOContato("quem é o corretor que vai me atender na visita?", MEIO)).toBeNull();
    expect(duvidaSobreOContato("acho que esse apartamento é pra mim!", COMECO)).toBeNull();
  });

  it("afirmar que o número é de outra pessoa continua sendo pedido para parar (a regex decide antes)", () => {
    expect(detectarRecusa("número errado")?.familia).toBe("parada");
    expect(detectarRecusa("não sou eu")?.familia).toBe("parada");
    expect(detectarRecusa("acho que mandou pra pessoa errada")?.familia).toBe("parada");
    expect(detectarRecusa("quem te deu meu número? não conheço vocês")?.familia).toBe("parada");
  });

  it("dúvida junto com pedido para parar ainda vai à IA: o que sobra decide", () => {
    expect(temSinalNegativo("acho que mandou errado, pode tirar meu número")).toBe(true);
    expect(temSinalNegativo("quem é? não quero receber isso")).toBe(true);
  });

  it("tirar a dúvida não apaga o resto da fala", () => {
    expect(semADuvidaDeEngano("acho que mandou errado, pode tirar meu número")).toContain("tirar meu numero");
  });

  it("a instrução da IA de recusa trata a dúvida como 'nenhuma' e só a AFIRMAÇÃO como parada", () => {
    const prompt = montarPromptDeRecusa({
      ultimaFalaNossa: "Bom dia! Saiu o lançamento do Vitra.",
      falaDoCliente: "acho que mandou errado",
    });
    expect(prompt).toMatch(/DÚVIDA sobre quem escreve/);
    expect(prompt).toMatch(/AFIRMA que o número é de outra pessoa/);
    expect(prompt).not.toMatch(/não conhece a empresa/);
  });
});

describe("a jogada de esclarecer o contato", () => {
  it("no começo: diz quem escreve e por quê, e oferece parar, sem pergunta de funil", () => {
    const estado = estadoDaConversa({
      historico: [LISTA],
      mensagemAtual: "Bom dia.. acho que você mandou errado",
      imovelEmFoco: null,
      catalogo: [],
    });
    const jogada = planejarJogada(estado);
    expect(jogada).toMatchObject({ tipo: "esclarecer_contato", oferecerParar: true });

    const bloco = blocoDaJogada(jogada, { nomeDoFoco: null, nomeAssistente: "Sofia", nomeCorretor: "Ramos" });
    expect(bloco).toMatch(/a Sofia/);
    expect(bloco).toMatch(/do corretor Ramos/);
    expect(bloco).toMatch(/continuar recebendo/);
    expect(bloco).toMatch(/NÃO invente de onde veio o número/);
    expect(bloco).toMatch(/Nenhuma pergunta de região/);
  });

  it("quem pergunta quem escreve não ganha a trava da qualificação ('em qual região?')", () => {
    const estado = estadoDaConversa({ historico: [LISTA], mensagemAtual: "quem é?", imovelEmFoco: null, catalogo: [] });
    const jogada = planejarJogada(estado);
    expect(jogada.tipo).toBe("esclarecer_contato");
    expect(travaDeQualificacao(jogada, estado)).toBeNull();
  });

  it("no meio da conversa, 'quem é você?' recebe a resposta sem a oferta de parar", () => {
    const historico = [
      LISTA,
      cliente("quero sim"),
      bot("Que bom! Em qual região você procura?"),
      cliente("Barueri"),
      bot("Ótimo. Prefere pronto para morar ou na planta?"),
      cliente("na planta"),
    ];
    const jogada = planejarJogada(
      estadoDaConversa({ historico, mensagemAtual: "quem é você?", imovelEmFoco: null, catalogo: [] }),
    );
    expect(jogada).toMatchObject({ tipo: "esclarecer_contato", oferecerParar: false });
    expect(blocoDaJogada(jogada, { nomeDoFoco: null })).not.toMatch(/continuar recebendo/);
  });

  it("a recusa ganha da dúvida: 'foi engano, me tira da lista' encerra", () => {
    const jogada = planejarJogada(
      estadoDaConversa({ historico: [LISTA], mensagemAtual: "foi engano, me tira da lista", imovelEmFoco: null, catalogo: [] }),
    );
    expect(jogada.tipo).toBe("encerrar_recusado");
  });

  it("sem nome da assistente nem do corretor, o bloco ainda diz quem escreve", () => {
    const bloco = blocoDaJogada(
      { tipo: "esclarecer_contato", oQueEleDisse: "quem é?", oferecerParar: true },
      { nomeDoFoco: null },
    );
    expect(bloco).toMatch(/você é a assistente/);
    expect(bloco).toMatch(/este WhatsApp é do corretor/);
  });
});

describe("depois da oferta de parar", () => {
  const OFERTA = bot(
    "Oi! Aqui é a Sofia, assistente digital da Next Home, no WhatsApp do corretor Ramos. Te escrevi sobre o lançamento do Vitra. Se foi engano, desculpa! Quer continuar recebendo novidades de imóveis por aqui?",
  );

  it("reconhece a oferta, do jeito que a jogada a escreve e com outras palavras", () => {
    expect(ofereceuParar(OFERTA.texto)).toBe(true);
    expect(ofereceuParar("Se não quiser, me avisa que eu não te mando mais nada.")).toBe(true);
    expect(ofereceuParar("Prefere que eu pare de te mandar?")).toBe(true);
    expect(ofereceuParar("Quer que eu te mande as plantas?")).toBe(false);
  });

  it("o 'não' seco vira pedido para parar mesmo sem a IA de recusa", () => {
    expect(detectarRecusa("não", { ofereceuParar: true })?.familia).toBe("parada");
    expect(detectarRecusa("não, obrigado", { ofereceuParar: true })?.familia).toBe("parada");
    // Sem a oferta, "não" continua sendo resposta comum (ao funil, por exemplo).
    expect(detectarRecusa("não")).toBeNull();
    // "obrigado" sozinho pode ser só educação: fica para a IA, com a oferta de contexto.
    expect(detectarRecusa("obrigado", { ofereceuParar: true })).toBeNull();
    expect(temSinalNegativo("obrigado")).toBe(true);
  });

  it("o planner encerra no 'não' e segue a conversa no 'sim'", () => {
    const historico = [LISTA, cliente("acho que você mandou errado"), OFERTA];
    const nao = planejarJogada(estadoDaConversa({ historico, mensagemAtual: "não", imovelEmFoco: null, catalogo: [] }));
    expect(nao).toMatchObject({ tipo: "encerrar_recusado", familia: "parada" });

    const sim = planejarJogada(
      estadoDaConversa({ historico, mensagemAtual: "sim, pode mandar", imovelEmFoco: null, catalogo: [] }),
    );
    expect(sim.tipo).not.toBe("encerrar_recusado");
    expect(sim.tipo).not.toBe("esclarecer_contato");
  });
});
