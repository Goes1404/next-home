import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * As telas de Imóveis: o catálogo, o que falta cadastrar e os links por
 * imóvel.
 *
 * Nasceu em 04/09/2026, quando "Links por imóvel" virou subtópico daqui: até
 * então as três telas se alcançavam por chip no cabeçalho ou por cartão no
 * meio da página, e cada uma dizia de um jeito onde estavam as outras.
 *
 * Deriva de `subitensDe`, como as outras barras — uma fonte só para menu,
 * gaveta e abas. Barra escrita à mão é o que fazia Campanhas desenhar abas de
 * WhatsApp enquanto o menu a acendia em Marketing (`navegacao.test.ts` trava
 * isso lendo o código: a versão derivada nunca escreve rótulo).
 */
export function AbasImoveis({ ativa, aCadastrar }: { ativa: string; aCadastrar?: number }) {
  const abas = subitensDe("/corretor/imoveis").map((sub) => ({
    href: sub.href,
    label: sub.label,
    /** Quantos imóveis esperam cadastro — ficha incompleta ou lançamento novo. */
    contador: sub.href === "/corretor/imoveis/candidatos" ? aCadastrar : undefined,
  }));

  return <AbasSecao abas={abas} ativa={ativa} rotulo="Seções de imóveis" />;
}
