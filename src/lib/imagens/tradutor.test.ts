import { beforeEach, describe, expect, it, vi } from "vitest";

const chamarLlmJson = vi.fn();
const algumProvedorLeImagem = vi.fn(() => true);
vi.mock("@/lib/whatsapp/llm", () => ({
  chamarLlmJson: (...args: unknown[]) => chamarLlmJson(...args),
  algumProvedorLeImagem: () => algumProvedorLeImagem(),
}));

const { traduzirPedido } = await import("./tradutor");

function respostaOk(prompt: string) {
  return {
    ok: true,
    json: { prompt },
    latenciaMs: 1200,
    tokensEntrada: 300,
    tokensSaida: 120,
    modelo: "gpt-4.1-mini",
  };
}

const BOM =
  "Fachada de edifício residencial alto vista da calçada em leve contra-plongée, " +
  "fim de tarde com luz quente e rasante, concreto claro e vidro refletivo, " +
  "paisagismo tropical no térreo. Sem pessoas com rosto reconhecível e sem texto na cena.";

beforeEach(() => {
  chamarLlmJson.mockReset();
  algumProvedorLeImagem.mockReset().mockReturnValue(true);
});

describe("o tradutor devolve português, e é ele que vai", () => {
  it("usa o texto do modelo quando ele responde", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({ pedido: "fachada bonita", fatos: [] });
    expect(r.prompt).toBe(BOM);
    expect(r.daIa).toBe(true);
  });

  it("os fatos do imóvel entram no prompt DO MOTOR", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "post do Dom Parque", fatos: ["Empreendimento: Dom Parque"] });
    expect(chamarLlmJson.mock.calls[0][0]).toContain("Dom Parque");
  });

  /*
   * Regressão de 10/09/2026, achada por um `no-unused-vars`. O caminho antigo
   * (`montarPromptFinal`) consumia as escolhas de chip; ao trocá-lo pelo
   * tradutor, elas passaram a ser coletadas e JOGADAS FORA — o corretor
   * respondia a pergunta e a resposta não chegava a lugar nenhum. Pergunta que
   * não muda o resultado é pior que pergunta nenhuma: cobra um toque e mente.
   */
  it("as escolhas de chip entram no prompt DO MOTOR, com a pergunta junto", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({
      pedido: "fachada do Dom Parque",
      fatos: [],
      respostas: [{ pergunta: "Que hora do dia?", escolha: "Pôr do sol" }],
    });
    const enviado = String(chamarLlmJson.mock.calls[0][0]);
    expect(enviado).toContain("Pôr do sol");
    expect(enviado).toContain("Que hora do dia?");
  });

  it("escolha em branco não vira linha no prompt", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({
      pedido: "fachada",
      fatos: [],
      respostas: [{ pergunta: "Que hora do dia?", escolha: "   " }],
    });
    expect(String(chamarLlmJson.mock.calls[0][0])).not.toContain("já respondeu");
  });

  it("a instrução da gramática viaja junto — senão o modelo não sabe o que cobrir", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "fachada", fatos: [] });
    const enviado = String(chamarLlmJson.mock.calls[0][0]).toLowerCase();
    expect(enviado).toContain("restrições");
    expect(enviado).toContain("soletr");
  });
});

describe("falha do motor é degradação DECLARADA", () => {
  it("motor fora do ar devolve o texto do corretor com daIa false", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "sem_api_key", latenciaMs: 0 });
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.prompt).toBe("fachada bonita ao entardecer");
    expect(r.daIa).toBe(false);
  });

  it("resposta curta demais é RECUSADA — trocar o texto do corretor por duas palavras é pior que não tentar", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk("um prédio"));
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.daIa).toBe(false);
    expect(r.prompt).toBe("fachada bonita ao entardecer");
  });

  it("JSON sem o campo esperado também cai na reserva", async () => {
    chamarLlmJson.mockResolvedValue({ ...respostaOk(""), json: { outro: "coisa" } });
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.daIa).toBe(false);
  });
});

describe("o portão", () => {
  it("marca abaixoDoPiso para o caso `Torre.`", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "http_5xx", latenciaMs: 10 });
    const r = await traduzirPedido({ pedido: "Torre.", fatos: [] });
    expect(r.abaixoDoPiso).toBe(true);
  });

  it("prompt completo não fica abaixo do piso nem tem pendência", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({ pedido: "fachada", fatos: [] });
    expect(r.abaixoDoPiso).toBe(false);
    expect(r.naoCobriu).toEqual([]);
  });

  it("ajuste parte do prompt ANTERIOR, não do zero", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "mais claro", fatos: [], promptAnterior: BOM });
    const enviado = String(chamarLlmJson.mock.calls[0][0]);
    expect(enviado).toContain(BOM);
    expect(enviado.toLowerCase()).toContain("mude apenas");
  });

  it("pedido vazio não gasta chamada nenhuma", async () => {
    const r = await traduzirPedido({ pedido: "   ", fatos: [] });
    expect(chamarLlmJson).not.toHaveBeenCalled();
    expect(r.prompt).toBe("");
    expect(r.abaixoDoPiso).toBe(true);
  });
});

