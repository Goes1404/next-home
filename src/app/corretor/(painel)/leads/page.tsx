import { ehCanal, type Canal } from "@/lib/graficos/calculos";
import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Mail } from "lucide-react";
import { ListaLeads } from "./ListaLeads";
import {
  getEquipeAtiva,
  getPaginaDeLeads,
  getEmpreendimentosParaFiltro,
  contarLeadsArquivados,
  getCarteiraDaVisao,
  souGestor,
  type FiltroLeads,
} from "@/lib/corretorSessao";
import { CARTEIRA_EQUIPE } from "@/lib/carteiraDaVisao";
import { createClient } from "@/lib/supabase/server";
import { ETAPAS_FUNIL, GRUPOS_FUNIL, etapasDoGrupo, type EtapaFunil, type GrupoFunil } from "@/lib/types";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { BotaoVoltarAoTopo } from "../_componentes/BotaoVoltarAoTopo";

export const metadata: Metadata = { title: "Meus leads" };

/**
 * Os segmentos rápidos da lista, cada um um recorte de etapas que o banco
 * resolve (roadmap F2): Hoje é especial — não é etapa, é "o que pede ação
 * agora" (novos + visitas do dia) — e vai como `recorte` para a query.
 */
const SEGMENTOS: Record<string, EtapaFunil[]> = {
  novos: ["novo"],
  conversa: ["primeiro_contato", "em_conversa", "qualificado", "proposta", "documentacao"],
  visitas: ["visita_agendada", "visitou"],
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
  // `?grupo=` chega do funil RESUMIDO (0165): a coluna "Contatei" são três
  // etapas, e o link precisa abrir as três.
  const grupoParam = primeiroValor(params.grupo);
  const grupoValido = (GRUPOS_FUNIL as readonly string[]).includes(grupoParam)
    ? (grupoParam as GrupoFunil)
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
    etapas: etapaValida
      ? [etapaValida]
      : grupoValido
        ? etapasDoGrupo(grupoValido)
        : SEGMENTOS[segmento],
    recorte: !etapaValida && !grupoValido && segmento === "hoje" ? "hoje" : undefined,
    corretorId: primeiroValor(params.corretor) || undefined,
    // `?campanha=<id do Meta>` chega da tabela por campanha da tela de
    // Anúncios. Sem este par, o link sairia da tela de Anúncios e a lista
    // ignoraria o parâmetro EM SILÊNCIO, mostrando a carteira inteira —
    // já aconteceu neste projeto com `?filtro=parados`.
    metaCampanhaId: primeiroValor(params.campanha) || undefined,
    // `?canal=` chega das barras de "De onde vêm os leads" (Marketing).
    canal: ehCanal(primeiroValor(params.canal)) ? (primeiroValor(params.canal) as Canal) : undefined,
    criadoDe: primeiroValor(params.de) || undefined,
    criadoAte: primeiroValor(params.ate) || undefined,
    // `?empreendimento=` — chegou por OU conversando sobre (06/09/2026).
    empreendimentoId: primeiroValor(params.empreendimento) || undefined,
    semDono: semDono || undefined,
    paradoDias,
    arquivados: verArquivados || undefined,
  };

  /*
   * De quem é a carteira (hotfix de 19/10/2026): sem `?corretor=`, a do
   * usuário logado — também para o gestor. Com ele, só o gestor muda de
   * carteira; é por aí que os números da Administração caem aqui já
   * recortados. "Sem dono" só existe na equipe.
   */
  const pedidoDeCarteira = semDono ? CARTEIRA_EQUIPE : filtro.corretorId;
  const [pagina, gestor, arquivados, empreendimentos, carteira] = await Promise.all([
    getPaginaDeLeads(filtro),
    souGestor(),
    contarLeadsArquivados(pedidoDeCarteira),
    getEmpreendimentosParaFiltro(),
    getCarteiraDaVisao(pedidoDeCarteira),
  ]);
  const equipe = gestor ? await getEquipeAtiva() : [];

  // O nome de quem é a carteira alheia, para a faixa dizer em voz alta.
  let nomeDaCarteira: string | null = null;
  if (carteira.tipo === "de_outro") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("corretores")
      .select("nome")
      .eq("id", carteira.corretorId)
      .maybeSingle();
    nomeDaCarteira = data?.nome ?? "outro corretor";
  }
  // Os links desta tela mantêm a carteira escolhida: sair dos arquivados não
  // pode devolver o gestor, calado, aos leads dele.
  const daCarteira =
    carteira.tipo === "equipe"
      ? `corretor=${CARTEIRA_EQUIPE}`
      : carteira.tipo === "de_outro"
        ? `corretor=${carteira.corretorId}`
        : "";
  const comCarteira = (base: string, extra?: string) => {
    const qs = [daCarteira, extra].filter(Boolean).join("&");
    return qs ? `${base}?${qs}` : base;
  };
  const alheia = carteira.tipo === "de_outro" || carteira.tipo === "equipe";

  return (
    <div>
      <CabecalhoDeTela
        titulo={verArquivados ? "Arquivados" : alheia ? "Contatos" : "Meus leads"}
        descricao={
          verArquivados
            ? "Leads fora das listas e do funil. Abra um deles para restaurar ou excluir de vez."
            : carteira.tipo === "equipe"
              ? "Todos os contatos da equipe, recebidos pelos formulários do site e portais parceiros."
              : carteira.tipo === "de_outro"
                ? `Os contatos de ${nomeDaCarteira}.`
                : "Contatos que chegaram atribuídos a você — pelo seu link pessoal, portais ou distribuição automática."
        }
        abaixo={
          <>
            {/* Era um texto cinza minúsculo debaixo do parágrafo — relatado
          como "não consigo acessar os arquivados", e com razão: no
          celular ele desaparece. Agora é um botão de verdade, e leva a
          CONTAGEM: sem o número, quem arquivou algo não tem como saber
          se ainda está lá. Some quando não há nada arquivado — porta
          para uma sala vazia é ruído. */}
            {(verArquivados || arquivados > 0) && (
              <Link
                href={
                  verArquivados
                    ? comCarteira("/corretor/leads")
                    : comCarteira("/corretor/leads", "arquivados=1")
                }
                className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 transition-colors"
              >
                {verArquivados ? (
                  "← Voltar para os leads ativos"
                ) : (
                  <>
                    <Archive aria-hidden className="h-3.5 w-3.5" />
                    Arquivados
                    <span className="bg-vidro-forte text-apoio rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
                      {arquivados}
                    </span>
                  </>
                )}
              </Link>
            )}
          </>
        }
        acao={
          /* Era `bg-brand-500 text-white`: tinta da MARCA, chumbada, no
             lugar da cor do módulo. A ação primária de cada tela é o
             lugar mais visível do color coding — pintá-la de teal aqui
             fazia Leads parecer a vitrine, não Leads. */
          <Link
            href="/corretor/importar"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium transition-colors"
          >
            <Mail aria-hidden className="h-4 w-4 shrink-0" />
            {/* "Adicionar" saiu do menu em 30/09/2026: a porta é este botão. */}
            + Adicionar leads
          </Link>
        }
      />

      {/* Carteira de outra pessoa (ou da equipe) aberta pelo gestor. Precisa
          estar escrito: sem a faixa, a lista dele "encheria" de leads alheios
          sem explicação — o defeito que este hotfix veio desfazer. */}
      {alheia && (
        <p className="text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave mt-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5">
          {carteira.tipo === "equipe"
            ? "Você está vendo a carteira da equipe inteira."
            : `Você está vendo a carteira de ${nomeDaCarteira}.`}
          <Link href="/corretor/leads" className="font-medium underline underline-offset-2">
            Voltar aos seus leads
          </Link>
        </p>
      )}

      {/* Recorte vindo de um KPI da administração. Precisa estar ESCRITO na
          tela: filtro invisível filtrando é a pior surpresa de uma lista —
          o gestor esqueceria por que "sumiram" leads. */}
      {(semDono || paradoDias) && (
        <p className="text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave mt-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5">
          Mostrando só{" "}
          {semDono
            ? "leads sem corretor responsável"
            : `leads parados há ${paradoDias}+ dias`}
          .
          <Link
            href={semDono ? "/corretor/leads?corretor=equipe" : comCarteira("/corretor/leads")}
            className="font-medium underline underline-offset-2"
          >
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
        verArquivados={verArquivados}
        empreendimentos={empreendimentos}
      />

      <BotaoVoltarAoTopo />
    </div>
  );
}
