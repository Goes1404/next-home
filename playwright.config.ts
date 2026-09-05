import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do site público e do painel do corretor.
 *
 * Duas verdades deste projeto moram aqui:
 *
 * - **O banco é o de PRODUÇÃO.** Não existe ambiente de teste (ver
 *   docs/MEMORIA.md). Por isso os specs são READ-ONLY por contrato: nenhum
 *   teste cria lead, dispara campanha ou salva cadastro. Clicar em checkbox
 *   e abrir modal é estado de tela; "Começar a enviar" é proibido.
 * - **O Chromium do Playwright não decodifica H.264** — os vídeos do site
 *   têm par WebM justamente para o teste exercitar o caminho real de vídeo
 *   (ver HERO_VIDEO_URL em src/lib/site.ts).
 *
 * O painel exige sessão: o projeto `painel` depende do setup de login, que
 * lê E2E_CORRETOR_EMAIL / E2E_CORRETOR_SENHA do ambiente (.env.e2e.local,
 * fora do git). Sem as credenciais, os specs do painel são PULADOS com
 * aviso — os do site público rodam sempre.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // UM worker, medido: com dois, os specs disputam o dev server pelos
  // vídeos de fundo (0,7-15 MB) e a rodada flake — 2 falhas numa execução,
  // zero na seguinte. Com um, três rodadas seguidas limpas, 1,3 min.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "pt-BR",
    // Sandbox sem o `chromium_headless_shell` que esta versão pede, mas com o
    // Chromium completo instalado: aponte o binário em vez de baixar
    // (E2E_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome).
    ...(process.env.E2E_CHROMIUM ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } } : {}),
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Aproveita o dev server que já estiver de pé — sobe um só se faltar.
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "publico",
      testMatch: /publico\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "publico-mobile",
      testMatch: /publico\/.*\.spec\.ts/,
      // Pixel 7, não iPhone: o device do iPhone pede WebKit, que não está
      // instalado nesta máquina — e o que se quer aqui é o VIEWPORT móvel
      // (touch, largura de celular), não uma rodada de Safari.
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "painel",
      testMatch: /painel\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"], // o corretor trabalha no celular — diretriz de produto
        storageState: "e2e/.auth/corretor.json",
      },
    },
  ],
});
