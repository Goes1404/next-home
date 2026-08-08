/**
 * Esqueleto da listagem.
 *
 * A listagem é a única rota de empreendimento renderizada sob demanda (os
 * detalhes são estáticos), então é a única onde existe espera real a
 * preencher. As proporções abaixo espelham as do conteúdo final para a
 * troca não empurrar o layout.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col bg-ink-950 px-4 pt-28 pb-20">
      <div className="mx-auto w-full max-w-5xl animate-pulse">
        <div className="h-9 w-64 rounded-lg bg-white/10" />
        <div className="mt-3 h-5 w-80 max-w-full rounded-lg bg-white/5" />
        <div className="mt-6 hidden h-28 rounded-2xl border border-white/10 bg-ink-900/60 sm:block" />
      </div>

      <div className="mx-auto mt-10 grid w-full max-w-5xl animate-pulse gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
            <div className="aspect-[4/3] w-full bg-white/5" />
            <div className="px-5 py-4">
              <div className="h-5 w-40 rounded bg-white/10" />
              <div className="mt-2 h-4 w-28 rounded bg-white/5" />
              <div className="mt-3 h-4 w-32 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Carregando empreendimentos…
      </span>
    </main>
  );
}
