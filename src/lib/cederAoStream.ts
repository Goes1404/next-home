/**
 * Cede a vez ao stream: o que já foi renderizado sai para o navegador antes
 * de o resto continuar.
 *
 * Existe por causa da página do imóvel (13/09/2026). O React só emite um
 * boundary de Suspense depois que o conteúdo dele termina — e, sem nada que
 * suspenda de verdade, a página inteira termina numa passada só: o `h1` do
 * hero saía no HTML DEPOIS dos 17 KB (gzip) de dados de todas as seções, e o
 * script que o revela, no fim do documento. No celular em rede lenta o
 * título só aparecia aos 6–9 s, com a página pronta no servidor desde os
 * 120 ms.
 *
 * Um `await` de promessa já resolvida não basta: ele volta num microtask, e
 * o React só despeja o que tem quando a tarefa atual acaba. O timer de zero
 * milissegundos volta na PRÓXIMA volta do event loop, depois do `setImmediate`
 * em que o React esvazia a fila — então o hero é emitido primeiro, com o
 * boundary pendente, e as seções vêm em seguida, no mesmo stream.
 *
 * Só vale para Server Components e só faz sentido DENTRO de um `<Suspense>`:
 * fora dele, o `await` atrasa a página inteira em vez de reordená-la.
 */
export function cederAoStream(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}
