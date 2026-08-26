import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { ListaLeads } from "./ListaLeads";
import { AbasLeads } from "@/app/corretor/(painel)/_componentes/AbasLeads";
import {
  getCorretorLogado,
  getEquipeAtiva,
  getMeusTemplates,
  getPaginaDeLeads,
  souGestor,
  type FiltroLeads,
} from "@/lib/corretorSessao";
import { ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";

export const metadata: Metadata = { title: "Meus leads" };

/**
 * Os segmentos rápidos da lista, cada um um recorte de etapas que o banco
 * resolve (roadmap F2): Hoje é especial — não é etapa, é "o que pede ação
 * agora" (novos + visitas do dia) — e vai como `recorte` para a query.
 */
const SEGMENTOS: Record<string, EtapaFunil[]> = {
  novos: ["novo"],
  conversa: ["primeiro_contato", "documentacao"],
  visitas: ["visita_agendada"],
  frios: ["perdido", "fechado"],
};

function primeiroValor(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/**
 * A lista cronológica, ao lado do quadro do funil. As duas telas leem os
 * mesmos dados: o funil responde "em que pé está cada negociação", esta aqui
 * responde "o que chegou hoje" — e é onde cabem a mensagem inteira e todos os
 * detalhes, que não caberiam num cartão de coluna.
 *
 * Todo filtro vive na URL (`?filtro=`, `?etapa=`, `?busca=`…): quem filtra é
 * o banco, por página de 30 — o navegador nunca recebe a carteira inteira.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const segmento = primeiroValor(params.filtro);
  const etapaParam = primeiroValor(params.etapa);
  const etapaValida = (ETAPAS_FUNIL as readonly string[]).includes(etapaParam)
    ? (etapaParam as EtapaFunil)
    : undefined;

  // `?dono=sem` e `?parado=15` chegam dos KPIs da administração — cada
  // número clicável de lá cai aqui JÁ recortado, senão o número mente sobre
  // o próprio destino.
  const semDono = primeiroValor(params.dono) === "sem";
  // `?arquivados=1` é o caminho de volta: a lista mostra o que foi
  // arquivado, e é de lá que se restaura (ou se exclui de vez).
  const verArquivados = primeiroValor(params.arquivados) === "1";
  const paradoDias = Number(primeiroValor(params.parado)) || undefined;

  const filtro: FiltroLeads = {
    busca: primeiroValor(params.busca) || undefined,
    // Uma etapa específica (vinda do seletor ou do link do quadro) vale mais
    // que o segmento — os dois juntos seriam uma interseção confusa.
    etapas: etapaValida ? [etapaValida] : SEGMENTOS[segmento],
    recorte: !etapaValida && segmento === "hoje" ? "hoje" : undefined,
    corretorId: primeiroValor(params.corretor) || undefined,
    criadoDe: primeiroValor(params.de) || undefined,
    criadoAte: primeiroValor(params.ate) || undefined,
    semDono: semDono || undefined,
    paradoDias,
    arquivados: verArquivados || undefined,
  };

  const [pagina, gestor, corretor, templates] = await Promise.all([
    getPaginaDeLeads(filtro),
    souGestor(),
    getCorretorLogado(),
    getMeusTemplates(),
  ]);
  const equipe = gestor ? await getEquipeAtiva() : [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-fluid-2xl text-titulo">
            {verArquivados ? "Arquivados" : gestor ? "Contatos" : "Meus leads"}
          </h1>
          <p className="text-fluid-sm mt-1 text-apoio max-w-2xl">
            {verArquivados
              ? "Leads fora das listas e do funil. Abra um deles para restaurar ou excluir de vez."
              : gestor
                ? "Todos os contatos recebidos pelos formulários do site e portais parceiros."
                : "Contatos que chegaram atribuídos a você — pelo seu link pessoal, portais ou distribuição automática."}
          </p>
          <Link
            href={verArquivados ? "/corretor/leads" : "/corretor/leads?arquivados=1"}
            className="text-fluid-xs text-tenue hover:text-corpo mt-2 inline-block underline underline-offset-4 transition-colors"
          >
            {verArquivados ? "← Voltar para os leads ativos" : "Ver leads arquivados"}
          </Link>
        </div>

        <Link
          href="/corretor/importar"
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 hover:bg-brand-400 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors"
        >
          <span> <Mail className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Puxar do Gmail / Importar
        </Link>
      </div>

      <AbasLeads ativa="lista" />

      {/* Recorte vindo de um KPI da administração. Precisa estar ESCRITO na
          tela: filtro invisível filtrando é a pior surpresa de uma lista —
          o gestor esqueceria por que "sumiram" leads. */}
      {(semDono || paradoDias) && (
        <p className="text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave mt-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5">
          Mostrando só{" "}
          {semDono ? "leads sem corretor responsável" : `leads parados há ${paradoDias}+ dias`}.
          <Link href="/corretor/leads" className="font-medium underline underline-offset-2">
            Ver todos
          </Link>
        </p>
      )}

      <ListaLeads
        leadsIniciais={pagina.leads}
        total={pagina.total}
        filtroServidor={filtro}
        gestor={gestor}
        equipe={equipe}
        templates={templates}
        nomeCorretor={corretor?.nome ?? ""}
        whatsappCorretor={corretor?.whatsapp ?? ""}
      />
    </div>
  );
}
