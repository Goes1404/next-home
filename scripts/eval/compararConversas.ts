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
  compararRodadas,
  mediana,
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
 * Uma rodada vira UM ponto por métrica: a soma sobre as personas daquela
 * rodada.
 *
 * Soma e não média porque o conjunto de personas é o mesmo nas duas versões
 * — dividir pelo mesmo número dos dois lados não muda comparação nenhuma e
 * esconde a grandeza ("12 repetições" diz mais que "3 por conversa").
 */
function rodadasDe(arquivo: ArquivoDeConversa): Rodada[] {
  const porRodada = new Map<number, Rodada>();

  for (const c of arquivo.conversas) {
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

    atual.clienteRepetiu += c.medida.perguntasReaparecidas.length;
    atual.iaRepetiu += c.medida.perguntasRepetidasPelaIa.length;
    atual.respostasRepetidas += c.medida.respostasRepetidas;
    atual.maiorSequenciaSemNovidade += c.medida.maiorSequenciaSemNovidade;
    atual.avancou += c.juizo?.avancou ?? 0;
    atual.assumiria += c.juizo?.assumiria ? 1 : 0;
    atual.mesmaPessoa += c.juizo?.mesmaPessoa ?? 0;

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

  const antes = ler(caminhoA);
  const depois = ler(caminhoB);

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

  console.log(`\n${antes.promptVersao} (${rodadasAntes.length} rodada(s), ${antes.data})`);
  console.log(`  →  ${depois.promptVersao} (${rodadasDepois.length} rodada(s), ${depois.data})\n`);

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

  console.log(`\n${r.conclusao}\n`);
}

principal();
