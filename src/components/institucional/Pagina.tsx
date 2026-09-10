/**
 * A casca de toda página institucional abaixo da home.
 *
 * O header do grupo é `fixed`, então o conteúdo precisa nascer abaixo dele
 * (`pt-28 sm:pt-32`) — e o fundo é OPACO a partir daqui, como na home depois
 * do herói: é o que permite bandas de seção. Sem um fundo próprio, tudo
 * flutuava translúcido sobre o vídeo e nenhuma seção se separava da outra.
 *
 * Existe para que as páginas não repitam essas duas decisões cada uma do
 * seu jeito — até 10/09/2026 havia `pt-32`, `pt-28 sm:pt-36`, `pt-32 pb-24`
 * e `px-4 pt-28 pb-20` em páginas irmãs.
 */
export function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className="flex flex-1 flex-col">
      <div className="bg-fundo relative pt-28 sm:pt-32">{children}</div>
    </main>
  );
}
