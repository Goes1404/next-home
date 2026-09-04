"use client";

import { useSearchParams } from "next/navigation";
import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * As visões da mesma carteira — lista, quadro, agenda e entrada — como abas
 * de uma tela só.
 *
 * A lista de abas vem de `subitensDe`, não daqui: até 04/09/2026 cada barra
 * de abas mantinha a própria cópia, e as cópias divergiram do menu. Agora
 * quem acrescenta um subtópico em `navegacao.tsx` o vê aparecer nos dois
 * lugares, por construção.
 *
 * Client component por um motivo só: LEVAR A BUSCA ADIANTE. Quem procurou
 * "Juliana" na lista e abre o funil está atrás da mesma pessoa — perder o
 * termo na troca de aba transformaria a busca num trabalho a refazer.
 */

/** A aba de entrada não filtra nada — levar a busca até ela seria ruído. */
const NAO_BUSCAM = new Set(["/corretor/importar"]);

export function AbasLeads({ ativa, visitas }: { ativa: string; visitas?: number }) {
  const params = useSearchParams();
  const busca = params.get("busca") ?? "";

  const abas = subitensDe("/corretor/pessoas").map((sub) => ({
    href:
      busca && !NAO_BUSCAM.has(sub.href)
        ? `${sub.href}?busca=${encodeURIComponent(busca)}`
        : sub.href,
    label: sub.label,
    // Só a agenda ganha contador: é a única em que "quantos" muda o que o
    // corretor faz agora — três visitas hoje é um dia diferente de nenhuma.
    contador: sub.href === "/corretor/visitas" ? visitas : undefined,
  }));

  // A busca entra no href, então comparar por prefixo é o que casa a aba ativa.
  const ativaHref = abas.find((a) => a.href.startsWith(ativa))?.href ?? abas[0]?.href;

  return <AbasSecao abas={abas} ativa={ativaHref} rotulo="Visões dos leads" />;
}
