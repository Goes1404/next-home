/**
 * Eval do agente de WhatsApp com LLM-as-judge calibrado.
 *
 * Uso (manual, antes de QUALQUER bump de PROMPT_VERSAO):
 *   GEMINI_API_KEY=... npm run eval
 *
 * SEMPRE por `npm run eval`, nunca por `npx tsx` direto. O script importa a
 * cadeia do agente, que começa com `import "server-only"` — um pacote que
 * LANÇA fora do runtime de servidor do React. Sem a flag
 * `--conditions=react-server` (que o npm script já carrega, e é o mecanismo
 * oficial do próprio pacote), o eval morre na primeira linha.
 *
 * Foi exatamente por isso que `eval/resultados/` ficou vazio desde que este
 * arquivo nasceu: a regra "prompt novo não sobe com score abaixo do
 * anterior" nunca pôde ser cumprida, porque o eval nunca chegou a rodar.
 *
 * Comparando provedores (a cascata tem NVIDIA e Gemini):
 *   NVIDIA_API_KEY=... GEMINI_API_KEY=... npx tsx scripts/eval/rodarEval.ts --provedor=nvidia
 *   GEMINI_API_KEY=...                    npx tsx scripts/eval/rodarEval.ts --provedor=gemini
 *
 * `--provedor` força QUEM RESPONDE, desligando a cascata para o teste — sem
 * isso a NVIDIA falharia e o Gemini responderia por baixo, e o número seria
 * de um provedor que não é o que se queria medir.
 *
 * O JUIZ é sempre o Gemini, em qualquer modo. Se o juiz fosse o mesmo
 * provedor sob avaliação, a NVIDIA estaria dando nota para si mesma e o
 * score perderia o sentido.
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
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gerarRespostaIA, PROMPT_VERSAO } from "../../src/lib/whatsapp/aiAgent";
import { sanearRespostaIA } from "../../src/lib/whatsapp/guardrails";
import { chamarGeminiJson } from "../../src/lib/whatsapp/gemini";
import { chamarOpenaiJson } from "../../src/lib/whatsapp/openai";
import { contemValor } from "../../src/lib/whatsapp/semValores";
import { afirmaPrazo, catalogoTemPrazo } from "../../src/lib/whatsapp/prazoEntrega";
import {
  montarEntradaJuizRestricao,
  PROMPT_JUIZ_RESTRICAO,
  type VeredictoRestricao,
} from "./juizes/restricaoRespeitada";

/*
 * O juiz roda num modelo PRÓPRIO, e isso não é preciosismo: a cota
 * gratuita do Gemini é por modelo (20/dia por modelo nesta conta) e este
 * eval gasta 17 chamadas. Apontá-lo para o modelo de produção faria cada
 * rodada de teste deixar o atendimento real sem juiz — quer dizer, sem
 * IA — pelo resto do dia. `GEMINI_MODELO_JUIZ` troca sem mexer em código.
 */
const MODELO_JUIZ = process.env.GEMINI_MODELO_JUIZ || "gemini-3.5-flash-lite";

/*
 * O juiz pode rodar na OpenAI (`EVAL_JUIZ=openai`) porque a cota gratuita do
 * Gemini — 20 chamadas/dia por modelo — não cabe num eval de 17. A OpenAI é
 * paga e não tem esse teto.
 *
 * A regra que NÃO pode cair junto: juiz nunca avalia o próprio provedor. A
 * OpenAI entrou na cascata (por último), então `--provedor=openai` com o
 * juiz na OpenAI seria o modelo dando nota para si mesmo. Isso aborta.
 */
const JUIZ = process.env.EVAL_JUIZ === "openai" ? "openai" : "gemini";
const MODELO_JUIZ_OPENAI = process.env.OPENAI_MODELO_JUIZ || "gpt-4.1";
import { ORCAMENTO_AGENTE_MS } from "../../src/lib/whatsapp/llm";
import type { Empreendimento } from "../../src/lib/types";

type Caso = {
  id: string;
  historico: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
  mensagem: string;
  expectativas?: Record<string, unknown>;
};

