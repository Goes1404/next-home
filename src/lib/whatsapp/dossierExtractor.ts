import { algumProvedorConfigurado, chamarLlmJson, ORCAMENTO_DOSSIE_MS } from "./llm";
import { TETO_DA_MEMORIA } from "./memoriaDaConversa";
import type { DossieClienteIA, TemperaturaLeadLabel } from "./types";

const PROMPT_DOSSIE = `Você é um analista sênior de inteligência comercial imobiliária da Next Home.
Sua missão é ler a transcrição de uma conversa de WhatsApp entre um cliente e a imobiliária e extrair um DOSSIÊ EXECUTIVO ESTRUTURADO do cliente.

Você DEVE responder EXCLUSIVAMENTE um objeto JSON válido no seguinte formato:
{
  "orcamentoMin": number ou null,
  "rendaMensal": number ou null (renda MENSAL da família, não o valor do imóvel; só preencha se o cliente disser),
  "regiaoInteresse": string ou null (região/bairro onde o CLIENTE disse que procura imóvel, ex: "Centro de Barueri", "Alphaville", "Jardim Tupanci"; use as palavras dele, nunca deduza do imóvel que a atendente ofereceu),
  "dormitoriosMin": number ou null (quantos dormitórios o cliente disse precisar; só se ELE disser, nunca deduza do imóvel apresentado),
  "nomeCliente": string ou null (o PRIMEIRO NOME do cliente, e SÓ quando ele se apresenta de forma inequívoca: "meu nome é X", "sou o/a X", "aqui é o/a X", ou assinatura no fim da mensagem. NUNCA um nome citado no meio da frase: em "vou ver com o João" ou "a Maria indicou", João e Maria NÃO são o cliente. Na dúvida, null),
  "email": string ou null (só se o cliente escrever o e-mail DELE),
  "orcamentoMax": number ou null,
  "formaPagamento": "a_vista" | "financiamento" | "permuta" | "misto" | null,
  "profissao": string ou null (com o que o cliente trabalha, nas palavras dele; NUNCA deduza renda a partir disso),
  "compraEmConjunto": true | false | null (true se a compra soma renda com cônjuge/familiar/sócio; false se é só ele; null se não disse),
  "perfilFamiliar": "casal_com_filhos" | "casal_sem_filhos" | "solteiro" | "investidor" | null,
  "urgenciaMudanca": "imediata" | "3_meses" | "6_meses" | "apenas_pesquisando" | null,
  "exigenciasEspecificas": ["lista de exigencias citadas como andar_alto, 3_vagas, 2_suites, pet_friendly, vista_livre; inclua também, QUANDO O CLIENTE DISSER: estágio desejado (na_planta | em_construcao | pronto_para_morar), finalidade (moradia_propria | investimento) e situação de crédito (credito_aprovado | precisa_assessoria_credito)"],
  "objecoesIdentificadas": ["lista de dúvidas ou objeções citadas como preco, taxa_condominio, prazo_entrega, etc"],
  "temperaturaScore": 0 a 100 (número indicando probabilidade de compra nos próximos 60 dias),
  "temperaturaLabel": "quente" | "morno" | "frio",
  "resumoExecutivo": "Resumo em tópicos com as principais dores, preferências e perfil do cliente",
  "proximoPassoSugerido": "Ação recomendada para o corretor humano realizar no próximo contato",
  "memoria": "Até ${TETO_DA_MEMORIA} caracteres, em PROSA CORRIDA, com o ESTADO DA NEGOCIAÇÃO — não é resumo para relatório, é o que a atendente precisa lembrar na próxima mensagem: o que ele procura, quanto pode pagar, QUAL IMÓVEL ele escolheu, o que já foi oferecido e ele RECUSOU, o que ficou combinado, e o que ele pediu e ainda não recebeu. Não transcreva falas. Não repita o que não importa mais. Não invente nada que não esteja na conversa."
}`;

/**
 * O bloco da memória anterior, quando existe.
 *
 * Entregar a memória de volta ao extrator é o que faz ela ACUMULAR em vez de
 * recomeçar: a extração só enxerga a janela do histórico, e sem a anterior
 * em mãos ela produziria, a cada mensagem, um retrato só do trecho recente —
 * exatamente o defeito que apagava o dossiê antes da 0106.
 */
function blocoDaMemoriaAnterior(memoriaAnterior: string | null | undefined): string {
  if (!memoriaAnterior || !memoriaAnterior.trim()) return "";
  return [
    "",
    "--- MEMÓRIA ATUAL DESTA CONVERSA (escrita por você em mensagens anteriores) ---",
    memoriaAnterior.trim(),
    "ATUALIZE esta memória com o que a transcrição abaixo acrescentar. Preserve o que continua valendo; corrija o que o cliente mudou de ideia; remova só o que deixou de fazer sentido.",
  ].join(String.fromCharCode(10));
}

/**
 * Transforma o JSON cru do modelo no dossiê tipado.
 *
 * Está separada de `extrairDossieCliente` para poder ser TESTADA: as réguas
 * de cada campo (o teto da memória, o e-mail que precisa parecer e-mail, o
 * dormitório que precisa ser plausível) são o que impede lixo de chegar à
 * ficha do cliente, e até 11/09/2026 elas viviam dentro da função que faz a
 * chamada de rede — ou seja, sem um único teste.
 */
