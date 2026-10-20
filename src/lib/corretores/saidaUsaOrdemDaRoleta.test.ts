import { describe, expect, it } from "vitest";
import { funcoesDasMigrations } from "@/lib/grupos/funcoesSeguras";

/**
 * Na saída do corretor, "dividir pela roleta" (`devolver_leads_da_imobiliaria`,
 * 0200) repete a ordem da roleta de leads (`distribuir_lead`). São duas
 * contas do mesmo "quem recebe o próximo lead", e duas contas divergem no
 * primeiro ajuste de uma delas (o defeito do `montarResumo`, MEMORIA).
 *
 * Esta guarda lê as duas definições vivas nas migrations: todo filtro de
 * corretor e toda preferência de ordem da roleta tem de estar na devolução.
 * A devolução pode ter A MAIS (quem sai fica de fora; o contador desta
 * divisão), e o desempate por "quem faz mais tempo que não recebe" fica de
 * fora de propósito: o contador o substitui.
 */

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bl2\b/g, "l")
    .replace(/v_lead\.cidade/g, "cidade_lead")
    .replace(/v_grupo\b/g, "new.grupo_id")
    .trim();

/** Divide por um separador fora de parênteses. */
function dividir(texto: string, separador: RegExp): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (nivel === 0) {
      const resto = texto.slice(i);
      const m = separador.exec(resto);
      if (m && m.index === 0) {
        partes.push(atual);
        atual = "";
        i += m[0].length - 1;
        continue;
      }
    }
    atual += c;
  }
  partes.push(atual);
  return partes.map(normalizar).filter(Boolean);
}

/** O `select c.id ... from corretores c ... limit 1` de um corpo. */
function escolha(corpo: string): { filtros: string[]; ordem: string[] } {
  const texto = normalizar(corpo);
  const inicio = texto.indexOf("from corretores c left join corretor_whatsapp_instancias");
  const onde = texto.indexOf(" where ", inicio);
  const ordem = texto.indexOf(" order by ", onde);
  const limite = texto.indexOf(" limit 1", ordem);
  expect(inicio >= 0 && onde > inicio && ordem > onde && limite > ordem, "Escolha do corretor não encontrada.").toBe(true);
  return {
    filtros: dividir(texto.slice(onde + 7, ordem), /^ and /),
    ordem: dividir(texto.slice(ordem + 10, limite), /^,/),
  };
}

describe("a divisão na saída usa a ordem da roleta", () => {
  const funcoes = funcoesDasMigrations();
  const roleta = funcoes.get("distribuir_lead()");
  const saida = funcoes.get("devolver_leads_da_imobiliaria(uuid, uuid)");

  it("as duas funções existem", () => {
    expect(roleta).toBeTruthy();
    expect(saida).toBeTruthy();
  });

  const a = escolha(roleta!.corpo);
  const b = escolha(saida!.corpo);

  it("leu filtros e preferências (o recorte não ficou vazio)", () => {
    expect(a.filtros.length).toBeGreaterThanOrEqual(5);
    expect(a.ordem.length).toBeGreaterThanOrEqual(6);
  });

  it("todo filtro da roleta vale na devolução", () => {
    expect(a.filtros.filter((f) => !b.filtros.includes(f))).toEqual([]);
    expect(b.filtros).toContain("c.id <> p_corretor");
  });

  it("toda preferência da roleta vale na devolução, na mesma ordem relativa", () => {
    const fora = (p: string) => p.includes("'epoch'"); // desempate substituído pelo contador
    const daRoleta = a.ordem.filter((p) => !fora(p));
    const naDevolucao = b.ordem.filter((p) => daRoleta.includes(p));
    expect(naDevolucao).toEqual(daRoleta);
  });
});
