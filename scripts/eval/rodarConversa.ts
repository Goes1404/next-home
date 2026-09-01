/**
 * O eval de CONVERSA: um cliente simulado conversa com a Sofia de verdade,
 * do primeiro "oi" até o desfecho.
 *
 * Rode com `npm run eval:conversa` — nunca com `npx tsx` direto. A cadeia do
 * agente começa em `import "server-only"`, um pacote que LANÇA fora do
 * runtime de servidor do React; o script morre na primeira linha. O `npm run`
 * carrega `--conditions=react-server`, que é o mecanismo oficial do próprio
 * pacote. Mesma pegadinha do `rodarEval.ts`, e ela já custou uma sessão.
 *
 * O agente passa por `executarTurnoDeAtendimento` — a MESMA função do
 * webhook. Não há caminho paralelo aqui, e é essa a razão de ela existir:
 * duas vezes um eval mediu um agente que produção nenhuma via.
 *
 * ## Efeitos sobre o mundo: NENHUM
 *
 * Não grava mensagem, não manda WhatsApp, não escreve telemetria, não toca
 * no CRM. O catálogo vem de `eval/fixtures/catalogo.json`, não do banco.
 *
 * Bandeiras:
 *   --personas=id1,id2   roda só essas (padrão: todas)
 *   --turnos=8           teto de turnos (padrão: 12)
 *   --rodadas=3          repete tudo N vezes (padrão: 1)
 *   --sem-juiz           só as medidas determinísticas
 *
 * ## Por que `--rodadas` existe
 *
 * Da v25 à v28 eu decidi quatro vezes com UMA rodada, e três dessas leituras
 * estavam erradas — a diferença que eu chamava de avanço ou de regressão
 * cabia dentro da variância. A memória do projeto já registrava isso duas
 * vezes sobre outros assuntos ("três rodadas quase iguais da v17 deram 2, 4
 * e 1 falhas duras") e mesmo assim segui com n=1, porque repetir era caro de
 * organizar. Agora não é: uma rodada com `--rodadas=3` guarda as três no
 * mesmo arquivo, e `npm run eval:comparar` recusa concluir com menos de duas.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chamarGeminiJson } from "../../src/lib/whatsapp/gemini";
import { chamarOpenaiJson } from "../../src/lib/whatsapp/openai";
import { executarTurnoDeAtendimento } from "../../src/lib/whatsapp/turnoDeAtendimento";
import { medirConversa, type TurnoRegistrado } from "../../src/lib/whatsapp/metricasConversa";
import { PROMPT_VERSAO } from "../../src/lib/whatsapp/aiAgent";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";
import { PERSONAS, personaPorId, type Persona } from "./personas";
import { conferirProvedores, proximaFalaDoCliente, provedorDoCliente } from "./clienteSimulado";

const argv = process.argv.slice(2);
const arg = (nome: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
const tem = (nome: string): boolean => argv.includes(`--${nome}`);

const TETO_DE_TURNOS = Number(arg("turnos") ?? 12);
const RODADAS = Math.max(1, Number(arg("rodadas") ?? 1));
const SEM_JUIZ = tem("sem-juiz");

/**
 * O provedor do agente. Precisa bater com o que `llm.ts` vai de fato usar —
 * é o valor comparado contra o do cliente simulado.
 */
const PROVEDOR_DO_AGENTE = (process.env.IA_ORDEM_PROVEDORES || "openai").split(",")[0].trim();

const catalogo = JSON.parse(
  readFileSync("eval/fixtures/catalogo.json", "utf8"),
) as Empreendimento[];

const IDENTIDADE = {
  nomeCorretor: "Bruna Cristal",
  slugCorretor: "cristal-bruna",
  creciCorretor: "254161",
  telefoneCorretor: "5511999999999",
  nomeAssistente: "Sofia",
  tomVoz: "consultivo_alto_padrao",
};

export type ConversaSimulada = {
  persona: string;
  turnos: TurnoRegistrado[];
  /** Por que o laço parou: o cliente encerrou, ou o teto foi atingido. */
  desfecho: "cliente_encerrou" | "teto_de_turnos" | "cliente_mudo" | "ia_indisponivel";
};

