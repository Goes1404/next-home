import Link from "next/link";
import { motivoDeUrgencia } from "@/lib/imoveis/apelidoPendente";
import {
  completudePorCategoria,
  imoveisPorCompletude,
  type Categoria,
  type ImovelAvaliavel,
} from "@/lib/imoveis/completudeDoCatalogo";

/**
 * O checklist do catálogo: o que cada imóvel TEM, e o que ainda falta.
 *
 * ## Duas perguntas, dois blocos
 *
 * O bloco POR CATEGORIA responde "onde o catálogo está fraco". Cinco imóveis
 * faltando coisas diferentes é trabalho espalhado; vinte faltando a MESMA
 * coisa é uma tarefa só, e só este bloco mostra isso.
 *
 * O bloco POR IMÓVEL responde "por onde eu começo". Ordenado por quanto
 * falta, com as ausências como etiqueta, cada linha levando ao editor.
 *
 * ## Por que aqui, e não dentro do imóvel
 *
 * Substitui o cartão de pendências, que morava nesta mesma tela pela mesma
 * razão: aviso dentro do editor não moveu nada em cinco dias, porque só é
 * visto por quem já abriu aquela tela — e quem abre um imóvel foi lá fazer
 * outra coisa. O checklist DENTRO do imóvel também existe, e é o par deste:
 * aqui se escolhe o trabalho, lá se faz.
 *
 * ## Sem matriz
 *
 * A tentação era uma grade de imóveis por categorias. Não cabe em 360
 * pixels, e rolagem lateral fora de conteúdo declarado é o que esta base
 * proíbe desde a reforma de bolso. As duas listas dizem o mesmo sem esconder
 * nada atrás de um gesto que ninguém anuncia.
 *
 * ## Custo zero
 *
 * `SELECT_EMPREENDIMENTO` já traz `midias`, `tipologias` e `lazer`. Nenhuma
 * consulta a mais do que a página faria de qualquer jeito.
 */

export type ImovelDoChecklist = ImovelAvaliavel & {
  slug: string;
  bairro?: string | null;
  construtora?: string | null;
  publicado?: boolean;
};

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

/** Barra de proporção. O número em texto ao lado é quem informa de verdade. */
function Barra({ de, para }: { de: number; para: number }) {
  const pct = para === 0 ? 0 : Math.round((de / para) * 100);
  return (
    <span
      className="bg-linha h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-24"
      aria-hidden
    >
      <span className="bg-acento block h-full rounded-full" style={{ width: `${pct}%` }} />
    </span>
  );
}

function LinhaDeCategoria({
  categoria,
  completos,
  total,
}: {
  categoria: Categoria;
  completos: number;
  total: number;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-2 sm:px-6">
      <span className="min-w-0 flex-1">
        <span className="text-fluid-xs text-titulo block truncate">{categoria.rotulo}</span>
        {completos < total && (
          // A explicacao QUEBRA linha em vez de truncar: ela e o porque, e
          // cortada no meio da palavra nao ensina nada — vira ruido ao lado
          // do numero, que e quem informa.
          <span className="text-fluid-xs text-tenue block text-pretty">
            {categoria.explicacao}
          </span>
        )}
      </span>
      <span className="text-fluid-xs text-apoio shrink-0 tabular-nums">
        {completos} de {total}
      </span>
      <Barra de={completos} para={total} />
    </li>
  );
}

