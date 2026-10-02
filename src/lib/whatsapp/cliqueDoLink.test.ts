import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas do cadastro por clique no link (0143). A regressão aqui é calada:
 * ou o lead que apagou a mensagem pronta volta a sumir, ou um contato
 * pessoal passa a ser cadastrado.
 */
const semComentarios = (fonte: string) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const webhook = semComentarios(fs.readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8"));
const migration = fs.readFileSync("supabase/migrations/0143_clique_no_link_cadastra_o_lead.sql", "utf8");

describe("cadastro por clique no link (0143)", () => {
  it("número sem lead NÃO é cadastrado pelo clique (desligado em 02/10)", () => {
    // Cadastrava conhecidos do corretor que escreviam nos 15 min seguintes a
    // um clique. Só a mensagem pronta reivindica o clique, e com conversa já
    // existente.
    expect(webhook).not.toContain('via: "clique_no_link"');
    expect(webhook).not.toMatch(/if \(!conversa\) \{\s*cliqueDoLink = await reivindicarCliqueDoLink/);
    const reivindica = webhook.indexOf("reivindicarCliqueDoLink(");
    const guarda = webhook.lastIndexOf("if (conversa && (convite?.via", reivindica);
    expect(guarda).toBeGreaterThan(0);
    expect(reivindica - guarda).toBeLessThan(200);
  });

  it("os dois links /wa/ marcam o clique como do porteiro", () => {
    for (const p of ["src/app/wa/route.ts", "src/app/wa/[campanha]/route.ts"]) {
      expect(semComentarios(fs.readFileSync(p, "utf8")), p).toContain("pelo_porteiro: true");
    }
  });

  it("a função ignora robôs, só usa clique do porteiro e não é chamável pela chave pública", () => {
    expect(migration).toMatch(/facebookexternalhit/);
    expect(migration).toMatch(/c\.pelo_porteiro\s*\n/);
    expect(migration).toMatch(/for update skip locked/);
    expect(migration).toMatch(/revoke all on function public\.reivindicar_clique_do_link[^;]*anon/);
  });

  it("o anon não escreve as colunas novas", () => {
    expect(migration).toMatch(/revoke insert on public\.cliques_whatsapp from anon/);
    const grant = /grant insert \(([^)]*)\)\s*on public\.cliques_whatsapp to anon/.exec(migration);
    expect(grant?.[1]).not.toMatch(/pelo_porteiro|lead_id|consumido_em/);
  });
});
