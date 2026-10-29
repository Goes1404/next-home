import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { perfilDoLead } from "@/lib/crm/compatibilidade";
import { leadsQueCombinam, temPressaDeMudar } from "@/lib/crm/matchDeImoveis";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { recursosDeImoveis } from "@/lib/grupos/ramo";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { deveAvisarMatch, textoDoAvisoDeMatch } from "@/lib/notificacoes/regrasDoAvisoDeMatch";

type Supa = ReturnType<typeof createServiceClient>;

/** Imóvel publicado ou atualizado nas últimas 72 horas. */
const JANELA_H = 72;
/** Lead que ainda pede trabalho: a campanha também não manda para os outros. */
const ETAPAS_ABERTAS = "(novo,primeiro_contato,em_conversa,qualificado,visita_agendada,visitou,proposta,documentacao)";

/**
 * Imóvel publicado ou atualizado → cada corretor sabe quais leads DELE
 * combinam (29/10/2026). Notificação no celular, nunca mensagem ao cliente:
 * mandar o imóvel continua sendo gesto do corretor (vitrine pela ficha ou
 * campanha com as travas). A trava de repetição é `avisos_de_match` (0245),
 * gravada ANTES do envio; a regra mora em `regrasDoAvisoDeMatch.ts`.
 *
 * Roda no tique dos follow-ups. Os imóveis vêm de todos os grupos; os leads,
 * os dossiês e as travas são lidos grupo a grupo, e cada imóvel só cruza com
 * a carteira do grupo dele (L13). Sem a 0245 aplicada a trava não grava e o
 * aviso não sai (falha fechada: sem trava, avisaria a cada 5 minutos).
 */
export async function avisarLeadsQueCombinam(supabase: Supa, agora = new Date(), limite = 20): Promise<number> {
  const desde = new Date(agora.getTime() - JANELA_H * 3600_000).toISOString();
  const { data: imoveis } = await supabase
    .from("empreendimentos")
    .select("id, grupo_id, nome, slug, cidade, bairro, preco_a_partir, status, tipologias(dormitorios)")
    .eq("publicado", true)
    .gte("updated_at", desde)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (!imoveis || imoveis.length === 0) return 0;

  const grupos = [...new Set(imoveis.map((i) => i.grupo_id))];
  let enviados = 0;

  for (const grupoId of grupos) {
    // Imóvel publicado só existe em grupo com catálogo; o ramo não é lido aqui (padrão imobiliária).
    if (!recursosDeImoveis(null)) continue;
    const doGrupo = imoveis.filter((i) => i.grupo_id === grupoId);
    const [{ data: leads }, { data: dossies }, { data: travas }, credito] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, grupo_id, nome, telefone, corretor_id, regiao_interesse, dormitorios_min, orcamento_max, orcamento_min, renda_mensal, empreendimento_id, imovel_interesse_id",
        )
        .eq("grupo_id", grupoId)
        .not("corretor_id", "is", null)
        .is("arquivado_em", null)
        .is("nao_contatar_em", null)
        .filter("etapa", "in", ETAPAS_ABERTAS)
        .limit(5000),
      supabase
        .from("lead_observacoes_ia")
        .select("lead_id, orcamento_max, orcamento_min, urgencia_mudanca")
        .eq("grupo_id", grupoId)
        .limit(5000),
      supabase
        .from("avisos_de_match")
        .select("empreendimento_id, corretor_id, leads, avisado_em")
        .eq("grupo_id", grupoId)
        .limit(5000),
      getParametrosCredito(grupoId),
    ]);
    if (!leads || leads.length === 0 || !travas) continue;
    const dossie = new Map((dossies ?? []).map((d) => [d.lead_id, d]));
    const numero = (v: number | string | null | undefined) => (v != null && Number(v) > 0 ? Number(v) : null);
    const ultimoDoCorretor = new Map<string, string>();
    for (const t of travas) {
      const atual = ultimoDoCorretor.get(t.corretor_id);
      if (!atual || t.avisado_em > atual) ultimoDoCorretor.set(t.corretor_id, t.avisado_em);
    }

    for (const imovel of doGrupo) {
      const combinam = leadsQueCombinam(
        {
          id: imovel.id,
          cidade: imovel.cidade,
          bairro: imovel.bairro,
          precoAPartir: imovel.preco_a_partir != null ? Number(imovel.preco_a_partir) : null,
          dormitorios: (imovel.tipologias ?? []).map((t) => t.dormitorios),
          status: imovel.status,
        },
        // O casamento é pelo grupo das duas linhas: lead de outro grupo
        // nunca entra, mesmo que a leitura mudasse.
        leads.filter((l) => l.grupo_id === imovel.grupo_id),
        (l) => {
          const d = dossie.get(l.id);
          return {
            ...perfilDoLead(l, d, credito),
            orcamentoMin: numero(l.orcamento_min) ?? numero(d?.orcamento_min),
            temPressa: temPressaDeMudar(d?.urgencia_mudanca),
            pediu: [l.imovel_interesse_id, l.empreendimento_id].filter((x): x is string => Boolean(x)),
          };
        },
      );

      const porCorretor = new Map<string, typeof combinam>();
      for (const l of combinam) porCorretor.set(l.corretor_id!, [...(porCorretor.get(l.corretor_id!) ?? []), l]);

      for (const [corretorId, dele] of porCorretor) {
        if (enviados >= limite) return enviados;
        const anterior = travas.find((t) => t.empreendimento_id === imovel.id && t.corretor_id === corretorId) ?? null;
        if (!deveAvisarMatch({ leadsAgora: dele.length, anterior, ultimoDoCorretor: ultimoDoCorretor.get(corretorId) ?? null, agora })) {
          continue;
        }
        // A trava antes do envio: se o envio falhar, não repete a cada tique.
        const { error } = await supabase
          .from("avisos_de_match")
          .upsert(
            { grupo_id: grupoId, empreendimento_id: imovel.id, corretor_id: corretorId, leads: dele.length, avisado_em: agora.toISOString() },
            { onConflict: "empreendimento_id,corretor_id" },
          );
        if (error) {
          console.warn("[match] trava não gravada:", error.message);
          continue;
        }
        ultimoDoCorretor.set(corretorId, agora.toISOString());
        const texto = textoDoAvisoDeMatch({
          imovel: imovel.nome,
          leads: dele.length,
          nomes: dele.map((l) => nomeParaExibir(l).split(" ")[0]),
        });
        const n = await notificarCorretor(supabase, corretorId, {
          ...texto,
          url: `/corretor/imoveis/${imovel.slug}/leads-que-combinam`,
          tag: `match-${imovel.id}`,
        });
        if (n > 0) enviados++;
      }
    }
  }
  return enviados;
}
