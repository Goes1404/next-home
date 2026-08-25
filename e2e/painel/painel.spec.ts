import { expect, test } from "@playwright/test";

/**
 * Smoke autenticado do painel — READ-ONLY por contrato.
 *
 * O banco por trás é o de PRODUÇÃO (não existe ambiente de teste): estes
 * specs abrem telas, marcam checkboxes e abrem modais — estado de navegador
 * — mas NUNCA acionam o botão que grava, dispara ou move de verdade.
 * Qualquer spec novo aqui herda essa regra.
 */

/**
 * Sem credenciais o setup grava uma sessão VAZIA: as páginas do painel
 * redirecionam para /corretor/entrar, e é isso que transforma a rodada em
 * skip — não em falha.
 */
async function irLogado(page: import("@playwright/test").Page, rota: string): Promise<void> {
  await page.goto(rota, { waitUntil: "domcontentloaded" });
  test.skip(
    /\/corretor\/entrar/.test(page.url()),
    "Sessão de corretor ausente — defina E2E_CORRETOR_EMAIL/E2E_CORRETOR_SENHA em .env.e2e.local.",
  );
}

test("a fila do Início carrega para o corretor logado", async ({ page }) => {
  await irLogado(page, "/corretor");
  // A tela mais aberta do painel: basta provar que rendeu logada.
  await expect(page.locator("main")).toBeVisible();
});

test("lista de leads: selecionar abre a barra com Mover para… e as seis etapas", async ({
  page,
}) => {
  await irLogado(page, "/corretor/leads");

  const caixas = page.locator('input[type="checkbox"]');
  test.skip((await caixas.count()) === 0, "Carteira sem leads — nada para selecionar.");

  await caixas.first().check();

  const barra = page.getByText(/selecionado\(s\)/);
  await expect(barra).toBeVisible();

  // Abre o segundo andar e confere as etapas — SEM clicar em nenhuma:
  // isso moveria um lead real de um corretor real.
  await page.getByRole("button", { name: "Mover para…" }).click();
  for (const etapa of ["Visita agendada", "Fechado", "Perdido"]) {
    await expect(page.getByRole("button", { name: etapa })).toBeVisible();
  }

  await page.getByRole("button", { name: "Limpar" }).click();
  await expect(barra).toHaveCount(0);
});

test("campanhas: o público 'Escolher um por um' busca pelo nome", async ({ page }) => {
  await irLogado(page, "/corretor/campanhas");

  const opcao = page.getByRole("button", { name: /Escolher um por um/ });
  await expect(opcao).toBeVisible();
  await opcao.click();

  // O seletor carrega a carteira e filtra pelo nome digitado. Marcar um
  // checkbox é estado de tela; o teste PARA antes de qualquer "Continuar".
  const busca = page.getByLabel("Buscar lead pelo nome");
  await expect(busca).toBeVisible();
  await expect(page.getByText(/Marque quem deve receber|Nenhum lead com WhatsApp/)).toBeVisible({
    timeout: 15_000,
  });
});

test("editor do imóvel: a aba de vídeo tem um form de verdade (Enter salva)", async ({ page }) => {
  await irLogado(page, "/corretor/imoveis");

  const primeiro = page.locator('a[href^="/corretor/imoveis/"]').first();
  test.skip((await primeiro.count()) === 0, "Nenhum imóvel no cadastro.");
  await primeiro.click();

  await page.getByRole("button", { name: /Vídeos & Tour 3D/ }).click();

  // A correção do Enter mudo: o campo de link mora num <form> com submit.
  const campoLink = page.locator('form input[type="url"]').first();
  await expect(campoLink).toBeVisible();
  await expect(
    page.locator("form").filter({ has: campoLink }).locator('button[type="submit"]'),
  ).toHaveCount(1);
});
