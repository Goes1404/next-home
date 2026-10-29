/**
 * A chegada de cada tela da plataforma (29/10/2026): o mesmo "sobe e acende"
 * do painel (`plataforma-tela` em `globals.css`). `template`, e não o
 * layout, porque o template remonta a cada navegação — e é a remontagem que
 * faz a animação rodar de novo.
 */
export default function PlataformaTemplate({ children }: { children: React.ReactNode }) {
  return <div className="plataforma-tela">{children}</div>;
}
