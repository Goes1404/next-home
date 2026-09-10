import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte: o consultor não pode voltar a rodar sem deixar
 * rastro.
 *
 * ## Por que ela existe
 *
 * O consultor subiu na 0101 sem telemetria nenhuma — `ia_interacoes.origem`
 * nem aceitava `'consultor'`. Cada turno rodava, custava dinheiro e não
 * deixava linha; "ninguém usou" ficava indistinguível de "usaram e estava
 * quebrado". É a sétima vez que esta base tropeça nessa família (recurso
 * completo, no ar, produzindo zero linha), e a primeira em que o zero seria
 * INVISÍVEL, porque nem a tabela conhecia a origem.
 *
 * A regressão falha CALADA: a tela continua respondendo e só o contador some.
 * Mesma classe de `escalaDoPainel.test.ts` e `gravacaoDeMensagem.test.ts`.
 */

const ACOES = join(process.cwd(), "src", "app", "corretor", "(painel)", "consultor", "acoes.ts");
const TURNO = join(process.cwd(), "src", "lib", "consultor", "turno.ts");
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** Comentário que CITA um nome não é uso dele. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("o consultor deixa rastro", () => {
  const acoes = semComentarios(readFileSync(ACOES, "utf8"));

  it("a action registra a interação", () => {
    expect(acoes).toContain("registrarInteracao(");
    expect(acoes).toContain('origem: "consultor"');
  });

  it("manda o CUSTO junto — tokens é o que responde quanto custa um turno", () => {
    for (const campo of ["tokensEntrada", "tokensSaida", "latenciaMs", "modelo"]) {
      expect(acoes, `a telemetria precisa levar ${campo}`).toContain(campo);
    }
  });

  it("carimba a versão do prompt", () => {
    /*
     * Sem agrupar por versão, um defeito já corrigido continua aparecendo no
     * contador acumulado como se fosse de hoje — foi o que aconteceu com os
     * 12 anexos "barrados" do agente, todos de versões antigas.
     */
    expect(acoes).toContain("promptVersao");
    expect(acoes).toContain("VERSAO_DO_PROMPT");
  });

  it("NÃO preenche conversaId — a coluna aponta para outra tabela", () => {
    // `ia_interacoes.conversa_id` referencia `whatsapp_conversas`; a conversa
    // do consultor é de `consultor_conversas`. Preencher apontaria para linha
    // alheia, e o dado passaria a mentir sem ninguém ver.
    const registro = acoes.slice(acoes.indexOf("registrarInteracao("));
    expect(registro.slice(0, registro.indexOf("})")))
      .not.toContain("conversaId");
  });
});

describe("o turno entrega os fatos que a telemetria grava", () => {
  const turno = semComentarios(readFileSync(TURNO, "utf8"));

  it("separa o turno em que o guardrail cortou", () => {
    expect(turno).toContain("respondida_com_corte");
    expect(turno).toContain("houveCorte(");
  });

  it("contingência sai com modelo nulo, nunca com palpite", () => {
    // Esta coluna já mentiu duas vezes nesta base.
    const bloco = turno.slice(turno.indexOf('acao: "contingencia"'));
    expect(bloco.slice(0, bloco.indexOf("},"))).toContain("modelo: null");
  });
});

describe("a migration abriu a origem", () => {
  it("`consultor` é valor aceito em ia_interacoes.origem", () => {
    const sql = readFileSync(join(MIGRATIONS, "0103_telemetria_do_consultor.sql"), "utf8");
    expect(sql).toContain("'consultor'");
    expect(sql.toLowerCase()).toContain("ia_interacoes_origem_check");
  });
});
