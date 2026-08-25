import { exigirGestorNaPagina } from "@/lib/guardas";

/**
 * Casca da área de administração — só a guarda.
 *
 * A guarda está aqui E em cada `page.tsx` de propósito: layouts não
 * re-executam ao navegar entre rotas irmãs, então o layout sozinho protege a
 * primeira entrada e não as seguintes. Custo de repetir: uma linha por
 * página. Custo de esquecer: uma rota administrativa aberta.
 *
 * O cabeçalho e a navegação NÃO moram aqui: cada página desenha o próprio
 * `<h1>` e o `AbasAdmin` (que inclui Preços — rota fora deste segmento, e é
 * por isso que uma nav no layout nunca conseguiria listá-la com estado
 * ativo). Já houve um segundo menu aqui, e o resultado em produção era
 * título duplicado e duas barras de abas empilhadas em toda tela de admin.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirGestorNaPagina();
  return children;
}
