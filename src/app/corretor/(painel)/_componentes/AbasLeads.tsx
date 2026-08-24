"use client";

import { useSearchParams } from "next/navigation";
import { AbasSecao } from "./AbasSecao";

/**
 * As visões da mesma carteira — lista, quadro, agenda e entrada — como abas
 * de uma tela só.
 *
 * Existe porque a navegação encolheu: Funil, Visitas e Adicionar saíram do
 * menu e passaram a morar "dentro" de Leads. As rotas continuam as mesmas
 * (nenhum link salvo quebra); o que muda é como o corretor chega.
 *
 * Client component por um motivo só: LEVAR A BUSCA ADIANTE. Quem procurou
 * "Juliana" na lista e abre o funil está atrás da mesma pessoa — perder o
 * termo na troca de aba transformaria a busca num trabalho a refazer.
 */
const ABAS = [
  { chave: "lista", href: "/corretor/leads", label: "Lista" },
  { chave: "funil", href: "/corretor/funil", label: "Funil" },
  { chave: "visitas", href: "/corretor/visitas", label: "Visitas" },
  // Adicionar lead é rotina de quem trabalha a carteira, não visita rara:
  // vira aba junto com as visões, em vez de um "← voltar" próprio.
  { chave: "adicionar", href: "/corretor/importar", label: "Adicionar" },
] as const;

export type AbaLeads = (typeof ABAS)[number]["chave"];

/** A aba de entrada não filtra nada — levar a busca até ela seria ruído. */
const ABAS_QUE_BUSCAM: readonly AbaLeads[] = ["lista", "funil", "visitas"];

export function AbasLeads({ ativa, visitas }: { ativa: AbaLeads; visitas?: number }) {
  const params = useSearchParams();
  const busca = params.get("busca") ?? "";

  const abas = ABAS.map((aba) => ({
    href:
      busca && ABAS_QUE_BUSCAM.includes(aba.chave)
        ? `${aba.href}?busca=${encodeURIComponent(busca)}`
        : aba.href,
    label: aba.label,
    // Só a agenda ganha contador: é a única em que "quantos" muda o que o
    // corretor faz agora — três visitas hoje é um dia diferente de nenhuma.
    contador: aba.chave === "visitas" ? visitas : undefined,
  }));

  const indiceAtivo = ABAS.findIndex((a) => a.chave === ativa);
  const ativaHref = abas[indiceAtivo === -1 ? 0 : indiceAtivo].href;

  return <AbasSecao abas={abas} ativa={ativaHref} rotulo="Visões dos leads" />;
}
