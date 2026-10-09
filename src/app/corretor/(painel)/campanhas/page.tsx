import type { Metadata } from "next";
import Link from "next/link";
import { CampanhasManager } from "./CampanhasManager";
import { carregarListaParaReabrir, listarCampanhas, statusDisparo } from "./acoes";
import { getEmpreendimentos } from "@/lib/queries";
import { getCorretorLogado, getMeusTemplates } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { corretorTemAgenda } from "@/lib/whatsapp/publicoDaLista";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { ListasSugeridasBloco } from "../_componentes/ListasSugeridas";
import { getListasSugeridas } from "@/lib/crm/listasSugeridasDados";
import { descreverLista, lerDiasDeParado } from "@/lib/crm/listasSugeridas";
import type { InicialDaLista } from "./_componentes/NovaCampanha";

export const metadata: Metadata = {
  title: "Listas de Transmissão de WhatsApp | Next Home",
};

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
  }>;
}) {
  // Pré-preenchimento: a criação refaz a interseção com a carteira no
  // servidor, então id inventado na URL não vira mensagem.
  const { imovel, leads, publico, grupo, dias, parados, repetir, rascunho } = await searchParams;
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
  const [empreendimentos, campanhas, status, listas, modelos, temAgenda] = await Promise.all([
    getEmpreendimentos(),
    listarCampanhas(),
    statusDisparo(),
    getListasSugeridas(diasParado),
    getMeusTemplates(),
    corretor ? corretorTemAgenda(await createClient(), corretor.id) : Promise.resolve(false),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <CabecalhoDeTela
          titulo="Listas de transmissão"
          descricao="Monte a lista e pronto: as mensagens saem sozinhas, uma a uma, com pausa entre elas. Nada aqui depende de você ficar clicando."
          // "Modelos" saiu do menu em 30/09/2026: mora aqui, onde é usado.
          abaixo={
            <Link
              href="/corretor/templates"
              className="text-acento-suave text-fluid-sm inline-flex min-h-11 items-center gap-1 font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
            >
              Modelos de mensagem →
            </Link>
          }
        />
      </div>

      {/* Listas sugeridas (plano de ativação, Fase 4). Some quando o
          corretor já veio de uma delas: a lista dele está no assistente. */}
      {listas && inicial.leadIds.length === 0 && !reaberta && (
        <ListasSugeridasBloco listas={listas} diasParado={diasParado} caminho="/corretor/campanhas" />
      )}

      <CampanhasManager
        // Reabrir outra lista monta o assistente do zero com os dados dela.
        key={reaberta?.id ?? "nova"}
        empreendimentos={empreendimentos}
        campanhasIniciais={campanhas}
        statusInicial={status}
        inicial={inicial}
        modelos={modelos}
        temAgenda={temAgenda}
        corretor={{ nome: corretor?.nome ?? "", whatsapp: corretor?.whatsapp ?? "" }}
      />
    </div>
  );
}
