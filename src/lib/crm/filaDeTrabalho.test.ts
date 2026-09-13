import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ordenarFila, TETO_DA_FILA, type ItemFila, type TipoItemFila } from "./filaDeTrabalho";

/**
 * A ordem da fila é a decisão de produto da tela inicial (roadmap F3): o que
 * some se ninguém agir hoje vem primeiro. Sem prova, um refactor reordena os
 * pesos sem ninguém notar — e o corretor passa a ver "revisar respostas da
 * IA" acima de uma visita marcada para daqui a duas horas.
 */

/**
 * A fonte de `filaDeTrabalho.ts`, lida uma vez.
 *
 * Serve às guardas que precisam olhar o CÓDIGO: a regressão delas falharia
 * calada — a fila continuaria montando, só com a linha errada.
 */
const FONTE = fs.readFileSync(
  path.join(process.cwd(), "src/lib/crm/filaDeTrabalho.ts"),
  "utf8",
);

/*
 * A ordem esperada, escrita à mão de propósito: se este arquivo importasse
 * o PESO de produção, o teste passaria a concordar com qualquer reordenação
 * — inclusive a errada. É a segunda cópia que dá sentido à primeira.
 *
 * Mas segunda cópia só dá sentido se alguém as COMPARAR, e desde a F3
 * ninguém comparava: `ordenarFila` ordena pelo `peso` que o próprio ITEM
 * carrega, e este arquivo monta os itens com os SEUS números — ou seja,
 * aprovava qualquer renumeração da produção. Provado em 11/09/2026: mudar
 * `cliente_recusou` de 2 para 4 no código deixou os cinco testes de ordem
 * verdes. Quem fecha isso é `peloCodigo`, logo abaixo.
 */
const PESOS: Record<TipoItemFila, number> = {
  sem_resposta: 0,
  visita_hoje: 1,
  /*
   * A recusa (0110) desceu a tarefa vencida um degrau, e o motivo está
   * escrito porque a régua desta fila é decisão de produto, não numeração:
   * é a única linha em que o SISTEMA agiu sozinho (calou o bot, cancelou os
   * follow-ups, marcou perdido, tirou das campanhas), a partir de um regex
   * sobre a fala do cliente. Tarefa vencida JÁ está atrasada e uma hora a
   * mais não muda nada; recusa só se reverte enquanto está fresca.
   */
  cliente_recusou: 2,
  // Lembrete de anotação (0100) pesa como tarefa — os dois são compromissos
  // que o próprio corretor marcou.
  tarefa_vencida: 3,
  lembrete_vencido: 3,
  lead_novo: 4,
  tarefa_hoje: 5,
  lembrete_hoje: 5,
  sem_revisao: 6,
  lead_parado: 7,
};

// `titulo: string` explícito: sem a anotação, o default (`= tipo`) faz o TS
// inferir `TipoItemFila` e um título de verdade ("09h") vira erro de tipo —
// e o arquivo entra no `tsconfig`, ou seja, derruba o `next build`.
function item(tipo: TipoItemFila, titulo: string = tipo): ItemFila {
  return {
    chave: `${tipo}:${titulo}`,
    tipo,
    titulo,
    detalhe: "",
    href: "/corretor/leads",
    peso: PESOS[tipo],
  };
}

/**
 * O `PESO` de produção, lido do código-fonte.
 *
 * Não é exportado de propósito (é detalhe de implementação da fila), e
 * importá-lo faria este arquivo concordar com qualquer reordenação. Ler o
 * texto é o que permite COMPARAR as duas cópias sem fundir uma na outra.
 */
function peloCodigo(): Record<string, number> {
  const abre = FONTE.indexOf("const PESO: Record<TipoItemFila, number> = {");
  expect(abre, "o mapa PESO sumiu do código — o recorte não vale").toBeGreaterThan(0);
  const fecha = FONTE.indexOf("\n};", abre);
  expect(fecha, "o fim do mapa PESO sumiu").toBeGreaterThan(abre);
  const corpo = FONTE.slice(abre, fecha)
    // Comentário dentro do mapa é a norma aqui (cada peso carrega o porquê),
    // e um `// tarefa_vencida: 2` velho viraria entrada falsa.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const pesos: Record<string, number> = {};
  for (const [, tipo, valor] of corpo.matchAll(/(\w+):\s*(\d+),/g)) {
    pesos[tipo!] = Number(valor);
  }
  return pesos;
}

