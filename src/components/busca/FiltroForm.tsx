import Link from "next/link";
import type { FiltrosEmpreendimento, Ordenacao } from "@/lib/types";
import { ORDENACAO_LABEL, TIPO_LABEL } from "@/lib/types";

/** Tetos de preço fixos — mais simples e mais rápido de escanear do que um slider. */
const FAIXAS_PRECO = [
  { valor: "500000", label: "Até R$ 500 mil" },
  { valor: "800000", label: "Até R$ 800 mil" },
  { valor: "1200000", label: "Até R$ 1,2 milhão" },
  { valor: "2000000", label: "Até R$ 2 milhões" },
];

const FAIXAS_DORMITORIOS = [
  { valor: "1", label: "1+ dormitório" },
  { valor: "2", label: "2+ dormitórios" },
  { valor: "3", label: "3+ dormitórios" },
  { valor: "4", label: "4+ dormitórios" },
];

const CAMPO =
  "w-full appearance-none rounded-xl border border-linha/10 bg-superficie px-3.5 py-2.5 text-sm text-corpo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte";

export type FiltroFormProps = {
  filtrosAtuais: FiltrosEmpreendimento;
  ordenacaoAtual: Ordenacao;
  regioes: {
    cidades: string[];
    bairros: string[];
    /** Tipos com estoque real. Sem a lista, cai no enum completo. */
    tipos?: string[];
  };
  /** Id único por instância — o form aparece 1x no desktop e 1x no sheet mobile. */
  idPrefixo: string;
  className?: string;
  /**
   * Versão de entrada, para o hero do institucional: só tipo, cidade e valor,
   * e o botão vira "Buscar imóveis". Quem chega na home ainda não sabe o que
   * quer refinar — a listagem é que oferece o conjunto completo de filtros.
   */
  compacto?: boolean;
};

/**
 * Form GET puro: submeter recarrega `/empreendimentos` com a nova query
 * string, então filtrar funciona mesmo sem JavaScript.
 */
export function FiltroForm({
  filtrosAtuais,
  ordenacaoAtual,
  regioes,
  idPrefixo,
  className,
  compacto = false,
}: FiltroFormProps) {
  const temFiltro = Object.values(filtrosAtuais).some((v) => v != null && v !== "");

  return (
    <form action="/empreendimentos" method="get" className={className}>
      {/* A busca por nome é linha própria, acima dos selects: é o filtro de
          quem JÁ SABE o que procura (viu o anúncio, ouviu do corretor) e não
          deveria ter de traduzir um nome em tipo/cidade/faixa. Fora do
          compacto da home, que promete só o começo da conversa. */}
      {!compacto && (
        <div className="mb-3">
          <label htmlFor={`${idPrefixo}-busca`} className="text-fluid-xs mb-1 block text-legenda">
            Nome do empreendimento
          </label>
          <input
            id={`${idPrefixo}-busca`}
            type="search"
            name="busca"
            defaultValue={filtrosAtuais.busca ?? ""}
            placeholder="Ex.: Vista AlphaGran, Dom Parque, Terra Alta…"
            maxLength={80}
            autoComplete="off"
            className={`${CAMPO} placeholder:text-tenue`}
          />
        </div>
      )}

      {/* 6 colunas só a partir de lg: em telas médias os selects ficariam
          estreitos demais e cortariam o rótulo da opção escolhida. */}
      <div
        className={
          compacto
            ? "grid grid-cols-2 gap-3 sm:grid-cols-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        }
      >
        <div>
          <label htmlFor={`${idPrefixo}-tipo`} className="text-fluid-xs mb-1 block text-legenda">
            Tipo
          </label>
          <select
            id={`${idPrefixo}-tipo`}
            name="tipo"
            defaultValue={filtrosAtuais.tipo ?? ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {/* Só tipos com estoque: oferecer "Casa" com zero casas manda o
                visitante para uma listagem vazia na primeira interação. */}
            {Object.entries(TIPO_LABEL)
              .filter(([valor]) => !regioes.tipos || regioes.tipos.includes(valor))
              .map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefixo}-cidade`} className="text-fluid-xs mb-1 block text-legenda">
            Cidade
          </label>
          <select
            id={`${idPrefixo}-cidade`}
            name="cidade"
            defaultValue={filtrosAtuais.cidade ?? ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {regioes.cidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {!compacto && (
          <div>
            <label htmlFor={`${idPrefixo}-bairro`} className="text-fluid-xs mb-1 block text-legenda">
              Bairro
            </label>
            <select
              id={`${idPrefixo}-bairro`}
              name="bairro"
              defaultValue={filtrosAtuais.bairro ?? ""}
              className={CAMPO}
            >
              <option value="">Qualquer</option>
              {regioes.bairros.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* No compacto o par tipo/cidade ocupa a primeira linha do mobile e o
            valor fica sozinho na segunda — full width em vez de meia coluna
            solta ao lado de um vazio. */}
        <div className={compacto ? "col-span-2 sm:col-span-1" : undefined}>
          <label htmlFor={`${idPrefixo}-preco`} className="text-fluid-xs mb-1 block text-legenda">
            Valor
          </label>
          <select
            id={`${idPrefixo}-preco`}
            name="precoMax"
            defaultValue={filtrosAtuais.precoMax ? String(filtrosAtuais.precoMax) : ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {FAIXAS_PRECO.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {!compacto && (
          <div>
            <label htmlFor={`${idPrefixo}-dorms`} className="text-fluid-xs mb-1 block text-legenda">
              Dormitórios
            </label>
            <select
              id={`${idPrefixo}-dorms`}
              name="dormitoriosMin"
              defaultValue={
                filtrosAtuais.dormitoriosMin ? String(filtrosAtuais.dormitoriosMin) : ""
              }
              className={CAMPO}
            >
              <option value="">Qualquer</option>
              {FAIXAS_DORMITORIOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {!compacto && (
          <div>
            <label
              htmlFor={`${idPrefixo}-ordenar`}
              className="text-fluid-xs mb-1 block text-legenda"
            >
              Ordenar por
            </label>
            <select
              id={`${idPrefixo}-ordenar`}
              name="ordenar"
              defaultValue={ordenacaoAtual}
              className={CAMPO}
            >
              {Object.entries(ORDENACAO_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          className={
            compacto
              ? "w-full rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400 sm:w-auto sm:px-8"
              : "rounded-full bg-brand-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
          }
        >
          {compacto ? "Buscar imóveis" : "Filtrar"}
        </button>
        {!compacto && temFiltro && (
          <Link
            href="/empreendimentos"
            className="text-fluid-sm text-apoio underline-offset-4 hover:text-titulo hover:underline"
          >
            Limpar filtros
          </Link>
        )}
      </div>
    </form>
  );
}
