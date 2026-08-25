import { expect, test } from "@playwright/test";

/*
 * Todos os goto usam domcontentloaded: o evento `load` inclui o download do
 * vídeo de fundo (0,7-15 MB conforme viewport), e esperá-lo estoura o teste
 * sem testar nada — as asserções seguintes já esperam os elementos reais.
 */

/**
 * O site público, do jeito que o visitante chega: sem sessão, no link que o
 * corretor mandou. Tudo aqui é leitura — nenhum teste escreve nada.
 */

test("a listagem busca por nome, sem acento, e mostra o chip removível", async ({ page }) => {
  await page.goto("/empreendimentos?busca=estacao", { waitUntil: "domcontentloaded" });

  const cards = page.locator('a[href^="/empreendimentos/"] h3');
  await expect(cards.first()).toContainText("Estação 267");
  await expect(cards).toHaveCount(1);

  // O chip do filtro ativo existe e remove a busca ao ser clicado.
  const chip = page.getByRole("link", { name: /Remover filtro/ });
  await expect(chip).toBeVisible();
  await chip.click();
  // Navegação client-side do Link: no projeto mobile os specs dividem o dev
  // server com o desktop, e os 5s padrão não cobrem a recompilação.
  await expect(page).toHaveURL(/\/empreendimentos$/, { timeout: 15_000 });
});

test("busca pelo nome do ANÚNCIO acha o cadastro de outro nome", async ({ page }) => {
  // "Dom Parque" é nome alternativo (0044) — o cadastro se chama
  // "Lançamento ao Lado do Parque". É o caminho de quem viu o anúncio.
  await page.goto("/empreendimentos?busca=dom%20parque", { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href^="/empreendimentos/"] h3').first()).toContainText("Dom Parque");
});

test("a galeria corta em seis e o Ver mais revela o resto", async ({ page }) => {
  await page.goto("/empreendimentos/estacao-267-ne67774", { waitUntil: "domcontentloaded" });

  const galeria = page.locator("#galeria");
  await galeria.scrollIntoViewIfNeeded();

  // 1 destaque + 6 da grade antes do botão.
  await expect(galeria.locator('button[aria-label^="Ampliar"]')).toHaveCount(7);

  const verMais = galeria.getByRole("button", { name: /Ver mais \d+ fotos?/ });
  await expect(verMais).toBeVisible();
  await verMais.click();

  // O acervo inteiro (16 no cadastro usado) e o botão some.
  await expect(galeria.locator('button[aria-label^="Ampliar"]')).toHaveCount(16);
  await expect(verMais).toHaveCount(0);

  // O rótulo sempre disse o total real — o corte era só de exibição.
  await expect(
    galeria.locator('button[aria-label="Ampliar imagem 16 de 16"], button[aria-label^="Ampliar imagem 16 de 16:"]'),
  ).toHaveCount(1);
});

test("o fundo em vídeo cobre a tela: camada cover + camada contain", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Duas camadas do MESMO vídeo (fix do fundo decepado). O Chromium do
  // Playwright não decodifica H.264 — se isto passa, o par WebM está no ar.
  const fundo = page.locator("[data-fundo-video] video");
  await expect(fundo).toHaveCount(2);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const [a, b] = Array.from(document.querySelectorAll("[data-fundo-video] video"));
          return {
            fits: [a, b].map((v) => getComputedStyle(v as Element).objectFit),
            rodando: (a as HTMLVideoElement).currentTime > 0,
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({ fits: ["cover", "contain"], rodando: true });
});
