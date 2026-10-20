import { describe, expect, it } from "vitest";
import {
  FUNCOES_QUE_CONFEREM_O_CHAMADOR,
  FUNCOES_SEM_GRUPO,
  funcoesDasMigrations,
  tiposDosParametros,
} from "./funcoesSeguras";

/*
 * Toda função `security definer` respeita o grupo (0192, Task 5).
 *
 * Dentro dela a RLS não vale, e a regressão é calada: a função "funciona",
 * só que enxerga e mexe nos outros grupos. Esta guarda lê a ÚLTIMA definição
 * viva de cada função nas migrations e reprova a que não cita o grupo nem
 * está na lista declarada, com motivo. A metade de banco
 * (`funcoesSeguras.db.test.ts`) confere o `pg_proc` e o EXECUTE.
 */

const funcoes = funcoesDasMigrations();
const definers = [...funcoes.values()].filter((f) => f.securityDefiner);

describe("funções security definer respeitam o grupo", () => {
  it("o leitor das migrations acha as funções que importam", () => {
    // Sem isto, um leitor quebrado que não acha nada aprovaria tudo.
    for (const assinatura of [
      "distribuir_lead()",
      "definir_papel_corretor(uuid, text)",
      "garantir_gestor_remanescente()",
      "ranking_vgv(date, date)",
      "sortear_corretor_whatsapp(uuid, uuid, uuid)",
      "reivindicar_clique_do_link(uuid, integer, uuid)",
    ]) {
      expect(funcoes.get(assinatura)?.securityDefiner, assinatura).toBe(true);
    }
    expect(definers.length).toBeGreaterThan(40);
  });

  it("toda função security definer cita o grupo ou está na lista declarada", () => {
    const semGrupo = definers
      .filter((f) => !/grupo/i.test(f.corpo) && !(f.assinatura in FUNCOES_SEM_GRUPO))
      .map((f) => `${f.assinatura} (${f.arquivo})`);
    expect(
      semGrupo,
      "Função security definer sem filtro de grupo. Dentro dela a RLS não vale: " +
        "restrinja ao grupo de quem chama (grupo_atual()), ao da linha do gatilho " +
        "(new.grupo_id) ou ao do parâmetro, ou declare-a em FUNCOES_SEM_GRUPO com o motivo.",
    ).toEqual([]);
  });

  it("a lista declarada não cita função que cita o grupo, nem função que não existe", () => {
    const sobrando = Object.keys(FUNCOES_SEM_GRUPO).filter((assinatura) => {
      const f = funcoes.get(assinatura);
      return !f || !f.securityDefiner || /grupo/i.test(f.corpo);
    });
    expect(sobrando, "Entrada obsoleta em FUNCOES_SEM_GRUPO: tire da lista.").toEqual([]);
    for (const assinatura of Object.keys(FUNCOES_QUE_CONFEREM_O_CHAMADOR)) {
      expect(funcoes.get(assinatura)?.securityDefiner, assinatura).toBe(true);
    }
  });

  it("função de gestor sem grupo só as duas que olham todos os grupos de propósito", () => {
    // `eh_gestor()` significa "gestor do MEU grupo" nas policies; dentro de
    // uma função security definer, o filtro de grupo é explícito. As únicas
    // exceções são a unicidade global do slug e do e-mail de acesso.
    const deGestorSemGrupo = definers
      .filter((f) => /eh_gestor\s*\(\s*\)/i.test(f.corpo) && !/grupo/i.test(f.corpo))
      .map((f) => f.assinatura)
      .sort();
    expect(deGestorSemGrupo).toEqual(["email_de_acesso_livre(text)", "slug_de_corretor_livre(text)"]);
  });

  it("os tipos dos parâmetros saem como o Postgres os escreve", () => {
    expect(tiposDosParametros("p_lead_id uuid, p_quando timestamptz")).toEqual([
      "uuid",
      "timestamp with time zone",
    ]);
    expect(tiposDosParametros("p_grupo uuid, p_x uuid default null, out y text")).toEqual(["uuid", "uuid"]);
    expect(tiposDosParametros("p numeric(16, 2), q int, r text[]")).toEqual(["numeric", "integer", "text[]"]);
  });
});
