import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getCorretorLogado,
  getEquipeAtiva,
  getEmpreendimentosParaFiltro,
  souGestor,
} from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { AbasLeads } from "@/app/corretor/(painel)/_componentes/AbasLeads";
import { AnotacoesClient, type AnotacaoNaTela } from "./AnotacoesClient";

export const metadata: Metadata = { title: "Anotações" };

function primeiroValor(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** Quantas anotações por carga — bloco de notas não é arquivo morto. */
const ANOTACOES_POR_PAGINA = 50;

/**
 * O bloco de notas do corretor (0100): nota livre, vínculo opcional a lead,
 * direcionável a colega, lembrete com WhatsApp + fila do Início.
 *
 * Todo filtro vive na URL (`?lead=`, `?empreendimento=`, `?colega=`,
 * `?pendentes=1`), como toda lista do painel — link compartilhado chega já
 * recortado. O recorte por empreendimento passa pelo LEAD vinculado: o
 * empreendimento não é coluna da nota de propósito (duas verdades
 * divergiriam).
 */
export default async function AnotacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const leadFiltro = primeiroValor(params.lead) || null;
  const empreendimentoFiltro = primeiroValor(params.empreendimento) || null;
  const colegaFiltro = primeiroValor(params.colega) || null;
  const soPendentes = primeiroValor(params.pendentes) === "1";

  const supabase = await createClient();

  let query = supabase
    .from("anotacoes")
    .select(
      "id, corretor_id, destinatario_id, lead_id, texto, lembrete_em, lembrete_whatsapp, lembrete_enviado_em, lembrete_erro, concluida_em, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(ANOTACOES_POR_PAGINA);

  if (leadFiltro) query = query.eq("lead_id", leadFiltro);
  if (colegaFiltro) query = query.eq("destinatario_id", colegaFiltro);
  if (soPendentes) query = query.is("concluida_em", null).not("lembrete_em", "is", null);

  const [{ data: linhas }, gestor, empreendimentos, { data: leadDoFiltro }] = await Promise.all([
    query,
    souGestor(),
    getEmpreendimentosParaFiltro(),
    // Para o composer nascer com o chip do lead quando a tela chega da
    // ficha (?lead=): anotar sobre alguém não pode exigir buscá-lo de novo.
    leadFiltro
      ? supabase.from("leads").select("id, nome, telefone").eq("id", leadFiltro).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const notas = linhas ?? [];

  /*
   * Leads e nomes em consultas separadas, não em embed do PostgREST: o
   * types.ts é mantido à mão e não conhece as relações — duas queries
   * simples valem mais que um cast (a mesma escolha de `lerMensagens`).
   */
  const idsLeads = [...new Set(notas.map((n) => n.lead_id).filter((v): v is string => Boolean(v)))];
  const idsCorretores = [
    ...new Set(notas.flatMap((n) => [n.corretor_id, n.destinatario_id])),
  ];

  const [{ data: leadsVinculados }, { data: nomes }] = await Promise.all([
    idsLeads.length > 0
      ? supabase
          .from("leads")
          .select("id, nome, etapa, empreendimento_id, imovel_interesse_id")
          .in("id", idsLeads)
      : Promise.resolve({ data: [] as never[] }),
    idsCorretores.length > 0
      ? supabase.from("corretores").select("id, nome").in("id", idsCorretores)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const leadPorId = new Map(
    (leadsVinculados ?? []).map((l) => [
      l.id,
      l as { id: string; nome: string; etapa: string; empreendimento_id: string | null; imovel_interesse_id: string | null },
    ]),
  );
  const nomePorId = new Map((nomes ?? []).map((c) => [c.id, c.nome as string]));

  const anotacoes: AnotacaoNaTela[] = notas
    .filter((n) => {
      if (!empreendimentoFiltro) return true;
      const lead = n.lead_id ? leadPorId.get(n.lead_id) : undefined;
      return (
        lead?.empreendimento_id === empreendimentoFiltro ||
        lead?.imovel_interesse_id === empreendimentoFiltro
      );
    })
    .map((n) => {
      const lead = n.lead_id ? leadPorId.get(n.lead_id) : undefined;
      return {
        id: n.id,
        texto: n.texto,
        criadaEm: n.created_at,
        lembreteEm: n.lembrete_em,
        lembreteWhatsapp: n.lembrete_whatsapp,
        lembreteEnviadoEm: n.lembrete_enviado_em,
        lembreteErro: n.lembrete_erro,
        concluidaEm: n.concluida_em,
        souAutor: n.corretor_id === corretor.id,
        souDestinatario: n.destinatario_id === corretor.id,
        autorNome: nomePorId.get(n.corretor_id) ?? "",
        destinatarioNome: nomePorId.get(n.destinatario_id) ?? "",
        lead: lead ? { id: lead.id, nome: lead.nome, etapa: lead.etapa } : null,
      };
    });

  // Colegas para direcionar: a equipe ativa menos o próprio corretor. O
  // gestor vê todos; corretor comum também — delegar nota não é privilégio.
  const equipe = (await getEquipeAtiva()).filter((c) => c.id !== corretor.id);

  return (
    <div>
      <CabecalhoDeTela
        secao="Pessoas"
        titulo="Anotações"
        descricao="Seu bloco de notas: vincule a um lead, mande para um colega, e receba o lembrete no WhatsApp e na fila do Início."
      />
      <AbasLeads ativa="/corretor/anotacoes" />
      <AnotacoesClient
        anotacoes={anotacoes}
        equipe={equipe}
        empreendimentos={empreendimentos}
        gestor={gestor}
        leadInicial={leadDoFiltro ?? null}
        filtros={{
          lead: leadFiltro,
          empreendimento: empreendimentoFiltro,
          colega: colegaFiltro,
          pendentes: soPendentes,
        }}
      />
    </div>
  );
}
