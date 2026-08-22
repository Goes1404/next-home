import type { Empreendimento } from "@/lib/types";

/**
 * Pontuação de RELEVÂNCIA de uma conversa passada para a conversa de agora.
 *
 * O `aprendizadoContinuo` original recuperava por um critério só: as 3
 * conversas mais RECENTES de leads que converteram. Duas fraquezas nisso.
 *
 * A primeira é de cobertura: exigir conversão para aprender significa não
 * aprender nada até a primeira venda fechar. Depois de ligar as 36
 * conversas aos leads, o corpus tem 721 mensagens reais — e só UMA delas
 * pertence a lead que avançou no funil. Recência sobre um conjunto vazio
 * continua vazio.
 *
 * A segunda é de pertinência: a conversa mais recente que converteu pode
 * ter sido sobre um imóvel de 400 mil em Osasco, enquanto o cliente de
 * agora pergunta sobre alto padrão em Alphaville. Recuperar por data é
 * recuperar o que estava por perto, não o que ajuda.
 *
 * Aqui a recuperação é por relevância, com a conversão virando um dos
 * sinais em vez do único filtro. Módulo puro: quem busca no banco é
 * `aprendizadoContinuo.ts`.
 */

/** Etapas que provam que a conversa levou a algum lugar. */
const ETAPAS_CONVERTIDAS = new Set([
  "visita_agendada",
  "proposta_enviada",
  "negociacao",
  "fechado",
]);

export type ConversaCandidata = {
  conversaId: string;
  leadEtapa: string;
  /** Texto concatenado da conversa, para casar assunto. */
  texto: string;
  /** Quantas vezes o CLIENTE falou — engajamento real, não monólogo do bot. */
  falasDoCliente: number;
  atualizadaEm: string;
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Termos que definem o assunto de agora: o imóvel citado e o bairro.
 *
 * Palavra solta do cliente ("oi", "quanto") não discrimina nada — o que
 * discrimina é o NOME do empreendimento e a região.
 */
export function termosDoAssunto(params: {
  mensagemAtual: string;
  historico?: { texto: string }[];
  catalogo: Empreendimento[];
}): string[] {
  const conversa = normalizar(
    [params.mensagemAtual, ...(params.historico ?? []).map((h) => h.texto)].join(" "),
  );

  const termos = new Set<string>();
  for (const imovel of params.catalogo) {
    const nome = normalizar(imovel.nome);
    const bairro = normalizar(imovel.bairro ?? "");
    if (nome && conversa.includes(nome)) termos.add(nome);
    if (bairro && bairro.length > 3 && conversa.includes(bairro)) termos.add(bairro);
  }
  return Array.from(termos);
}

export function pontuarRelevancia(
  candidata: ConversaCandidata,
  termos: string[],
  agora = new Date(),
): number {
  let pontos = 0;
  const texto = normalizar(candidata.texto);

  // ASSUNTO é o sinal mais forte: uma conversa sobre o mesmo imóvel ensina
  // o argumento que serve agora.
  for (const termo of termos) {
    if (texto.includes(termo)) pontos += 60;
  }

  // Conversão vira um sinal, não um filtro. Continua valendo muito — é a
  // prova de que aquele jeito de conduzir funcionou.
  if (ETAPAS_CONVERTIDAS.has(candidata.leadEtapa)) pontos += 50;

  /*
   * Engajamento: o cliente respondeu várias vezes. Sem isso, uma conversa
   * em que o bot falou sozinho cinco vezes pontuaria igual a uma troca de
   * verdade — e ensinaria justamente o que não funciona.
   */
  pontos += Math.min(candidata.falasDoCliente, 6) * 8;

  // Recência entra por último, como desempate: até 20 pontos, caindo ao
  // longo de 30 dias.
  const dias = (agora.getTime() - new Date(candidata.atualizadaEm).getTime()) / 86_400_000;
  pontos += Math.max(0, 20 - dias * (20 / 30));

  return Math.round(pontos);
}

/**
 * Escolhe as melhores conversas para servir de exemplo.
 *
 * Descarta as que não têm troca real — uma conversa com uma fala só do
 * cliente não mostra padrão de condução nenhum.
 */
export function escolherExemplos(
  candidatas: ConversaCandidata[],
  termos: string[],
  limite = 3,
  agora = new Date(),
): ConversaCandidata[] {
  return candidatas
    .filter((c) => c.falasDoCliente >= 2)
    .map((c) => ({ c, pontos: pontuarRelevancia(c, termos, agora) }))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((x) => x.c);
}