/*
 * O caso que veio de PRODUÇÃO (15/09/2026).
 *
 * Com a foto de uma torre anexada e o pedido "deixe a primeira imagem parecida
 * com a segunda, mas com uma frase que chame mais atenção", o tradutor
 * devolveu "um apartamento moderno... sala de estar... sofá elegante e mesa de
 * centro". Nada disso estava na foto nem no pedido: o modelo é de TEXTO, nunca
 * recebe a imagem, e a instrução antiga mandava "descreva a cena a partir
 * dela" enquanto a gramática exigia 200 a 600 caracteres cobrindo quatro
 * seções. Inventar era a única saída que satisfazia as duas.
 */
describe("com foto anexada, o tradutor NÃO manda descrever o que não vê", () => {
  const PEDIDO_REAL =
    "Quero que deixe a primeira imagem parecida com a segunda, mas com uma frase " +
    "que chame mais atenção e atraia mais clientes";

  async function promptDoMotor(fotos: number) {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: PEDIDO_REAL, fatos: [], fotosDeReferencia: fotos });
    return String(chamarLlmJson.mock.calls[0][0]);
  }

  it("diz ao modelo, em voz alta, que ele NÃO está vendo as fotos", async () => {
    const enviado = await promptDoMotor(2);
    expect(enviado).toContain("VOCÊ NÃO ESTÁ VENDO ESSAS FOTOS");
    expect(enviado).toMatch(/NUNCA descreva o que há nelas/i);
  });

  it("não manda descrever a cena a partir da foto — era a instrução impossível", async () => {
    const enviado = await promptDoMotor(1);
    expect(enviado).not.toMatch(/Descreva a cena a partir dela/i);
  });

  it("nomeia as fotos pela POSIÇÃO, que é como o corretor fala delas", async () => {
    const enviado = await promptDoMotor(2);
    expect(enviado).toContain("anexou 2 fotos");
    expect(enviado).toContain("a 1ª");
    expect(enviado).toContain("a 2ª");
  });

  it("a gramática de CRIAÇÃO fica de fora — é ela que obriga a inventar cena", async () => {
    const enviado = await promptDoMotor(1);
    expect(enviado).not.toContain("Entre 200 e 600 caracteres");
    expect(enviado).not.toMatch(/Sujeito: o que aparece em primeiro plano/);
  });

  it("sem foto, a gramática de criação continua valendo inteira", async () => {
    const enviado = await promptDoMotor(0);
    expect(enviado).toContain("Entre 200 e 600 caracteres");
    expect(enviado).not.toContain("VOCÊ NÃO ESTÁ VENDO");
  });

  it("instrução curta de edição não é acusada de incompleta nem de abaixo do piso", async () => {
    const edicao = "Deixe a 1ª foto com o enquadramento e a luz da 2ª foto.";
    chamarLlmJson.mockResolvedValue(respostaOk(edicao));

    const r = await traduzirPedido({
      pedido: PEDIDO_REAL,
      fatos: [],
      fotosDeReferencia: 2,
    });

    // 54 caracteres: reprovaria no piso de CRIAÇÃO (80) e acusaria três seções.
    expect(r.prompt).toBe(edicao);
    expect(r.naoCobriu).toEqual([]);
    expect(r.abaixoDoPiso).toBe(false);
  });

  it("`Torre.` continua barrado mesmo com foto — piso de edição não é piso nenhum", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false });

    const r = await traduzirPedido({ pedido: "Torre.", fatos: [], fotosDeReferencia: 1 });

    expect(r.abaixoDoPiso).toBe(true);
  });
});

/*
 * A correção seguinte (15/09/2026): o modelo passou a OLHAR as fotos.
 *
 * O caminho cego continua inteiro logo acima — ele é a degradação, não um
 * erro, e vale sempre que não houver provedor com visão configurado.
 */