async function conversarCom(persona: Persona): Promise<ConversaSimulada> {
  const historico: Fala[] = [];
  const turnos: TurnoRegistrado[] = [];

  for (let i = 0; i < TETO_DE_TURNOS; i++) {
    const fala = await proximaFalaDoCliente(
      persona,
      historico.map((h) => ({
        quem: h.remetente === "cliente" ? ("cliente" as const) : ("assistente" as const),
        texto: h.texto,
      })),
    );

    // Cliente mudo é falha do EVAL, não do agente — e precisa aparecer como
    // desfecho próprio. Confundir os dois acusaria o agente de algo que ele
    // não fez, que é o defeito clássico de eval deste projeto.
    if (!fala) return { persona: persona.id, turnos, desfecho: "cliente_mudo" };

    for (const balao of fala.baloes) {
      historico.push({ remetente: "cliente", texto: balao });
    }

    const turno = await executarTurnoDeAtendimento({
      identidade: IDENTIDADE,
      catalogo,
      historico,
      // Sem few-shot: ele vai ao banco, e um eval não pode depender de haver
      // banco nem de qual conversa está gravada nele hoje.
    });

    if (turno.resposta.meta.fallback) {
      return { persona: persona.id, turnos, desfecho: "ia_indisponivel" };
    }

    /*
     * O que o cliente RECEBE são os balões, não `textoResposta` — que ainda
     * carrega o marcador `---` que a IA usa para indicar onde cortar. Medir
     * o texto cru mediria um caractere que ninguém vê, e a transcrição que
     * o humano vai ler na F1 sairia com lixo de formatação no meio.
     */
    const textoDoBot = turno.baloes.join("\n");
    const linhasDeAnexo = turno.anexos.map((a) => `📎 ${a.titulo || a.tipo}: ${a.url}`);
    historico.push({
      remetente: "bot",
      texto: [textoDoBot, ...linhasDeAnexo].join("\n\n"),
    });

    turnos.push({
      cliente: fala.baloes,
      bot: textoDoBot,
      anexos: turno.anexos.map((a) => a.url),
      modelo: turno.resposta.meta.modelo,
      sugeriuVisita: turno.resposta.sugerirVisita,
    });

    process.stdout.write(
      `  ${persona.id} · turno ${i + 1}: cliente ${fala.baloes.length} balão(ões) → ${textoDoBot.length} chars` +
        `${turno.anexos.length ? ` + ${turno.anexos.length} anexo(s)` : ""}\n`,
    );

    if (fala.encerrar) return { persona: persona.id, turnos, desfecho: "cliente_encerrou" };
  }

  return { persona: persona.id, turnos, desfecho: "teto_de_turnos" };
}

const RUBRICA_DA_CONVERSA = `Você avalia uma CONVERSA INTEIRA entre um cliente e a assistente de uma imobiliária no WhatsApp — não uma resposta isolada.

Responda SOMENTE com JSON:
{"avancou": 0|1|2, "mesmaPessoa": 0|1|2, "assumiria": true|false, "justificativa": "até 30 palavras"}

- avancou: a conversa foi a algum lugar? 0 = girou em círculo; 1 = andou com tropeços; 2 = qualificou e conduziu ao próximo passo.
- mesmaPessoa: soou como UMA pessoa do começo ao fim? 0 = mudou de registro/estilo no meio; 2 = consistente.
- assumiria: um corretor de verdade assumiria esta conversa sem se envergonhar do que já foi dito?

Contexto de negócio: a assistente NÃO pode falar valores (isso é correto, não penalize), deve convidar para visita cedo, e deve qualificar região, estágio da obra, tipologia e renda.`;

type JuizoDaConversa = { avancou: number; mesmaPessoa: number; assumiria: boolean; justificativa: string };

