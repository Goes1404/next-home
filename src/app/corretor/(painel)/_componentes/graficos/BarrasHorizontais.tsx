import Link from "next/link";

/**
 * Barras deitadas do painel (28/09/2026) — o formato de quase todo gráfico
 * daqui, porque os rótulos são nomes (etapa, canal, imóvel) e nome deitado se
 * lê no celular; barra em pé exigiria rótulo girado.
 *
 * Régua da casa (dataviz): barra fina (10px, bem abaixo do teto de 24),
 * ponta arredondada e base reta, crescendo de uma linha só; UMA cor por
 * gráfico quando a série é uma (a do módulo, `bg-acento`); cor de estado só
 * quando o valor É estado, e sempre com o rótulo escrito ao lado. O texto
 * nunca usa a cor da barra: valor e rótulo ficam na tinta do texto.
 *
 * Cada linha pode ser um link: tocar abre a lista por trás do número. É o
 * que transforma o gráfico em decisão — número que não leva a lugar nenhum
 * obriga a refazer o filtro à mão.
 *
 * HTML, não SVG: a barra é uma `div` com largura em %, então encolhe junto
 * com a tela sem cálculo, e o valor escrito ao lado já é a "tabela" do
 * gráfico para leitor de tela.
 */

export type TomDaBarra = "acento" | "ok" | "alerta" | "perigo" | "apagado";

const COR: Record<TomDaBarra, string> = {
  acento: "bg-acento",
  ok: "bg-ok",
  alerta: "bg-alerta",
  perigo: "bg-perigo",
  apagado: "bg-linha-forte",
};

export type LinhaDaBarra = {
  chave: string;
  rotulo: string;
  valor: number;
  /** O que aparece à direita; o padrão é o próprio número. */
  textoDoValor?: string;
  /** Linha pequena embaixo do rótulo (ex.: "72% do passo anterior"). */
  detalhe?: string;
  href?: string;
  tom?: TomDaBarra;
  /** Realça esta linha (ex.: o maior vazamento). */
  destaque?: boolean;
};

export function BarrasHorizontais({
  linhas,
  rotulo,
  maximo,
}: {
  linhas: LinhaDaBarra[];
  /** Nome do gráfico para leitor de tela. */
  rotulo: string;
  /** Escala fixa; o padrão é o maior valor. */
  maximo?: number;
}) {
  const topo = Math.max(1, maximo ?? Math.max(0, ...linhas.map((l) => l.valor)));

  return (
    <ul aria-label={rotulo} className="space-y-1">
      {linhas.map((l) => {
        const largura = l.valor <= 0 ? 0 : Math.max(2, Math.round((l.valor / topo) * 100));
        const conteudo = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-fluid-sm text-corpo min-w-0 break-words">
                {l.rotulo}
                {l.destaque && (
                  <span className="text-fluid-xs text-alerta ml-2 font-medium">● atenção</span>
                )}
              </span>
              <span className="text-fluid-sm text-titulo shrink-0 font-semibold tabular-nums">
                {l.textoDoValor ?? l.valor.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="mt-1.5 h-2.5" aria-hidden>
              <div
                className={`${COR[l.tom ?? "acento"]} h-full rounded-r-[4px] transition-[width] duration-700 motion-reduce:transition-none`}
                style={{ width: `${largura}%` }}
              />
            </div>
            {l.detalhe && <p className="text-fluid-xs text-apoio mt-1">{l.detalhe}</p>}
          </>
        );
        return (
          <li key={l.chave}>
            {l.href ? (
              <Link
                href={l.href}
                title={`${l.rotulo}: ${l.textoDoValor ?? l.valor}`}
                className="hover:bg-vidro focus-visible:bg-vidro active:bg-vidro-forte -mx-2 block min-h-11 rounded-lg px-2 py-2 transition-colors"
              >
                {conteudo}
              </Link>
            ) : (
              <div className="py-2">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

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
