import Link from "next/link";

/**
 * Várias medidas por linha (corretor, imóvel), cada coluna com a PRÓPRIA
 * escala (28/09/2026).
 *
 * É o "pequenos múltiplos" da régua de dataviz, em forma de tabela: leads,
 * visitas e vendas têm ordens de grandeza diferentes, e barra agrupada numa
 * escala só faria as vendas sumirem ao lado dos leads. Barras agrupadas
 * também pediriam três cores com legenda; aqui o cabeçalho da coluna diz o
 * que é, e a cor é uma só.
 *
 * É uma `<table>` de verdade: o leitor de tela anuncia linha e coluna, e o
 * número está escrito em cada célula — a barra é só o reforço visual.
 */

export type ColunaDaTabela = { chave: string; rotulo: string };

export type LinhaDaTabela = {
  chave: string;
  rotulo: string;
  detalhe?: string;
  href?: string;
  valores: Record<string, number>;
};

export function TabelaDeBarras({
  colunas,
  linhas,
  legenda,
}: {
  colunas: ColunaDaTabela[];
  linhas: LinhaDaTabela[];
  legenda: string;
}) {
  const maximos = Object.fromEntries(
    colunas.map((c) => [c.chave, Math.max(1, ...linhas.map((l) => l.valores[c.chave] ?? 0))]),
  );

  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">{legenda}</caption>
      <thead>
        <tr>
          <th scope="col" className="text-fluid-xs text-tenue w-[38%] pb-2 text-left font-normal">
            <span className="sr-only">Nome</span>
          </th>
          {colunas.map((c) => (
            <th key={c.chave} scope="col" className="text-fluid-xs text-tenue pb-2 pl-2 text-left font-normal">
              {c.rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.chave} className="border-linha border-t">
            <th scope="row" className="py-2.5 pr-2 text-left align-top font-normal">
              {/* `-my-3 py-3`: o alvo do toque passa de 44px sem abrir espaço entre
                  o nome e o detalhe embaixo dele. */}
              {l.href ? (
                <Link
                  href={l.href}
                  className="text-fluid-sm text-titulo hover:decoration-current -my-3 block break-words py-3 underline decoration-transparent underline-offset-4 transition-colors"
                >
                  {l.rotulo}
                </Link>
              ) : (
                <span className="text-fluid-sm text-titulo block break-words">{l.rotulo}</span>
              )}
              {l.detalhe && <span className="text-fluid-xs text-apoio block">{l.detalhe}</span>}
            </th>
            {colunas.map((c) => {
              const v = l.valores[c.chave] ?? 0;
              const largura = v <= 0 ? 0 : Math.max(4, Math.round((v / maximos[c.chave]) * 100));
              return (
                <td key={c.chave} className="py-2.5 pl-2 align-top">
                  <span className="text-fluid-sm text-titulo block font-semibold tabular-nums">
                    {v.toLocaleString("pt-BR")}
                  </span>
                  <span className="mt-1 block h-2" aria-hidden>
                    <span
                      className={`${v > 0 ? "bg-acento" : ""} block h-full rounded-r-[4px]`}
                      style={{ width: `${largura}%` }}
                    />
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