async function julgarConversa(
  c: ConversaSimulada,
): Promise<(JuizoDaConversa & { juiz: "gemini" | "gpt-reserva" }) | null> {
  const transcricao = c.turnos
    .map((t, i) => `[${i + 1}] Cliente: ${t.cliente.join(" / ")}\n[${i + 1}] Sofia: ${t.bot}`)
    .join("\n");

  /*
   * Modelo PRÓPRIO do juiz, separado do que o cliente simulado usa.
   *
   * A cota gratuita do Gemini conta por MODELO (20 chamadas/dia por modelo
   * nesta conta), e numa rodada de seis personas o cliente simulado sozinho
   * gasta dezenas. Com os dois no mesmo modelo, o juiz fica sem cota no meio
   * da rodada e metade das conversas sai sem nota — foi assim que o eval de
   * resposta perdeu 8 dos 36 casos numa medição.
   */
  const prompt = `${RUBRICA_DA_CONVERSA}

CONVERSA:
${transcricao}`;
  const gemini = await chamarGeminiJson(prompt, {
    temperature: 0,
    timeoutMs: 45_000,
    modelo: process.env.GEMINI_MODELO_JUIZ || "gemini-3.5-flash-lite",
  });
  if (gemini.ok) {
    return { ...(gemini.json as JuizoDaConversa), juiz: "gemini" as const };
  }

  /*
   * RESERVA: a cota gratuita do Gemini morre no meio da rodada com
   * frequência, e conversa sem nota é rodada perdida. O GPT assume — com
   * CARIMBO no resultado, porque ele é da mesma família do agente e a nota
   * dele carrega viés para cima. Nota comparável entre versões exige saber
   * qual juiz a deu.
   */
  const gpt = await chamarOpenaiJson(prompt, {
    temperature: 0,
    timeoutMs: 60_000,
    modelo: process.env.OPENAI_MODELO_JUIZ || "gpt-4.1",
  });
  if (!gpt.ok) return null;
  return { ...(gpt.json as JuizoDaConversa), juiz: "gpt-reserva" as const };
}

/**
 * Grava o resultado ao fim de CADA rodada, não só no fim de tudo.
 *
 * Uma rodada de 4 personas x 3 leva mais de uma hora, e o contêiner desta
 * sessão foi reiniciado no meio de uma — 2 de 12 conversas pagas e
 * perdidas, porque o arquivo só era escrito no final. Salvar por rodada
 * transforma a perda total em perda parcial.
 */
type RodadaDoRelatorio = Awaited<ReturnType<typeof conversarCom>> & {
  medida: ReturnType<typeof medirConversa>;
  juizo: Awaited<ReturnType<typeof julgarConversa>> | null;
  rodada: number;
};