export function normalizarSaidaDoDossie(bruto: unknown, leadId: string): DossieClienteIA {
  const parsed = (bruto ?? {}) as Record<string, unknown>;

  const score =
    typeof parsed.temperaturaScore === "number"
      ? Math.min(100, Math.max(0, parsed.temperaturaScore))
      : 50;
  const label: TemperaturaLeadLabel = score >= 75 ? "quente" : score >= 40 ? "morno" : "frio";

  const texto = (valor: unknown, teto: number): string | null =>
    typeof valor === "string" && valor.trim() ? valor.trim().slice(0, teto) : null;

  return {
    id: "dossie-" + leadId,
    leadId,
    orcamentoMin: typeof parsed.orcamentoMin === "number" ? parsed.orcamentoMin : null,
    rendaMensal: typeof parsed.rendaMensal === "number" ? parsed.rendaMensal : null,
    regiaoInteresse: texto(parsed.regiaoInteresse, 120),
    dormitoriosMin:
      typeof parsed.dormitoriosMin === "number" && parsed.dormitoriosMin >= 1 && parsed.dormitoriosMin <= 10
        ? Math.round(parsed.dormitoriosMin)
        : null,
    /*
     * O nome passa por uma última peneira aqui, além da régua do prompt: no
     * máximo 60 caracteres e nada que pareça frase. Modelo que devolve "o
     * cliente não se apresentou" nesse campo escreveria isso na ficha, e o
     * corretor chamaria a pessoa assim na primeira linha.
     */
    nomeCliente: nomePlausivel(texto(parsed.nomeCliente, 60)),
    email: emailPlausivel(texto(parsed.email, 160)),
    memoria: texto(parsed.memoria, TETO_DA_MEMORIA),
    orcamentoMax: typeof parsed.orcamentoMax === "number" ? parsed.orcamentoMax : null,
    formaPagamento: (parsed.formaPagamento as DossieClienteIA["formaPagamento"]) || null,
    profissao: texto(parsed.profissao, 80),
    compraEmConjunto: typeof parsed.compraEmConjunto === "boolean" ? parsed.compraEmConjunto : null,
    perfilFamiliar: (parsed.perfilFamiliar as DossieClienteIA["perfilFamiliar"]) || null,
    urgenciaMudanca: (parsed.urgenciaMudanca as DossieClienteIA["urgenciaMudanca"]) || null,
    exigenciasEspecificas: Array.isArray(parsed.exigenciasEspecificas)
      ? (parsed.exigenciasEspecificas as string[])
      : [],
    objecoesIdentificadas: Array.isArray(parsed.objecoesIdentificadas)
      ? (parsed.objecoesIdentificadas as string[])
      : [],
    temperaturaScore: score,
    temperaturaLabel: (parsed.temperaturaLabel as TemperaturaLeadLabel) || label,
    resumoExecutivo: (parsed.resumoExecutivo as string) || "Lead qualificado via inteligência artificial.",
    proximoPassoSugerido: (parsed.proximoPassoSugerido as string) || "Dar continuidade ao atendimento.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Até quatro palavras, sem dígito e sem pontuação de frase. */
function nomePlausivel(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.replace(/["']/g, "").trim();
  if (!limpo || /\d/.test(limpo) || /[.,;:!?]/.test(limpo)) return null;
  const palavras = limpo.split(/\s+/);
  if (palavras.length > 4 || limpo.length < 2) return null;
  return limpo;
}

/** Tem de parecer e-mail: o modelo devolve "não informado" com frequência. */
function emailPlausivel(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo) ? limpo : null;
}

/**
 * Analisa a conversa e extrai o Dossiê de Inteligência do Cliente.
 *
 * Roda DEPOIS de as mensagens já terem saído, com orçamento próprio — ninguém
 * está esperando por ela, e é isso que deixa o orçamento de 60s do webhook
 * fechar com folga.
 */
export async function extrairDossieCliente(
  conversaTexto: string,
  leadId: string,
  memoriaAnterior?: string | null,
): Promise<DossieClienteIA> {
  const dossieDefault: DossieClienteIA = {
    ...normalizarSaidaDoDossie({}, leadId),
    id: "temp-" + leadId,
    resumoExecutivo: "Lead em atendimento inicial via WhatsApp.",
    proximoPassoSugerido: "Entrar em contato para qualificar interesse.",
    /*
     * Sem chamada, a memória anterior é PRESERVADA em vez de virar null. O
     * default é o que o chamador grava, e um default com memória nula
     * apagaria o que já se sabia toda vez que o motor estivesse fora do ar
     * — o defeito que a 0106 consertou no dossiê, de volta pela porta dos
     * fundos.
     */
    memoria: memoriaAnterior?.trim() || null,
  };

  if (!algumProvedorConfigurado() || conversaTexto.trim().length < 20) {
    return dossieDefault;
  }

  // A chamada (timeout + retentativa) mora em llm.ts — a mesma resiliência
  // do agente de resposta, sem duplicar o fetch aqui.
  const resultado = await chamarLlmJson(
    `${PROMPT_DOSSIE}${blocoDaMemoriaAnterior(memoriaAnterior)}\n\n--- TRANSCRIÇÃO DA CONVERSA ---\n${conversaTexto.slice(0, 12000)}`,
    { temperature: 0.1, orcamentoMs: ORCAMENTO_DOSSIE_MS },
  );

  if (!resultado.ok) {
    console.error("Erro ao gerar dossiê do lead:", resultado.erro);
    return dossieDefault;
  }

  const dossie = normalizarSaidaDoDossie(resultado.json, leadId);
  // Extração sem memória não apaga a anterior: a mescla final é de
  // `mesclarMemoria`, mas já aqui o campo carrega o que havia — assim
  // nenhum chamador precisa lembrar disso.
  return { ...dossie, memoria: dossie.memoria ?? memoriaAnterior?.trim() ?? null };
}
