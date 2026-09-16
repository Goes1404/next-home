"use client";

import {
  avaliarCompletude,
  type ChaveCategoria,
  type ImovelAvaliavel,
} from "@/lib/imoveis/completudeDoCatalogo";

/**
 * O que falta NESTE imóvel, e para qual aba ir.
 *
 * É o par do checklist da Fila de cadastro: lá se escolhe o trabalho, aqui
 * se faz. O que muda é o verbo — esta lista não ordena por urgência, ela
 * marca o que já está pronto, porque quem abriu o editor veio preencher e
 * precisa ver o progresso, não a cobrança.
 *
 * ## Por que o item que falta é BOTÃO
 *
 * O aviso que morava no editor antes só dizia o que faltava. Dizer sem levar
 * obriga o corretor a adivinhar em qual das seis abas aquilo mora, e as abas
 * têm nome de estrutura (`Mídia`, `Plantas`), não de campo. Um toque resolve.
 *
 * ## O que ele NÃO enxerga ao vivo
 *
 * Foto, book, vídeo e tour vivem no estado interno de cada editor de aba, e
 * este componente lê o que veio do banco. Eles só mudam de estado depois de
 * salvar e recarregar. Os essenciais que o corretor mais mexe — descrição,
 * preço, endereço, apelido, lazer e plantas — são estado desta tela e
 * marcam na hora.
 */

export type AbaDoEditor = "fotos" | "textos" | "book" | "midia" | "plantas" | "lazer";

/**
 * Onde cada categoria se preenche.
 *
 * `Record` exaustivo de propósito: categoria nova no módulo não compila até
 * alguém dizer para qual aba ela manda. Mapa incompleto viraria um item que
 * o corretor toca e não acontece nada.
 */
const ABA: Record<ChaveCategoria, AbaDoEditor> = {
  foto: "fotos",
  planta_imagem: "plantas",
  tipologia: "plantas",
  lazer: "lazer",
  preco: "textos",
  descricao: "textos",
  endereco: "textos",
  apelido: "textos",
  construtora: "textos",
  entrega: "textos",
  unidades: "textos",
  torres: "textos",
  andares: "textos",
  book: "book",
  video_ou_tour: "midia",
};

function Marca({ presente }: { presente: boolean }) {
  return presente ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-acento h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <span className="border-linha h-3.5 w-3.5 shrink-0 rounded-full border" aria-hidden />
  );
}

export function ChecklistDoImovel({
  imovel,
  onIr,
}: {
  imovel: ImovelAvaliavel;
  onIr: (aba: AbaDoEditor) => void;
}) {
  const { itens, essencialCompletos, essencialTotal } = avaliarCompletude(imovel);
  const essenciais = itens.filter((x) => x.categoria.faixa === "essencial");
  const complementares = itens.filter((x) => x.categoria.faixa === "complementar");

  const Item = ({ item }: { item: (typeof itens)[number] }) => {
    const { categoria, presente } = item;

    if (presente) {
      return (
        <li className="flex min-h-11 items-center gap-2">
          <Marca presente />
          <span className="text-fluid-xs text-apoio min-w-0 truncate">{categoria.rotulo}</span>
        </li>
      );
    }

    return (
      <li>
        <button
          type="button"
          onClick={() => onIr(ABA[categoria.chave])}
          title={categoria.explicacao}
          className="hover:bg-elevado active:bg-vidro-forte flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-left transition-colors"
        >
          <Marca presente={false} />
          <span className="text-fluid-xs text-titulo min-w-0 flex-1 truncate">
            {categoria.rotulo}
          </span>
          <span className="text-tenue shrink-0 text-[11px] whitespace-nowrap">preencher</span>
        </button>
      </li>
    );
  };

  return (
    <section className="border-linha bg-superficie rounded-2xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-titulo text-base">O que falta neste imóvel</h2>
        <p className="text-fluid-xs text-apoio tabular-nums">
          Essencial: {essencialCompletos} de {essencialTotal}
        </p>
      </div>

      <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {essenciais.map((item) => (
          <Item key={item.categoria.chave} item={item} />
        ))}
      </ul>

      <details className="group mt-2">
        <summary className="text-tenue hover:text-titulo flex min-h-11 cursor-pointer list-none items-center text-[11px] font-medium tracking-[0.14em] uppercase transition-colors select-none">
          <span className="group-open:hidden">Ver o complementar</span>
          <span className="hidden group-open:inline">Esconder o complementar</span>
        </summary>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {complementares.map((item) => (
            <Item key={item.categoria.chave} item={item} />
          ))}
        </ul>
      </details>
    </section>
  );
}
