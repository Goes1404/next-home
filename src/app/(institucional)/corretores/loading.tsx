/**
 * Esqueleto da equipe.
 *
 * A rota é renderizada sob demanda (o layout institucional lê cookie para
 * saber o corretor ativo), então há espera real a preencher toda vez. As
 * proporções espelham as do card final — avatar redondo, duas linhas de
 * texto, rodapé de ação — para a troca não empurrar o layout.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
      <div className="mx-auto w-full max-w-2xl animate-pulse text-center">
        <div className="mx-auto h-4 w-28 rounded bg-white/10" />
        <div className="mx-auto mt-5 h-10 w-full max-w-lg rounded-lg bg-white/10" />
        <div className="mx-auto mt-4 h-5 w-full max-w-md rounded bg-white/5" />
      </div>

      <div className="mx-auto mt-14 grid w-full max-w-5xl animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="rounded-glass bg-ink-900/50 border border-white/10 px-5 py-5"
          >
            <div className="flex items-center gap-4">
              <div className="h-18 w-18 shrink-0 rounded-full bg-white/10" />
              <div className="min-w-0 flex-1">
                <div className="h-5 w-32 rounded bg-white/10" />
                <div className="mt-2 h-4 w-24 rounded bg-white/5" />
              </div>
            </div>
            <div className="mt-4 h-10 rounded bg-white/5" />
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="h-4 w-20 rounded bg-white/5" />
              <div className="h-11 w-32 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Carregando a equipe…
      </span>
    </main>
  );
}
