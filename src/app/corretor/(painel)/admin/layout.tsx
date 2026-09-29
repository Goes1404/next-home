import { exigirGestorNaPagina } from "@/lib/guardas";

/**
 * Casca da área de administração — só a guarda.
 *
 * A guarda está aqui E em cada `page.tsx` de propósito: layouts não
 * re-executam ao navegar entre rotas irmãs, então o layout sozinho protege a
 * primeira entrada e não as seguintes. Custo de repetir: uma linha por
 * página. Custo de esquecer: uma rota administrativa aberta.
 *
 * O cabeçalho NÃO mora aqui: cada página desenha o próprio `<h1>`. A
 * navegação entre as telas de admin é só o menu lateral desde 29/09/2026
 * (a caixa de abas saiu de todas as telas). Já houve um segundo menu aqui,
 * e o resultado em produção era título duplicado e duas barras empilhadas.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirGestorNaPagina();
  return children;
}