function gravar(
  relatorio: RodadaDoRelatorio[],
  clienteIndependente: boolean,
  rodadasFeitas: number,
): string {
  const hoje = new Date().toISOString().slice(0, 10);
  mkdirSync("eval/resultados/transcricoes", { recursive: true });

  const arquivo = `eval/resultados/conversa-${PROMPT_VERSAO}-${hoje}.json`;
  writeFileSync(
    arquivo,
    JSON.stringify(
      {
        promptVersao: PROMPT_VERSAO,
        data: hoje,
        provedorDoAgente: PROVEDOR_DO_AGENTE,
        provedorDoCliente: provedorDoCliente(),
        /*
         * Carimbo, na mesma régua do `juizIndependente` do eval de resposta:
         * cliente no mesmo provedor do agente (em outro modelo) ainda enviesa
         * para a cooperação. A nota continua útil; comparar esta rodada com
         * uma de cliente independente é comparar réguas diferentes.
         */
        clienteIndependente,
        tetoDeTurnos: TETO_DE_TURNOS,
        rodadas: rodadasFeitas,
        comJuiz: !SEM_JUIZ,
        conversas: relatorio.map(({ persona, desfecho, medida, juizo, turnos, rodada }) => ({
          persona,
          rodada,
          desfecho,
          turnos: turnos.length,
          medida,
          juizo,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  /*
   * A transcrição legível não é enfeite: é o insumo da F1, em que o humano
   * lê e rotula. Relatório com número e sem texto é inauditável — foi assim
   * que dois modelos bons foram reprovados injustamente antes de alguém
   * olhar a resposta.
   */
  for (const c of relatorio) {
    const texto = c.turnos
      .map((t: (typeof c.turnos)[number], i: number) => `[${i + 1}] Cliente: ${t.cliente.join("\n              ")}\n[${i + 1}] Sofia:   ${t.bot}${t.anexos?.length ? `\n              📎 ${t.anexos.join("\n              📎 ")}` : ""}`)
      .join("\n\n");
    writeFileSync(
      `eval/resultados/transcricoes/${PROMPT_VERSAO}-${c.persona}${RODADAS > 1 ? `-r${c.rodada}` : ""}.txt`,
      `${c.persona}${RODADAS > 1 ? ` · rodada ${c.rodada}` : ""} · ${c.desfecho} · ${c.turnos.length} turnos\n${"—".repeat(60)}\n\n${texto}\n`,
      "utf8",
    );
  }

  return arquivo;
}

async function principal() {
  // Trava ANTES de qualquer chamada: rodar e descobrir depois já custou o
  // dinheiro e produziu um relatório que parece válido.
  const { clienteIndependente } = conferirProvedores(PROVEDOR_DO_AGENTE);

  const ids = arg("personas")?.split(",").map((s) => s.trim());
  const escolhidas = ids
    ? ids.map((id) => personaPorId(id)).filter((p): p is Persona => Boolean(p))
    : PERSONAS;

  if (escolhidas.length === 0) {
    console.error("Nenhuma persona encontrada. Ids válidos:", PERSONAS.map((p) => p.id).join(", "));
    process.exit(1);
  }

  console.log(
    `Eval de CONVERSA · prompt ${PROMPT_VERSAO} · agente=${PROVEDOR_DO_AGENTE} · cliente=${provedorDoCliente()}`,
  );
  console.log(
    `${escolhidas.length} persona(s), teto de ${TETO_DE_TURNOS} turnos, ${RODADAS} rodada(s).\n`,
  );
  if (RODADAS < 2) {
    console.warn(
      "[eval] UMA rodada só: serve para olhar transcrição, não para comparar versões.\n" +
        "       Use --rodadas=3 antes de decidir se uma mudança de prompt é avanço.\n",
    );
  }

  const relatorio = [];
  for (let rodada = 1; rodada <= RODADAS; rodada++) {
  for (const persona of escolhidas) {
    const conversa = await conversarCom(persona);
    const medida = medirConversa(conversa.turnos, {
      conversaCompleta:
        conversa.desfecho === "cliente_encerrou" || conversa.desfecho === "teto_de_turnos",
    });
    const juizo = SEM_JUIZ ? null : await julgarConversa(conversa);

    console.log(
      `\n${persona.id}${RODADAS > 1 ? ` (rodada ${rodada}/${RODADAS})` : ""}: ${conversa.turnos.length} turnos · ${conversa.desfecho}` +
        `${medida.reprovacoes.length ? `\n  ⚠ ${medida.reprovacoes.join("\n  ⚠ ")}` : "\n  ✓ nenhuma reprovação determinística"}` +
        `${juizo ? `\n  juiz: avançou=${juizo.avancou} mesmaPessoa=${juizo.mesmaPessoa} assumiria=${juizo.assumiria} — ${juizo.justificativa}` : ""}\n`,
    );

    relatorio.push({ ...conversa, medida, juizo, rodada });
  }

  /*
   * Salva ao fim de CADA rodada. O contêiner desta sessão reiniciou no meio
   * de uma rodada de 12 conversas e levou as 2 já pagas junto, porque o
   * arquivo só era escrito no final. Perda parcial em vez de total.
   */
  gravar(relatorio, clienteIndependente, rodada);
  if (RODADAS > 1) console.log(`  [salvo: ${rodada}/${RODADAS} rodada(s) até aqui]`);
  }

  const arquivo = gravar(relatorio, clienteIndependente, RODADAS);

  const reprovadas = relatorio.filter((c) => c.medida.reprovacoes.length > 0).length;
  console.log(
    `\n${relatorio.length - reprovadas}/${relatorio.length} conversa(s) sem reprovação determinística.`,
  );
  console.log(`Resultado em ${arquivo} · transcrições em eval/resultados/transcricoes/`);
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
