/**
 * Os blocos cinza que seguram o lugar enquanto o dado não chegou.
 *
 * O painel não tinha NENHUM `loading.tsx` nem `<Suspense>`: toda navegação
 * ficava com a tela anterior parada até o servidor terminar de responder, e o
 * Início ainda esperava três leituras e depois, em série, uma fila de cinco
 * consultas. Nada indicava que algo estava acontecendo — o corretor tocava de
 * novo, achando que o toque não pegou.
 *
 * O esqueleto tem a FORMA do que vem: mesma altura, mesmo raio, mesmo número
 * de linhas. Um retângulo genérico marcaria a espera, mas a tela pularia ao
 * trocar o conteúdo — e salto de layout parece defeito.
 */

export function Esqueleto({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`bg-veu/10 block animate-pulse rounded-lg motion-reduce:animate-none ${className}`}
    />
  );
}

/** Uma seção em cartão, com título e algumas linhas. */
export function EsqueletoCartao({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
      <Esqueleto className="h-5 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Esqueleto className="h-11 w-1 shrink-0 rounded-r-full" />
            <Esqueleto className="h-4 flex-1" />
            <Esqueleto className="h-9 w-9 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * O aviso para quem usa leitor de tela. O esqueleto é `aria-hidden` — uma
 * pilha de retângulos não é informação —, então sem isto a espera seria
 * silêncio absoluto.
 */
export function AvisoDeCarregamento({ children = "Carregando…" }: { children?: React.ReactNode }) {
  return (
    <span role="status" className="so-para-leitor">
      {children}
    </span>
  );
}