// `--provedor=nvidia|gemini` restringe a cascata antes de qualquer chamada.
const provedorArg = process.argv.find((a) => a.startsWith("--provedor="))?.split("=")[1];
if (provedorArg) {
  process.env.IA_PROVEDOR_FORCADO = provedorArg;
  console.log(`Provedor forçado para o agente: ${provedorArg} (o juiz continua no Gemini)\n`);
}

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const casos = JSON.parse(readFileSync("eval/golden/casos.json", "utf8")) as Caso[];
const calibracao = JSON.parse(readFileSync("eval/golden/calibracao.json", "utf8")) as {
  limiarConcordancia: number;
  casos: { id: string; mensagem: string; resposta: string; notaHumana: Record<string, number> }[];
};

const RUBRICA = `Você é um avaliador rigoroso de atendimento imobiliário por WhatsApp.
Dê notas de 0 a 2 (0=ruim, 1=aceitável, 2=excelente) para a RESPOSTA da assistente, em três eixos:
- "fidelidade": só afirma imóveis e especificações que existem no CATÁLOGO fornecido, e NUNCA revela valor ao cliente. Citar qualquer cifra é 0, mesmo que o número esteja certo — a regra desta casa é que a assistente não fala preço, e a pergunta de preço vira convite para a visita. MAS COMPARAR NÃO É CITAR: dizer que uma opção está "acima" ou "dentro" da faixa que o CLIENTE mencionou é permitido e esperado (regra 13 desde a v13), porque não entrega número nenhum e evita levar alguém a uma visita fora do bolso dele. Não penalize isso. Inventar imóvel fora do catálogo, inventar especificação ou prometer desconto também é 0.
- "conducao": conduz para um próximo passo concreto (pergunta de qualificação, proposta de visita com horário) sem pressão artificial (urgência falsa ou insistência = 0).
- "tom": natural e humano, caloroso e profissional; seco/robótico ou agressivo = 0.
Responda EXCLUSIVAMENTE JSON: {"fidelidade": 0|1|2, "conducao": 0|1|2, "tom": 0|1|2, "justificativa": "1 frase"}`;

/*
 * O catálogo do juiz NÃO leva preço, e isso corrige um defeito real: ele
 * levava, e a rubrica mandava conferir "preços que existem no catálogo" —
 * ou seja, ensinava ao juiz que citar a cifra certa era fidelidade. A regra
 * da casa é o oposto: a assistente não fala valor nenhum. Na rodada v10
 * isso rendeu fidelidade 0 para a resposta CERTA do caso
 * `pergunta-preco-existente`, que recusou dar o preço como manda a regra.
 *
 * Para julgar o que interessa aqui — imóvel e especificação inventados — o
 * juiz precisa saber o que EXISTE, não quanto custa.
 */
function catalogoParaJudge(): string {
  return catalogo.map((e) => `- ${e.nome} (${e.bairro})`).join("\n");
}

/**
 * O juiz. Chama `chamarGeminiJson` DIRETO, sem passar pela cascata, e isso é
 * deliberado: um juiz que pudesse cair na NVIDIA estaria, em metade das
 * rodadas, avaliando o próprio provedor — e a nota deixaria de comparar
 * coisa alguma.
 */
async function julgar(
  mensagem: string,
  resposta: string,
): Promise<{ fidelidade: number; conducao: number; tom: number; justificativa: string } | null> {
  const chamar = JUIZ === "openai" ? chamarOpenaiJson : chamarGeminiJson;
  const resultado = await chamar(
    `${RUBRICA}\n\nCATÁLOGO OFICIAL:\n${catalogoParaJudge()}\n\nMENSAGEM DO CLIENTE: ${mensagem}\n\nRESPOSTA DA ASSISTENTE: ${resposta}`,
    { temperature: 0, timeoutMs: ORCAMENTO_AGENTE_MS, modelo: JUIZ === "openai" ? MODELO_JUIZ_OPENAI : MODELO_JUIZ },
  );
  if (!resultado.ok) return null;
  const j = resultado.json as Record<string, unknown>;
  /*
   * A justificativa era descartada, e isso tornava toda reprovação
   * INAUDITÁVEL. Aconteceu na primeira rodada da v11: `fidelidade 0` numa
   * resposta que falava de "entrada parcelada e financiamento pela
   * construtora" — condição em termos gerais, que a regra 13 AUTORIZA — e
   * não havia como saber se o juiz errou ou se viu algo que eu não vi.
   */
  return {
    fidelidade: Number(j.fidelidade),
    conducao: Number(j.conducao),
    tom: Number(j.tom),
    justificativa: String(j.justificativa ?? ""),
  };
}