describe("ordem da fila de trabalho", () => {
  it("o PESO do código é o mesmo que este teste declara", () => {
    expect(peloCodigo()).toEqual(PESOS);
  });

  it("visita de hoje vem antes de tudo", () => {
    const ordenada = ordenarFila([
      item("lead_parado"),
      item("sem_revisao"),
      item("visita_hoje"),
      item("lead_novo"),
    ]);
    expect(ordenada[0].tipo).toBe("visita_hoje");
  });

  it("tarefa vencida vem antes de lead novo, e lead novo antes de tarefa de hoje", () => {
    const ordenada = ordenarFila([
      item("tarefa_hoje"),
      item("lead_novo"),
      item("tarefa_vencida"),
    ]);
    expect(ordenada.map((i) => i.tipo)).toEqual(["tarefa_vencida", "lead_novo", "tarefa_hoje"]);
  });

  it("rótulo de IA e lead parado ficam no fim — importam, mas esperam", () => {
    const ordenada = ordenarFila([
      item("lead_parado"),
      item("sem_revisao"),
      item("visita_hoje"),
    ]);
    expect(ordenada.map((i) => i.tipo)).toEqual(["visita_hoje", "sem_revisao", "lead_parado"]);
  });

  it("mantém a ordem de chegada dentro do mesmo peso (visita mais cedo primeiro)", () => {
    const ordenada = ordenarFila([
      item("visita_hoje", "09h"),
      item("visita_hoje", "14h"),
      item("visita_hoje", "18h"),
    ]);
    expect(ordenada.map((i) => i.titulo)).toEqual(["09h", "14h", "18h"]);
  });

  it("o teto mantém a fila legível — fila longa vira lista, e lista ninguém lê", () => {
    expect(TETO_DA_FILA).toBeLessThanOrEqual(6);
  });
});

describe("nome e agrupamento na fila (27/08/2026)", () => {
  /*
   * Reprodução do que apareceu em produção: uma importação de dez leads sem
   * nome encheu as seis vagas com "Falar com Contato sem nome · Chegou
   * hoje" — seis pessoas diferentes, indistinguíveis, escondendo tudo o que
   * viesse depois.
   */
  it("sem nome utilizável, o TELEFONE vira a identidade", async () => {
    const { nomeParaExibir } = await import("@/lib/leads/nomeExibido");
    expect(nomeParaExibir({ nome: "Contato sem nome", telefone: "11.95721-6675" })).toBe(
      "(11) 95721-6675",
    );
    expect(nomeParaExibir({ nome: "  ", telefone: "5511995738920" })).toBe("(11) 99573-8920");
  });

  it("nome de verdade continua ganhando do telefone", async () => {
    const { nomeParaExibir } = await import("@/lib/leads/nomeExibido");
    expect(nomeParaExibir({ nome: "Priscila", telefone: "11957216675" })).toBe("Priscila");
  });

  it("sem nome E sem telefone, diz a verdade em vez de inventar", async () => {
    const { nomeParaExibir } = await import("@/lib/leads/nomeExibido");
    expect(nomeParaExibir({ nome: null, telefone: null })).toBe("Contato sem nome");
    // Número que não dá para remontar não vira identidade falsa.
    expect(nomeParaExibir({ nome: null, telefone: "123" })).toBe("Contato sem nome");
  });

  it("a fila agrupa a partir do terceiro item do mesmo tipo", async () => {
    const { INDIVIDUAIS_POR_TIPO } = await import("./filaDeTrabalho");
    // O teto de 6 não serve de nada se um assunto só puder ocupar os 6.
    expect(INDIVIDUAIS_POR_TIPO).toBeLessThan(6);
    expect(INDIVIDUAIS_POR_TIPO).toBeGreaterThan(1);
  });
});

