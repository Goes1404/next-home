import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";

/**
 * Como a TELA mostra a conversa que nunca foi liberada.
 *
 * A regra de guardar está em `privacidadeDaConversa.ts` e continua valendo:
 * conversa sem atendimento autorizado guarda a LINHA, não o texto — o número
 * da instância é o WhatsApp pessoal do corretor, e o painel não precisa de
 * cópia da vida particular de ninguém.
 *
 * O que faltava era o outro lado. `TEXTO_NAO_GUARDADO` existe para a linha em
 * branco não parecer defeito, e isso funciona quando há UMA; repetido
 * cinquenta vezes ele vira uma parede que não informa nada — o corretor abre a
 * conversa, lê o mesmo colchete até o fim da tela e não descobre por que, nem
 * o que fazer a respeito.
 *
 * Módulo PURO e SEPARADO da regra de gravação de propósito: quem decide o que
 * guardar é o webhook, quem decide como mostrar é a tela, e as duas pontas têm
 * de reconhecer o marcador pela MESMA constante. Comparar com o literal
 * copiado é exatamente como duas cópias do mesmo texto divergem no dia em que
 * alguém melhora a frase.
 */
export function naoFoiGravada(conteudo: string): boolean {
  return conteudo === TEXTO_NAO_GUARDADO;
}

/**
 * Nenhuma mensagem tem texto — a conversa inteira aconteceu antes de alguém
 * autorizar. Aqui a tela troca os balões por uma explicação: não há o que ler,
 * e o que resolve é liberar o atendimento, não rolar mais para cima.
 *
 * Conversa VAZIA não conta. Ela não é uma conversa travada, é uma conversa que
 * ainda não começou, e o estado vazio dela é outro.
 */
export function todasSemTexto(mensagens: { conteudo: string }[]): boolean {
  return mensagens.length > 0 && mensagens.every((m) => naoFoiGravada(m.conteudo));
}

/**
 * Uma sequência de mensagens sem texto, colapsada numa linha só.
 *
 * O campo se chama `naoGravadas` e não `tipo: "lacuna"` porque a mensagem do
 * chat JÁ TEM um campo `tipo` (texto | audio | imagem | documento): usá-lo
 * como discriminador não estreitaria a união, e o TypeScript reprovaria as
 * duas metades do `map`. O nome do discriminador precisa ser exclusivo de um
 * dos lados.
 */
export type Lacuna = { naoGravadas: number };

/**
 * O caso MISTO, que é o comum de quem liberou no meio: o que tem texto segue
 * como balão, e cada sequência de não gravadas vira uma linha com a contagem.
 *
 * Esconder as não gravadas seria pior que mostrá-las: o buraco no meio da
 * conversa é informação — é ele que explica por que a IA parece ter perdido o
 * fio (`medirContexto.ts` mediu 32% das falas do cliente gravadas em branco).
 * O que não serve é repetir o mesmo marcador linha após linha.
 */
export function agruparNaoGravadas<T extends { conteudo: string }>(
  mensagens: T[],
): (T | Lacuna)[] {
  const saida: (T | Lacuna)[] = [];

  for (const mensagem of mensagens) {
    if (!naoFoiGravada(mensagem.conteudo)) {
      saida.push(mensagem);
      continue;
    }

    const ultimo = saida.at(-1);
    // Só cresce a lacuna que está ABERTA no fim da lista: mensagem com texto
    // no meio fecha a anterior e a próxima começa outra.
    if (ultimo && "naoGravadas" in ultimo) ultimo.naoGravadas += 1;
    else saida.push({ naoGravadas: 1 });
  }

  return saida;
}
