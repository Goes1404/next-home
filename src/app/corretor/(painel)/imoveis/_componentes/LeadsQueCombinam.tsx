import Link from "next/link";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { lerLeadsQueCombinam } from "./lerLeadsQueCombinam";
import { ReabrirPerdidos } from "./ReabrirPerdidos";
import type { Empreendimento } from "@/lib/types";

const MOSTRAR = 5;

/**
 * Imóvel novo encontra quem já procurava (26/09/2026).
 *
 * Cruza este imóvel com a carteira do corretor pelos critérios que cada
 * lead DECLAROU (`compatibilidade.ts`) e leva à campanha com os que
 * combinam já marcados. Até aqui, lead parado nunca era revisitado quando
 * surgia um imóvel que servia para ele.
 *
 * Só entra quem a campanha aceita: sem `fechado`, `perdido`, arquivado ou
 * quem pediu para não ser procurado. Perdidos que combinam ganham um botão
 * para voltar ao funil em lote — reabrir é decisão do corretor, nunca
 * efeito de abrir a tela.
 *
 * O orçamento sai da ficha, e na falta dela do dossiê da IA; sem orçamento,
 * a renda declarada vira teto pela conta do simulador (`perfilDoLead`).
 *
 * Devolve `null` quando ninguém combina: cartão vazio vira paisagem.
 */
export async function LeadsQueCombinam({ imovel }: { imovel: Empreendimento }) {
  // A mesma leitura da página inteira (29/10/2026): o cartão e a lista
  // contam igual, com a pontuação do match.
  const combinam = await lerLeadsQueCombinam(imovel);
  if (!combinam) return null;
  const ativos = combinam.filter((l) => l.etapa !== "perdido");
  const perdidos = combinam.filter((l) => l.etapa === "perdido").map((l) => l.id);
  if (ativos.length === 0 && perdidos.length === 0) return null;

  const params = new URLSearchParams({
    imovel: imovel.slug,
    leads: ativos.map((l) => l.id).join(","),
  });

  return (
    <section className="cartao p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-fluid-base font-bold text-titulo">
          {ativos.length === 0
            ? "Só leads perdidos combinam com este imóvel"
            : ativos.length === 1
              ? "1 lead da sua carteira combina com este imóvel"
              : `${ativos.length} leads da sua carteira combinam com este imóvel`}
        </h2>
        <span className="text-fluid-xs text-apoio">pelo que cada um disse que procura</span>
      </div>

      {ativos.length > 0 && (
        <ul className="divide-y divide-linha">
          {ativos.slice(0, MOSTRAR).map((l) => (
            <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Link
                href={`/corretor/leads/${l.id}`}
                className="min-h-11 flex items-center font-semibold text-titulo min-w-0 break-words link-acao"
              >
                {nomeParaExibir(l)}
              </Link>
              <span className="text-fluid-xs text-apoio">{l.match.motivos.join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      {ativos.length > MOSTRAR && (
        <p className="text-fluid-xs text-apoio">e mais {ativos.length - MOSTRAR}</p>
      )}
      {ativos.length > 0 && (
        <Link
          href={`/corretor/imoveis/${imovel.slug}/leads-que-combinam`}
          className="min-h-11 inline-flex items-center text-fluid-xs font-semibold text-corpo underline underline-offset-2"
        >
          Ver todos, com os motivos
        </Link>
      )}

      {perdidos.length > 0 && (
        <ReabrirPerdidos perdidos={perdidos} imovelSlug={imovel.slug} ativos={ativos.map((l) => l.id)} />
      )}

      {ativos.length > 0 && (
        <Link
          href={`/corretor/campanhas?${params.toString()}`}
          className="botao-vivo min-h-11 inline-flex items-center justify-center rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor"
        >
          Mandar este imóvel para {ativos.length === 1 ? "ele" : `os ${ativos.length}`}
        </Link>
      )}
    </section>
  );
}
