// Fotografa as telas do NÚMERO OFICIAL no painel LOCAL (04/11/2026).
//
// Antes: banco de teste com scripts/demo/canalOficialLocal.sql e o painel
// rodando contra ELE (nunca produção) — os comandos estão no vault, em
// vault/10-notas/painel-local-com-dados-de-exemplo.md. Depois:
//
//   node scripts/demo/fotografarCanalOficial.mjs <pasta-de-saída> [gestor|corretor]
//
// Só navega, escolhe opções e fotografa: não aperta botão que fale com a
// Meta e não cria lista.
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// O Playwright do projeto pode ser de outra versão que o Chromium instalado
// no contêiner da nuvem: lá, o navegador fica em /opt/pw-browsers/chromium.
const CHROMIUM_DO_CONTEINER = "/opt/pw-browsers/chromium";

const BASE = "http://localhost:3000";
const SAIDA = path.resolve(process.argv[2] ?? ".");
const SENHA = "Demo-Local-2026!";
const LEAD_CARLA = "eeeeeeee-0000-4000-8000-000000000001";

async function entrar(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 2400 }, deviceScaleFactor: 2, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  page.on("pageerror", (e) => console.log("[erro na página]", e.message));
  await page.goto(`${BASE}/corretor/entrar`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', SENHA);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/corretor/entrar"), { timeout: 120_000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log("entrou:", email, "->", page.url());
  return { ctx, page };
}

// Esconde o que flutua (menu do topo, robô do assistente, avisos) para a
// foto mostrar só o bloco.
async function semFlutuantes(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed") el.style.setProperty("visibility", "hidden", "important");
      if (pos === "sticky") el.style.setProperty("position", "static", "important");
    }
  });
}

async function foto(loc, nome) {
  await semFlutuantes(loc.page());
  await loc.scrollIntoViewIfNeeded();
  await loc.page().waitForTimeout(400);
  await loc.screenshot({ path: path.join(SAIDA, nome), animations: "disabled" });
  console.log("foto:", nome);
}

(async () => {
  const browser = await chromium.launch(
    existsSync(CHROMIUM_DO_CONTEINER) ? { executablePath: CHROMIUM_DO_CONTEINER } : {},
  );
  const so = process.argv[3] ?? "tudo";

  if (so === "tudo" || so === "gestor") {
    const { ctx, page } = await entrar(browser, "gestora.demo@nexthome.test");
    await page.goto(`${BASE}/corretor/admin/whatsapp-oficial`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "WhatsApp oficial" }).first().waitFor();
    await page.screenshot({ path: path.join(SAIDA, "00-gestor-tela-inteira.png"), fullPage: true });
    await foto(page.locator('section[aria-labelledby="numero-titulo"]'), "01-gestor-o-numero.png");
    await foto(page.locator('section[aria-labelledby="decisoes-titulo"]'), "02-gestor-decisoes.png");
    await foto(page.locator('section[aria-labelledby="modelos-titulo"]'), "03-gestor-modelos.png");
    await foto(page.locator('section[aria-labelledby="medicao-titulo"]'), "04-gestor-medicao.png");
    await ctx.close();
  }

  if (so === "tudo" || so === "corretor") {
    const { ctx, page } = await entrar(browser, "corretor.demo@nexthome.test");

    // Campanhas -> nova lista pelo número oficial (sem criar)
    await page.goto(`${BASE}/corretor/campanhas`, { waitUntil: "networkidle" });
    const escolha = page.locator("fieldset", { hasText: "Por onde a lista sai?" });
    await escolha.waitFor();
    const alvo = page.locator("section.cartao", { hasText: /Passo \d de 3/ }).first();
    await foto(alvo, "05-lista-por-onde-sai.png");
    await escolha.getByRole("button", { name: /número oficial da imobiliária/ }).click();
    await page.getByRole("button", { name: /Todos os meus leads/ }).click();
    await page.getByText(/pessoas receberão/).first().waitFor();
    await page.waitForTimeout(1500);
    await foto(alvo, "06-lista-oficial-quem-recebe.png");
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /lancamento_com_foto|Oi, \{\{nome\}\}|tabela de lançamento/ }).first().click();
    await page.waitForTimeout(800);
    await foto(alvo, "07-lista-oficial-modelo.png");
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.waitForTimeout(1200);
    await foto(alvo, "08-lista-oficial-resumo.png");

    // Ficha do lead -> painel do número oficial
    await page.goto(`${BASE}/corretor/leads/${LEAD_CARLA}`, { waitUntil: "networkidle" });
    const painel = page.locator("#numero-oficial");
    await painel.waitFor();
    await foto(painel, "09-ficha-do-lead-numero-oficial.png");
    await ctx.close();
  }

  await browser.close();
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
