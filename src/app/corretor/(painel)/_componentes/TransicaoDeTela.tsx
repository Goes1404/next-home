"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * A troca de tela do painel: a que sai esmaece subindo, a que entra chega
 * de baixo (`painel-sai` / `painel-entra` em `globals.css`).
 *
 * É a View Transitions API pelo `<ViewTransition>` do React — o mesmo que a
 * vitrine já usa para a capa do imóvel. O navegador anima duas FOTOGRAFIAS
 * da região, então o `translate` da animação não toca no DOM vivo: nenhum
 * containing block é criado, e os componentes `fixed` que nascem dentro das
 * telas (folha de ações, barra de salvar, modal) não são afetados. Foi por
 * essa armadilha que a entrada do site público é só opacidade.
 *
 * A chave é a ROTA, e isso decide o que anima: navegar entre telas, sim;
 * mudar um filtro na URL, `router.refresh()` depois de uma ação e o polling
 * das conversas, não — `default="none"` cala qualquer atualização que não
 * seja a troca do nó chaveado. Sem a chave, cada refresh cruzaria a tela
 * inteira em fade, e a tela de Conversas piscaria a cada tique.
 *
 * Navegador sem a API só não anima; a navegação segue igual.
 */
export function TransicaoDeTela({ children }: { children: React.ReactNode }) {
  const rota = usePathname();
  return (
    <ViewTransition key={rota} enter="painel-entra" exit="painel-sai" default="none">
      <div className="min-w-0">{children}</div>
    </ViewTransition>
  );
}
