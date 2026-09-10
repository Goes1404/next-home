import { expect, test } from "@playwright/test";

/**
 * A varredura de saúde de TODA página pública.
 *
 * Nasceu de uma passada manual em 10/09/2026, depois de uma sequência de
 * mudanças grandes no site — tema claro virando padrão, paleta refeita duas
 * vezes, fundo em vídeo removido, transição entre páginas, faixas curvas. A
 * varredura de então voltou limpa; esta guarda existe para que ela CONTINUE
 * voltando limpa sem ninguém precisar refazê-la à mão.
 *
 * Quatro perguntas por página, e cada uma nasceu de um defeito real desta
 * base:
 *
 * 1. **A página responde 200?** Migration não aplicada já derrubou três
 *    telas de uma vez (a 0101, em 07/09), e o sintoma era a página de erro
 *    genérica do Next — que só quem abre a rota vê.
 * 2. **Ela cabe na tela?** O estouro horizontal do `CartaoTilt` (04/09)
 *    tornava o header inalcançável. `largura-mobile.spec.ts` cobre isso a
 *    fundo no celular; aqui é a rede no desktop também.
 * 3. **Sobrou `.gsap-pending`?** É o contrato de opacidade da casa: o
 *    elemento nasce invisível e o GSAP solta a classe. Dois donos da mesma
 *    opacidade, ou um ScrollTrigger que não dispara, deixam conteúdo
 *    invisível PARA SEMPRE — e a página "funciona", só que vazia.
 * 4. **O console ficou limpo?** Erro de hidratação e módulo faltando
 *    aparecem ali antes de aparecerem na tela.
 *
 * O que esta guarda NÃO faz é medir contraste. A varredura manual tentou, e
 * o medidor deu falso positivo em massa: `color-mix()` e `oklab()` chegam ao
 * `getComputedStyle` como `color(srgb 0.72 0.81 0.77)`, e um parser ingênuo
 * lê 0,72 como se fosse 0,72/255 — todo texto escuro vira "1,2:1". Contraste
 * se confere com `npm run paleta` (tokens) e com o olho (captura).
 */

const PAGINAS = [
  "/",
  "/empreendimentos",
  "/empreendimentos/estacao-267-ne67774",
  "/mapa",
  "/portfolio",
  "/sobre",
  "/contato",
  "/financiamento",
  "/corretores",
  "/anunciar-imovel",
  "/privacidade",
  "/regioes/alphaville",
];

const CHAVE_VINHETA = "nh-intro-vista";

/**
 * Ruído que não é defeito do site: o favicon em 404 no dev server e os
 * avisos que o próprio Next imprime sobre pré-carregamento.
 */
const RUIDO = /favicon|preloaded using link preload|Download the React DevTools/i;

test.describe("toda página pública abre inteira e sem erro", () => {
  test.beforeEach(({ page }) =>
    page.addInitScript((chave) => {
      try {
        sessionStorage.setItem(chave, "1");
      } catch {
        // Janela anônima ou dados de site bloqueados: a vinheta aparece e a
        // medição segue valendo — ela só some um pouco depois.
      }
    }, CHAVE_VINHETA),
  );

  for (const rota of PAGINAS) {
    test(`${rota} está saudável`, async ({ page }) => {
      const erros: string[] = [];
      page.on("pageerror", (e) => erros.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error" && !RUIDO.test(m.text())) erros.push(m.text());
      });

      // `domcontentloaded` e não `load`: o `load` espera o vídeo de fundo, e
      // esperar por ele estoura o tempo sem testar nada (MEMORIA).
      const resposta = await page.goto(rota, { waitUntil: "domcontentloaded" });
      expect(resposta?.status(), `${rota} não respondeu 200`).toBe(200);

      await page.waitForTimeout(1200);

      // Rola a página inteira: é o que dispara os ScrollTrigger e revela
      // qualquer `.gsap-pending` que não se solte.
      const altura = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < Math.min(altura, 12000); y += 700) {
        await page.evaluate((alvo) => window.scrollTo(0, alvo), y);
        await page.waitForTimeout(70);
      }
      await page.waitForTimeout(700);

      const estado = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        presos: [...document.querySelectorAll(".gsap-pending")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((el) => `${el.tagName}.${el.className}`.slice(0, 90)),
      }));

      expect(
        estado.scrollWidth,
        `${rota} é mais larga que a tela (${estado.scrollWidth} > ${estado.clientWidth})`,
      ).toBeLessThanOrEqual(estado.clientWidth);

      expect(
        estado.presos,
        `${rota} deixou conteúdo invisível: o GSAP não soltou a classe de opacidade`,
      ).toEqual([]);

      expect(erros, `${rota} registrou erro no console`).toEqual([]);
    });
  }
});
