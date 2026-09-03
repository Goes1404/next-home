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

describe("a cláusula anti-invenção", () => {
  it("entra em toda geração, inclusive na receita livre", () => {
    for (const r of RECEITAS) {
      const final = promptFinal(montarPedido("uma varanda", r));
      expect(final.toLowerCase(), r.chave).toContain("não escreva nada na imagem");
      expect(final.toLowerCase(), r.chave).toContain("letreiros");
    }
  });

  it("preserva o pedido original", () => {
    expect(promptFinal("uma varanda ao entardecer")).toContain("uma varanda ao entardecer");
  });

  /*
   * Esta guarda LÊ O CÓDIGO-FONTE, como `gravacaoDeMensagem.test.ts` e
   * `escalaDoPainel.test.ts`. O motivo é o mesmo: a regressão falha CALADA.
   *
   * São dois caminhos até o provedor — criação (JSON) e edição (multipart) —
   * e basta um deles voltar a ler `pedido.prompt` cru para as imagens daquele
   * caminho voltarem a nascer com placa inventada. Build passa, tipo passa, a
   * imagem chega bonita na tela, e só o cliente vê o nome de um
   * empreendimento que não existe.
   */
  it("nenhum caminho manda o prompt cru ao provedor", () => {
    const fonte = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // Depois de montado o objeto com a cláusula, `pedido.prompt` não pode mais
    // ser lido por ninguém. O corte é DEPOIS da linha que monta o objeto — ela
    // é a única que pode (e deve) ler o texto cru.
    const montagem = fonte.indexOf("const comClausula");
    const depois = fonte.slice(fonte.indexOf("\n", montagem));
    expect(depois).not.toMatch(/pedido\.prompt/);

    // E os dois caminhos precisam ler do objeto tratado.
    expect(fonte).toMatch(/corpoDeEdicao\(\s*comClausula/);
    expect(fonte).toMatch(/prompt:\s*comClausula\.prompt/);
  });
});
