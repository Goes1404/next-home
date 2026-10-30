"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegação da área do ADM (30/10/2026, pedido do dono: "arrume a
 * responsividade do desktop").
 *
 * Antes, oito botões numa linha só (`sm:flex-row`, sem quebra) no topo de
 * /plataforma vazavam para a direita no computador. Agora:
 *   - computador (lg+): barra lateral fixa à esquerda, com a página atual
 *     marcada;
 *   - celular e tablet: uma faixa de atalhos que rola de lado, logo abaixo
 *     do cabeçalho.
 * Mesma lista nos dois; `ITENS_DA_PLATAFORMA` é a fonte única.
 */
export const ITENS_DA_PLATAFORMA: { href: string; rotulo: string; exato?: boolean }[] = [
  { href: "/plataforma", rotulo: "Contas", exato: true },
  { href: "/plataforma/pedidos", rotulo: "Pedidos de contratação" },
  { href: "/plataforma/suporte", rotulo: "Suporte e contato" },
  { href: "/plataforma/indicacoes", rotulo: "Indicações" },
  { href: "/plataforma/avisos", rotulo: "Avisos aos clientes" },
  { href: "/plataforma/acessos", rotulo: "Buscar acesso" },
  { href: "/plataforma/administradores", rotulo: "Administradores" },
];

export function itemAtivo(caminho: string, item: { href: string; exato?: boolean }): boolean {
  if (item.exato) return caminho === item.href || caminho.startsWith("/plataforma/grupos");
  return caminho === item.href || caminho.startsWith(`${item.href}/`);
}

function classeDoItem(ativo: boolean, lateral: boolean): string {
  const base = "text-fluid-sm flex min-h-11 items-center rounded-xl px-3 transition-colors";
  const estado = ativo ? "bg-acento-lavado text-titulo font-semibold" : "text-corpo hover:bg-vidro hover:text-titulo";
  return `${base} ${estado} ${lateral ? "w-full" : "shrink-0 whitespace-nowrap border border-linha"}`;
}

export function NavLateralDaPlataforma() {
  const caminho = usePathname() ?? "/plataforma";
  return (
    <nav aria-label="Áreas da plataforma" className="sticky top-20 flex flex-col gap-1">
      {ITENS_DA_PLATAFORMA.map((item) => {
        const ativo = itemAtivo(caminho, item);
        return (
          <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined} className={classeDoItem(ativo, true)}>
            {item.rotulo}
          </Link>
        );
      })}
      <div className="border-linha mt-3 flex flex-col gap-2 border-t pt-4">
        <Link
          href="/plataforma/grupos/novo/imobiliaria"
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 items-center justify-center rounded-xl px-3 font-medium"
        >
          Nova conta de equipe
        </Link>
        <Link
          href="/plataforma/grupos/novo/independente"
          className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center px-3 font-medium"
        >
          Novo profissional autônomo
        </Link>
      </div>
    </nav>
  );
}

export function NavFaixaDaPlataforma() {
  const caminho = usePathname() ?? "/plataforma";
  return (
    <nav aria-label="Áreas da plataforma" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
      {ITENS_DA_PLATAFORMA.map((item) => {
        const ativo = itemAtivo(caminho, item);
        return (
          <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined} className={classeDoItem(ativo, false)}>
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
