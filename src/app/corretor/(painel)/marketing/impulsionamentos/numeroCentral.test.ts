import { describe, expect, it } from "vitest";
import { opcoesDoNumeroCentral } from "./numeroCentral";

const conectada = { status_conexao: "conectado", conectado_em: "2026-10-27T19:23:35Z", sessao_caida_em: null };

describe("opcoesDoNumeroCentral", () => {
  it("oferece o número da conta oculta: é o número da imobiliária (Aretz, 27/10/2026)", () => {
    const opcoes = opcoesDoNumeroCentral(
      [{ corretor_id: "adm", instance_name: "nexthome-administracao-aretz", ...conectada }],
      [{ id: "adm", nome: "Aretz" }],
      new Set(["adm"]),
    );
    expect(opcoes).toEqual([
      { instanceName: "nexthome-administracao-aretz", nome: "Aretz (conta oculta)", conectada: true },
    ]);
  });

  it("número de corretor visível sai com o nome dele, sem marca", () => {
    const opcoes = opcoesDoNumeroCentral(
      [{ corretor_id: "c1", instance_name: "inst-c1", ...conectada }],
      [{ id: "c1", nome: "Moisés" }],
      new Set(),
    );
    expect(opcoes).toEqual([{ instanceName: "inst-c1", nome: "Moisés", conectada: true }]);
  });

  it("sessão caída ou sem data de conexão não conta como conectada", () => {
    const opcoes = opcoesDoNumeroCentral(
      [
        { corretor_id: "c1", instance_name: "a", ...conectada, sessao_caida_em: "2026-10-27T20:00:00Z" },
        { corretor_id: "c2", instance_name: "b", ...conectada, conectado_em: null },
      ],
      [],
      new Set(),
    );
    expect(opcoes.map((o) => o.conectada)).toEqual([false, false]);
    // Sem a pessoa na lista, o nome da instância identifica o número.
    expect(opcoes.map((o) => o.nome)).toEqual(["a", "b"]);
  });
});
