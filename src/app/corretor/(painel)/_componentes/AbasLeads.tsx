import { AbasSecao } from "./AbasSecao";

/**
 * As três visões da mesma carteira — lista, quadro e agenda — apresentadas
 * como abas de uma tela só.
 *
 * Existe porque a navegação encolheu: Funil e Visitas saíram do menu e
 * passaram a morar "dentro" de Leads. As rotas continuam as mesmas (nenhum
 * link salvo quebra); o que muda é como o corretor chega.
 */
const ABAS = [
  { chave: "lista", href: "/corretor/leads", label: "Lista" },
  { chave: "funil", href: "/corretor/funil", label: "Funil" },
  { chave: "visitas", href: "/corretor/visitas", label: "Visitas" },
] as const;

export type AbaLeads = (typeof ABAS)[number]["chave"];

export function AbasLeads({ ativa, visitas }: { ativa: AbaLeads; visitas?: number }) {
  const abas = ABAS.map((aba) => ({
    href: aba.href,
    label: aba.label,
    // Só a agenda ganha contador: é a única em que "quantos" muda o que o
    // corretor faz agora — três visitas hoje é um dia diferente de nenhuma.
    contador: aba.chave === "visitas" ? visitas : undefined,
  }));

  const ativaHref = ABAS.find((a) => a.chave === ativa)?.href ?? ABAS[0].href;

  return <AbasSecao abas={abas} ativa={ativaHref} rotulo="Visões dos leads" />;
}
