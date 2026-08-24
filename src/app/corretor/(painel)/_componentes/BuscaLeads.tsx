"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A busca das abas de leads — uma só, igual em lista, funil e visitas.
 *
 * Antes ela existia apenas na lista, e trocar de aba era perder o termo. Um
 * corretor que procura "Juliana" na lista e abre o funil espera continuar
 * vendo a Juliana: quem busca está atrás de UMA pessoa, e a aba é só o
 * ângulo pelo qual ele quer olhar para ela.
 *
 * O termo mora na URL (`?busca=`), então: sobrevive ao trocar de aba (as
 * abas carregam o parâmetro adiante), pode ser compartilhado, e o servidor
 * é quem filtra — a busca não depende do que já foi baixado para a tela.
 */
export function BuscaLeads({
  placeholder = "Buscar por nome ou telefone",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const buscaNaUrl = params.get("busca") ?? "";
  const [texto, setTexto] = useState(buscaNaUrl);

  /*
   * A URL pode mudar por fora — trocar de aba, voltar no histórico — e o
   * campo precisa acompanhar, senão mostraria um termo que já não está em
   * vigor.
   *
   * Ajuste durante o render (o padrão do React para estado derivado), e não
   * um efeito: o efeito rodaria DEPOIS de pintar, então o campo apareceria
   * por um quadro com o texto velho.
   */
  const [urlAnterior, setUrlAnterior] = useState(buscaNaUrl);
  if (buscaNaUrl !== urlAnterior) {
    setUrlAnterior(buscaNaUrl);
    setTexto(buscaNaUrl);
  }

  // Espera a digitação parar antes de consultar o servidor. O guard evita
  // reescrever a URL quando nada mudou — e com ele o efeito acima não entra
  // em laço com este.
  useEffect(() => {
    if (texto === buscaNaUrl) return;
    const timer = setTimeout(() => {
      const proximos = new URLSearchParams(params.toString());
      if (texto) proximos.set("busca", texto);
      else proximos.delete("busca");
      const qs = proximos.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 400);
    return () => clearTimeout(timer);
  }, [texto, buscaNaUrl, params, pathname, router]);

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="text-tenue pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
      />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border pr-10 pl-10 focus:outline-none"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          aria-label="Limpar busca"
          className="text-tenue hover:text-titulo absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
