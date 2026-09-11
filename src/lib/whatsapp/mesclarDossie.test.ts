import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mesclarDossie, type LinhaDossie } from "./mesclarDossie";

/**
 * O dossiê se apagava sozinho.
 *
 * `salvarDossie` faz `upsert` com TODAS as colunas, e a extração só enxerga a
 * janela do histórico: quando o assunto sai dela, o campo volta `null` e o
 * upsert sobrescreve o que o cliente já tinha dito. `leads` ganhou a guarda
 * contra null em 24/08 (renda e orçamento); `lead_observacoes_ia` nunca
 * ganhou — e o estado medido era 16 dossiês para 131 leads, com orçamento
 * 0/16 e forma de pagamento 0/16.
 *
 * A conta mora em módulo PURO para poder ser testada sem banco, e porque é
 * uma regra de negócio ("o que o cliente disse não se desdiz sozinho"), não
 * um detalhe de persistência.
 */

const anterior: LinhaDossie = {
  orcamento_min: 300000,
  orcamento_max: 500000,
  forma_pagamento: "financiamento",
  perfil_familiar: "casal com um filho",
  urgencia_mudanca: "seis meses",
  exigencias_especificas: ["varanda gourmet"],
  objecoes_identificadas: ["preço"],
  temperatura_score: 40,
  temperatura_label: "morno",
  resumo_executivo: "Procura 3 dorm em Alphaville",
  proximo_passo_sugerido: "oferecer visita",
};

const vazio: LinhaDossie = {
  orcamento_min: null,
  orcamento_max: null,
  forma_pagamento: null,
  perfil_familiar: null,
  urgencia_mudanca: null,
  exigencias_especificas: [],
  objecoes_identificadas: [],
  temperatura_score: 55,
  temperatura_label: "morno",
  resumo_executivo: "Conversa em andamento",
  proximo_passo_sugerido: null,
};

describe("mesclarDossie — null não apaga", () => {
  it("preserva o que o cliente já tinha dito quando a extração vem vazia", () => {
    const final = mesclarDossie(anterior, vazio);

    expect(final.orcamento_min).toBe(300000);
    expect(final.orcamento_max).toBe(500000);
    expect(final.forma_pagamento).toBe("financiamento");
    expect(final.perfil_familiar).toBe("casal com um filho");
    expect(final.urgencia_mudanca).toBe("seis meses");
  });

  it("valor novo substitui o antigo — o cliente pode mudar de ideia", () => {
    const final = mesclarDossie(anterior, { ...vazio, orcamento_max: 700000 });
    expect(final.orcamento_max).toBe(700000);
  });

  it("sem linha anterior, escreve tudo como veio", () => {
    const final = mesclarDossie(null, vazio);
    expect(final).toEqual(vazio);
  });

  /*
   * Exceção declarada: a temperatura é LEITURA DO MOMENTO, não fato
   * acumulado. Preservar o score antigo faria o termostato do
   * `evolucaoConversa` comparar com um número que já não existe — e é a
   * comparação de faixa que decide se o corretor recebe aviso.
   */
  it("temperatura SEMPRE sobrescreve, mesmo caindo", () => {
    const final = mesclarDossie(anterior, { ...vazio, temperatura_score: 12, temperatura_label: "frio" });
    expect(final.temperatura_score).toBe(12);
    expect(final.temperatura_label).toBe("frio");
  });

  it("o resumo e o próximo passo também são leitura do momento", () => {
    const final = mesclarDossie(anterior, vazio);
    expect(final.resumo_executivo).toBe("Conversa em andamento");
  });
});

describe("mesclarDossie — listas", () => {
  it("lista vazia não apaga a anterior", () => {
    const final = mesclarDossie(anterior, vazio);
    expect(final.exigencias_especificas).toEqual(["varanda gourmet"]);
    expect(final.objecoes_identificadas).toEqual(["preço"]);
  });

  /*
   * E lista NÃO-vazia substitui, nunca acumula. União guardaria objeção já
   * superada, e objeção morta no dossiê manda a IA tratar um problema que o
   * cliente já esqueceu — o que soa como não ter ouvido.
   */
  it("lista nova SUBSTITUI, não faz união", () => {
    const final = mesclarDossie(anterior, {
      ...vazio,
      objecoes_identificadas: ["prazo de entrega"],
    });

    expect(final.objecoes_identificadas).toEqual(["prazo de entrega"]);
  });
});

/**
 * Guarda de código-fonte: a regressão aqui falha CALADA.
 *
 * Basta alguém voltar a montar o objeto do upsert à mão — o que é a coisa
 * mais natural do mundo ao acrescentar um campo — e o dossiê volta a se
 * apagar, sem erro, sem teste vermelho, sem nada na tela. Foi assim que ele
 * ficou 16 dossiês para 131 leads.
 */
