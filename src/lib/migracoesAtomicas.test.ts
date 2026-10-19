import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda: as migrations da plataforma multi-grupo (0181 em diante) aplicam
 * inteiras ou nada, com teto de espera por trava, e podem ser repetidas.
 *
 * Elas rodam em produção com o webhook do WhatsApp escrevendo, e põem ACCESS
 * EXCLUSIVE em dezenas de tabelas. A revisão final da fase 1 achou a 0181 e a
 * 0184 sem transação (achados D e G): na 0184, o `set local lock_timeout`
 * virava só um aviso fora de transação, e uma falha no meio deixava as
 * policies novas criadas com o Storage ainda nas antigas; a 0181 esperaria
 * sem teto por `corretores`, que quase toda policy lê, e não podia ser
 * reaplicada depois de falhar (`create policy` sem `drop ... if exists`).
 *
 * A regra, por arquivo:
 *   - o primeiro comando é `begin;` e o último é `commit;`;
 *   - há `set local lock_timeout` logo no começo da transação;
 *   - todo `create policy` tem antes um `drop policy if exists` com o mesmo
 *     nome e a mesma tabela.
 */
const DIR = join(process.cwd(), "supabase", "migrations");
const PRIMEIRA = 181;

function semComentarios(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function migracoes(): { arquivo: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((nome) => nome.endsWith(".sql") && Number(nome.slice(0, 4)) >= PRIMEIRA)
    .sort()
    .map((arquivo) => ({ arquivo, sql: semComentarios(readFileSync(join(DIR, arquivo), "utf8")) }));
}

describe("Migrations multi-grupo são atômicas e reaplicáveis", () => {
  it("existem (o recorte não ficou vazio)", () => {
    expect(migracoes().length).toBeGreaterThanOrEqual(4);
  });

  for (const { arquivo, sql } of migracoes()) {
    describe(arquivo, () => {
      const comandos = sql
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      it("abre com begin; e fecha com commit;", () => {
        expect(comandos[0]).toBe("begin;");
        expect(comandos[comandos.length - 1]).toBe("commit;");
      });

      it("põe lock_timeout logo no começo da transação", () => {
        const teto = comandos.findIndex((l) => /^set local lock_timeout\s*=\s*'\d+s';$/.test(l));
        expect(teto).toBeGreaterThan(0);
        expect(teto).toBeLessThanOrEqual(2);
      });

      it("derruba cada policy antes de criá-la", () => {
        const criadas = [...sql.matchAll(/create policy\s+("[^"]+"|\w+)\s+on\s+([\w.%]+)/gi)];
        const semDrop = criadas
          .filter((m) => {
            const antes = sql.slice(0, m.index);
            const drop = new RegExp(
              `drop policy if exists\\s+${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+on\\s+${m[2].replace(/[.*+?^${}()|[\]\\%]/g, "\\$&")}`,
              "i",
            );
            return !drop.test(antes);
          })
          .map((m) => `${m[1]} on ${m[2]}`);
        expect(semDrop, `create policy sem drop policy if exists antes`).toEqual([]);
      });
    });
  }
});
