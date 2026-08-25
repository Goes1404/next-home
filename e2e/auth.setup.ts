import { expect, test as setup } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ARQUIVO_SESSAO = "e2e/.auth/corretor.json";

/**
 * Faz o login UMA vez pela tela real (/corretor/entrar) e guarda a sessão em
 * e2e/.auth/corretor.json — os specs do painel a reutilizam por storageState,
 * sem repetir o formulário em cada teste.
 *
 * As credenciais vêm de E2E_CORRETOR_EMAIL / E2E_CORRETOR_SENHA, lidas do
 * ambiente ou de .env.e2e.local (fora do git — é senha de uma conta REAL,
 * porque o projeto não tem banco de teste). Sem elas, o setup é pulado com
 * aviso e os specs do painel não rodam — os do site público não passam por
 * aqui e rodam sempre.
 */
function carregarEnvLocal(): void {
  const arquivo = path.join(process.cwd(), ".env.e2e.local");
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

setup("login do corretor", async ({ page }) => {
  carregarEnvLocal();
  const email = process.env.E2E_CORRETOR_EMAIL;
  const senha = process.env.E2E_CORRETOR_SENHA;

  if (!email || !senha) {
    // Estado VAZIO, não ausência de arquivo: o projeto `painel` referencia o
    // storageState no `use` e morre com ENOENT antes de qualquer teste rodar
    // — o skip educado de cada spec (redirecionado para /entrar) nunca
    // chega a acontecer. Com o arquivo vazio, os specs abrem deslogados,
    // caem no /entrar e se pulam com a mensagem certa.
    writeFileSync(ARQUIVO_SESSAO, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(
      true,
      "Sem E2E_CORRETOR_EMAIL/E2E_CORRETOR_SENHA (defina em .env.e2e.local) — specs do painel pulados.",
    );
  }

  await page.goto("/corretor/entrar", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="senha"]').fill(senha!);
  await page.locator('button[type="submit"]').click();

  // O destino pós-login é o painel; qualquer rota /corretor/* logada serve.
  await expect(page).toHaveURL(/\/corretor(?!\/entrar)/, { timeout: 15_000 });
  await page.context().storageState({ path: ARQUIVO_SESSAO });
});
