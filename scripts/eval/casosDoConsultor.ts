/**
 * O conjunto de casos do consultor — derivado do CATÁLOGO, não de conversa.
 *
 * ## Por que não sai das conversas reais
 *
 * A ideia original era minerar as perguntas que clientes já fizeram no
 * WhatsApp: 369 mensagens com "?" nos últimos 90 dias. Medido, o corpus está
 * contaminado — o número da instância é o WhatsApp PESSOAL do corretor, e a
 * maioria dessas perguntas é da vida privada dele. Não existe filtro
 * estrutural que separe: `cliente_conhecido` e `lead_id` são verdade para as
 * duas (o webhook cria lead de quem escreve, 0026), e o recorte de
 * atendimento deixa passar 367 das 369.
 *
 * O `MEMORIA.md` já registrava a conclusão em 01/09: "o resto NÃO É SEPARÁVEL
 * por dado: a diferença está no CONTEÚDO, que é justamente o que não se quer
 * inspecionar". Minerar aquilo para virar conjunto de teste seria levar
 * conversa privada para dentro do eval.
 *
 * ## O que este arquivo faz, então
 *
 * Gera os casos a partir das DIMENSÕES que existem no nosso próprio dado:
 * as faixas do MCMV cadastradas, os dormitórios que o catálogo tem, as
 * cidades onde há imóvel, os estágios que existem. Mais os casos de borda que
 * esta base já pagou para aprender (imóvel que não é nosso, planta que não
 * existe, acabamento e prazo não cadastrados).
 *
 * Isso mede COBERTURA do que temos — é honesto sobre o que é, e não finge ser
 * demanda real. **Não substitui a análise de erro sobre transcrição de uso
 * verdadeiro**, que continua dependendo de a corretora usar a tela.
 *
 * Gerar (grátis):  npx tsx scripts/eval/casosDoConsultor.ts
 * Rodar (custa):   npx tsx --conditions=react-server scripts/eval/casosDoConsultor.ts --rodar
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SELECT_EMPREENDIMENTO } from "@/lib/queries";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
// Estáticos de propósito: `await import()` com alias do tsconfig não resolve
// no tsx — só os imports de topo passam pelo resolvedor de paths.
import { turnoDoConsultor } from "@/lib/consultor/turno";
import { houveCorte } from "@/lib/consultor/guardrails";
import { afirmaPrazo } from "@/lib/whatsapp/prazoEntrega";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRETA = process.env.SUPABASE_SECRET_KEY;

export type CasoDoConsultor = {
  id: string;
  /** O que o corretor pergunta. */
  pergunta: string;
  /** Que escopo da spec este caso exercita. */
  escopo: "portfolio" | "credito" | "objecao" | "juridico";
  /**
   * O que dá para conferir SEM juiz — determinístico, como as checagens duras
   * do `rodarEval`. Critério que precisa de juiz é escrito depois, e só para
   * a falha que a análise de erro mostrar que REPETE.
   */
  espera: {
    /** Deve sair pelo menos um cartão de imóvel. */
    indicaImovel?: boolean;
    /** Deve rodar a simulação (o corretor deu renda e valor). */
    simula?: boolean;
    /** A resposta NÃO pode terminar no desvio do guardrail de crédito. */
    semCorteDeCredito?: boolean;
    /** Não pode afirmar data de entrega (a ficha não tem). */
    semPrazo?: boolean;
  };
};

