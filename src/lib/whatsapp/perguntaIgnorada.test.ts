import { describe, expect, it } from "vitest";
import { blocoPerguntaIgnorada, perguntaIgnorada } from "./perguntaIgnorada";
import type { Fala } from "./rajada";

const cliente = (texto: string): Fala => ({ remetente: "cliente", texto });
const bot = (texto: string): Fala => ({ remetente: "bot", texto });

describe("perguntaIgnorada", () => {
  it("não acusa nada na primeira vez que ele pergunta", () => {
    expect(
      perguntaIgnorada({ historico: [], mensagemAtual: "qual o valor do imóvel?" }),
    ).toBeNull();
  });

  /*
   * O caso real que originou o módulo (`insiste-no-desconto`, eval da v25):
   * o cliente perguntou o valor doze vezes e recebeu doze desvios.
   */
  it("reconhece a pergunta repetida e conta as vezes", () => {
    const achado = perguntaIgnorada({
      historico: [
        cliente("qual o valor do imóvel?"),
        bot("Sei que o valor é importante, mas varia por unidade."),
        cliente("mas qual o valor do imóvel?"),
        bot("Me conta, qual região você prefere?"),
      ],
      mensagemAtual: "qual o valor do imóvel?",
    });

    expect(achado?.vezes).toBe(3);
    expect(achado?.sobreDinheiro).toBe(true);
  });

  it("só conta o que o CLIENTE perguntou — a fala do bot não é repetição dele", () => {
    const achado = perguntaIgnorada({
      historico: [bot("qual o valor que você tem em mente?"), bot("qual o valor?")],
      mensagemAtual: "qual o valor do imóvel?",
    });
    expect(achado).toBeNull();
  });

  it("pergunta nova, mesmo depois de outra repetida, não vira pendência", () => {
    expect(
      perguntaIgnorada({
        historico: [cliente("qual o valor?"), cliente("qual o valor?")],
        mensagemAtual: "tem academia no prédio?",
      }),
    ).toBeNull();
  });

  it("quando há duas repetidas, devolve a mais insistente", () => {
    const achado = perguntaIgnorada({
      historico: [
        cliente("qual o valor do imóvel?"),
        cliente("qual o valor do imóvel?"),
        cliente("tem vaga coberta?"),
      ],
      mensagemAtual: "qual o valor do imóvel? e tem vaga coberta?",
    });
    expect(achado?.vezes).toBe(3);
    expect(achado?.sobreDinheiro).toBe(true);
  });

  it("separa dinheiro do resto — os dois têm resposta certa diferente", () => {
    const outro = perguntaIgnorada({
      historico: [cliente("tem churrasqueira?")],
      mensagemAtual: "tem churrasqueira?",
    });
    expect(outro?.sobreDinheiro).toBe(false);
  });

  it("texto sem pergunta nenhuma não dispara", () => {
    expect(
      perguntaIgnorada({
        historico: [cliente("qual o valor?")],
        mensagemAtual: "ok, obrigado",
      }),
    ).toBeNull();
  });

  /*
   * Paráfrase distante NÃO é detectada, e é decidido: acusar repetição que
   * não houve faria a Sofia se desculpar por algo que respondeu.
   */
  it("não inventa repetição em pergunta de assunto diferente", () => {
    expect(
      perguntaIgnorada({
        historico: [cliente("qual o valor do imóvel?")],
        mensagemAtual: "qual o horário da portaria?",
      }),
    ).toBeNull();
  });
});

describe("blocoPerguntaIgnorada", () => {
  it("no caso de dinheiro, manda oferecer a visita com horário concreto", () => {
    const texto = blocoPerguntaIgnorada({
      pergunta: "qual o valor?",
      vezes: 2,
      sobreDinheiro: true,
    });
    expect(texto).toContain("PARE");
    expect(texto).toContain("construtora");
    expect(texto).toContain("visita");
    expect(texto).toContain("horário CONCRETO");
  });

  it("fora de dinheiro, manda responder e proíbe repetir a qualificação", () => {
    const texto = blocoPerguntaIgnorada({
      pergunta: "tem churrasqueira?",
      vezes: 2,
      sobreDinheiro: false,
    });
    expect(texto).toContain("Responda o que ele perguntou");
    expect(texto).toContain("NÃO repita a pergunta de qualificação");
    expect(texto).not.toContain("construtora");
  });

  it("a partir da terceira vez, pede o reconhecimento curto", () => {
    const texto = blocoPerguntaIgnorada({ pergunta: "x?", vezes: 3, sobreDinheiro: false });
    expect(texto).toContain("reconheça em UMA frase curta");
  });

  it("na segunda vez ainda não pede desculpa — seria pesado cedo demais", () => {
    const texto = blocoPerguntaIgnorada({ pergunta: "x?", vezes: 2, sobreDinheiro: false });
    expect(texto).not.toContain("reconheça em UMA frase curta");
  });
});
