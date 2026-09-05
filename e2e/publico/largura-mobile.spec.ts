import { expect, test } from "@playwright/test";

/**
 * Nenhuma página pública pode ser mais larga que a tela do celular.
 *
 * Nasceu de um defeito que só existia com JavaScript rodando: o zoom de
 * entrada do `CartaoTilt` escalava um nó em fluxo a 1.18 e a home media
 * 374px numa tela de 360 (04/09/2026). O HTML + CSS estáticos passavam
 * limpos — por isso esta guarda MEDE a página de verdade, com JS, rolando.
 *
 * - `clientWidth`, não `innerWidth`: no Chromium headless os 15px da barra
 *   de rolagem clássica entram na conta e acusariam falso (MEMORIA).
 * - Mede ANTES de rolar (cartões abaixo da dobra já estão escalados), a
 *   cada passo com uma pausa curta (pega o meio da animação) e uma vez no
 *   fim (entradas terminadas).
 * - Na falha, a mensagem nomeia os culpados — tag, classes, borda direita e
 *   transform — para a próxima causa ser achada, não suposta.
 */

const PAGINAS = ["/", "/empreendimentos", "/empreendimentos/estacao-267-ne67774"];
const LARGURAS = [360, 390];
const CHAVE_VINHETA = "nh-intro-vista";

test.describe("nenhuma página pública é mais larga que a tela", () => {
  test.skip(({ isMobile }) => !isMobile, "só no projeto publico-mobile");

  // A vinheta lê esta chave num script inline ANTES da primeira pintura: com
  // ela gravada não há overlay, o body fica livre e nada é transladado.
  test.beforeEach(({ page }) =>
    page.addInitScript((chave) => {
      try {
        sessionStorage.setItem(chave, "1");
      } catch {
        /* sessionStorage bloqueado: a vinheta aparece e o teste segue */
      }
    }, CHAVE_VINHETA),
  );

  for (const largura of LARGURAS) {
    for (const rota of PAGINAS) {
      test(`${rota} @ ${largura}px`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 800 });
        await page.goto(rota, { waitUntil: "domcontentloaded" });

        const medir = () =>
          page.evaluate(() => {
            const d = document.documentElement;
            // Culpado é quem pode EMPURRAR a página: fora da borda direita e sem
            // ancestral fixo nem com overflow hidden/clip (decoração já cortada
            // não conta — sem este filtro a lista vinha cheia de brilhos e
            // vídeo de fundo, e o cartão escalado nem aparecia).
            const contido = (el: Element) => {
              for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                const cs = getComputedStyle(a);
                if (cs.position === "fixed") return true;
                if (["hidden", "clip", "auto", "scroll"].includes(cs.overflowX)) return true;
              }
              return false;
            };
            const culpados = [...document.querySelectorAll("body *")]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                const cs = getComputedStyle(e);
                return r.width > 0 && r.right > d.clientWidth + 1 && cs.position !== "fixed" && !contido(e);
              })
              .slice(0, 8)
              .map((e) => {
                const r = e.getBoundingClientRect();
                const classes = [...e.classList].slice(0, 4).join(".");
                return `${e.tagName.toLowerCase()}.${classes} R=${Math.round(r.right)} T=${getComputedStyle(e).transform}`;
              });
            return {
              scrollWidth: d.scrollWidth,
              clientWidth: d.clientWidth,
              alturaTotal: d.scrollHeight,
              culpados,
            };
          });

        let m = await medir();
        expect(m.scrollWidth, `antes de rolar: ${JSON.stringify(m.culpados)}`).toBeLessThanOrEqual(m.clientWidth);

        for (let y = 0; y < m.alturaTotal; y += 600) {
          await page.evaluate((py) => window.scrollTo(0, py), y);
          await page.waitForTimeout(150);
          m = await medir();
          expect(m.scrollWidth, `y=${y}: ${JSON.stringify(m.culpados)}`).toBeLessThanOrEqual(m.clientWidth);
        }

        await page.waitForTimeout(1600);
        m = await medir();
        expect(m.scrollWidth, `no fim: ${JSON.stringify(m.culpados)}`).toBeLessThanOrEqual(m.clientWidth);
      });
    }
  }
});