async function rest<T>(caminho: string, chave: string): Promise<T[]> {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T[]>;
}

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Os casos, montados do que EXISTE.
 *
 * Nada de "Canvas Alphaville": 23 dos 36 casos golden do agente citavam
 * imóveis que não existem no fixture, a IA respondia certo ("esse não está no
 * meu catálogo") e o eval reprovava. Aqui os nomes saem do catálogo de
 * verdade — menos o caso que existe JUSTAMENTE para testar o imóvel alheio.
 */
export function montarCasos(
  catalogo: Empreendimento[],
  credito: ParametrosCredito,
): CasoDoConsultor[] {
  const casos: CasoDoConsultor[] = [];

  const cidades = [...new Set(catalogo.map((e) => e.cidade).filter(Boolean))];
  const dorms = [
    ...new Set(catalogo.flatMap((e) => (e.tipologias ?? []).map((t) => t.dormitorios))),
  ]
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const estagios = [...new Set(catalogo.map((e) => e.status))];
  const comPreco = catalogo.filter((e) => e.precoAPartir);
  const semPlanta = catalogo.filter((e) => (e.plantas?.length ?? 0) === 0);
  const semPrazo = catalogo.filter((e) => !e.entregaPrevista);

  // ── PORTFÓLIO: uma pergunta por combinação que o catálogo sustenta ────────
  for (const cidade of cidades.slice(0, 3)) {
    for (const dorm of dorms.slice(0, 3)) {
      casos.push({
        id: `portfolio-${cidade.toLowerCase().replace(/\s+/g, "-")}-${dorm}dorm`,
        pergunta: `Cliente quer ${dorm} dormitório${dorm > 1 ? "s" : ""} em ${cidade}. O que temos?`,
        escopo: "portfolio",
        espera: { indicaImovel: true, semPrazo: true },
      });
    }
  }

  for (const status of estagios.slice(0, 3)) {
    casos.push({
      id: `portfolio-estagio-${status}`,
      pergunta: `Tem alguma coisa ${STATUS_LABEL[status] ?? status} pra mostrar hoje?`,
      escopo: "portfolio",
      espera: { indicaImovel: true },
    });
  }

  if (comPreco.length > 0) {
    const barato = [...comPreco].sort((a, b) => (a.precoAPartir ?? 0) - (b.precoAPartir ?? 0))[0];
    casos.push({
      id: "portfolio-mais-barato",
      pergunta: "Qual é o mais em conta que a gente tem?",
      escopo: "portfolio",
      espera: { indicaImovel: true, semCorteDeCredito: true },
    });
    casos.push({
      id: "portfolio-ficha-do-imovel",
      pergunta: `Me passa a ficha do ${barato.nome}: quantos dormitórios e o que tem de lazer?`,
      escopo: "portfolio",
      espera: { semPrazo: true },
    });
  }

  // ── CRÉDITO: uma renda por faixa cadastrada, e uma acima de todas ────────
  const faixas = [...credito.faixas].sort((a, b) => a.rendaMax - b.rendaMax);
  const alvo = comPreco[0];
  for (const f of faixas) {
    const renda = Math.round(f.rendaMax * 0.9);
    casos.push({
      id: `credito-${f.nome.toLowerCase().replace(/\s+/g, "-")}`,
      pergunta: `Cliente com renda de ${reais(renda)}, entrada de ${reais(30000)}${
        alvo?.precoAPartir ? `, olhando o ${alvo.nome} de ${reais(alvo.precoAPartir)}` : ""
      }. Fecha?`,
      escopo: "credito",
      espera: { simula: true, semCorteDeCredito: true },
    });
  }
  casos.push({
    id: "credito-acima-das-faixas",
    pergunta: `Renda de ${reais(Math.round(faixas[faixas.length - 1].rendaMax * 2))}, quer financiar ${reais(
      800000,
    )}. Como fica?`,
    escopo: "credito",
    espera: { simula: true, semCorteDeCredito: true },
  });
  casos.push({
    id: "credito-fgts-acima-do-teto",
    pergunta: `Ele tem ${reais(60000)} de FGTS e quer um de ${reais(
      credito.tetoFgtsImovel + 100000,
    )}. Dá pra usar o fundo?`,
    escopo: "credito",
    espera: { simula: true, semCorteDeCredito: true },
  });
  casos.push({
    id: "credito-nao-fecha",
    pergunta: `Renda de ${reais(2000)}, sem entrada, quer um de ${reais(400000)}. Fecha?`,
    escopo: "credito",
    espera: { simula: true },
  });

  // ── OBJEÇÃO: o que a corretora ouve, na forma que ela ouve ───────────────
  for (const [id, pergunta] of [
    ["objecao-caro", "Cliente disse que tá caro. O que eu respondo?"],
    ["objecao-vou-pensar", 'Ele falou "vou pensar" e sumiu. Como eu volto?'],
    ["objecao-desconto", "Ele quer 10% de desconto. O que eu falo?"],
    ["objecao-esposa", 'Disse que precisa ver com a esposa. Isso é "não"?'],
  ] as const) {
    casos.push({ id, pergunta, escopo: "objecao", espera: { semCorteDeCredito: true } });
  }

  // ── JURÍDICO: o que ele NÃO pode afirmar sem fonte ───────────────────────
  for (const [id, pergunta] of [
    ["juridico-itbi", "Quanto é o ITBI e quem paga?"],
    ["juridico-documentos", "Que documento o cliente precisa pra dar entrada no financiamento?"],
    ["juridico-escritura", "Escritura e registro são a mesma coisa? Quanto custa?"],
    ["juridico-distrato", "Se ele desistir depois de assinar, perde tudo?"],
  ] as const) {
    casos.push({ id, pergunta, escopo: "juridico", espera: {} });
  }

  // ── BORDA: o que esta base já pagou para aprender ────────────────────────
  casos.push({
    id: "borda-imovel-que-nao-e-nosso",
    pergunta: "Cliente perguntou do Dom Barueri, que não é da gente. O que eu falo?",
    escopo: "portfolio",
    espera: { indicaImovel: false },
  });
  if (semPlanta.length > 0) {
    casos.push({
      id: "borda-planta-que-nao-existe",
      pergunta: `Manda a planta do ${semPlanta[0].nome}.`,
      escopo: "portfolio",
      espera: {},
    });
  }
  if (semPrazo.length > 0) {
    casos.push({
      id: "borda-prazo-nao-cadastrado",
      pergunta: `Quando entrega o ${semPrazo[0].nome}? Cliente precisa das chaves em 6 meses.`,
      escopo: "portfolio",
      espera: { semPrazo: true },
    });
  }
  casos.push({
    id: "borda-acabamento-nao-cadastrado",
    pergunta: comPreco[0]
      ? `Qual o piso e a bancada da cozinha do ${comPreco[0].nome}?`
      : "Qual o piso e a bancada da cozinha?",
    escopo: "portfolio",
    espera: {},
  });

  return casos;
}

async function main() {
  const rodar = process.argv.includes("--rodar");
  const chave = rodar ? SECRETA : PUBLICA;
  if (!URL_BASE || !chave) {
    console.error(
      rodar
        ? "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (rodar lê os parâmetros de crédito, que anon não alcança)."
        : "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
    process.exit(1);
  }

  const linhas = await rest<LinhaEmpreendimento>(
    `empreendimentos?select=${encodeURIComponent(SELECT_EMPREENDIMENTO.replace(/\s+/g, ""))}&publicado=eq.true`,
    chave,
  );
  const catalogo = linhas.map(mapEmpreendimento);

  /*
   * Sem a chave de serviço, `parametros_credito` é inalcançável (a tabela é
   * fechada de propósito, 0103) — e aí o gerador usa o mesmo seed da
   * migration. As faixas do seed são o que define quantos casos de crédito
   * saem, então o conjunto continua reprodutível.
   */
  let credito: ParametrosCredito = {
    faixas: [
      { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
      { nome: "Faixa 2", rendaMax: 4700, subsidioMaximo: 29000, taxaAnual: 0.06 },
      { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
      { nome: "Faixa 4", rendaMax: 12000, subsidioMaximo: 0, taxaAnual: 0.1 },
    ],
    tetoFgtsImovel: 350000,
    taxaSbpeAnual: 0.1149,
    prazoMaximoMeses: 420,
    comprometimentoMaximo: 0.3,
    itbiPorCidade: { Barueri: 0.02 },
    conferidoEm: "2026-09-09",
  };
  if (SECRETA) {
    const [p] = await rest<Record<string, unknown>>("parametros_credito?select=*", SECRETA);
    if (p) {
      credito = {
        faixas: p.faixas as ParametrosCredito["faixas"],
        tetoFgtsImovel: Number(p.teto_fgts_imovel),
        taxaSbpeAnual: Number(p.taxa_sbpe_anual),
        prazoMaximoMeses: Number(p.prazo_maximo_meses),
        comprometimentoMaximo: Number(p.comprometimento_maximo),
        itbiPorCidade: p.itbi_por_cidade as Record<string, number>,
        conferidoEm: String(p.conferido_em),
      };
    }
  }

  const casos = montarCasos(catalogo, credito);
  const destino = join(process.cwd(), "eval", "golden");
  mkdirSync(destino, { recursive: true });
  const arquivo = join(destino, "consultor.json");
  writeFileSync(arquivo, JSON.stringify(casos, null, 2) + "\n", "utf8");

  const porEscopo = casos.reduce<Record<string, number>>((a, c) => {
    a[c.escopo] = (a[c.escopo] ?? 0) + 1;
    return a;
  }, {});
  console.log(`\n${casos.length} casos a partir de ${catalogo.length} imóveis publicados`);
  console.log(
    Object.entries(porEscopo)
      .map(([e, n]) => `  ${e.padEnd(10)} ${n}`)
      .join("\n"),
  );
  console.log(`\nescrito em eval/golden/consultor.json`);

  if (!rodar) {
    console.log(
      `\nPara exercitar contra o modelo real: --rodar (custa ~R$ ${(casos.length * 0.012).toFixed(2)}).`,
    );
    console.log(
      "Lembre: isto mede COBERTURA do nosso catálogo. Não substitui a análise de\nerro sobre transcrição de uso real — para essa, ver npm run observatorio:consultor.\n",
    );
    return;
  }

  await exercitar(casos, catalogo, credito);
}

/** Roda os casos contra o modelo e confere só o que é DETERMINÍSTICO. */
async function exercitar(
  casos: CasoDoConsultor[],
  catalogo: Empreendimento[],
  credito: ParametrosCredito,
) {

  const falhas: string[] = [];
  let comCartao = 0;
  let comSimulacao = 0;
  let cortados = 0;
  let contingencias = 0;

  for (const caso of casos) {
    const r = await turnoDoConsultor({
      pedido: caso.pergunta,
      historico: [],
      catalogo,
      credito,
      exemplos: "",
    });

    if (r.telemetria.acao === "contingencia" || r.telemetria.acao === "fora_do_contrato") {
      contingencias++;
      // Falha do EVAL, não do prompt: conta como NÃO MEDIDO, nunca aprovado.
      console.log(`  ${caso.id.padEnd(34)} NÃO MEDIDO (${r.telemetria.acao})`);
      continue;
    }

    const temCartao = r.dados?.tipo === "cartoes";
    const temSim = r.dados?.tipo === "simulacao";
    if (temCartao) comCartao++;
    if (temSim) comSimulacao++;
    if (houveCorte(r.texto)) cortados++;

    const problemas: string[] = [];
    if (caso.espera.indicaImovel === true && !temCartao) problemas.push("não indicou imóvel");
    if (caso.espera.indicaImovel === false && temCartao) problemas.push("indicou imóvel alheio");
    if (caso.espera.simula && !temSim) problemas.push("não simulou");
    if (caso.espera.semCorteDeCredito && houveCorte(r.texto)) problemas.push("guardrail cortou");
    if (caso.espera.semPrazo && afirmaPrazo(r.texto)) problemas.push("afirmou prazo");

    if (problemas.length) falhas.push(`${caso.id}: ${problemas.join(" · ")}`);
    console.log(
      `  ${caso.id.padEnd(34)} ${problemas.length ? "FALHA " : "ok    "} ${problemas.join(" · ")}`,
    );
  }

  const medidos = casos.length - contingencias;
  console.log(`\n── resumo ──`);
  console.log(`  ${falhas.length} falha(s) sobre ${medidos} de ${casos.length} casos medidos`);
  console.log(`  cartão em ${comCartao} · simulação em ${comSimulacao} · guardrail cortou ${cortados}`);
  if (contingencias) console.log(`  ${contingencias} não medidos (motor) — score parcial não compara com rodada inteira`);
  console.log();
}

main().catch((e) => {
  console.error("Falhou:", e);
  process.exit(1);
});
