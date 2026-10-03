import type { Metadata } from "next";
import Link from "next/link";
import { CampanhasManager } from "./CampanhasManager";
import { listarCampanhas, statusDisparo } from "./acoes";
import { getEmpreendimentos } from "@/lib/queries";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { ListasSugeridasBloco } from "../_componentes/ListasSugeridas";
import { getListasSugeridas } from "@/lib/crm/listasSugeridasDados";
import { descreverLista, lerDiasDeParado } from "@/lib/crm/listasSugeridas";

export const metadata: Metadata = {
  title: "Listas de Transmissão de WhatsApp | Next Home",
};

/**
 * As server actions desta página (`processarFilaAgora`) chegam a mandar
 * WhatsApp de verdade antes de responder. O teto padrão de 10s de uma
 * função Hobby cortaria o envio no meio.
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
  }>;
}) {
  // Vindo de "leads que combinam" (tela do imóvel): imóvel e leads já
  // marcados. É só pré-preenchimento: a criação refaz a interseção com a
  // carteira no servidor, então id inventado na URL não vira mensagem.
  const { imovel, leads, publico, grupo, dias, parados } = await searchParams;
  const diasParado = lerDiasDeParado(parados);
  const grupoDaLista = grupo === "novos" || grupo === "parados" || grupo === "imovel" ? grupo : null;
  const inicial = {
    imovelSlug: imovel || undefined,
    // "Avisar compradores" na tela do imóvel (26/09/2026).
    publico: publico === "compradores" ? ("compradores" as const) : undefined,
    leadIds: (leads ?? "").split(",").filter((id) => UUID.test(id)).slice(0, TETO_DE_IDS),
    // Quem é este público, em palavras: é o que a IA usa para sugerir a
    // mensagem de uma lista sugerida (citando o imóvel, quando houver).
    descricaoDoPublico: grupoDaLista
      ? descreverLista(grupoDaLista, { diasParado: lerDiasDeParado(dias), imovel: imovel || null })
      : undefined,
  };

  const [empreendimentos, campanhas, status, listas] = await Promise.all([
    getEmpreendimentos(),
    listarCampanhas(),
    statusDisparo(),
    getListasSugeridas(diasParado),
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
      {listas && inicial.leadIds.length === 0 && (
        <ListasSugeridasBloco listas={listas} diasParado={diasParado} caminho="/corretor/campanhas" />
      )}

      <CampanhasManager
        empreendimentos={empreendimentos}
        campanhasIniciais={campanhas}
        statusInicial={status}
        inicial={inicial}
      />
    </div>
  );
}
