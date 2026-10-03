/**
 * A fala "do corretor" que não foi o corretor: a saudação automática do
 * WhatsApp Business.
 *
 * Medido no anúncio do Dom Parque (01-03/10/2026): em todo lead novo, no
 * MESMO segundo da primeira mensagem do cliente, chegava "Oiii Sou eu a
 * corretora Bruna! Prazer em te ajudar..." como mensagem do próprio número.
 * Ninguém digita em zero segundos: é a saudação configurada no app.
 *
 * Desde a 0152 a fala do corretor DESLIGA a IA na conversa. Lida como fala
 * dela, a saudação desligaria a IA em todo lead que chega pelo anúncio,
 * exatamente quando ele mais precisa de resposta.
 *
 * A régua: o corretor não tinha falado nesta conversa nas últimas 24h E
 * (o lead acabou de nascer OU o cliente falou há segundos). Mão humana não
 * responde em cinco segundos uma conversa que não estava acompanhando.
 *
 * A saudação não é gravada na conversa (ver o webhook). O custo é o de uma
 * fala de verdade cair na régua: ela some do histórico e não desliga a IA.
 * Por isso as janelas são curtas: a saudação chega em um segundo e a decisão
 * sai três segundos depois; um "Oii" digitado 11s depois já fica de fora.
 *
 * O erro é assimétrico: tratar fala de verdade como automática deixa a IA
 * ligada numa conversa que o corretor pegou — mas aí a próxima fala dele
 * desliga. Tratar a saudação como fala desliga a IA no lead do anúncio, e
 * ninguém volta para ligar.
 *
 * Módulo puro.
 */

/** Quanto o webhook espera antes de decidir: as duas mensagens chegam juntas. */
export const SEGUNDOS_PARA_A_SAUDACAO = 3;
/** O lead nasceu agora há pouco: a saudação é disparada pela primeira mensagem. */
export const SEGUNDOS_LEAD_NOVO = 12;
/** O cliente acabou de escrever: a mensagem de ausência ou saudação responde na hora. */
export const SEGUNDOS_RESPOSTA_INSTANTANEA = 5 + SEGUNDOS_PARA_A_SAUDACAO;
const HORAS_SEM_FALA_DO_CORRETOR = 24;

export function ehSaudacaoAutomatica(params: {
  agora: Date;
  leadCriadoEm: string | null;
  ultimaFalaDoClienteEm: string | null;
  ultimaFalaDoCorretorEm: string | null;
}): boolean {
  const agora = params.agora.getTime();
  const segundosDesde = (iso: string | null) => {
    if (!iso) return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? (agora - t) / 1000 : Number.POSITIVE_INFINITY;
  };

  if (segundosDesde(params.ultimaFalaDoCorretorEm) < HORAS_SEM_FALA_DO_CORRETOR * 3600) return false;

  return (
    segundosDesde(params.leadCriadoEm) <= SEGUNDOS_LEAD_NOVO ||
    segundosDesde(params.ultimaFalaDoClienteEm) <= SEGUNDOS_RESPOSTA_INSTANTANEA
  );
}