describe("com visão, o modelo olha as fotos em vez de adivinhar", () => {
  const PEDIDO = "Deixe a primeira imagem parecida com a segunda, com uma frase que chame atenção";
  const URLS = ["https://sto/ref/a.jpg", "https://sto/ref/b.jpg"];

  async function traduzirComFotos(extra: Partial<Parameters<typeof traduzirPedido>[0]> = {}) {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({
      pedido: PEDIDO,
      fatos: [],
      fotosDeReferencia: 2,
      urlsDeReferencia: URLS,
      ...extra,
    });
    return { r, prompt: String(chamarLlmJson.mock.calls[0][0]), opts: chamarLlmJson.mock.calls[0][1] };
  }

  it("manda as URLs na chamada, na ordem em que o corretor anexou", async () => {
    const { opts } = await traduzirComFotos();
    expect(opts.imagens).toEqual(URLS);
  });

  it("diz ao modelo que ele ESTÁ vendo, e não o contrário", async () => {
    const { prompt } = await traduzirComFotos();
    expect(prompt).toContain("Você está vendo as 2 fotos");
    expect(prompt).not.toContain("VOCÊ NÃO ESTÁ VENDO");
  });

  it("marca `viuAsFotos` para a tela poder dizer isso ao corretor", async () => {
    const { r } = await traduzirComFotos();
    expect(r.viuAsFotos).toBe(true);
  });

  it("sem provedor com visão, volta ao caminho CEGO e não manda imagem", async () => {
    algumProvedorLeImagem.mockReturnValue(false);
    const { r, prompt, opts } = await traduzirComFotos();

    expect(opts.imagens).toBeUndefined();
    expect(prompt).toContain("VOCÊ NÃO ESTÁ VENDO ESSAS FOTOS");
    expect(r.viuAsFotos).toBe(false);
  });

  it("sem as URLs, também é caminho cego — não se promete o que não se manda", async () => {
    const { r, prompt, opts } = await traduzirComFotos({ urlsDeReferencia: [] });

    expect(opts.imagens).toBeUndefined();
    expect(prompt).toContain("VOCÊ NÃO ESTÁ VENDO ESSAS FOTOS");
    expect(r.viuAsFotos).toBe(false);
  });

  it("motor que falha não deixa `viuAsFotos` verdadeiro — não houve leitura nenhuma", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false });
    const r = await traduzirPedido({
      pedido: PEDIDO,
      fatos: [],
      fotosDeReferencia: 2,
      urlsDeReferencia: URLS,
    });
    expect(r.viuAsFotos).toBe(false);
    expect(r.daIa).toBe(false);
  });

  it("nunca manda mais fotos do que o gerador aceita", async () => {
    const seis = Array.from({ length: 6 }, (_, i) => `https://sto/ref/${i}.jpg`);
    const { opts } = await traduzirComFotos({ fotosDeReferencia: 6, urlsDeReferencia: seis });
    expect(opts.imagens).toHaveLength(4);
  });

  it("com foto, o orçamento é maior — ele ainda precisa baixar e olhar", async () => {
    const { opts } = await traduzirComFotos();
    const semFoto = (async () => {
      chamarLlmJson.mockClear();
      chamarLlmJson.mockResolvedValue(respostaOk(BOM));
      await traduzirPedido({ pedido: PEDIDO, fatos: [] });
      return chamarLlmJson.mock.calls[0][1];
    })();
    expect(opts.orcamentoMs).toBeGreaterThan((await semFoto).orcamentoMs);
  });
});

describe("o ofício entra no prompt, e é filtrado pelo regime", () => {
  it("criar do zero recebe a hora que vende; editar foto, não", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "fachada do Eternity", fatos: [], dominio: "imovel" });
    const criacao = String(chamarLlmJson.mock.calls[0][0]);

    chamarLlmJson.mockClear();
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({
      pedido: "clareia essa foto",
      fatos: [],
      fotosDeReferencia: 1,
      dominio: "imovel",
    });
    const edicao = String(chamarLlmJson.mock.calls[0][0]);

    expect(criacao).toContain("hora azul");
    expect(edicao).not.toContain("hora azul");
  });

  it("editar foto recebe o que PRESERVAR; criar do zero, não", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({
      pedido: "clareia essa foto",
      fatos: [],
      fotosDeReferencia: 1,
      dominio: "imovel",
    });
    const edicao = String(chamarLlmJson.mock.calls[0][0]);

    chamarLlmJson.mockClear();
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "fachada do Eternity", fatos: [], dominio: "imovel" });
    const criacao = String(chamarLlmJson.mock.calls[0][0]);

    expect(edicao).toContain("Preserve a arquitetura");
    expect(criacao).not.toContain("Preserve a arquitetura");
  });

  it("as regras que valem sempre vão nos dois regimes", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "fachada", fatos: [], dominio: "imovel" });
    expect(String(chamarLlmJson.mock.calls[0][0])).toContain("aprumadas");
  });

  it("pedido LIVRE não recebe o ofício de arquitetura — o Estúdio não é só de imóvel", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "um cachorro de papai noel", fatos: [] });
    const enviado = String(chamarLlmJson.mock.calls[0][0]);

    expect(enviado).not.toContain("aprumadas");
    expect(enviado).toContain("UM assunto principal");
  });
});
