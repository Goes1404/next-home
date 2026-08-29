import { AbasSecao } from "./AbasSecao";

/**
 * As telas de administração, num destino só.
 *
 * Eram cinco itens ocupando metade do menu do gestor — e o gestor também é
 * corretor: ele atende lead, responde WhatsApp e, de vez em quando,
 * administra. Cinco itens de administração competindo com o trabalho do dia
 * invertem essa proporção na tela.
 */
const ABAS = [
  { chave: "geral", href: "/corretor/admin", label: "Visão geral" },
  { chave: "leads", href: "/corretor/admin/leads", label: "Leads da equipe" },
  { chave: "contas", href: "/corretor/admin/contas", label: "Contas" },
  { chave: "whatsapp", href: "/corretor/admin/whatsapp", label: "WhatsApp da equipe" },
  { chave: "anuncios", href: "/corretor/admin/anuncios", label: "Anúncios" },
  { chave: "eventos", href: "/corretor/admin/eventos", label: "Eventos" },
  { chave: "sla", href: "/corretor/admin/sla", label: "SLA" },
  { chave: "precos", href: "/corretor/precos", label: "Preços" },
] as const;

export type AbaAdmin = (typeof ABAS)[number]["chave"];

export function AbasAdmin({ ativa }: { ativa: AbaAdmin }) {
  const ativaHref = ABAS.find((a) => a.chave === ativa)?.href ?? ABAS[0].href;

  return (
    <AbasSecao
      abas={ABAS.map((a) => ({ href: a.href, label: a.label }))}
      ativa={ativaHref}
      rotulo="Seções da administração"
    />
  );
}