describe("salvarDossie passa pela mescla, nunca grava direto", () => {
  const FONTE = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");

  function corpoDeSalvarDossie(): string {
    const inicio = FONTE.indexOf("export async function salvarDossie(");
    expect(inicio, "salvarDossie não encontrada").toBeGreaterThan(-1);
    const fim = FONTE.indexOf("\n}", inicio);
    return FONTE.slice(inicio, fim);
  }

  it("lê a linha anterior e mescla antes de gravar", () => {
    const corpo = corpoDeSalvarDossie();
    expect(corpo).toMatch(/mesclarDossie\(/);
    expect(corpo).toMatch(/from\("lead_observacoes_ia"\)\s*\.select\(/);
  });

  it("o upsert grava o RESULTADO da mescla, não o dossiê cru", () => {
    const corpo = corpoDeSalvarDossie();
    /*
     * O recorte é da CHAMADA, não do resto da função. A primeira versão desta
     * guarda ia do `.upsert(` até o fim de `salvarDossie` — e reprovou código
     * correto, porque mais abaixo o orçamento é gravado em `leads` de
     * propósito (é de lá que a ficha do CRM lê). Oitava vez que uma guarda
     * desta base tropeça no próprio recorte.
     */
    const inicio = corpo.indexOf(".upsert(");
    const upsert = corpo.slice(inicio, corpo.indexOf(");", inicio));

    expect(upsert).toMatch(/\.\.\.mesclado/);
    // O sintoma da regressão: o campo do dossiê cru de volta dentro do upsert.
    expect(upsert).not.toMatch(/dossie\.orcamentoMax/);
  });
});

/**
 * Guarda de código-fonte: o update da FICHA não volta a ser montado à mão.
 *
 * A regressão aqui falha calada e é a pior do conjunto: alguém acrescenta um
 * campo ao objeto de update, esquece a marca `campos_do_corretor`, e a
 * primeira correção manual do corretor é desfeita na mensagem seguinte — sem
 * erro, sem teste vermelho, sem nada na tela. É assim que alguém para de
 * corrigir a ficha.
 */
describe("salvarDossie escreve a ficha por camposDaFicha", () => {
  const FONTE = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");

  function corpoDeSalvarDossie(): string {
    const inicio = FONTE.indexOf("export async function salvarDossie(");
    expect(inicio, "salvarDossie não encontrada").toBeGreaterThan(-1);
    const fim = FONTE.indexOf(String.fromCharCode(10) + "}", inicio);
    return FONTE.slice(inicio, fim);
  }

  it("passa a marca do corretor PARA camposDaFicha, não só cita a coluna", () => {
    const corpo = corpoDeSalvarDossie();
    /*
     * A segunda mordida passou na versão anterior desta guarda: trocar o
     * argumento por `[]` deixava a IA escrever por cima de tudo que o
     * corretor tivesse corrigido, e o teste continuava verde porque a
     * palavra `campos_do_corretor` seguia aparecendo no `.select`.
     *
     * Recortar a CHAMADA — e afirmar que ela é única antes de recortar, que
     * é a lição das sete vezes em que uma guarda desta base tropeçou no
     * próprio recorte.
     */
    const ocorrencias = corpo.split("camposDaFicha(").length - 1;
    expect(ocorrencias, "camposDaFicha deveria ser chamada uma vez").toBe(1);

    const inicio = corpo.indexOf("camposDaFicha(");
    const chamada = corpo.slice(inicio, corpo.indexOf(");", inicio));
    expect(chamada).toMatch(/campos_do_corretor/);
  });

  it("o update de leads grava o RESULTADO dela, não um objeto montado aqui", () => {
    const corpo = corpoDeSalvarDossie();
    /*
     * A primeira versão desta guarda checava só a PRESENÇA de
     * `camposDaFicha(` no corpo — e passou na mordida: bastou manter a
     * chamada num `const naoUsado` e montar o update à mão ao lado. Guarda
     * que confere que a função foi citada, e não que o resultado dela é o
     * que vai para o banco, é decorativa. Quarta guarda desta base a nascer
     * cega; por isso agora a exigência é o VÍNCULO.
     */
    expect(corpo).toMatch(/const doLead = camposDaFicha\(/);
    expect(corpo).toMatch(/\.from\("leads"\)\.update\(doLead\)/);
    // E nada de campo escrito à mão no objeto que vai para o update.
    expect(corpo).not.toMatch(/doLead\w*\.\w+ = /);
  });
});
