import Link from "next/link";
import {
  contarPorTipo,
  pendenciasDoCatalogo,
  type ImovelDoCatalogo,
} from "@/lib/imoveis/pendenciasDoCatalogo";

/**
 * O que falta no catálogo para a assistente atender bem.
 *
 * ## Por que esta lista existe, e por que aqui
 *
 * Substitui o cartão que só falava de apelido (31/08). A razão é a mesma
 * que criou aquele: aviso dentro do editor do imóvel não moveu nada em
 * cinco dias, porque só é visto por quem já abriu aquela tela — e quem abre
 * um imóvel foi lá fazer outra coisa. A lista precisa morar onde alguém
 * passa, não dentro do registro que ela critica.
 *
 * Desde 04/09/2026 ela mora em "Fila de cadastro" (decisão do usuário), e
 * não mais em cima da lista de Imóveis: a fila é o subtópico dedicado a
 * "o que falta cadastrar", e ali a ficha incompleta fica ao lado dos
 * lançamentos do mercado — os dois são o mesmo trabalho. A tela de Imóveis
 * voltou a ser só o catálogo, para editar.
 *
 * O que mudou é o ESCOPO. Medido em 01/09 sobre os 25 publicados: 16 sem
 * planta, 3 sem tipologia, 23 sem apelido. Três cartões separados
 * competiriam entre si; um só, ordenado pelo estrago, é uma lista de
 * trabalho.
 *
 * ## Custo zero
 *
 * A pendência é calculada do catálogo que a tela já carrega, com `midias` e
 * `tipologias` — nenhuma consulta a mais do que a página faria de qualquer
 * jeito.
 */

const RESUMO: { chave: keyof ReturnType<typeof contarPorTipo>; rotulo: string }[] = [
  { chave: "apelido_invisivel", rotulo: "invisíveis para a assistente" },
  { chave: "sem_planta", rotulo: "sem planta" },
  { chave: "sem_tipologia", rotulo: "sem tipologia" },
  { chave: "sem_apelido", rotulo: "sem apelido" },
];

function Seta() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-tenue h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function PendenciasDoCatalogo({ imoveis }: { imoveis: readonly ImovelDoCatalogo[] }) {
  const lista = pendenciasDoCatalogo(imoveis);
  if (lista.length === 0) return null;

  const contagem = contarPorTipo(lista);

  // Os graves ficam abertos; o resto atrás de um clique. Vinte linhas é
  // lista, e lista ninguém lê.
  const graves = lista.filter((x) => x.peso <= 1);
  const resto = lista.filter((x) => x.peso > 1);

  const Linha = ({ item }: { item: (typeof lista)[number] }) => (
    <li>
      <Link
        href={`/corretor/imoveis/${item.imovel.slug}`}
        className="border-linha hover:bg-elevado flex items-center gap-3 border-t px-5 py-3 transition-colors sm:px-6"
      >
        <span className="min-w-0 flex-1">
          <span className="text-fluid-sm text-titulo block truncate font-medium">
            {item.imovel.nome}
          </span>
          <span className="text-fluid-xs text-apoio block truncate">
            {[item.imovel.bairro, item.imovel.construtora].filter(Boolean).join(" · ") ||
              "sem bairro cadastrado"}
          </span>
          <span className="text-fluid-xs text-tenue mt-0.5 block">
            {item.pendencias.map((p) => p.explicacao).join(" · ")}
          </span>
        </span>
        <Seta />
      </Link>
    </li>
  );

  return (
    <section className="border-alerta-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
      <div className="px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-titulo text-lg">
            {lista.length === 1
              ? "1 imóvel com cadastro incompleto"
              : `${lista.length} imóveis com cadastro incompleto`}
          </h2>
        </div>

        <p className="text-fluid-xs text-corpo mt-2 leading-relaxed text-pretty">
          O que falta aqui a assistente sente na conversa: ela promete a planta que não existe,
          inventa metragem quando a ficha não tem, e não reconhece o imóvel quando o cliente usa
          outro nome.
        </p>

        <ul className="text-fluid-xs text-apoio mt-3 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          {RESUMO.filter(({ chave }) => contagem[chave] > 0).map(({ chave, rotulo }) => (
            <li key={chave}>
              <strong className="text-titulo">{contagem[chave]}</strong> {rotulo}
            </li>
          ))}
        </ul>
      </div>

      {graves.length > 0 && (
        <ul className="mt-4">
          {graves.map((item) => (
            <Linha key={item.imovel.slug} item={item} />
          ))}
        </ul>
      )}

      {resto.length > 0 && (
        <details className="group">
          <summary className="text-fluid-xs text-apoio hover:text-titulo border-linha cursor-pointer list-none border-t px-5 py-3.5 transition-colors select-none sm:px-6">
            <span className="group-open:hidden">Ver os outros {resto.length}</span>
            <span className="hidden group-open:inline">Esconder os outros {resto.length}</span>
          </summary>
          <ul>
            {resto.map((item) => (
              <Linha key={item.imovel.slug} item={item} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
