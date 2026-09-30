"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { destinoAtivo, ehPasta, gruposVisiveis, moduloDoTopico, subitemAtivo } from "./_componentes/navegacao";
import { useContadoresDoMenu } from "./_componentes/contadoresDoMenu";
import { MarcaDoMenu, temPendencia } from "./_componentes/MarcaDoMenu";
import { CarregandoLink } from "./_componentes/CarregandoLink";

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
 * (`/corretor/imoveis/criar-imagem` é subtópico da Assistente e casa por
 * prefixo com Imóveis), e dois itens acesos não dizem onde a pessoa está.
 */
export function NavPainel({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const grupos = gruposVisiveis(ehGestor);
  const dono = destinoAtivo(atual);
  const marcas = useContadoresDoMenu();

  // Pasta aberta à mão nesta rota; ao navegar, volta a ser a da rota nova.
  const [manual, setManual] = useState<{ rota: string | null; href: string | null } | null>(null);
  const expandido = manual && manual.rota === atual ? manual.href : (dono?.href ?? null);
  const alternar = (href: string) => setManual({ rota: atual, href: expandido === href ? null : href });

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
                const pasta = ehPasta(item);
                const aberta = pasta && expandido === item.href;
                const subs = aberta ? (item.subitens ?? []) : [];
                const subAtivo = ativa ? subitemAtivo(atual, item) : null;
                const classes = cn(
                  "group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-2 py-1.5 text-[15px] transition-colors",
                  /*
                   * Tópico ativo é SÓLIDO, igual ao da gaveta do celular
                   * (06/09/2026, pedido do usuário: "deixe mais visível qual
                   * está selecionado"). O `bg-acento-lavado` de antes era
                   * acento a ~10% sobre um fundo já translúcido — no claro
                   * ele praticamente empatava com o hover, e a barra inteira
                   * parecia não ter seleção nenhuma. A gaveta e as abas já
                   * eram sólidas; era a lateral que destoava das duas.
                   */
                  ativa
                    ? "bg-acento text-sobre-cor font-medium"
                    : "text-apoio hover:bg-vidro hover:text-titulo",
                  pasta && "w-full cursor-pointer text-left",
                );
                const miolo = (
                  <>
                    {/* Régua à esquerda: marca a seção aberta sem depender
                        só da cor, que some para quem não distingue verde.
                        Sobre o fundo sólido ela é CLARA — em `bg-acento` uma
                        régua `bg-acento` seria invisível. */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity",
                        ativa ? "bg-sobre-cor opacity-90" : "bg-acento opacity-0",
                      )}
                    />
                    {/* O ícone num quadradinho na cor da PRÓPRIA seção (30/09/2026):
                        o menu vira a legenda das cores do painel. No ativo,
                        o fundo já é sólido e o quadradinho só clareia. */}
                    <span
                      aria-hidden
                      data-modulo={moduloDoTopico(item.href) ?? undefined}
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
                        ativa ? "bg-white/20" : "bg-acento-lavado text-acento-suave",
                      )}
                    >
                      <Icone className="h-[18px] w-[18px]" />
                    </span>
                    {item.label}
                    {/* Pasta fechada: um ponto diz que há pendência lá dentro,
                        já que os números moram nos subtópicos escondidos. */}
                    {pasta && !aberta && temPendencia((item.subitens ?? []).map((s) => s.href), marcas) && (
                      <span
                        aria-hidden
                        className={cn("ml-auto size-2 shrink-0 rounded-full", ativa ? "bg-sobre-cor" : "bg-acento")}
                      />
                    )}
                    {!pasta && <MarcaDoMenu marca={marcas[item.href]} sobreSolido={ativa} />}
                    {pasta && (
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform motion-reduce:transition-none",
                          // A seta vai para a direita sozinha só quando não há
                          // ponto de pendência antes dela.
                          !(!aberta && temPendencia((item.subitens ?? []).map((s) => s.href), marcas)) && "ml-auto",
                          aberta && "rotate-90",
                        )}
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    )}
                  </>
                );
                return (
                  <li key={item.href}>
                    {pasta ? (
                      /* Pasta: tocar ABRE, não navega. Quem tem página é o
                         subtópico (o primeiro deles é a própria tela do tópico). */
                      <button
                        type="button"
                        onClick={() => alternar(item.href)}
                        aria-expanded={aberta}
                        className={classes}
                      >
                        {miolo}
                      </button>
                    ) : (
                      <Link href={item.href} aria-current={ativa ? "page" : undefined} className={classes}>
                        {miolo}
                        <CarregandoLink />
                      </Link>
                    )}

                    {subs.length > 0 && (
                      /* Recuo alinhado ao rótulo do pai (ícone 18px + gap 12px)
                         e uma régua vertical: é o recuo que diz "isto pertence
                         àquilo", por isso subtópico não leva ícone — cinco
                         símbolos repetidos seriam ruído, não hierarquia. */
                      <ul className="border-linha mt-1 mb-1 ml-6 space-y-px border-l pl-3">
                        {subs.map((sub, i) => {
                          const aberto = subAtivo?.href === sub.href;
                          const IconeSub = sub.icone;
                          // Título de seção quando ela muda (Administração:
                          // Equipe · Negócio · Sistema).
                          const novaSecao = sub.secao && sub.secao !== subs[i - 1]?.secao;
                          return (
                            <li key={sub.href}>
                              {novaSecao && (
                                <p className="text-tenue px-2 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
                                  {sub.secao}
                                </p>
                              )}
                              <Link
                                href={sub.href}
                                aria-current={aberto ? "page" : undefined}
                                className={cn(
                                  "relative flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] transition-colors",
                                  /* O subtópico aberto ganhou FUNDO: só a cor
                                     do texto não vencia a régua vertical ao
                                     lado, e numa lista de seis a linha atual
                                     se perdia. Mesmo lavado da gaveta. */
                                  aberto
                                    ? "bg-acento-lavado text-acento-suave font-medium"
                                    : "text-apoio hover:text-titulo hover:bg-vidro",
                                )}
                              >
                                {IconeSub && <IconeSub aria-hidden className="h-4 w-4 shrink-0 opacity-80" />}
                                {sub.label}
                                <MarcaDoMenu marca={marcas[sub.href]} />
                                <CarregandoLink />
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
