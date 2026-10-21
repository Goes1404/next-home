import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { gravarMensagem, obterOuCriarConversa } from "@/lib/whatsapp/repositorio";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { registrarInteracao } from "@/lib/crm/interacoes";
import { primeiroNomeUtil } from "@/lib/leads/nomeExibido";
import { primeiroNome } from "@/lib/format";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO, preencherTexto } from "./roletaTextos";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Roleta dos anúncios (0204). Lead que NASCEU agora pela etiqueta de anúncio
 * da Meta no número de A é repassado ao próximo da lista de A:
 *
 * 1. `proximo_da_roleta` escolhe B e avança a vez (atômico no banco);
 * 2. o número de B manda a abertura. Falhou? B entra na lista de excluídos e
 *    a roleta tenta o seguinte. Ninguém conseguiu → o lead fica com A;
 * 3. só então a ficha muda de dono, o número de A manda a passagem, e B é
 *    avisado (WhatsApp + notificação no celular).
 *
 * A abertura vai PRIMEIRO de propósito: passar a ficha antes e a mensagem
 * falhar deixaria o cliente sem ninguém. A IA não responde lead de anúncio
 * (20/10/2026): a conversa nova de B nasce desligada. Limite diário e
 * intervalo das listas não valem aqui (decisão do dono): é resposta a quem
 * acabou de pedir contato. Nunca lança.
 *
 * Devolve o id de B quando houve repasse; `null` quando o lead fica com A.
 */
export async function repassarPelaRoleta(params: {
  leadId: string;
  corretorId: string;
  instanceNameDoDono: string;
  conversaDoDonoId: string;
  telefoneCliente: string;
  nomeCliente: string | null;
}): Promise<string | null> {
  try {
    return await repassar(createServiceClient(), params);
  } catch (erro) {
    console.error("[roleta] falhou:", erro instanceof Error ? erro.message : erro);
    return null;
  }
}

async function repassar(
  supabase: Supa,
  p: Parameters<typeof repassarPelaRoleta>[0],
): Promise<string | null> {
  const { data: roleta } = await supabase
    .from("roleta_anuncios")
    .select("ligada, texto_passagem, texto_abertura")
    .eq("corretor_id", p.corretorId)
    .maybeSingle();
  if (!roleta?.ligada) return null;

  const { data: lead } = await supabase
    .from("leads")
    .select("id, nome, grupo_id, origem_atribuicao, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome)")
    .eq("id", p.leadId)
    .maybeSingle();
  if (!lead) return null;
  const imovel = (Array.isArray(lead.empreendimento) ? lead.empreendimento[0] : lead.empreendimento)?.nome ?? null;
  const cliente = primeiroNomeUtil(lead.nome ?? p.nomeCliente);

  // O nome da casa é o do grupo do lead (cache de 60 s; o grupo 1 não consulta).
  const imobiliaria = (await lerMarcaDoCrm(lead.grupo_id)).nome;

  const excluidos: string[] = [];
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const { data: destino, error } = await supabase.rpc("proximo_da_roleta", {
      p_corretor: p.corretorId,
      p_excluir: excluidos,
    });
    if (error) {
      console.error("[roleta] falha ao escolher o próximo:", error.message);
      return null;
    }
    // Ninguém pode receber, ou a vez é do próprio dono: o lead fica com ele.
    if (!destino || destino === p.corretorId) return null;

    const [{ data: inst }, { data: novo }] = await Promise.all([
      supabase
        .from("corretor_whatsapp_instancias")
        .select("instance_name")
        .eq("corretor_id", destino)
        .eq("status_conexao", "conectado")
        .limit(1)
        .maybeSingle(),
      supabase.from("corretores").select("nome").eq("id", destino).maybeSingle(),
    ]);
    if (!inst?.instance_name || !novo) {
      excluidos.push(destino);
      continue;
    }

    const vars = {
      corretor: primeiroNome(novo.nome),
      cliente,
      imovel,
      imobiliaria,
    };
    const abertura = preencherTexto(roleta.texto_abertura || TEXTO_ABERTURA_PADRAO, vars);
    const envio = await enviarMensagemWhatsapp({
      instanceName: inst.instance_name,
      telefone: p.telefoneCliente,
      texto: abertura,
    });
    if (!envio.enviado) {
      console.warn("[roleta] abertura não saiu, tentando o próximo:", envio.motivo);
      excluidos.push(destino);
      continue;
    }

    await passarAFicha(supabase, { ...p, destino, nomeNovo: novo.nome, origemAnterior: lead.origem_atribuicao });

    // A conversa nova, no painel de B, com a IA desligada (lead de anúncio).
    const conversaNova = await obterOuCriarConversa({
      corretorId: destino,
      telefoneCliente: p.telefoneCliente,
      nomeCliente: p.nomeCliente,
    }).catch(() => null);
    if (conversaNova) {
      await supabase.from("whatsapp_conversas").update({ bot_ativo: false }).eq("id", conversaNova.id);
      await gravarMensagem({
        conversaId: conversaNova.id,
        remetente: "bot",
        conteudo: abertura,
        conversaLiberada: true,
        providerMessageId: envio.messageId ?? null,
        statusEntrega: "enviada",
      });
    }

    const passagem = preencherTexto(roleta.texto_passagem || TEXTO_PASSAGEM_PADRAO, vars);
    const envioPassagem = await enviarMensagemWhatsapp({
      instanceName: p.instanceNameDoDono,
      telefone: p.telefoneCliente,
      texto: passagem,
    });
    if (envioPassagem.enviado) {
      await gravarMensagem({
        conversaId: p.conversaDoDonoId,
        remetente: "bot",
        conteudo: passagem,
        conversaLiberada: true,
        providerMessageId: envioPassagem.messageId ?? null,
        statusEntrega: "enviada",
      });
    }

    const nomeNoAviso = cliente ?? "Cliente novo";
    await avisarCorretor(
      supabase,
      destino,
      `*🎯 Lead de anúncio para você: ${nomeNoAviso}*\nVeio pela roleta. Já mandei a primeira mensagem do seu número; a conversa é sua.\n${linkDoPainel(lead.grupo_id, `/corretor/leads/${p.leadId}`)}`,
      `/corretor/leads/${p.leadId}`,
    );
    return destino;
  }
  return null;
}

async function passarAFicha(
  supabase: Supa,
  p: { leadId: string; corretorId: string; destino: string; nomeNovo: string; origemAnterior: string | null },
): Promise<void> {
  // A origem anterior fica guardada antes de ser sobrescrita, como em todo
  // repasse (ver `repasseGuardaOrigem.test.ts`).
  await supabase.from("lead_interacoes").insert({
    lead_id: p.leadId,
    corretor_id: null,
    tipo: "repasse",
    conteudo: "Repasse pela roleta do anúncio",
    detalhes: { origem_anterior: p.origemAnterior, de: p.corretorId, para: p.destino },
  });
  const { error } = await supabase
    .from("leads")
    .update({
      corretor_id: p.destino,
      origem_atribuicao: "roleta",
      // Se B sair, o lead volta para quem pagou o anúncio (0206).
      anuncio_pago_por: p.corretorId,
      // B é avisado pela roleta; o aviso de lead novo não repete.
      aviso_lead_novo_em: new Date().toISOString(),
    })
    .eq("id", p.leadId);
  if (error) console.error("[roleta] ficha não mudou de dono:", error.message);
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: null,
    tipo: "sistema",
    conteudo: `Lead do anúncio repassado para ${p.nomeNovo} pela roleta`,
    detalhes: { de: p.corretorId, para: p.destino, motivo: "roleta_do_anuncio" },
  });
}
