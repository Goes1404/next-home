import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "./grupo";

/**
 * Os scripts que leem conversa com a chave secreta RODADOS de verdade, sem
 * `--grupo` e com outro grupo: têm de recusar antes de tocar o banco (L22).
 * Sem nenhuma variável do Supabase no ambiente, um script que passasse da
 * recusa morreria por outro motivo — por isso a mensagem é conferida.
 */

const RAIZ = process.cwd();
const TSX = join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");
const OUTRO_GRUPO = "00000000-0000-0000-0000-00000000000b";

function rodar(script: string, args: string[]) {
  const ambiente = { ...process.env };
  for (const k of Object.keys(ambiente)) if (/SUPABASE|DATABASE_URL|DB_TESTE/.test(k)) delete ambiente[k];
  const r = spawnSync(process.execPath, [TSX, script, ...args], {
    cwd: RAIZ,
    env: ambiente,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

describe.each(["scripts/observatorio.ts", "scripts/eval/exportarGolden.ts"])("%s", (script) => {
  it("script sem --grupo recusa rodar", () => {
    const r = rodar(script, []);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("--grupo=");
  });

  it("script com outro grupo recusa rodar", () => {
    const r = rodar(script, [`--grupo=${OUTRO_GRUPO}`]);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain(GRUPO_NEXT_HOME_ID);
  });
});