describe("a recusa do cliente avisa o corretor (0110)", () => {
  const item = (tipo: TipoItemFila): ItemFila => ({
    chave: tipo,
    tipo,
    titulo: tipo,
    detalhe: "",
    href: "/",
    peso: PESOS[tipo],
  });

  /*
   * Quatro consequências caem sobre o lead sem ninguém conferir — bot
   * silenciado, follow-ups cancelados, etapa "perdido", fora das campanhas —
   * e quem as dispara é um regex sobre a fala do cliente. O aviso existe
   * para que um erro do detector custe uma linha na fila, não um lead.
   */
  it("vem depois de quem espera e da visita de hoje, e antes da tarefa vencida", () => {
    const ordenada = ordenarFila([
      item("tarefa_vencida"),
      item("cliente_recusou"),
      item("visita_hoje"),
      item("sem_resposta"),
    ]);
    expect(ordenada.map((i) => i.tipo)).toEqual([
      "sem_resposta",
      "visita_hoje",
      "cliente_recusou",
      "tarefa_vencida",
    ]);
  });

  /*
   * As duas regras abaixo falhariam CALADAS: a fila continuaria montando,
   * só com a linha errada. Por isso a guarda lê o código — mesma classe de
   * `escalaDoPainel` e `etapaAutomatica`.
   */

  /** O corpo do laço que monta o item, recortado por âncoras ÚNICAS. */
  function corpoDoLaco(): string {
    const inicio = FONTE.indexOf("for (const lead of (recusas.data");
    const fim = FONTE.indexOf("for (const lead of (novos.data");
    expect(inicio, "a âncora de início sumiu — o recorte não vale").toBeGreaterThan(0);
    expect(fim, "a âncora de fim sumiu — o recorte não vale").toBeGreaterThan(inicio);
    return FONTE.slice(inicio, fim);
  }

  it("a fonte é o FATO (`nao_contatar_em`), nunca a etapa — etapa anda e volta", () => {
    const inicio = FONTE.indexOf('.select("id, nome, telefone, nao_contatar_em');
    expect(inicio, "a consulta da recusa sumiu").toBeGreaterThan(0);
    const consulta = FONTE.slice(inicio, FONTE.indexOf(".limit(TETO_DA_FILA)", inicio));
    expect(consulta).toContain('.gte("nao_contatar_em"');
    // Arrastar o cartão de volta para "Novo" não pode apagar o aviso: o
    // cliente continua tendo pedido para não ser procurado.
    expect(consulta).not.toContain('"etapa"');
  });

  it("quem pediu para PARAR não ganha botão de WhatsApp na fila", () => {
    const corpo = corpoDoLaco();
    expect(corpo).toMatch(/motivo === "parada"\s*\?\s*undefined/);
    // E os outros dois ganham: a recusa pode ter sido da OFERTA, e o
    // corretor nunca foi barrado pelo `nao_contatar_em`.
    expect(corpo).toContain("whatsappDoLead(lead)");
  });
});

describe("quem esperando resposta vem primeiro", () => {
  /*
   * A ordem da fila é a do CUSTO DE PERDER, e esta é a única situação em
   * que a pessoa já levantou a mão e nós ignoramos.
   *
   * Medido em 01/09, com a trava de campanha quebrada: 6 clientes
   * responderam ao disparo e nenhum recebeu resposta — um deles esperando
   * desde 27/08. A visita de hoje perde para isso porque já está marcada;
   * quem espera resposta desiste a qualquer momento.
   */
  it("ganha até da visita de hoje", () => {
    const item = (tipo: TipoItemFila): ItemFila => ({
      chave: tipo,
      tipo,
      titulo: tipo,
      detalhe: "",
      href: "/",
      peso: PESOS[tipo],
    });

    const ordenada = ordenarFila([
      item("lead_parado"),
      item("visita_hoje"),
      item("sem_resposta"),
      item("tarefa_vencida"),
    ]);

    expect(ordenada[0].tipo).toBe("sem_resposta");
    expect(ordenada[1].tipo).toBe("visita_hoje");
  });
});
