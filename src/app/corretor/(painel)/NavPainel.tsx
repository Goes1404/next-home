"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { destinoAtivo, gruposVisiveis, subitemAtivo } from "./_componentes/navegacao";

/**
 * Barra lateral do painel (desktop).
 *
 * Substitui a fileira de treze pílulas que rolava na horizontal: a partir da
 * sétima aba o destino ficava fora da tela sem nenhum sinal de que existia,
 * e "Equipe" — a última — era invisível para o gestor que nunca arrastou a
 * barra. Empilhado e agrupado, o painel inteiro cabe de uma vez.
 *
 * ## Os subtópicos só aparecem sob o destino ABERTO
 *
 * Abrir todos de uma vez devolveria a lista de treze que esta barra veio
 * desfazer — só que na vertical. Aberto um por vez, o menu continua cabendo
 * numa olhada e a hierarquia aparece onde ela importa: onde a pessoa está.
 *
 * Quem decide o destino aberto é `destinoAtivo`, e não `itemAtivo`: com
 * subtópicos passou a haver rota em que dois itens acendem
 * (`/corretor/imoveis/criar-imagem` é subtópico de Marketing e casa por
 * prefixo com Imóveis), e dois itens acesos não dizem onde a pessoa está.
 */
export function NavPainel({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const grupos = gruposVisiveis(ehGestor);
  const dono = destinoAtivo(atual);

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
                const ativa = dono?.href === item.href;
                const Icone = item.icone;
                const subs = ativa ? (item.subitens ?? []) : [];
                const subAtivo = ativa ? subitemAtivo(atual, item) : null;
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

                    {subs.length > 0 && (
                      /* Recuo alinhado ao rótulo do pai (ícone 18px + gap 12px)
                         e uma régua vertical: é o recuo que diz "isto pertence
                         àquilo", por isso subtópico não leva ícone — cinco
                         símbolos repetidos seriam ruído, não hierarquia. */
                      <ul className="border-linha mt-0.5 ml-[1.65rem] space-y-px border-l pl-3">
                        {subs.map((sub) => {
                          const aberto = subAtivo?.href === sub.href;
                          return (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                aria-current={aberto ? "page" : undefined}
                                className={cn(
                                  "block rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                                  aberto
                                    ? "text-acento-suave font-medium"
                                    : "text-apoio hover:text-titulo hover:bg-vidro",
                                )}
                              >
                                {sub.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
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
