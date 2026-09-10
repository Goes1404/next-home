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
  it("sem texto pedido, proíbe TODA escrita — inclusive na receita livre", () => {
    for (const r of RECEITAS) {
      const final = promptFinal(montarPedido("uma varanda", r));
      expect(final.toLowerCase(), r.chave).toContain("não escreva nada na imagem");
      expect(final.toLowerCase(), r.chave).toContain("letreiros");
    }
  });

  it("com texto pedido, permite SÓ ele e segue proibindo o resto", () => {
    /*
     * A cláusula abriu depois da medição de 03/09: acento correto em 4 de 4
     * renders. Mas o que o corretor NÃO digitou continua proibido — a placa
     * "VISTA ALTO" que o modelo inventou é o defeito que a cláusula existe
     * para impedir, e ele não sumiu por o modelo saber escrever português.
     */
    const final = promptFinal("uma fachada", "Conheça o decorado");
    expect(final).toContain('"Conheça o decorado"');
    expect(final.toLowerCase()).toContain("única escrita permitida");
    expect(final.toLowerCase()).toContain("nenhuma outra palavra");
    // E o pedido literal precisa ser explícito, senão o modelo reescreve.
    expect(final.toLowerCase()).toMatch(/caractere por caractere|id[êe]nticos/);
  });

  it("texto vazio ou só espaço volta a proibir tudo", () => {
    // Campo em branco não pode virar "pode escrever o que quiser".
    for (const vazio of ["", "   ", null, undefined]) {
      expect(promptFinal("uma varanda", vazio).toLowerCase()).toContain(
        "não escreva nada na imagem",
      );
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
  /*
   * A ressalva legal tem DUAS metades, e as duas são travadas aqui.
   *
   * (1) Ela nunca se pede ao modelo generativo. Ele acerta o texto literal
   *     3 em 4 (medido nesta base; 2 em 2 com aspas e soletração, medido na
   *     F0) — ótimo para uma manchete, inaceitável para um aviso legal, onde
   *     uma palavra trocada muda o que a peça afirma ao consumidor.
   *
   * (2) Ela SAI, por código. `compor.ts` a desenhava e foi apagado em
   *     10/09/2026 junto com o caminho de marketing; por algumas horas toda
   *     arte saiu sem aviso nenhum, e nada nesta esteira reclamou. Hoje quem
   *     a escreve é `carimbo.ts`, chamado pela rota antes do upload.
   *
   * A parte (2) é a que falha CALADA: build passa, tipo passa, a imagem chega
   * bonita na tela, e só o cliente recebe uma perspectiva de IA sem saber que
   * é ilustrativa.
   */
  it("a ressalva legal nunca é pedida ao modelo", () => {
    const motor = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8");
    expect(motor).not.toMatch(/meramente ilustrativa/i);
  });

  it("a rota CARIMBA a ressalva, e antes de guardar o arquivo", () => {
    const rota = readFileSync(join(process.cwd(), "src/app/api/imagens/gerar/route.ts"), "utf8");

    expect(rota).toMatch(/carimbarRessalva\(/);

    /*
     * Antes do upload, não depois: carimbar depois deixaria no bucket uma
     * versão sem aviso, e é o arquivo do bucket que a galeria mostra e que o
     * corretor baixa. O hash também sai dos bytes JÁ carimbados, senão dois
     * pedidos iguais gerariam nomes diferentes do conteúdo guardado.
     */
    expect(rota.indexOf("carimbarRessalva(")).toBeLessThan(rota.indexOf(".upload("));
    expect(rota).toMatch(/createHash\("sha256"\)\.update\(marcada\.bytes\)/);
    expect(rota).toMatch(/\.upload\(caminho, marcada\.bytes/);
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

  it("nenhum caminho manda o prompt cru ao provedor", () => {
    const fonte = readFileSync(join(process.cwd(), "src/lib/imagens/gerarImagem.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    /*
     * A montagem do objeto é a ÚNICA que pode ler o texto cru — então ela sai
     * inteira antes da checagem, e o que sobra não pode conter `pedido.prompt`.
     *
     * Cortar "até a primeira quebra de linha" já falhou aqui: bastou a
     * construção virar multilinha para a guarda acusar código correto. Terceira
     * vez que uma guarda desta base tropeça na FORMATAÇÃO do que ela lê.
     */
    const montagem = fonte.indexOf("const comClausula");
    const fimDaMontagem = fonte.indexOf("};", montagem) + 2;
    const depois = fonte.slice(fimDaMontagem);
    expect(depois).not.toMatch(/pedido\.prompt/);

    // E os dois caminhos precisam ler do objeto tratado.
    expect(fonte).toMatch(/corpoDeEdicao\(\s*comClausula/);
    expect(fonte).toMatch(/prompt:\s*comClausula\.prompt/);
  });
});