export function ChecklistDoCatalogo({ imoveis }: { imoveis: readonly ImovelDoChecklist[] }) {
  if (imoveis.length === 0) return null;

  const porCategoria = completudePorCategoria(imoveis);
  const porImovel = imoveisPorCompletude(imoveis);

  const essenciais = porCategoria.filter((x) => x.categoria.faixa === "essencial");
  const complementares = porCategoria.filter((x) => x.categoria.faixa === "complementar");

  const prontos = porImovel.filter(
    (x) => x.completude.essencialCompletos === x.completude.essencialTotal,
  );
  const faltando = porImovel.filter(
    (x) => x.completude.essencialCompletos < x.completude.essencialTotal,
  );

  /*
   * Teto de seis abertos, o mesmo da fila do Início.
   *
   * Medido no catálogo real em 16/09/2026: ZERO dos 26 imóveis têm o
   * essencial completo, então sem teto esta lista abriria com 26 linhas — e
   * lista de vinte e seis ninguém percorre. Os piores ficam à vista, o resto
   * a um toque.
   */
  const abertos = faltando.slice(0, 6);
  const escondidos = faltando.slice(6);

  const Linha = ({ item }: { item: (typeof porImovel)[number] }) => {
    const { imovel, completude } = item;
    // Nome que é título de anúncio não é "seria bom ter apelido": sem ele não
    // existe nome que o cliente possa acertar, e o imóvel some para a IA.
    const invisivel =
      item.faltando.some((c) => c.chave === "apelido") && Boolean(motivoDeUrgencia(imovel.nome));

    return (
      <li>
        <Link
          href={`/corretor/imoveis/${imovel.slug}`}
          className="border-linha hover:bg-elevado active:bg-vidro-forte flex items-center gap-3 border-t px-5 py-3 transition-colors sm:px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-fluid-sm text-titulo min-w-0 truncate font-medium">
                {imovel.nome}
              </span>
              {imovel.publicado === false && (
                <span className="text-tenue border-linha rounded-full border px-2 text-[11px] whitespace-nowrap">
                  Rascunho
                </span>
              )}
              {invisivel && (
                <span className="text-alerta border-alerta-linha rounded-full border px-2 text-[11px] whitespace-nowrap">
                  invisível para a assistente
                </span>
              )}
            </span>

            <span className="text-fluid-xs text-apoio block truncate">
              {[imovel.bairro, imovel.construtora].filter(Boolean).join(" · ") ||
                "sem bairro cadastrado"}
            </span>

            {/* Etiquetas quebram linha, nunca rolam: escolha escondida atrás
                de um gesto que a fileira não anuncia é defeito já medido. */}
            <span className="mt-1.5 flex flex-wrap gap-1">
              {item.faltando.map((c) => (
                <span
                  key={c.chave}
                  className={`rounded-md border px-1.5 py-0.5 text-[11px] whitespace-nowrap ${
                    c.faixa === "essencial"
                      ? "border-linha text-apoio"
                      : "border-linha text-tenue opacity-70"
                  }`}
                >
                  {c.rotulo}
                </span>
              ))}
            </span>
          </span>

          <span className="text-fluid-xs text-apoio shrink-0 tabular-nums">
            {completude.essencialCompletos}/{completude.essencialTotal}
          </span>
          <Seta />
        </Link>
      </li>
    );
  };

  return (
    <section className="border-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
      <div className="px-5 pt-5 sm:px-6">
        <h2 className="font-display text-titulo text-lg">Checklist do catálogo</h2>
        <p className="text-fluid-xs text-corpo mt-2 leading-relaxed text-pretty">
          {prontos.length} de {imoveis.length} imóveis já têm o essencial completo. O essencial é o
          que a assistente usa na conversa ou o cliente vê na página; o complementar enriquece a
          página e não é cobrado.
        </p>
      </div>

      <div className="mt-4">
        <p className="text-tenue border-linha border-t px-5 py-2 text-[11px] font-medium tracking-[0.14em] uppercase sm:px-6">
          Essencial, por categoria
        </p>
        <ul>
          {essenciais.map((x) => (
            <LinhaDeCategoria
              key={x.categoria.chave}
              categoria={x.categoria}
              completos={x.completos}
              total={x.total}
            />
          ))}
        </ul>

        <details className="group">
          <summary className="text-tenue hover:text-titulo border-linha cursor-pointer list-none border-t px-5 py-2.5 text-[11px] font-medium tracking-[0.14em] uppercase transition-colors select-none sm:px-6">
            <span className="group-open:hidden">Ver o complementar</span>
            <span className="hidden group-open:inline">Esconder o complementar</span>
          </summary>
          <ul>
            {complementares.map((x) => (
              <LinhaDeCategoria
                key={x.categoria.chave}
                categoria={x.categoria}
                completos={x.completos}
                total={x.total}
              />
            ))}
          </ul>
        </details>
      </div>

      {faltando.length > 0 && (
        <div>
          <p className="text-tenue border-linha border-t px-5 py-2 text-[11px] font-medium tracking-[0.14em] uppercase sm:px-6">
            Por imóvel, do mais incompleto
          </p>
          <ul>
            {abertos.map((item) => (
              <Linha key={item.imovel.slug} item={item} />
            ))}
          </ul>
        </div>
      )}

      {escondidos.length > 0 && (
        <details className="group">
          <summary className="text-fluid-xs text-apoio hover:text-titulo border-linha cursor-pointer list-none border-t px-5 py-3.5 transition-colors select-none sm:px-6">
            <span className="group-open:hidden">Ver os outros {escondidos.length}</span>
            <span className="hidden group-open:inline">Esconder os outros {escondidos.length}</span>
          </summary>
          <ul>
            {escondidos.map((item) => (
              <Linha key={item.imovel.slug} item={item} />
            ))}
          </ul>
        </details>
      )}

      {prontos.length > 0 && (
        <details className="group">
          <summary className="text-fluid-xs text-apoio hover:text-titulo border-linha cursor-pointer list-none border-t px-5 py-3.5 transition-colors select-none sm:px-6">
            <span className="group-open:hidden">
              Ver os {prontos.length} com o essencial completo
            </span>
            <span className="hidden group-open:inline">
              Esconder os {prontos.length} completos
            </span>
          </summary>
          <ul>
            {prontos.map((item) => (
              <Linha key={item.imovel.slug} item={item} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
