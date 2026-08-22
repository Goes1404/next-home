/**
 * Eval do agente de WhatsApp com LLM-as-judge calibrado.
 *
 * Uso (manual, antes de QUALQUER bump de PROMPT_VERSAO):
 *   GEMINI_API_KEY=... npx tsx scripts/eval/rodarEval.ts
 *
 * Fluxo:
 *  1. CALIBRAÇÃO: o judge avalia os casos de eval/golden/calibracao.json
 *     (anotados à mão) e o script ABORTA se a concordância com as notas
 *     humanas ficar abaixo do limiar — um juiz descalibrado produziria
 *     scores bonitos e inúteis.
 *  2. EVAL: para cada caso de eval/golden/casos.json, roda o agente REAL
 *     (gerarRespostaIA + guardrails) sobre o catálogo CONGELADO de
 *     eval/fixtures/catalogo.json e julga a resposta na rubrica
 *     (fidelidade ao catálogo, condução à visita, tom) + checagens duras
 *     (guardrails, visita confirmada quando esperada).
 *  3. Grava eval/resultados/{PROMPT_VERSAO}-{data}.json — commitá-lo é a
 *     rastreabilidade score→versão. REGRA DO TIME: prompt novo não sobe
 *     com score médio abaixo do da versão anterior.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gerarRespostaIA, PROMPT_VERSAO } from "../../src/lib/whatsapp/aiAgent";
import { sanearRespostaIA } from "../../src/lib/whatsapp/guardrails";
import { chamarGeminiJson } from "../../src/lib/whatsapp/gemini";
import type { Empreendimento } from "../../src/lib/types";

type Caso = {
  id: string;
  historico: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
  mensagem: string;
  expectativas?: Record<string, unknown>;
};

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const casos = JSON.parse(readFileSync("eval/golden/casos.json", "utf8")) as Caso[];
const calibracao = JSON.parse(readFileSync("eval/golden/calibracao.json", "utf8")) as {
  limiarConcordancia: number;
  casos: { id: string; mensagem: string; resposta: string; notaHumana: Record<string, number> }[];
};

const RUBRICA = `Você é um avaliador rigoroso de atendimento imobiliário por WhatsApp.
Dê notas de 0 a 2 (0=ruim, 1=aceitável, 2=excelente) para a RESPOSTA da assistente, em três eixos:
- "fidelidade": só afirma preços/imóveis/dados que existem no CATÁLOGO fornecido; não inventa NADA (imóvel fora do catálogo, preço para imóvel "sob consulta", desconto não autorizado = 0).
- "conducao": conduz para um próximo passo concreto (pergunta de qualificação, proposta de visita com horário) sem pressão artificial (urgência falsa ou insistência = 0).
- "tom": natural e humano, caloroso e profissional; seco/robótico ou agressivo = 0.
Responda EXCLUSIVAMENTE JSON: {"fidelidade": 0|1|2, "conducao": 0|1|2, "tom": 0|1|2, "justificativa": "1 frase"}`;

function catalogoParaJudge(): string {
  return catalogo
    .map((e) => `- ${e.nome} (${e.bairro}): ${e.precoAPartir ? `R$ ${e.precoAPartir.toLocaleString("pt-BR")}` : "preço sob consulta"}`)
    .join("\n");
}

async function julgar(mensagem: string, resposta: string): Promise<Record<string, number> | null> {
  const resultado = await chamarGeminiJson(
    `${RUBRICA}\n\nCATÁLOGO OFICIAL:\n${catalogoParaJudge()}\n\nMENSAGEM DO CLIENTE: ${mensagem}\n\nRESPOSTA DA ASSISTENTE: ${resposta}`,
    { temperature: 0 },
  );
  if (!resultado.ok) return null;
  const j = resultado.json as Record<string, number>;
  return { fidelidade: j.fidelidade, conducao: j.conducao, tom: j.tom };
}

async function calibrar(): Promise<boolean> {
  let comparacoes = 0;
  let concordantes = 0;

  for (const caso of calibracao.casos) {
    const nota = await julgar(caso.mensagem, caso.resposta);
    if (!nota) continue;
    for (const eixo of ["fidelidade", "conducao", "tom"] as const) {
      comparacoes++;
      // Concordância = diferença de no máximo 1 ponto na escala 0-2.
      if (Math.abs((nota[eixo] ?? 0) - caso.notaHumana[eixo]) <= 1) concordantes++;
    }
    console.log(`  calibração ${caso.id}: judge=${JSON.stringify(nota)} humano=${JSON.stringify(caso.notaHumana)}`);
  }

  const taxa = comparacoes > 0 ? concordantes / comparacoes : 0;
  console.log(`Concordância judge×humano: ${(taxa * 100).toFixed(0)}% (limiar ${calibracao.limiarConcordancia * 100}%)`);
  return taxa >= calibracao.limiarConcordancia;
}

async function main() {
  console.log(`Eval do prompt ${PROMPT_VERSAO} — ${casos.length} casos\n`);

  console.log("1/2 Calibrando o judge...");
  if (!(await calibrar())) {
    console.error("ABORTADO: judge descalibrado — revisar a rubrica antes de confiar nos scores.");
    process.exit(1);
  }

  console.log("\n2/2 Rodando os casos...");
  const resultados: unknown[] = [];
  const somas = { fidelidade: 0, conducao: 0, tom: 0 };
  let julgados = 0;
  let falhasDuras = 0;

  for (const caso of casos) {
    const bruta = await gerarRespostaIA(
      {
        nomeCorretor: "Bruna Cristal",
        creciCorretor: "254161",
        telefoneCorretor: "5511999999999",
        nomeAssistente: "Sofia",
        tomVoz: "consultivo_alto_padrao",
        catalogo,
        historicoMensagens: caso.historico,
      },
      caso.mensagem,
    );
    const saneada = sanearRespostaIA(bruta, catalogo);

    // Checagens DURAS (não dependem do judge)
    const duras: string[] = [];
    if (bruta.meta.fallback) duras.push("caiu_no_fallback");
    if (saneada.anexosBloqueados > 0) duras.push(`guardrail_bloqueou_${saneada.anexosBloqueados}_anexos`);
    if (caso.expectativas?.visitaConfirmadaEsperada && !saneada.resposta.visitaProposta?.confirmadaPeloCliente) {
      duras.push("nao_confirmou_visita_esperada");
    }
    if (caso.expectativas?.deveAnexarMidia && saneada.resposta.anexosMidia.length === 0) {
      duras.push("nao_anexou_midia_esperada");
    }
    if (duras.length > 0) falhasDuras++;

    const nota = bruta.meta.fallback ? null : await julgar(caso.mensagem, saneada.resposta.textoResposta);
    if (nota) {
      julgados++;
      somas.fidelidade += nota.fidelidade ?? 0;
      somas.conducao += nota.conducao ?? 0;
      somas.tom += nota.tom ?? 0;
    }

    resultados.push({ id: caso.id, resposta: saneada.resposta.textoResposta, nota, falhasDuras: duras });
    console.log(`  ${caso.id}: ${nota ? JSON.stringify(nota) : "FALLBACK"} ${duras.length ? `⚠ ${duras.join(", ")}` : ""}`);
  }

  const medias = {
    fidelidade: +(somas.fidelidade / Math.max(1, julgados)).toFixed(2),
    conducao: +(somas.conducao / Math.max(1, julgados)).toFixed(2),
    tom: +(somas.tom / Math.max(1, julgados)).toFixed(2),
  };
  const scoreGeral = +(((medias.fidelidade + medias.conducao + medias.tom) / 6) * 100).toFixed(1);

  const data = new Date().toISOString().slice(0, 10);
  const arquivo = `eval/resultados/${PROMPT_VERSAO}-${data}.json`;
  writeFileSync(
    arquivo,
    JSON.stringify({ promptVersao: PROMPT_VERSAO, data, scoreGeral, medias, falhasDuras, casos: resultados }, null, 2),
  );

  console.log(`\nScore geral: ${scoreGeral}/100 · médias ${JSON.stringify(medias)} · ${falhasDuras} caso(s) com falha dura`);
  console.log(`Resultado gravado em ${arquivo} — commite junto do bump de versão.`);
}

main();
