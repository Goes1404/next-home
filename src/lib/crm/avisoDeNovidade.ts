import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { linkDaPagina } from "@/lib/whatsapp/resolverMidia";
import { gerarEEnviarPelaIA } from "@/lib/whatsapp/aberturaPelaIA";
import { liberarConversaPorPalavraChave, obterOuCriarConversa } from "@/lib/whatsapp/repositorio";
import {
  descreverPedido,
  imovelParaAvisar,
  instrucaoDoAviso,
  lerAlerta,
  type ImovelNovo,
} from "./alertaDeNovidade";

/** Imóvel "novo" para o aviso: publicado nos últimos 3 dias. */
const JANELA_DE_NOVIDADE_H = 72;

/**
 * Roda no tique dos follow-ups, DEPOIS da janela comercial e da trava (é
 * contato por iniciativa nossa). Teto por tique porque cada aviso custa uma
 * chamada de IA. A trava de repetição é `detalhes.avisados`, gravada ANTES
 * do envio: se ele falhar, o imóvel não é reenviado a cada 5 minutos.
 */
export async function avisarQuemPediuAlerta(limite = 2): Promise<number> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - JANELA_DE_NOVIDADE_H * 3600_000).toISOString();
  const { data: novosBrutos } = await supabase
    .from("empreendimentos")
    .select("id, nome, slug, cidade, bairro, preco_a_partir, tipologias(dormitorios)")
    .eq("publicado", true)
    .gte("created_at", desde)
    .limit(20);
  if (!novosBrutos || novosBrutos.length === 0) return 0;
  const novos: ImovelNovo[] = novosBrutos.map((e) => ({
    id: e.id,
    nome: e.nome,
    slug: e.slug,
    cidade: e.cidade,
    bairro: e.bairro,
    precoAPartir: e.preco_a_partir != null ? Number(e.preco_a_partir) : null,
    dormitorios: (e.tipologias ?? []).map((t) => t.dormitorios),
  }));

  const { data: leads } = await supabase
    .from("leads")
    .select("id, nome, telefone_e164, corretor_id, detalhes, regiao_interesse, dormitorios_min, orcamento_max")
    .eq("detalhes->>alerta", "true")
    .is("nao_contatar_em", null)
    .is("arquivado_em", null)
    .not("corretor_id", "is", null)
    .not("telefone_e164", "is", null)
    .filter("etapa", "in", "(novo,primeiro_contato,visita_agendada,documentacao)")
    .order("created_at", { ascending: true })
    .limit(200);

  let enviados = 0;
  for (const lead of leads ?? []) {
    if (enviados >= limite) break;
    const alerta = lerAlerta(lead.detalhes);
    if (!alerta.ativo) continue;
    const imovel = imovelParaAvisar(lead, novos, alerta.avisados);
    if (!imovel) continue;

    const detalhes = { ...(lead.detalhes as Record<string, unknown>), avisados: [...alerta.avisados, imovel.id] };
    const { error } = await supabase.from("leads").update({ detalhes }).eq("id", lead.id);
    if (error) continue;

    const { data: instancia } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id, corretor_id, instance_name, status_conexao, nome_assistente, tom_voz, conectado_em")
      .eq("corretor_id", lead.corretor_id!)
      .maybeSingle();
    if (!instancia || instancia.status_conexao !== "conectado") continue;

    const conversa = await obterOuCriarConversa({
      corretorId: lead.corretor_id!,
      telefoneCliente: lead.telefone_e164!,
      nomeCliente: lead.nome,
    });
    if (!conversa) continue;
    // Pedir o aviso pelo site é a autorização para a assistente falar.
    await liberarConversaPorPalavraChave(conversa.id);

    const r = await gerarEEnviarPelaIA({
      conversa: { id: conversa.id, telefoneCliente: conversa.telefoneCliente, leadId: lead.id, eTeste: conversa.eTeste },
      instancia,
      instrucaoAbertura: instrucaoDoAviso({
        nome: lead.nome,
        pedido: descreverPedido(lead),
        imovel: imovel.nome,
        link: linkDaPagina(imovel.slug),
      }),
    });
    if (r.enviou) enviados++;
    else console.warn("[aviso de novidade] não saiu:", lead.id, r.erro);
  }
  return enviados;
}
