import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { filtrarContasOcultas } from "@/lib/corretores/contaOculta";
import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import { casarImovel, casarCorretor } from "@/lib/inbound/casamento";
import type { LeadExtraido } from "@/lib/inbound/types";

type Supa = ReturnType<typeof createServiceClient>;

export type LeadGravado = { id: string; deduplicado: boolean; nome: string; telefone: string };

export type ResultadoDaGravacao = {
  processados: LeadGravado[];
  falhas: { telefone: string; motivo: string }[];
  totalInseridos: number;
  totalDeduplicados: number;
};

/**
 * O caminho ÚNICO de um lead que chega de fora sem sessão (29/10/2026):
 * casamento do imóvel e do corretor citado, deduplicação pelo telefone no
 * grupo e o insert que dispara a roleta (`distribuir_lead`, gatilho da
 * 0007) quando o lead nasce sem dono.
 *
 * Nasceu do miolo de `processarEmailDeLead` para o webhook dos portais
 * (`/api/webhooks/portais/[portal]`) usar a MESMA regra: duas cópias da
 * deduplicação divergiriam no primeiro ajuste, e o mesmo cliente chegando
 * pelo e-mail do ZAP e pelo webhook do Canal Pro viraria duas fichas.
 *
 * Recebe o cliente da chave de serviço de quem validou a entrada (o segredo
 * do webhook de e-mail, o token do portal, a conta do Gmail) e o grupo que
 * essa validação decidiu. Toda leitura filtra o grupo (L08).
 */
export async function gravarLeadsRecebidos(
  supabase: Supa,
  leadsExtraidos: LeadExtraido[],
  opcoes: {
    grupoId: string;
    corretorDono?: string | null;
    /** `inbound/<portal>` no e-mail; `portal/<portal>` no webhook dos portais. */
    origem: (lead: LeadExtraido) => string;
    emailMessageId?: string | null;
  },
): Promise<ResultadoDaGravacao> {
  /*
   * Imóvel, corretor citado e duplicado só no grupo do lead (L08): sem o
   * filtro, um e-mail na caixa de outro grupo que citasse "Bruna" criaria o
   * lead na carteira dela, e o telefone de um cliente de outro grupo faria
   * reescrever a ficha dele. O corretor citado é sempre do grupo, então ele
   * nunca vence o dono da caixa de outro grupo.
   */
  const [{ data: empreendimentos }, { data: todosCorretores }] = await Promise.all([
    supabase
      .from("empreendimentos")
      .select("id, nome, slug, codigo_legado, nomes_alternativos")
      .eq("grupo_id", opcoes.grupoId)
      .limit(500),
    supabase.from("corretores").select("id, nome, slug").eq("grupo_id", opcoes.grupoId).eq("ativo", true),
  ]);
  // Conta oculta (0189) não recebe lead nem por nome citado no e-mail: a
  // chave de serviço não passa pela RLS, então o recorte é aqui.
  const corretores = await filtrarContasOcultas(supabase, todosCorretores ?? [], opcoes.grupoId);

  const processados: LeadGravado[] = [];
  const falhas: { telefone: string; motivo: string }[] = [];
  let totalInseridos = 0;
  let totalDeduplicados = 0;

  for (const lead of leadsExtraidos) {
    // Só o imóvel: desde 28/09 ele não tem corretor dono. Sem corretor
    // citado nem dono da caixa, o lead nasce sem dono e a roleta decide.
    const empreendimentoId = casarImovel(
      { termo: lead.imovelInteresse ?? null, codigo: lead.codigoReferencia ?? null },
      empreendimentos ?? [],
    );
    const corretorId = casarCorretor(lead.corretorMencionado ?? null, corretores ?? []);

    /*
     * Compara pela coluna gerada `telefone_e164`, não pelo texto digitado: o
     * mesmo cliente chega "(11) 99123-4567" por um portal e "11991234567"
     * por outro, e a igualdade crua nunca casava os dois.
     */
    const e164 = normalizarTelefoneBrasileiro(lead.telefone);

    /*
     * Sem janela de 30 dias desde 03/10/2026 (plano de ativação): a mesma
     * pessoa voltando meses depois por outro portal é a mesma ficha, e uma
     * segunda ficha vira dois corretores ligando para ela. Lead arquivado
     * fica de fora: arquivar é tirar do caminho, e quem volta pede ficha nova.
     *
     * E-mail lido da caixa DE um corretor só deduplica na carteira dele: a
     * caixa é dele, e ela não pode escrever na ficha de um colega.
     */
    let buscaExistente = supabase
      .from("leads")
      .select("id, mensagem, empreendimento_id")
      .eq("grupo_id", opcoes.grupoId)
      .eq("telefone_e164", e164 ?? lead.telefone)
      .is("arquivado_em", null);
    if (opcoes.corretorDono) buscaExistente = buscaExistente.eq("corretor_id", opcoes.corretorDono);
    const { data: existente, error: erroBusca } = await buscaExistente
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroBusca) console.error("[inbound] falha ao consultar duplicado:", erroBusca.message);

    if (existente) {
      const hoje = new Date().toLocaleDateString("pt-BR");
      const novaMensagem =
        `${existente.mensagem || ""}\n\n[Novo contato via ${lead.portalOrigem} em ${hoje}]: ${lead.mensagemOriginal || ""}`.trim();

      const { error: erroUpdate } = await supabase
        .from("leads")
        .update({
          mensagem: novaMensagem,
          etapa_alterada_em: new Date().toISOString(),
          portal_origem: lead.portalOrigem,
          // O imóvel só entra onde a ficha não tem um: o que o corretor
          // escolheu (ou o primeiro pedido) não é trocado por e-mail.
          ...(empreendimentoId && !existente.empreendimento_id ? { empreendimento_id: empreendimentoId } : {}),
        })
        .eq("id", existente.id)
        .eq("grupo_id", opcoes.grupoId);

      if (erroUpdate) {
        console.error(`[inbound] falha ao atualizar duplicado ${existente.id}:`, erroUpdate.message);
        falhas.push({ telefone: lead.telefone, motivo: erroUpdate.message });
        continue;
      }

      totalDeduplicados++;
      processados.push({ id: existente.id, deduplicado: true, nome: lead.nome, telefone: lead.telefone });
      continue;
    }

    const { data: novo, error: erroInsert } = await supabase
      .from("leads")
      .insert({
        grupo_id: opcoes.grupoId,
        nome: lead.nome,
        telefone: lead.telefone,
        email: lead.email,
        mensagem: lead.mensagemOriginal,
        tipo: "comprador",
        origem: opcoes.origem(lead),
        portal_origem: lead.portalOrigem,
        anuncio_origem: lead.imovelInteresse || lead.codigoReferencia || null,
        email_message_id: opcoes.emailMessageId || null,
        empreendimento_id: empreendimentoId,
        corretor_id: corretorId ?? opcoes.corretorDono ?? null,
        consentimento_lgpd: true,
      })
      .select("id")
      .single();

    /*
     * O contador só sobe depois de o banco confirmar. Antes ele subia junto
     * com a tentativa, e a resposta anunciava leads que nunca existiram.
     */
    if (erroInsert || !novo) {
      const motivo = erroInsert?.message ?? "insert não retornou linha";
      console.error(`[inbound] falha ao inserir lead: ${motivo}`);
      falhas.push({ telefone: lead.telefone, motivo });
      continue;
    }

    totalInseridos++;
    processados.push({ id: novo.id, deduplicado: false, nome: lead.nome, telefone: lead.telefone });
  }

  return { processados, falhas, totalInseridos, totalDeduplicados };
}