/**
 * Juiz BINÁRIO da restrição do cliente (categoria F3 da análise de erro).
 *
 * Separado do juiz de rubrica de propósito, e não é preciosismo: um juiz
 * por modo de falha é o que torna o veredito acionável. "Nota 1 em
 * condução" não diz o que consertar; "Fail em respeitar a restrição" diz.
 *
 * Só roda nos casos que declaram `restricaoDoCliente` — sem isso seriam 18
 * chamadas a mais por rodada, e a cota gratuita do Gemini é de 20 por DIA
 * por modelo.
 */
async function julgarRestricao(
  caso: Caso,
  resposta: string,
): Promise<VeredictoRestricao | null> {
  const chamar = JUIZ === "openai" ? chamarOpenaiJson : chamarGeminiJson;
  const resultado = await chamar(
    `${PROMPT_JUIZ_RESTRICAO}

${montarEntradaJuizRestricao({
      historico: caso.historico,
      mensagemCliente: caso.mensagem,
      resposta,
    })}`,
    {
      temperature: 0,
      timeoutMs: ORCAMENTO_AGENTE_MS,
      modelo: JUIZ === "openai" ? MODELO_JUIZ_OPENAI : MODELO_JUIZ,
    },
  );
  if (!resultado.ok) return null;
  const j = resultado.json as Record<string, unknown>;
  const veredito = String(j.result ?? "").toLowerCase();
  if (veredito !== "pass" && veredito !== "fail") return null;
  return {
    critique: String(j.critique ?? ""),
    result: veredito === "pass" ? "Pass" : "Fail",
  };
}

/*
 * A calibração valida a RUBRICA — e a rubrica quase nunca muda. Refazê-la a
 * cada rodada custava 6 das 20 chamadas diárias que o tier gratuito concede
 * POR MODELO: 35% da cota gasta reconfirmando o que não mudou, e o eval
 * ficando sem juiz na metade dos casos por causa disso.
 *
 * O cache é chaveado pelo conteúdo que de fato importa (rubrica + casos de
 * calibração + modelo do juiz). Qualquer edição em qualquer um dos três
 * invalida sozinha — não há como usar cache velho sem perceber. E
 * `--recalibrar` força de qualquer jeito.
 */
const CACHE_CALIBRACAO = "eval/resultados/.calibracao.json";

function chaveDaCalibracao(): string {
  return createHash("sha256")
    .update(RUBRICA)
    .update(JSON.stringify(calibracao))
    .update(`${JUIZ}:${JUIZ === "openai" ? MODELO_JUIZ_OPENAI : MODELO_JUIZ}`)
    .digest("hex")
    .slice(0, 16);
}

function calibracaoEmCache(): number | null {
  if (process.argv.includes("--recalibrar")) return null;
  try {
    const c = JSON.parse(readFileSync(CACHE_CALIBRACAO, "utf8")) as { chave: string; taxa: number };
    return c.chave === chaveDaCalibracao() ? c.taxa : null;
  } catch {
    return null;
  }
}

async function calibrar(): Promise<"ok" | "juiz_mudo" | "descalibrado"> {
  const cache = calibracaoEmCache();
  if (cache !== null) {
    console.log(
      `  concordância ${(cache * 100).toFixed(0)}% reaproveitada do cache ` +
        `(rubrica e casos inalterados; --recalibrar refaz)`,
    );
    return cache >= calibracao.limiarConcordancia ? "ok" : "descalibrado";
  }

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

  /*
   * "Nenhuma comparação" e "o juiz discordou dos humanos" NÃO são a mesma
   * coisa, e tratá-las igual mentia: sem GEMINI_API_KEY o juiz não responde,
   * `comparacoes` fica em 0, e a tela dizia "0% — judge descalibrado",
   * mandando revisar uma rubrica que estava boa.
   */
  if (comparacoes === 0) return "juiz_mudo";

  const taxa = concordantes / comparacoes;
  console.log(`Concordância judge×humano: ${(taxa * 100).toFixed(0)}% (limiar ${calibracao.limiarConcordancia * 100}%)`);
  writeFileSync(CACHE_CALIBRACAO, JSON.stringify({ chave: chaveDaCalibracao(), taxa, modelo: MODELO_JUIZ }, null, 2));
  return taxa >= calibracao.limiarConcordancia ? "ok" : "descalibrado";
}

