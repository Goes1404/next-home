import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { bancoFalso } from "../../../test/bancoFalso";

vi.mock("server-only", () => ({}));

import { listasDoNumeroDoCorretor } from "./listasDoNumero";

/**
 * A lista do número OFICIAL da imobiliária (0256) nunca pode sair pelo
 * WhatsApp pessoal do corretor — foi a restrição da conta da Bruna, em
 * 07/10/2026, que fez nascer o canal oficial. E nada do que fala do número do
 * corretor (aviso de queda, saúde, status da fila, "limpar fila") pode contar
 * ou apagar a lista oficial como se fosse dele.
 */

const CORRETOR = "corretor-1";

function listas() {
  return [
    { id: "evolution-andando", corretor_id: CORRETOR, grupo_id: "g1", status: "em_andamento", canal: "evolution" },
    { id: "oficial-andando", corretor_id: CORRETOR, grupo_id: "g1", status: "em_andamento", canal: "oficial" },
    { id: "evolution-pausada", corretor_id: CORRETOR, grupo_id: "g1", status: "pausada", canal: "evolution" },
    { id: "evolution-rascunho", corretor_id: CORRETOR, grupo_id: "g1", status: "rascunho", canal: "evolution" },
    { id: "de-outro", corretor_id: "corretor-2", grupo_id: "g1", status: "em_andamento", canal: "evolution" },
  ];
}

describe("listas do número do corretor", () => {
  it("a lista oficial fica de fora; as do número dele entram", async () => {
    const banco = bancoFalso({ whatsapp_campanhas: listas() });
    const andando = await listasDoNumeroDoCorretor(banco.cliente as never, CORRETOR, { status: "em_andamento" });
    expect(andando?.map((l) => l.id)).toEqual(["evolution-andando"]);

    const todas = await listasDoNumeroDoCorretor(banco.cliente as never, CORRETOR, { semRascunho: true });
    expect(todas?.map((l) => l.id).sort()).toEqual(["evolution-andando", "evolution-pausada"]);
  });

  it("antes da 0256 aplicada (sem a coluna `canal`), toda lista é do corretor", async () => {
    const consultas: string[][] = [];
    const cliente = {
      from: () => {
        const filtros: string[] = [];
        consultas.push(filtros);
        const consulta = {
          select: () => consulta,
          eq: (coluna: string, valor: unknown) => (filtros.push(`eq:${coluna}=${String(valor)}`), consulta),
          neq: (coluna: string, valor: unknown) => (filtros.push(`neq:${coluna}=${String(valor)}`), consulta),
          then: (resolver: (r: unknown) => void) =>
            resolver(
              filtros.includes("neq:canal=oficial")
                ? { data: null, error: { code: "42703", message: "column whatsapp_campanhas.canal does not exist" } }
                : { data: [{ id: "antiga", status: "em_andamento" }], error: null },
            ),
        };
        return consulta;
      },
    };
    const r = await listasDoNumeroDoCorretor(cliente as never, CORRETOR, { status: "em_andamento" });
    expect(r).toEqual([{ id: "antiga", status: "em_andamento" }]);
    expect(consultas).toHaveLength(2);
  });

  it("outro erro não vira 'nenhuma lista' calado como se tudo estivesse bem: devolve null", async () => {
    const cliente = {
      from: () => {
        const consulta = {
          select: () => consulta,
          eq: () => consulta,
          neq: () => consulta,
          then: (resolver: (r: unknown) => void) => resolver({ data: null, error: { code: "57014", message: "timeout" } }),
        };
        return consulta;
      },
    };
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await listasDoNumeroDoCorretor(cliente as never, CORRETOR)).toBeNull();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});

describe("guarda: tudo o que fala do número do corretor passa pela mesma regra", () => {
  const raiz = join(__dirname, "..", "..", "..");
  const fonte = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

  it("o disparador da Evolution só pega as listas do número do corretor", () => {
    const disparador = fonte("src/lib/whatsapp/campaignDispatcher.ts");
    const processar = disparador.slice(disparador.indexOf("async function processarInstancia("));
    expect(processar).toContain("campanhasDoNumeroDoCorretor(supabase, instancia.corretor_id)");
    const regra = disparador.slice(disparador.indexOf("export async function campanhasDoNumeroDoCorretor("));
    expect(regra.slice(0, regra.indexOf("\n}\n"))).toContain("listasDoNumeroDoCorretor(");
  });

  it.each([
    ["src/lib/whatsapp/avisoDeQueda.ts", "o aviso de queda do número"],
    ["src/lib/central/tratadores/saude.ts", "a saúde do número pela Central"],
    ["src/app/corretor/(painel)/campanhas/acoes.ts", "o status da fila e o limpar fila"],
  ])("%s (%s) lê as listas pela regra única", (caminho) => {
    const texto = fonte(caminho);
    expect(texto).toContain("listasDoNumeroDoCorretor(");
  });

  it("o status da fila e o limpar fila do corretor não leem lista nenhuma por fora da regra", () => {
    const acoes = fonte("src/app/corretor/(painel)/campanhas/acoes.ts");
    for (const funcao of ["export async function statusDisparo(", "export async function limparFilaDisparo("]) {
      const inicio = acoes.indexOf(funcao);
      expect(inicio, funcao).toBeGreaterThan(-1);
      const corpo = acoes.slice(inicio, acoes.indexOf("\n}\n", inicio));
      expect(corpo, funcao).toContain("listasDoNumeroDoCorretor(");
      // Escrever nas listas que a regra devolveu pode (fechar as que acabaram);
      // LER lista por fora dela, não.
      expect(corpo, funcao).not.toMatch(/from\("whatsapp_campanhas"\)\s*\.select\(/);
    }
  });

  it("a comparação de texto do número ignora o que saiu pelo número oficial", () => {
    expect(fonte("src/lib/whatsapp/textosDoNumero.ts")).toContain('.neq("campanha.canal", "oficial")');
  });
});
