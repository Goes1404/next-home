import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Ver test/stubs/server-only.ts: sem isto, qualquer teste que toque
      // num módulo de servidor quebra na importação.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
      // Ver test/stubs/next-font-google.ts: a fonte só existe no build do Next.
      "next/font/google": path.resolve(__dirname, "./test/stubs/next-font-google.ts"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 20000,
    // Os `*.spec.ts` de e2e/ são do Playwright — casam com o padrão padrão
    // do vitest e quebram na importação de @playwright/test.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
