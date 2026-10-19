import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { numeroDoLinkPessoal } from "./numeroDoLinkPessoal";

function banco(linha: { telefone_conectado: string | null; status_conexao: string } | null) {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: linha, error: null }),
  };
  return { from: () => consulta } as unknown as SupabaseClient;
}

describe("link pessoal: o clique nunca sai do corretor do link", () => {
  it("número conectado na plataforma vem primeiro", async () => {
    const n = await numeroDoLinkPessoal(banco({ telefone_conectado: "5511900000001", status_conexao: "conectado" }), {
      id: "c",
      whatsapp: "5511900000002",
    });
    expect(n).toBe("5511900000001");
  });

  it("desconectado, vai para o WhatsApp do perfil dele, não para outro corretor", async () => {
    const n = await numeroDoLinkPessoal(banco({ telefone_conectado: "5511900000001", status_conexao: "desconectado" }), {
      id: "c",
      whatsapp: "(11) 90000-0002",
    });
    expect(n).toBe("11900000002");
  });

  it("sem número nenhum, devolve null", async () => {
    expect(await numeroDoLinkPessoal(banco(null), { id: "c", whatsapp: null })).toBeNull();
  });

  it("as duas portas consultam o link pessoal antes do sorteio e não usam mais o 'preferido'", () => {
    for (const arquivo of ["src/app/wa/route.ts", "src/app/wa/[campanha]/route.ts"]) {
      const codigo = readFileSync(arquivo, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const link = codigo.indexOf("numeroDoLinkPessoal(");
      const sorteio = codigo.indexOf("sortear_corretor_whatsapp");
      expect(link, arquivo).toBeGreaterThan(-1);
      expect(link, arquivo).toBeLessThan(sorteio);
      expect(codigo, arquivo).not.toMatch(/preferido/);
    }
  });
});
