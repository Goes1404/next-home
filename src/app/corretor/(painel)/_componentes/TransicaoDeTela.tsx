"use client";

import { usePathname } from "next/navigation";

/**
 * A chegada de cada tela do painel.
 *
 * Até 29/10/2026 era a View Transitions API (`<ViewTransition>` do React):
 * o navegador fotografava a página inteira, velha e nova, e animava as duas
 * fotos. No Android de entrada isso custa caro (duas texturas do tamanho da
 * tela a cada toque no menu) e era o que mais pesava na troca de tela do app
 * ("deixe o app leve, rápido, sem tirar qualidade").
 *
 * Agora: o contêiner é chaveado pela ROTA, então remonta a cada navegação, e
 * a classe `tela-entra` (globals.css) faz uma chegada só de opacidade e
 * subida curta — nada de foto. Na troca de SEÇÃO passa por cima a onda da
 * Astro (`OndaDeTransicao`, no layout raiz), que cobre o corte.
 *
 * Filtro na URL, `router.refresh()` e o polling das conversas não mudam a
 * rota: não remontam nada e não animam nada, como antes.
 */
export function TransicaoDeTela({ children }: { children: React.ReactNode }) {
  const rota = usePathname();
  return (
    <div key={rota} className="tela-do-painel tela-entra min-w-0">
      {children}
    </div>
  );
}
