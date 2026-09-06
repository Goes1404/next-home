/**
 * Compara duas rodadas do eval de conversa e diz se houve avanço.
 *
 * `npm run eval:comparar -- eval/resultados/conversa-A.json eval/resultados/conversa-B.json`
 *
 * Existe porque quatro versões seguidas (v25 a v28) foram lidas como avanço
 * ou regressão a partir de UMA rodada de 4 personas, e três dessas leituras
 * não se sustentavam. A régua vive em `comparacaoDeRodadas.ts`, testada, e é
 * conservadora de propósito: faixas que se tocam são empate.
 *
 * Não chama LLM nenhum: lê os JSON que o eval já grava.
 */

import { readFileSync } from "node:fs";
import {
  compararPorPersona,
  compararRodadas,
  mediana,
  rodadasSugeridas,
  type Rodada,
} from "../../src/lib/eval/comparacaoDeRodadas";

interface ArquivoDeConversa {
  promptVersao: string;
  data: string;
  rodadas?: number;
  comJuiz?: boolean;
  clienteIndependente?: boolean;
  juizIndependente?: boolean;
  conversas: {
    persona: string;
    rodada?: number;
    /** Ausente em arquivo antigo; ausente = medida. */
    desfecho?: string;
    medida: {
      perguntasReaparecidas: string[];
      perguntasRepetidasPelaIa: string[];
      respostasRepetidas: number;
      maiorSequenciaSemNovidade: number;
    };
    juizo?: { avancou?: number; assumiria?: boolean; mesmaPessoa?: number } | null;
  }[];
}

/**
 * Conversa que morreu por falha do EVAL — IA sem crédito, cliente simulado
 * mudo — NÃO É MEDIDA. Ela tem zero turnos, logo zero repetição, e somada
 * ao resto vira avanço de mentira: em 02/09 uma rodada com 15 de 16
 * conversas mortas por `insufficient_quota` saiu do comparador como
 * "▲ o cliente repetiu 8 → 2". A régua da casa já dizia isso ("conta como
 * NÃO MEDIDA, nunca como aprovada"); o código não.
 */
const DESFECHOS_MEDIDOS = new Set(["cliente_encerrou", "teto_de_turnos"]);

function foiMedida(c: ArquivoDeConversa["conversas"][number]): boolean {
  return c.desfecho === undefined || DESFECHOS_MEDIDOS.has(c.desfecho);
}

/** Por rodada: quantas conversas foram medidas de quantas rodaram. */
function cobertura(arquivo: ArquivoDeConversa): { rodada: number; medidas: number; total: number }[] {
  const mapa = new Map<number, { medidas: number; total: number }>();
  for (const c of arquivo.conversas) {
    const n = c.rodada ?? 1;
    const atual = mapa.get(n) ?? { medidas: 0, total: 0 };
    atual.total += 1;
    if (foiMedida(c)) atual.medidas += 1;
    mapa.set(n, atual);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([rodada, v]) => ({ rodada, ...v }));
}

/** Personas medidas em TODAS as rodadas dos dois arquivos. */
function personasComuns(a: ArquivoDeConversa, b: ArquivoDeConversa): Set<string> {
  const rodadasDe = (arq: ArquivoDeConversa) => new Set(arq.conversas.map((c) => c.rodada ?? 1));
  const medidaEm = (arq: ArquivoDeConversa, persona: string, rodada: number) =>
    arq.conversas.some((c) => c.persona === persona && (c.rodada ?? 1) === rodada && foiMedida(c));
  const todas = new Set([...a.conversas, ...b.conversas].map((c) => c.persona));
  const comuns = new Set<string>();
  for (const p of todas) {
    const ok =
      [...rodadasDe(a)].every((r) => medidaEm(a, p, r)) &&
      [...rodadasDe(b)].every((r) => medidaEm(b, p, r));
    if (ok) comuns.add(p);
  }
  return comuns;
}

/**
 * Uma rodada vira UM ponto por métrica: a soma sobre as personas daquela
 * rodada.
 *
 * Soma e não média porque o conjunto de personas é o mesmo nas duas versões
 * — dividir pelo mesmo número dos dois lados não muda comparação nenhuma e
 * esconde a grandeza ("12 repetições" diz mais que "3 por conversa").
 */
function zero(): Rodada {
  return {
    clienteRepetiu: 0,
    iaRepetiu: 0,
    respostasRepetidas: 0,
    maiorSequenciaSemNovidade: 0,
    avancou: 0,
    assumiria: 0,
    mesmaPessoa: 0,
  };
}

