import { Suspense } from "react";
import Link from "next/link";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { EsqueletoDeLista } from "../_componentes/EsqueletoDeLista";
import { ListaPessoas } from "./ListaPessoas";
import { getPaginaDePessoas } from "@/lib/crm/pessoas";
import { getCorretorLogado } from "@/lib/corretorSessao";

export const metadata = { title: "Pessoas" };

function primeiroValor(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/**
 * Pessoas — uma lista, uma porta.
 *
 * O painel tinha DOIS destinos para o mesmo ser humano: "Leads" e "WhatsApp".
 * Medido em 02/09/2026: 91 dos 116 leads têm conversa e 91 das 127 conversas
 * têm lead. Em 91 casos a pessoa existia nos dois lugares, com ações
 * diferentes em cada um — e a primeira decisão que o painel pedia era
 * justamente a que ninguém consegue tomar sem alguém explicar: por qual porta
 * eu entro para falar com o Fulano?
 *
 * A ordem é a da última atividade, e a linha traz prévia, não lidas e a hora.
 * Isso não é estética: é o formato do aplicativo que a pessoa usa o dia
 * inteiro. Um painel que precisa ser usado sem treino não inventa um modelo
 * mental novo — ele empresta o que já existe no bolso de quem vai usar.
 *
 * O que a lista NÃO tem, e é decisão: abas, chips de segmento, filtros
 * avançados e seleção em lote. Eram dez elementos antes do primeiro lead na
 * tela antiga; aqui são dois. Filtrar 147 pessoas é trabalho de tela grande,
 * e continua existindo em `/corretor/leads`.
 */
export default async function PaginaPessoas({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const busca = primeiroValor(params.busca);

  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  return (
    <div className="space-y-5">
      <CabecalhoDeTela
        titulo="Pessoas"
        descricao="Quem falou com você, de quem falou por último para quem falou há mais tempo."
        abaixo={
          /*
           * Adicionar gente à mão é raro — 25 das 147 pessoas em produção
           * chegaram sem conversa. Como ação primária de largura cheia ele
           * empurrava a lista para baixo e gritava mais que o conteúdo; a
           * ação primária desta tela é LER a lista.
           */
          <Link
            href="/corretor/importar"
            className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo mt-3 inline-flex min-h-11 items-center rounded-full border px-3.5 transition-colors"
          >
            + Adicionar alguém
          </Link>
        }
      />

      <Suspense key={busca} fallback={<EsqueletoDeLista linhas={7} titulo="Carregando pessoas…" />}>
        <Conteudo busca={busca} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ busca }: { busca: string }) {
  const { pessoas, total } = await getPaginaDePessoas({ busca: busca || undefined });
  return <ListaPessoas iniciais={pessoas} total={total} busca={busca} />;
}
