/**
 * SEGUNDO juiz — GPT sobre as transcrições já colhidas.
 *
 * Rode com `npx tsx --conditions=react-server scripts/eval/julgarComGpt.ts`.
 * Mesmo sem importar a cadeia do agente, `openai.ts` começa com
 * `import "server-only"` — a pegadinha de sempre deste projeto.
 *
 * ## Por que "segundo", e nunca único
 *
 * O agente roda na OpenAI. Juiz da mesma casa avaliando o próprio provedor
 * tende a dar nota para si mesmo — é a regra que já vale para o juiz do
 * Gemini e para o cliente simulado. O que se faz aqui é o meio-termo
 * honesto: modelo MAIOR e diferente do agente (`gpt-4.1` contra
 * `gpt-4.1-mini`), rubrica idêntica à do juiz Gemini, e o resultado marcado
 * como `juizDaMesmaFamilia: true`. A nota que fecha versão de prompt é a
 * CONCORDÂNCIA entre os dois juízes, não qualquer um sozinho.
 *
 * Lê as transcrições de eval/resultados/transcricoes/<versao>-*.txt — a
 * conversa não é re-rodada, então julgar aqui não gasta chamada de agente
 * nem muda o dado.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { chamarOpenaiJson } from "../../src/lib/whatsapp/openai";

const VERSAO = process.argv.find((a) => a.startsWith("--versao="))?.split("=")[1] || "2026.08-v17";
const MODELO_JUIZ = process.env.OPENAI_MODELO_JUIZ || "gpt-4.1";

// A MESMA rubrica do juiz Gemini (rodarConversa.ts). Rubricas diferentes
// mediriam coisas diferentes e a concordância entre juízes não significaria nada.
const RUBRICA = `Você avalia uma CONVERSA INTEIRA entre um cliente e a assistente de uma imobiliária no WhatsApp — não uma resposta isolada.

Responda SOMENTE com JSON:
{"avancou": 0|1|2, "mesmaPessoa": 0|1|2, "assumiria": true|false, "justificativa": "até 30 palavras"}

- avancou: a conversa foi a algum lugar? 0 = girou em círculo; 1 = andou com tropeços; 2 = qualificou e conduziu ao próximo passo.
- mesmaPessoa: soou como UMA pessoa do começo ao fim? 0 = mudou de registro/estilo no meio; 2 = consistente.
- assumiria: um corretor de verdade assumiria esta conversa sem se envergonhar do que já foi dito?

Contexto de negócio: a assistente NÃO pode falar valores (isso é correto, não penalize), deve convidar para visita cedo, e deve qualificar região, estágio da obra, tipologia e renda.`;

async function principal() {
  const pasta = "eval/resultados/transcricoes";
  const arquivos = readdirSync(pasta).filter(
    (f) => f.startsWith(`${VERSAO}-`) && f.endsWith(".txt"),
  );
  if (arquivos.length === 0) {
    console.error(`Nenhuma transcrição de ${VERSAO} em ${pasta}.`);
    process.exit(1);
  }

  console.log(`Juiz GPT (${MODELO_JUIZ}) sobre ${arquivos.length} transcrição(ões) de ${VERSAO}.`);
  console.log(`AVISO: juiz da MESMA família do agente — viés para cima; comparar com o juiz Gemini.\n`);

  const resultados = [];
  for (const arquivo of arquivos) {
    const persona = arquivo.replace(`${VERSAO}-`, "").replace(".txt", "");
    const transcricao = readFileSync(`${pasta}/${arquivo}`, "utf8");
    const r = await chamarOpenaiJson(`${RUBRICA}\n\nCONVERSA:\n${transcricao}`, {
      temperature: 0,
      timeoutMs: 60_000,
      modelo: MODELO_JUIZ,
    });
    const juizo = r.ok
      ? (r.json as { avancou: number; mesmaPessoa: number; assumiria: boolean; justificativa: string })
      : null;
    resultados.push({ persona, juizo });
    console.log(
      juizo
        ? `${persona}: avançou=${juizo.avancou} mesmaPessoa=${juizo.mesmaPessoa} assumiria=${juizo.assumiria} — ${juizo.justificativa}`
        : `${persona}: SEM NOTA (${!r.ok ? r.erro : "?"})`,
    );
  }

  const julgados = resultados.filter((x) => x.juizo);
  const media = (campo: "avancou" | "mesmaPessoa") =>
    julgados.length
      ? (julgados.reduce((s, x) => s + (x.juizo![campo] ?? 0), 0) / julgados.length).toFixed(2)
      : "—";
  const assumiria = julgados.filter((x) => x.juizo!.assumiria).length;

  console.log(
    `\nMédias: avançou=${media("avancou")} mesmaPessoa=${media("mesmaPessoa")} · assumiria ${assumiria}/${julgados.length}`,
  );

  const saida = `eval/resultados/juiz-gpt-${VERSAO}-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(
    saida,
    JSON.stringify(
      { versao: VERSAO, modeloJuiz: MODELO_JUIZ, juizDaMesmaFamilia: true, resultados },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Resultado em ${saida}`);
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