/**
 * Conta CONVERSAS afetadas, não ocorrências.
 *
 * Medido na linha de base de 16 personas (01/09): somando ocorrências, duas
 * rodadas do mesmo código deram 50 e 14 — um balanço de 3,5x. Contando
 * conversas afetadas, 10 e 6: 1,7x. A distribuição tem cauda pesada, a
 * maioria das conversas fica em zero e umas poucas explodem — somar deixa a
 * cauda mandar na medição.
 *
 * É a mesma lição da taxonomia de falhas, onde ordenar por ocorrências
 * fazia um caso isolado parecer padrão. A unidade que importa é a CONVERSA:
 * o cliente não compara mensagens de conversas diferentes, ele vive a dele.
 */
function somar(alvo: Rodada, c: ArquivoDeConversa["conversas"][number]): void {
  if (c.medida.perguntasReaparecidas.length > 0) alvo.clienteRepetiu += 1;
  if (c.medida.perguntasRepetidasPelaIa.length > 0) alvo.iaRepetiu += 1;
  if (c.medida.respostasRepetidas > 0) alvo.respostasRepetidas += 1;
  alvo.maiorSequenciaSemNovidade += c.medida.maiorSequenciaSemNovidade;
  alvo.avancou += c.juizo?.avancou ?? 0;
  alvo.assumiria += c.juizo?.assumiria ? 1 : 0;
  alvo.mesmaPessoa += c.juizo?.mesmaPessoa ?? 0;
}

/** As rodadas de CADA persona — o recorte que a soma escondia. */
function porPersona(arquivo: ArquivoDeConversa): Map<string, Rodada[]> {
  const mapa = new Map<string, Map<number, Rodada>>();

  for (const c of arquivo.conversas) {
    if (!foiMedida(c)) continue;
    const dela = mapa.get(c.persona) ?? new Map<number, Rodada>();
    const n = c.rodada ?? 1;
    const atual = dela.get(n) ?? zero();
    somar(atual, c);
    dela.set(n, atual);
    mapa.set(c.persona, dela);
  }

  return new Map(
    [...mapa.entries()].map(([persona, rodadas]) => [
      persona,
      [...rodadas.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r),
    ]),
  );
}

