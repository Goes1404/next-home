import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Decodificador Draco do three.js, copiado como está para a página de
    // vendas (03/11/2026): código de terceiro, minificado, não se edita. Sem
    // isto a catraca do lint (scripts/lintTeto.mjs) passa de 0 para 6 erros.
    "public/espaco/draco/**",
  ]),
]);

export default eslintConfig;
