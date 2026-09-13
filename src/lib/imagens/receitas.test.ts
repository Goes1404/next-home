import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { promptFinal } from "./gerarImagem";
import { RECEITAS, RECEITA_PADRAO, montarPedido, receitaPor } from "./receitas";

describe("receitas", () => {
  it("cai em 'livre' para chave desconhecida, nula ou ausente", () => {
    // Chave que não existe não pode escolher uma receita QUALQUER: "mobiliar
    // ambiente vazio" exige foto, e cair nela por engano barraria a geração
    // de quem não pediu receita nenhuma.
    for (const chave of ["inexistente", null, undefined, ""]) {
      expect(receitaPor(chave).chave).toBe("livre");
    }
  });

  it("tem a receita padrão na lista", () => {
    expect(RECEITAS.some((r) => r.chave === RECEITA_PADRAO)).toBe(true);
  });

  it("só marca precisaFoto em receita que de fato parte de uma foto", () => {
    // Quem exige foto BARRA a geração sem ela. Marcar isso à toa em uma
    // receita que cria do zero deixaria o botão morto sem motivo.
    const exigem = RECEITAS.filter((r) => r.precisaFoto).map((r) => r.chave);
    expect(exigem).toEqual(["ambientar", "melhorar_foto"]);
  });

  it("'livre' devolve exatamente o que o corretor escreveu", () => {
    expect(montarPedido("  um gato de óculos  ", receitaPor("livre"))).toBe("um gato de óculos");
  });

  it("põe a espinha DEPOIS do pedido, para o assunto continuar sendo o assunto", () => {
    const r = receitaPor("ambientar");
    const montado = montarPedido("sala de estar, tons claros", r);
    expect(montado.indexOf("sala de estar")).toBeLessThan(montado.indexOf(r.espinha));
  });

  it("toda receita com espinha carrega o que o corretor não saberia pedir", () => {
    // A espinha existe para trazer luz, ângulo e realismo — se ela virar uma
    // frase decorativa, a receita deixa de melhorar o resultado e vira só um
    // rótulo na tela.
    for (const r of RECEITAS.filter((x) => x.espinha)) {
      expect(r.espinha.length, r.chave).toBeGreaterThan(80);
      expect(r.espinha.toLowerCase(), r.chave).toMatch(
        // Direção de luz OU de câmera. As duas famílias contam: "corrija a
        // exposição, recupere as sombras" dirige luz sem usar a palavra luz.
        /luz|ilumina|exposi|sombra|c[âa]mera|lente|enquadramento|[âa]ngulo/,
      );
    }
  });
});

/*
 * Esta guarda MUDOU DE LADO em 11/09/2026, e o registro importa mais que o
 * teste: até aqui ela exigia a cláusula `SEM_TEXTO_ALGUM` em toda geração.
 *
 * A decisão de produto (spec 2026-09-11-estudio-de-imagem-livre) é texto
 * LIVRE na imagem: as peças que o corretor usa como referência são
 * majoritariamente texto, e com a cláusula elas eram impossíveis por
 * construção. O risco aceito está escrito na spec — a IA vai inventar nome,
 * metragem e preço quando achar que a peça pede, e a revisão passa a ser
 * humana.
 *
 * O que a guarda protege AGORA é o que sobrou de invariante: nenhum dos dois
 * caminhos até o provedor manda `pedido.prompt` cru, porque é por
 * `promptFinal` que passa a soletração do texto ditado — e é ela que faz a
 * manchete sair com as palavras certas.
 */
describe("o texto na cena", () => {
  it("sem texto ditado, o prompt vai exatamente como o corretor aprovou", () => {
    // Nada é acrescentado: é isto que faz a ferramenta se comportar como o
    // ChatGPT, que foi o pedido.
    expect(promptFinal("um cachorro vestido de Papai Noel")).toBe(
      "um cachorro vestido de Papai Noel",
    );
  });

  it("não sobrou nenhuma proibição de escrita no prompt", () => {
    for (const r of RECEITAS) {
      const final = promptFinal(montarPedido("uma varanda", r)).toLowerCase();
      expect(final, r.chave).not.toContain("não escreva nada na imagem");
      expect(final, r.chave).not.toContain("letreiros");
    }
  });

  it("com texto ditado, manda soletrar — é a técnica que mediu 2 em 2", () => {
    const final = promptFinal("fachada ao pôr do sol", ["MUDE AINDA ESTE ANO"]);
    expect(final).toContain('"MUDE AINDA ESTE ANO"');
    expect(final.toLowerCase()).toMatch(/caractere por caractere|id[êe]nticos/);
  });

  it("dois textos ditados saem como LISTA, nunca colados", () => {
    // Juntar por barra ou por espaço faria o modelo desenhar o separador
    // dentro da peça — o defeito aparece na imagem, não no teste.
    const final = promptFinal("arte de feed", ["MANACÁ BARUERI", "63 e 81 m²"]);
    expect(final).toContain('"MANACÁ BARUERI"');
    expect(final).toContain('"63 e 81 m²"');
    expect(final).not.toContain("MANACÁ BARUERI / 63");
    expect(final).not.toContain("MANACÁ BARUERI 63");
  });

  it("lista vazia, texto em branco ou nulo não acrescenta nada", () => {
    for (const nada of [[], ["", "   "], null, undefined]) {
      expect(promptFinal("uma varanda", nada)).toBe("uma varanda");
    }
  });

  it("preserva o pedido original", () => {
    expect(promptFinal("uma varanda ao entardecer")).toContain("uma varanda ao entardecer");
  });

  /*
   * As guardas abaixo LEEM O CÓDIGO-FONTE, como `gravacaoDeMensagem.test.ts`
   * e `escalaDoPainel.test.ts`, porque a regressão falha CALADA: build passa,
   * tipo passa, a imagem chega bonita na tela.
   */
  it("nenhum dos dois caminhos manda o prompt cru ao provedor", () => {
    const motor = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // São dois endpoints: criação (JSON) e edição (multipart). Basta um deles
    // voltar a ler `pedido.prompt` para a soletração do texto ditado sumir
    // daquele caminho, e a manchete sair embaralhada só na edição de foto.
    const montagem = motor.indexOf("const pedidoFinal");
    expect(montagem, "a montagem do pedido final sumiu do motor").toBeGreaterThan(-1);
    const depois = motor.slice(motor.indexOf("};", montagem) + 2);
    expect(depois).not.toMatch(/pedido\.prompt/);

    expect(motor).toMatch(/promptFinal\(pedido\.prompt,\s*pedido\.textosNaCena\)/);
    expect(motor).toMatch(/corpoDeEdicao\(\s*pedidoFinal/);
    expect(motor).toMatch(/prompt:\s*pedidoFinal\.prompt/);
  });

  it("a ressalva legal nunca é pedida ao modelo", () => {
    const motor = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8");
    expect(motor).not.toMatch(/meramente ilustrativa/i);
  });

  it("carimbo que falha NÃO sai calado — a tela é obrigada a avisar", () => {
    // A imagem já foi paga, então ela é entregue de qualquer forma. O que não
    // pode é sair achando que tem a ressalva.
    const rota = readFileSync(join(process.cwd(), "src/app/api/imagens/gerar/route.ts"), "utf8");
    expect(rota).toMatch(/comRessalva: marcada\.carimbada/);

    const tela = readFileSync(
      join(process.cwd(), "src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx"),
      "utf8",
    );
    expect(tela).toMatch(/comRessalva === false/);
  });
});
