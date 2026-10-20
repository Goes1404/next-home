import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { gravarClique } from "./gravarClique";

/**
 * O lead que chega pelo link pessoal do corretor é dele (spec §9, fase 5).
 * O caminho principal do link é o WhatsApp: o porteiro (`/wa`) marca o
 * clique que foi para o corretor do cookie, e o webhook passa a ficha do
 * convite a `whatsapp/link_pessoal`, que o gatilho da 0200 marca como
 * trazida por ele. Sem isso, quase todo lead do link pessoal ficava com a
 * imobiliária na saída. A regressão é calada: o lead nasce, só a etiqueta
 * erra, e só aparece no dia em que alguém sai.
 */
const semComentarios = (fonte: string) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const ler = (p: string) => semComentarios(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"));

describe("o link pessoal chega à etiqueta de origem", () => {
  it("as duas portas do porteiro marcam o clique que foi para o corretor do link", () => {
    expect(ler("src/app/wa/route.ts")).toMatch(/do_link_pessoal:[^,\n]*numeroDoLink !== null/);
    const campanha = ler("src/app/wa/[campanha]/route.ts");
    expect(campanha).toMatch(/do_link_pessoal: doLinkPessoal/);
    expect(campanha).toMatch(/registrarClique\(sorteio\?\.corretor_id \?\? null, numeroDoLink !== null\)/);
  });

  it("o webhook promove a ficha do convite ANTES de tratá-la como anúncio, e só fora do anúncio pago", () => {
    const webhook = ler("src/app/api/webhooks/whatsapp/route.ts");
    const promove = webhook.indexOf("marcarLeadVindoDoLinkPessoal(conversa.leadId)");
    const anuncio = webhook.indexOf("marcarLeadVindoDeAnuncio(conversa.leadId");
    expect(promove).toBeGreaterThan(0);
    expect(anuncio).toBeGreaterThan(promove);
    expect(webhook.slice(promove - 200, promove)).toMatch(/cliqueDoLink\.doLinkPessoal && !cliqueDoLink\.doAnuncio/);
  });

  it("só a ficha recém-nascida do convite muda de origem", () => {
    const repo = ler("src/lib/whatsapp/repositorio.ts");
    const fn = repo.slice(repo.indexOf("export async function marcarLeadVindoDoLinkPessoal"));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).toMatch(/origem: "whatsapp\/link_pessoal"/);
    expect(corpo).toMatch(/\.eq\("origem", "whatsapp\/organico"\)/);
    expect(corpo).toMatch(/\.gte\("created_at"/);
  });
});

describe("gravarClique", () => {
  const cliente = (erros: (string | null)[]) => {
    const linhas: Record<string, unknown>[] = [];
    const insert = vi.fn(async (linha: Record<string, unknown>) => {
      linhas.push(linha);
      const msg = erros.shift() ?? null;
      return { error: msg ? { message: msg } : null };
    });
    return { linhas, supabase: { from: () => ({ insert }) } as never };
  };

  it("antes da 0200, repete o clique sem a coluna nova em vez de perdê-lo", async () => {
    const { linhas, supabase } = cliente([
      "Could not find the 'do_link_pessoal' column of 'cliques_whatsapp' in the schema cache",
    ]);
    await gravarClique(supabase, { grupo_id: "g", origem: "site", do_link_pessoal: true });
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toEqual({ grupo_id: "g", origem: "site" });
  });

  it("outra recusa não é repetida", async () => {
    const { linhas, supabase } = cliente(["timeout"]);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await gravarClique(supabase, { grupo_id: "g", origem: "site", do_link_pessoal: false });
    expect(linhas).toHaveLength(1);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