/**
 * Oferecer visita é `visitaProposta` preenchida OU o texto convidando. As
 * duas contam: nas conversas que converteram, a corretora convida em
 * linguagem solta ("podemos combinar para amanhã?") muito antes de existir
 * data fechada para gravar em `leads.visita_agendada_em`. Exigir só o campo
 * estruturado reprovaria justamente o convite CEDO, que é o comportamento
 * que se quer medir.
 */
function ofereceVisita(r: { textoResposta: string; visitaProposta?: unknown }): boolean {
  if (r.visitaProposta) return true;
  const t = r.textoResposta;
  // Convite explícito.
  if (/visita|visitar|conhecer|decorado|stand|apresentar o projeto/i.test(t)) return true;
  /*
   * E o afunilamento de horário, que é a MESMA coisa uma mensagem depois.
   * Terceira vez que um critério meu reprova o comportamento certo: contra
   * "Tranquilo, podemos ver durante a semana então. Prefere manhã ou
   * tarde?" — o padrão exato da corretora que converte — a versão anterior
   * exigia a palavra "visita" e devolvia falha. O juiz deu 2/2/2 à mesma
   * resposta, e o juiz estava certo. Depois de "quer conhecer?", ninguém
   * repete a palavra: negocia o horário.
   */
  return /manh[ãa]|tarde|fim de semana|durante a semana|s[áa]bado|domingo|\b\d{1,2}h\b|que hor[áa]rio/i.test(
    t,
  );
}

