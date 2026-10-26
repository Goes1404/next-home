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
import { BOAS_VINDAS_DE_CAMPANHA } from "./impulsionamentos";
import { planoDeMensagens, type ModoDaRoleta } from "./planoDaRoleta";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO, preencherTexto } from "./roletaTextos";

type Supa = ReturnType<typeof createServiceClient>;
type Parametros = {
  leadId: string;
  corretorId: string;
  instanceNameDoDono: string;
  conversaDoDonoId: string;
  telefoneCliente: string;
  nomeCliente: string | null;
};
type ModoLigado = Exclude<ModoDaRoleta, "desligada">;

/**
 * Como a roleta deste corretor está agora. `desligada` quando não há linha,
 * quando `ligada = false` e quando a leitura falha: na dúvida a roleta não age
 * e o webhook segue o caminho de sempre. Nunca lança.
 */
export async function lerModoDaRoleta(corretorId: string): Promise<ModoDaRoleta> {
  try {
    const { data, error } = await createServiceClient()
      .from("roleta_anuncios")
      .select("ligada, modo_aviso")
      .eq("corretor_id", corretorId)
      .maybeSingle();
    if (error || !data?.ligada) return "desligada";
    return data.modo_aviso === "grupo" ? "grupo" : "mensagem";
  } catch {
    return "desligada";
  }
}

/**
 * Roleta dos anúncios (0204). Lead que NASCEU agora pela etiqueta de anúncio
 * da Meta no número de A é repassado ao próximo da lista de A. O modo da
 * roleta (0217) diz como B fica sabendo:
 *
 * - `mensagem`: o número de A manda a passagem e logo depois o número de B
 *   manda a abertura. Falhou a abertura? B entra na lista de excluídos e a
 *   roleta tenta o seguinte.
 * - `grupo`: nenhuma mensagem sai do número de B (nem do de A; a boas-vindas
 *   já saiu pelo webhook). B é avisado no grupo e no celular para ligar.
 *
 * Em qualquer modo `proximo_da_roleta` escolhe B e avança a vez (atômico no
 * banco), e só DEPOIS de a ficha trocar de dono o aviso do grupo é
 * enfileirado: ele vai para o dono atual, nunca para quem pagou. Se a troca
 * falhar o repasse para ali e ninguém é avisado como se o lead fosse dele.
 *
 * No modo `mensagem`, todo caminho que termina sem repasse manda a
 * boas-vindas fixa do número de A (o webhook não manda mais nesse modo): o
 * cliente nunca fica sem resposta. Limite diário e intervalo das listas não
 * valem aqui (decisão do dono): é resposta a quem acabou de pedir contato. A
 * IA não responde lead de anúncio (20/10/2026): a conversa nova de B nasce
 * desligada. Nunca lança.
 *
 * Devolve o id de B quando houve repasse; `null` quando o lead fica com A.
 */
export async function repassarPelaRoleta(params: Parametros): Promise<string | null> {
  const modo = await lerModoDaRoleta(params.corretorId);
  if (modo === "desligada") return null;

  // `respondido`: o cliente já leu a abertura de quem vai atendê-lo. Sem
  // isso, o caminho sem repasse manda a boas-vindas do dono.
  const estado = { respondido: false };
  let destino: string | null = null;
  try {
    destino = await repassar(createServiceClient(), params, modo, estado);
  } catch (erro) {
    console.error("[roleta] falhou:", erro instanceof Error ? erro.message : erro);
  }
  if (!destino && !estado.respondido) await mandarBoasVindasDoDono(modo, params);
  return destino;
}

/** Sem repasse no modo mensagem: o número do dono responde o cliente. */
async function mandarBoasVindasDoDono(modo: ModoLigado, p: Parametros): Promise<void> {
  if (!planoDeMensagens(modo, false).includes("boas_vindas")) return;
  try {
    const envio = await enviarMensagemWhatsapp({
      instanceName: p.instanceNameDoDono,
      telefone: p.telefoneCliente,
      texto: BOAS_VINDAS_DE_CAMPANHA,
    });
    if (!envio.enviado) {
      console.warn("[roleta] boas-vindas não saiu:", envio.motivo);
      return;
    }
    await gravarMensagem({
      conversaId: p.conversaDoDonoId,
      remetente: "bot",
      conteudo: BOAS_VINDAS_DE_CAMPANHA,
      conversaLiberada: true,
      providerMessageId: envio.messageId ?? null,
      statusEntrega: "enviada",
    });
  } catch (erro) {
    console.error("[roleta] boas-vindas falhou:", erro instanceof Error ? erro.message : erro);
  }
}