function rodadasDe(arquivo: ArquivoDeConversa): Rodada[] {
  const porRodada = new Map<number, Rodada>();

  for (const c of arquivo.conversas) {
    if (!foiMedida(c)) continue;
    const n = c.rodada ?? 1;
    const atual: Rodada = porRodada.get(n) ?? {
      clienteRepetiu: 0,
      iaRepetiu: 0,
      respostasRepetidas: 0,
      maiorSequenciaSemNovidade: 0,
      avancou: 0,
      assumiria: 0,
      mesmaPessoa: 0,
    };

    somar(atual, c);

    porRodada.set(n, atual);
  }

  return [...porRodada.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function ler(caminho: string): ArquivoDeConversa {
  return JSON.parse(readFileSync(caminho, "utf8")) as ArquivoDeConversa;
}

function principal() {
  const [caminhoA, caminhoB] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!caminhoA || !caminhoB) {
    console.error("Uso: npm run eval:comparar -- <antes.json> <depois.json>");
    process.exit(1);
  }

  const antesCru = ler(caminhoA);
  const depoisCru = ler(caminhoB);

  const comuns = personasComuns(antesCru, depoisCru);
  const antes = { ...antesCru, conversas: antesCru.conversas.filter((c) => comuns.has(c.persona)) };
  const depois = { ...depoisCru, conversas: depoisCru.conversas.filter((c) => comuns.has(c.persona)) };

  const rodadasAntes = rodadasDe(antes);
  const rodadasDepois = rodadasDe(depois);

  /*
   * O juiz só decide se for independente NAS DUAS versões. Hoje não é: uma
   * chave só, agente e juiz na OpenAI. A nota continua impressa — ela
   * descreve — mas não entra na conclusão, e é isso que impede alguém (eu)
   * de voltar a tratar "assumiria 1/4 → 0/4" como medida.
   */
  const juizDecide = Boolean(
    antes.comJuiz &&
      depois.comJuiz &&
      antes.clienteIndependente !== false &&
      depois.clienteIndependente !== false,
  );

  const r = compararRodadas(rodadasAntes, rodadasDepois, { juizDecide });

  /*
   * Veredito sobre o MESMO denominador. Conversa morta por falha do eval
   * fica fora da soma (`foiMedida`), mas excluir de um lado só troca um
   * erro por outro: somar 9 personas contra 16 é comparar denominadores
   * diferentes — o defeito recorrente desta base. Então entra na conta
   * apenas a persona medida em TODAS as rodadas dos DOIS arquivos, e o
   * veredito diz sobre quantas foi tirado. Abaixo da metade não há veredito.
   */
  const cobAntes = cobertura(antesCru);
  const cobDepois = cobertura(depoisCru);
  const fmtCob = (cob: ReturnType<typeof cobertura>) =>
    cob.map((c) => `r${c.rodada}: ${c.medidas}/${c.total}`).join(" · ");
  const todas = new Set([...antesCru.conversas, ...depoisCru.conversas].map((c) => c.persona));
  const excluidas = [...todas].filter((p) => !comuns.has(p)).sort();
  const comparavel = comuns.size >= Math.ceil(todas.size / 2);

  console.log(`\n${antes.promptVersao} (${rodadasAntes.length} rodada(s), ${antes.data}) — medidas ${fmtCob(cobAntes)}`);
  console.log(`  →  ${depois.promptVersao} (${rodadasDepois.length} rodada(s), ${depois.data}) — medidas ${fmtCob(cobDepois)}\n`);

  const simbolo = { melhorou: "▲", piorou: "▼", empate: "=", sem_dados: "?" } as const;

  for (const c of r.metricas) {
    const nota = c.metrica.doJuiz && !juizDecide ? "  (juiz não independente — não decide)" : "";
    const fmt = (v: number[]) =>
      v.length === 0 ? "—" : `${mediana(v)} [${Math.min(...v)}–${Math.max(...v)}]`;

    console.log(
      `${simbolo[c.veredito]} ${c.metrica.rotulo.padEnd(34)} ${fmt(c.antes).padEnd(16)} → ${fmt(c.depois)}${nota}`,
    );
  }

  if (!juizDecide) {
    console.log(
      "\nAs métricas do juiz estão acima só como descrição: com juiz no mesmo\n" +
        "provedor do agente, a nota enviesa para a cooperação e não sustenta decisão.",
    );
  }

  const denominador = `${comuns.size} de ${todas.size} personas`;
  if (!comparavel) {
    console.log(
      `\nNÃO COMPARÁVEL: só ${denominador} foram medidas em todas as rodadas dos dois\n` +
        "arquivos (o resto morreu por falha do eval: IA sem crédito, cliente mudo).\n" +
        "As faixas acima são só descrição — repita a rodada inteira antes de tirar veredito.\n",
    );
  } else {
    console.log(`\n${r.conclusao}`);
    console.log(
      `(veredito sobre ${denominador}${excluidas.length ? `; fora por falha do eval: ${excluidas.join(", ")}` : ""})\n`,
    );
  }

  /*
   * O recorte por persona. Não muda o veredito acima — muda o que dá para
   * APRENDER dele: onde a mudança agiu, e quais personas estão ruidosas
   * demais para informar qualquer coisa com o número de rodadas usado.
   */
  const detalhe = compararPorPersona(porPersona(antes), porPersona(depois));
  console.log("Por persona (diagnóstico, não veredito):\n");

  const barulhentas: string[] = [];
  for (const p of detalhe) {
    const mudaram = p.metricas.filter((m) => m.veredito === "melhorou" || m.veredito === "piorou");
    const resumo =
      mudaram.length === 0
        ? "nada saiu da faixa"
        : mudaram
            .map((m) => `${m.veredito === "melhorou" ? "▲" : "▼"} ${m.metrica.rotulo}`)
            .join(", ");

    const sugeridas = rodadasSugeridas(p.ruido, rodadasDepois.length);
    if (sugeridas > rodadasDepois.length) barulhentas.push(`${p.persona} (${sugeridas})`);

    console.log(
      `  ${p.persona.padEnd(26)} ${resumo}${p.ruido !== null ? `  · ruído ${p.ruido}` : ""}`,
    );
  }

  if (barulhentas.length > 0) {
    console.log(
      `\nRuidosas demais para ${rodadasDepois.length} rodada(s) — a faixa delas é maior que o` +
        `\nvalor típico, então elas não medem mudança nenhuma. Rodadas sugeridas:` +
        `\n  ${barulhentas.join(", ")}`,
    );
  }
  console.log();
}

principal();
