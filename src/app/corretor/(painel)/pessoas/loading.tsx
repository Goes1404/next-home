import { EsqueletoDeLista } from "../_componentes/EsqueletoDeLista";

/**
 * Pessoas era a única tela principal do painel sem `loading.tsx` (F4 do
 * roadmap de performance, 13/09/2026): ao trocar de aba para cá, a tela
 * anterior ficava parada até o RSC inteiro chegar — que é exatamente o
 * "sumiu" que o roadmap proíbe. A casca chega na hora; a lista preenche.
 */
export default function Carregando() {
  return <EsqueletoDeLista linhas={8} titulo="Carregando suas conversas…" />;
}