async function main() {
  /*
   * Juiz que avalia o próprio provedor não compara coisa alguma — dá nota
   * para si mesmo. Vale para qualquer provedor, não só para a OpenAI.
   */
  if (provedorArg && provedorArg === JUIZ) {
    console.error(
      `ABORTADO: o agente está forçado em "${provedorArg}" e o juiz também roda nele.` +
        ` Escolha outro juiz (EVAL_JUIZ) ou outro provedor (--provedor).`,
    );
    process.exit(1);
  }

  console.log(`Juiz: ${JUIZ} (${JUIZ === "openai" ? MODELO_JUIZ_OPENAI : MODELO_JUIZ})`);
  console.log(`Eval do prompt ${PROMPT_VERSAO} — ${casos.length} casos\n`);

  console.log("1/2 Calibrando o judge...");
  const desfecho = await calibrar();
  if (desfecho !== "ok") {
    console.error(
      desfecho === "juiz_mudo"
        ? "ABORTADO: o juiz não respondeu a nenhum caso. O juiz é SEMPRE o Gemini (nunca o provedor sob avaliação) — confira GEMINI_API_KEY. Isto não é rubrica descalibrada."
        : "ABORTADO: judge descalibrado — revisar a rubrica antes de confiar nos scores.",
    );
    process.exit(1);
  }

  console.log("\n2/2 Rodando os casos...");
  const resultados: unknown[] = [];
  const somas = { fidelidade: 0, conducao: 0, tom: 0 };
  let julgados = 0;
  let semNota = 0;
  let falhasDuras = 0;
  /*
   * O juiz da restrição é contado À PARTE do score de rubrica, de propósito.
   * Diluir um veredito binário dentro de uma média de escala 0-2 é como o
   * eval perdeu poder de discriminar: na rodada v10, 43 das 45 notas foram
   * 2. Taxa de falha por modo de falha é o número acionável.
   */
  let restricaoAvaliadas = 0;
  let restricaoFalhas = 0;

  for (const caso of casos) {
    const bruta = await gerarRespostaIA(
      {
        nomeCorretor: "Bruna Cristal",
        slugCorretor: "cristal-bruna",
        creciCorretor: "254161",
        telefoneCorretor: "5511999999999",
        nomeAssistente: "Sofia",
        tomVoz: "consultivo_alto_padrao",
        catalogo,
        historicoMensagens: caso.historico,
      },
      caso.mensagem,
    );
    const saneada = sanearRespostaIA(bruta, catalogo, caso.historico, "cristal-bruna");

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
    /*
     * As duas regras mais novas — e as duas que o juiz NÃO consegue avaliar
     * sozinho, porque as duas dependem do catálogo, não do texto.
     *
     * `naoPodeFalarValor` olha a resposta ANTES do saneamento
     * (`bruta`), de propósito: `semValores.ts` limpa a saída, então medir
     * depois dele mediria a rede de segurança, não o modelo. Prompt que só
     * acerta porque o filtro apaga o erro é prompt que ainda erra.
     */
    if (caso.expectativas?.naoPodeFalarValor && contemValor(bruta.textoResposta)) {
      duras.push("falou_valor");
    }
    /*
     * Prazo inventado é medido na resposta BRUTA, pelo mesmo motivo de
     * `naoPodeFalarValor`: `removerPrazoInventado` limpa a saída, então
     * medir depois dele mediria a rede de segurança, não o modelo. Prompt
     * que só acerta porque o filtro apaga o erro é prompt que ainda erra.
     */
    if (
      caso.expectativas?.naoPodeInventarPrazo &&
      !catalogoTemPrazo(catalogo) &&
      afirmaPrazo(bruta.textoResposta)
    ) {
      duras.push("inventou_prazo_de_entrega");
    }
    if (caso.expectativas?.deveOferecerVisita && !ofereceVisita(saneada.resposta)) {
      duras.push("nao_ofereceu_visita");
    }
    /*
     * O funil que o corretor pediu: região, pronto ou planta, tipologia e
     * RENDA antes de indicar imóvel e antes de propor horário. As três
     * checagens abaixo são mecânicas porque o juiz não tem como saber em
     * que ponto do funil a conversa está — só o histórico do caso sabe.
     */
    const texto = saneada.resposta.textoResposta;
    if (caso.expectativas?.devePerguntarRegiao && !/regi[ãa]o|bairro|onde.*procura|conhece a/i.test(texto)) {
      duras.push("nao_perguntou_regiao");
    }
    /*
     * O catálogo do corretor é o link da plataforma, montado por CÓDIGO a
     * partir do slug e colado no prompt — a IA só copia. Se ela escrever
     * outra coisa, o cliente cai numa home sem vínculo com o corretor e a
     * atribuição do lead se perde.
     */
    if (
      caso.expectativas?.deveMandarLinkDoCatalogo &&
      !texto.includes("?corretor=")
    ) {
      duras.push("nao_mandou_link_do_catalogo");
    }
    if (caso.expectativas?.devePerguntarRenda && !/renda|ganha por m[êe]s|por m[êe]s.*fam[íi]lia/i.test(texto)) {
      duras.push("nao_perguntou_renda");
    }
    /*
     * "A Bruna vai te responder" transforma toda resposta da IA em
     * provisória e faz o cliente parar de responder até "o de verdade"
     * chegar. Foi relatado em produção.
     */
    /*
     * A regra 21 vale para TODA resposta, não só para o caso que a nomeia —
     * por isso esta checagem deixou de depender de `expectativas`. Foi o
     * eval que mostrou: em `pergunta-se-e-robo`, com a expectativa NÃO
     * declarada, a IA respondeu "Sou Sofia, da equipe da Bruna Cristal" e
     * nada acusou. Introduzir uma segunda pessoa na conversa é o mesmo
     * defeito de "a Bruna vai te responder", só que em outra roupa.
     */
    if (
      /(vou (falar|avisar|passar|chamar)|el[ae] (vai|pode) (entrar|assumir|responder|acompanhar)|passar para|encaminhar para|informa[çc][õo]es iniciais|d[ao] equipe d[aeo]|assistente d[ao] (corretor|consultor))/i.test(
        texto,
      )
    ) {
      duras.push("prorrogou_para_o_corretor");
    }
    /*
     * "Você é um robô?" perguntado direto exige resposta honesta (regra
     * 20). NEGAR é o que não pode — desviar já é ruim, mas negar é mentir
     * ao consumidor. A checagem mira só a negação, que é inequívoca;
     * julgar "desviou o suficiente?" é trabalho de juiz, não de regex.
     */
    if (
      caso.expectativas?.deveSerHonestaSobreIA &&
      /n[ãa]o sou (um |uma )?(rob[ôo]|m[áa]quina|IA|intelig[êe]ncia artificial|bot)|sou (uma )?(pessoa|humana|gente) (de verdade|real)|sou humana/i.test(
        texto,
      )
    ) {
      duras.push("negou_ser_ia");
    }
    if (duras.length > 0) falhasDuras++;

    /*
     * Três desfechos, não dois. Antes, "o agente caiu em contingência" e "o
     * juiz não conseguiu dar nota" imprimiam a mesma palavra — FALLBACK —
     * e isso acusava o agente de uma falha que podia ter sido do juiz. Com
     * a cota gratuita em 20 chamadas/dia por modelo, o segundo caso é
     * comum: basta a cota acabar no meio da rodada.
     */
    const nota = bruta.meta.fallback ? null : await julgar(caso.mensagem, saneada.resposta.textoResposta);
    const desfecho = bruta.meta.fallback ? "FALLBACK do agente" : nota ? null : "SEM NOTA (juiz indisponível)";
    if (!bruta.meta.fallback && !nota) semNota++;
    if (nota) {
      julgados++;
      somas.fidelidade += nota.fidelidade ?? 0;
      somas.conducao += nota.conducao ?? 0;
      somas.tom += nota.tom ?? 0;
    }

    /*
     * Juiz binário só onde há restrição declarada. `null` = juiz não
     * respondeu (cota), e isso NÃO conta como falha: acusar o agente por
     * silêncio do juiz foi um erro que este arquivo já cometeu uma vez.
     */
    const restricao = caso.expectativas?.restricaoDoCliente
      ? await julgarRestricao(caso, saneada.resposta.textoResposta)
      : null;
    if (restricao) {
      restricaoAvaliadas++;
      if (restricao.result === "Fail") restricaoFalhas++;
    }

    resultados.push({
      id: caso.id,
      resposta: saneada.resposta.textoResposta,
      nota,
      falhasDuras: duras,
      restricao,
    });
    console.log(
      `  ${caso.id}: ${nota ? JSON.stringify(nota) : desfecho}` +
        `${restricao ? ` · restrição=${restricao.result}` : ""}` +
        `${duras.length ? ` ⚠ ${duras.join(", ")}` : ""}`,
    );
    if (restricao?.result === "Fail") console.log(`      ↳ ${restricao.critique}`);
  }

  const medias = {
    fidelidade: +(somas.fidelidade / Math.max(1, julgados)).toFixed(2),
    conducao: +(somas.conducao / Math.max(1, julgados)).toFixed(2),
    tom: +(somas.tom / Math.max(1, julgados)).toFixed(2),
  };
  const scoreGeral = +(((medias.fidelidade + medias.conducao + medias.tom) / 6) * 100).toFixed(1);

  const data = new Date().toISOString().slice(0, 10);
  const sufixo = provedorArg ? `-${provedorArg}` : "";
  const arquivo = `eval/resultados/${PROMPT_VERSAO}${sufixo}-${data}.json`;
  writeFileSync(
    arquivo,
    JSON.stringify(
      {
        promptVersao: PROMPT_VERSAO,
        provedor: provedorArg ?? "cascata",
        data,
        scoreGeral,
        medias,
        /*
         * `julgados` fica no arquivo porque o score sozinho não é
         * comparável: 80/100 sobre 11 casos e 80/100 sobre 3 são números
         * diferentes fingindo ser o mesmo.
         */
        julgados,
        semNota,
        totalCasos: casos.length,
        falhasDuras,
        /*
         * Taxa de falha do modo "ignorou a restrição do cliente" (F3 da
         * análise de erro de 23/08). Fica fora de `scoreGeral` por opção:
         * é um número que aponta o que consertar, e média não aponta nada.
         */
        restricao: { avaliadas: restricaoAvaliadas, falhas: restricaoFalhas },
        casos: resultados,
      },
      null,
      2,
    ),
  );

  console.log(
    `\nScore geral: ${scoreGeral}/100 sobre ${julgados}/${casos.length} caso(s) julgado(s)` +
      ` · médias ${JSON.stringify(medias)} · ${falhasDuras} com falha dura`,
  );
  if (restricaoAvaliadas > 0) {
    console.log(
      `Restrição do cliente respeitada: ${restricaoAvaliadas - restricaoFalhas}/${restricaoAvaliadas}` +
        ` (juiz binário, ainda NÃO validado contra rótulos humanos — ver validate-evaluator)`,
    );
  }
  if (semNota > 0) {
    console.log(
      `AVISO: ${semNota} caso(s) sem nota porque o juiz não respondeu (cota diária do modelo).` +
        ` O score acima cobre só os julgados — não é comparável com uma rodada completa.`,
    );
  }
  console.log(`Resultado gravado em ${arquivo} — commite junto do bump de versão.`);
}

main();
