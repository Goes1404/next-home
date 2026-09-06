"use client";

import { usePathname } from "next/navigation";
import { moduloAtivo } from "./_componentes/navegacao";
import { ProvedorDeAvisos } from "./_componentes/Avisos";

/**
 * Pendura no painel o atributo que decide a cor do módulo.
 *
 * Por que é client: `moduloAtivo` depende da rota, e **layout não re-executa
 * entre rotas irmãs** no App Router. Calcular isto no `layout.tsx` daria um
 * atributo VELHO — o corretor iria de Leads para WhatsApp e a tela continuaria
 * magenta. `usePathname` re-renderiza a cada navegação, e roda também no SSR,
 * então o atributo já vem no primeiro HTML: sem piscada de cor errada.
 *
 * Os filhos chegam por prop e continuam sendo Server Components — marcar o
 * wrapper como client não arrasta a árvore inteira para o cliente.
 *
 * Sem módulo reconhecido o atributo não é escrito, e o CSS cai no tom padrão
 * do painel. Escrever `data-modulo=""` acenderia o seletor `[data-modulo]`
 * com valor nenhum, que é pior que não escrever.
 *
 * A região de avisos entra aqui junto, e não num segundo wrapper: já é a
 * fronteira de cliente do painel, e duas fronteiras para o mesmo lugar da
 * árvore custam o dobro sem entregar nada.
 */
export function CromaDoModulo({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const modulo = moduloAtivo(usePathname());
  return (
    <main data-rota="painel" data-modulo={modulo ?? undefined} className={className}>
      <ProvedorDeAvisos>{children}</ProvedorDeAvisos>
    </main>
  );
}
