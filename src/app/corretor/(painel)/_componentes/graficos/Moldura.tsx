/**
 * A moldura comum dos gráficos do painel (28/09/2026). Cada gráfico escolhe a
 * própria forma pela pergunta que responde (funil, faixa de espera, cartões
 * por canal, placar, ranking com foto, medidor); o que se repete é só isto:
 * o título que é a pergunta e o estado vazio que explica o que falta.
 */

/**
 * O gráfico sem dado ainda. Zero sozinho parece defeito; aqui a frase diz o
 * que falta acontecer para o gráfico aparecer.
 */
export function GraficoVazio({ texto }: { texto: string }) {
  return (
    <p className="text-fluid-sm text-apoio border-linha rounded-xl border border-dashed px-4 py-6 text-center">
      {texto}
    </p>
  );
}

/** Moldura comum: título que é a PERGUNTA, subtítulo com o recorte. */
export function CartaoDeGrafico({
  titulo,
  subtitulo,
  children,
  rodape,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <section className="cartao space-y-4 p-4 sm:p-5">
      <header>
        <h2 className="text-fluid-base text-titulo font-medium">{titulo}</h2>
        {subtitulo && <p className="text-fluid-xs text-apoio mt-1">{subtitulo}</p>}
      </header>
      {children}
      {rodape && <div className="text-fluid-xs text-apoio">{rodape}</div>}
    </section>
  );
}
