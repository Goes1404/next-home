"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ITENS_DA_CONTA, rotaAtiva } from "./_componentes/navegacao";

/**
 * O menu do avatar — onde Conta passou a morar.
 *
 * Perfil e senha saíram da navegação principal porque eram o destino menos
 * visitado ocupando um dos cinco slots, e o slot liberado foi para Imóveis na
 * barra do polegar. Aqui elas ficam onde as pessoas já procuram por elas: a
 * própria foto.
 *
 * O menu guarda EM QUE ROTA foi aberto, não um booleano — assim ele fecha
 * sozinho ao navegar, sem `useEffect` de fechamento e sem re-render em
 * cascata. É o mesmo padrão da gaveta em `NavMobileBottom`.
 *
 * `Sair` recebe o formulário por prop porque a ação é um Server Action e este
 * componente é client: passar o `<form>` pronto mantém a ação no servidor sem
 * arrastar nada para o cliente.
 */
export function MenuDaConta({
  nome,
  fotoUrl,
  iniciais,
  formularioSair,
}: {
  nome: string;
  fotoUrl: string | null;
  iniciais: string;
  formularioSair: React.ReactNode;
}) {
  const rota = usePathname();
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === rota;
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAbertoEm(null);
    const aoClicarFora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAbertoEm(null);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicarFora);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicarFora);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAbertoEm(aberto ? null : rota)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="border-linha hover:border-acento-linha flex cursor-pointer items-center gap-2.5 rounded-full border py-1 pr-3 pl-1 transition-colors"
      >
        {fotoUrl ? (
          <Image
            src={fotoUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="bg-acento-lavado text-acento-suave flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
          >
            {iniciais}
          </span>
        )}
        {/* O nome cabe no desktop; no celular a inicial já identifica a conta. */}
        <span className="text-fluid-sm text-corpo hidden sm:inline">{nome}</span>
        <span className="so-para-leitor">Menu da conta</span>
      </button>

      {aberto && (
        <div
          role="menu"
          className="border-linha bg-elevado shadow-painel-alto absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border p-1.5"
        >
          {ITENS_DA_CONTA.map((item) => {
            const Icone = item.icone;
            const atual = rotaAtiva(rota, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={atual ? "page" : undefined}
                onClick={() => setAbertoEm(null)}
                className={`text-fluid-sm flex min-h-11 items-center gap-3 rounded-xl px-3 transition-colors ${
                  atual
                    ? "bg-acento-lavado text-acento-suave"
                    : "text-corpo hover:bg-vidro hover:text-titulo"
                }`}
              >
                <Icone className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <div className="border-linha mt-1.5 border-t pt-1.5">{formularioSair}</div>
        </div>
      )}
    </div>
  );
}
