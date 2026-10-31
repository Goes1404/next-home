import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { marcaDoPainel } from "@/lib/marcaDoCrm/doPainel";
import { lerLimitesDoGrupo } from "@/lib/planos/usoDaIa";
import { RestamNoMes } from "@/components/planos/RestamNoMes";
import { CampanhasManager } from "./CampanhasManager";
import { carregarListaParaReabrir, listarCampanhas, statusDisparo } from "./acoes";
import { getEmpreendimentos } from "@/lib/queries";
import { getCorretorLogado, getMeusTemplates } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { ListasSugeridasBloco } from "../_componentes/ListasSugeridas";
import { getListasSugeridas } from "@/lib/crm/listasSugeridasDados";
import { descreverLista, lerDiasDeParado } from "@/lib/crm/listasSugeridas";
import type { InicialDaLista } from "./_componentes/NovaCampanha";

// O nome depois da barra é o da casa de quem está logado (a Next Home no grupo 1).
export async function generateMetadata(): Promise<Metadata> {
  return { title: `Listas de Transmissão de WhatsApp | ${(await marcaDoPainel()).nome}` };
}

/**
 * Criar a lista confere os números no WhatsApp antes de responder; o teto
 * padrão de 10s de uma função Hobby cortaria a conferência no meio.
 */
export const maxDuration = 60;

/** Até isso de ids pela URL: acima disso a URL fica maior que o navegador aceita. */
const TETO_DE_IDS = 300;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function CampanhasPainelPage({
  searchParams,
}: {
  searchParams: Promise<{
    imovel?: string;
    leads?: string;
    publico?: string;
    /** Vindo das listas sugeridas (plano de ativação, Fase 4). */
    grupo?: string;
    dias?: string;
    parados?: string;
    /** Repetir uma lista já enviada (roadmap das listas, Fase 3). */
    repetir?: string;
    /** Continuar um rascunho (Fase 4). */
    rascunho?: string;
    /** "Nova lista" no cabeçalho abre o assistente (31/10/2026). */
    nova?: string;
  }>;
}) {
  // Pré-preenchimento: a criação refaz a interseção com a carteira no
  // servidor, então id inventado na URL não vira mensagem.
  const { imovel, leads, publico, grupo, dias, parados, repetir, rascunho, nova } = await searchParams;
  const diasParado = lerDiasDeParado(parados);
  const grupoDaLista = grupo === "novos" || grupo === "parados" || grupo === "imovel" ? grupo : null;
  const idReabrir = [repetir, rascunho].find((v) => v && UUID.test(v));
  const reaberta = idReabrir ? await carregarListaParaReabrir(idReabrir) : null;

  const inicial: InicialDaLista = {
    imovelSlug: imovel || undefined,
    // "Avisar compradores" na tela do imóvel (26/09/2026).
    publico: publico === "compradores" ? ("compradores" as const) : undefined,
    leadIds: (leads ?? "").split(",").filter((id) => UUID.test(id)).slice(0, TETO_DE_IDS),
    descricaoDoPublico: grupoDaLista
      ? descreverLista(grupoDaLista, { diasParado: lerDiasDeParado(dias), imovel: imovel || null })
      : undefined,
    reabrir: reaberta
      ? { ...reaberta, modo: rascunho && reaberta.status === "rascunho" ? "rascunho" : "repetir" }
      : undefined,
  };

  const corretor = await getCorretorLogado();
  const [empreendimentos, campanhas, status, listas, modelos, limites] = await Promise.all([
    // O catálogo do grupo de quem está logado; sem sessão, nenhum.
    corretor ? getEmpreendimentos(corretor.grupoId) : Promise.resolve([]),
    listarCampanhas(),
    statusDisparo(),
    getListasSugeridas(diasParado),
    getMeusTemplates(),
    // Mensagens de lista que ainda cabem no plano neste mês (limites do plano).
    corretor ? lerLimitesDoGrupo(corretor.grupoId) : Promise.resolve(null),
  ]);

  /*
   * O assistente abre fechado (31/10/2026): a tela é, antes de tudo, o
   * acompanhamento das listas. Abre sozinho quando há o que montar — veio de
   * uma sugestão, de "Avisar compradores", de repetir ou de um rascunho — ou
   * quando ainda não existe lista nenhuma.
   */
  const veioParaMontar =
    Boolean(nova) || Boolean(reaberta) || inicial.leadIds.length > 0 || Boolean(inicial.publico) || Boolean(imovel);

  return (
    <div className="max-w-6xl space-y-6">
      <CabecalhoDeTela
        titulo="Listas de transmissão"
        descricao="Escolha quem recebe e o que dizer. As mensagens saem sozinhas, uma a uma, no horário seguro."
        acao={
          <Link
            href="/corretor/campanhas?nova=1"
            scroll={false}
            className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors sm:w-auto"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Nova lista
          </Link>
        }
        // "Modelos" saiu do menu em 30/09/2026: mora aqui, onde é usado.
        abaixo={
          <Link
            href="/corretor/templates"
            className="text-acento-suave text-fluid-sm inline-flex min-h-11 items-center gap-1 font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
          >
            Modelos de mensagem
          </Link>
        }
      />

      {limites && <RestamNoMes situacao={limites.lista} />}

      <CampanhasManager
        // Reabrir outra lista (ou abrir pelo cabeçalho) monta o assistente do zero.
        key={reaberta?.id ?? (veioParaMontar ? "nova-aberta" : "nova")}
        empreendimentos={empreendimentos}
        campanhasIniciais={campanhas}
        statusInicial={status}
        inicial={inicial}
        modelos={modelos}
        corretor={{ nome: corretor?.nome ?? "", whatsapp: corretor?.whatsapp ?? "" }}
        abrirAssistente={veioParaMontar || campanhas.length === 0}
        // Listas sugeridas (plano de ativação, Fase 4): atalhos para montar
        // uma lista; somem com o assistente aberto, onde a lista já está.
        sugestoes={
          listas ? <ListasSugeridasBloco listas={listas} diasParado={diasParado} caminho="/corretor/campanhas" /> : null
        }
      />
    </div>
  );
}
