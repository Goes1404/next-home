"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { gruposVisiveis, itemAtivo } from "./_componentes/navegacao";

/**
 * Barra lateral do painel (desktop).
 *
 * Substitui a fileira de treze pílulas que rolava na horizontal: a partir da
 * sétima aba o destino ficava fora da tela sem nenhum sinal de que existia,
 * e "Equipe" — a última — era invisível para o gestor que nunca arrastou a
 * barra. Empilhado e agrupado, o painel inteiro cabe de uma vez.
 */
export function NavPainel({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const grupos = gruposVisiveis(ehGestor);

  return (
    <nav aria-label="Seções do painel" className="hidden md:block">
      {/* Desconta a altura do cabeçalho grudente (`--painel-header-h`): com
          `top-6` os primeiros itens escorregavam por baixo dele ao rolar. */}
      <div className="sticky top-[calc(var(--painel-header-h)+1.5rem)] space-y-6">
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            {/* Título de grupo só quando há mais de um grupo. Para o corretor
                comum sobrou um só, e um rótulo "TRABALHO" sozinho em cima de
                tudo não separa nada de nada — é ruído com aparência de
                estrutura. O gestor, que tem dois, continua vendo os dois. */}
            {grupos.length > 1 && (
              <p className="text-tenue px-3 pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
                {grupo.titulo}
              </p>
            )}
            <ul className="space-y-0.5">
              {grupo.itens.map((item) => {
                const ativa = itemAtivo(atual, item);
                const Icone = item.icone;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={ativa ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                        ativa
                          ? "bg-acento-lavado text-acento-suave font-medium"
                          : "text-apoio hover:bg-vidro hover:text-titulo",
                      )}
                    >
                      {/* Régua à esquerda: marca a seção aberta sem depender
                          só da cor, que some para quem não distingue verde. */}
                      <span
                        aria-hidden
                        className={cn(
                          "bg-acento absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity",
                          ativa ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <Icone aria-hidden className="h-[18px] w-[18px] shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
