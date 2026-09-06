import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * As telas de administração, num destino só.
 *
 * Eram seis itens ocupando o menu do gestor — e o gestor também é corretor:
 * ele atende lead, responde WhatsApp e, de vez em quando, administra. Seis
 * itens de administração competindo com o trabalho do dia invertem essa
 * proporção na tela.
 *
 * A lista vem de `subitensDe`, a mesma que o sidebar desenha.
 */
export function AbasAdmin({ ativa }: { ativa: string }) {
  const abas = subitensDe("/corretor/admin").map((sub) => ({
    href: sub.href,
    label: sub.label,
  }));

  return <AbasSecao abas={abas} ativa={ativa} rotulo="Seções da administração" />;
}