async function repassar(
  supabase: Supa,
  p: Parametros,
  modo: ModoLigado,
  estado: { respondido: boolean },
): Promise<string | null> {
  const { data: roleta } = await supabase
    .from("roleta_anuncios")
    .select("texto_passagem, texto_abertura")
    .eq("corretor_id", p.corretorId)
    .maybeSingle();
  if (!roleta) return null;

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
      p_modo: modo,
    });
    if (error) {
      console.error("[roleta] falha ao escolher o próximo:", error.message);
      return null;
    }
    // Ninguém pode receber, ou a vez é do próprio dono: o lead fica com ele.
    if (!destino || destino === p.corretorId) return null;

    const [inst, { data: novo }] = await Promise.all([
      // No modo grupo quem manda é o número central: o WhatsApp do escolhido
      // nem é consultado.
      modo === "grupo"
        ? Promise.resolve(null)
        : supabase
            .from("corretor_whatsapp_instancias")
            .select("instance_name")
            .eq("corretor_id", destino)
            .eq("status_conexao", "conectado")
            .limit(1)
            .maybeSingle()
            .then((r) => r.data),
      supabase.from("corretores").select("nome").eq("id", destino).eq("grupo_id", lead.grupo_id).maybeSingle(),
    ]);
    if (!novo || (modo === "mensagem" && !inst?.instance_name)) {
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
    const passagem = preencherTexto(roleta.texto_passagem || TEXTO_PASSAGEM_PADRAO, vars);
    let envioAbertura: Awaited<ReturnType<typeof enviarMensagemWhatsapp>> | null = null;

    // No modo grupo o plano é vazio: nada sai por aqui.
    for (const mensagem of planoDeMensagens(modo, true)) {
      if (mensagem === "passagem") {
        // A passagem do dono sai ANTES da abertura de B. Se ela não sair, a
        // abertura segue: B se apresenta sozinho.
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
      } else if (mensagem === "abertura") {
        envioAbertura = await enviarMensagemWhatsapp({
          instanceName: inst?.instance_name ?? "",
          telefone: p.telefoneCliente,
          texto: abertura,
        });
      }
    }

    if (modo === "mensagem") {
      if (!envioAbertura?.enviado) {
        console.warn("[roleta] abertura não saiu, tentando o próximo:", envioAbertura?.motivo);
        excluidos.push(destino);
        continue;
      }
      estado.respondido = true;
    }

    // Trocar o dono é o que torna o repasse real. Falhou? O lead fica com
    // quem pagou e ninguém é avisado como se ele fosse seu.
    const trocou = await passarAFicha(supabase, {
      leadId: p.leadId,
      grupoId: lead.grupo_id,
      corretorId: p.corretorId,
      destino,
      nomeNovo: novo.nome,
      origemAnterior: lead.origem_atribuicao,
    });
    if (!trocou) return null;

    // O aviso do grupo é decidido DEPOIS da troca: sai para o dono atual.
    const { error: erroAviso } = await supabase.rpc("enfileirar_aviso_do_lead", { p_lead: p.leadId });
    if (erroAviso) console.error("[roleta] aviso do grupo não foi enfileirado:", erroAviso.message);

    if (modo === "mensagem" && envioAbertura) {
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
          providerMessageId: envioAbertura.messageId ?? null,
          statusEntrega: "enviada",
        });
      }
    }

    const nomeNoAviso = cliente ?? "Cliente novo";
    const comoSegue =
      modo === "grupo"
        ? "Veio pela roleta. Ligue para o cliente; o contato está no grupo e na ficha."
        : "Veio pela roleta. Já mandei a primeira mensagem do seu número; a conversa é sua.";
    await avisarCorretor(
      supabase,
      destino,
      `*🎯 Lead de anúncio para você: ${nomeNoAviso}*\n${comoSegue}\n${linkDoPainel(lead.grupo_id, `/corretor/leads/${p.leadId}`)}`,
      `/corretor/leads/${p.leadId}`,
    );
    return destino;
  }
  return null;
}

/**
 * Troca o dono da ficha. Devolve `true` só se a linha mudou: o histórico do
 * repasse e o aviso a B dependem disso, e um `update` sem erro pode não ter
 * afetado nenhuma linha.
 */
async function passarAFicha(
  supabase: Supa,
  p: {
    leadId: string;
    grupoId: string;
    corretorId: string;
    destino: string;
    nomeNovo: string;
    origemAnterior: string | null;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .update({
      corretor_id: p.destino,
      origem_atribuicao: "roleta",
      // Se B sair, o lead volta para quem pagou o anúncio (0206).
      anuncio_pago_por: p.corretorId,
      // B é avisado pela roleta; o aviso de lead novo não repete.
      aviso_lead_novo_em: new Date().toISOString(),
    })
    .eq("id", p.leadId)
    .eq("grupo_id", p.grupoId)
    .select("id");
  if (error || !data?.length) {
    console.error("[roleta] ficha não mudou de dono:", error?.message ?? "nenhuma linha afetada");
    return false;
  }
  // A origem anterior fica guardada antes de ser sobrescrita, como em todo
  // repasse (ver `repasseGuardaOrigem.test.ts`). Só entra no histórico o
  // repasse que de fato aconteceu.
  await supabase.from("lead_interacoes").insert({
    lead_id: p.leadId,
    corretor_id: null,
    tipo: "repasse",
    conteudo: "Repasse pela roleta do anúncio",
    detalhes: { origem_anterior: p.origemAnterior, de: p.corretorId, para: p.destino },
  });
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: null,
    tipo: "sistema",
    conteudo: `Lead do anúncio repassado para ${p.nomeNovo} pela roleta`,
    detalhes: { de: p.corretorId, para: p.destino, motivo: "roleta_do_anuncio" },
  });
  return true;
}
