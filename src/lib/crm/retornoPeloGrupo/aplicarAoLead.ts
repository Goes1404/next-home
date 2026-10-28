import "server-only";

import { registrarInteracao } from "@/lib/crm/interacoes";
import { textoMudancaEtapa } from "@/lib/crm/timeline";
import type { Database, Json } from "@/lib/supabase/types";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { enviarMensagemWhatsappParaGrupo } from "@/lib/whatsapp/provider";
import { buscarDossieAtual, salvarDossie } from "@/lib/whatsapp/repositorio";
import { dossieComORelato, textoDoDossie } from "./dossie";
import { planejarEfeitos, type Aplicado } from "./efeitos";
import { NAO_E_RELATO, type LeituraDoRetorno } from "./leituraDoRetorno";
import { lerRetornoDaLigacao, type CustoDaLeitura } from "./ler";
import type { Banco, EnvioDoLead } from "./situacao";
import {
  TEXTO_CLIENTE_NAO_ENCONTRADO,
  TEXTO_NAO_E_MAIS_SEU,
  TEXTO_NAO_ENTENDI_A_LIGACAO,
  TEXTO_SEM_LEITURA,
  textoDaConfirmacao,
} from "./textos";

const ORIGEM = "grupo_whatsapp";
const PROMPT_VERSAO = "retorno-da-ligacao-v1";
const NOME_SEM_NOME = "Cliente sem nome";
const LIGACAO_SO_EM_AUDIO = "Relato da ligação em áudio (sem transcrição).";
/*
 * Sem leitura (grupo suspenso, IA fora) não há quem diga se a mensagem conta
 * uma ligação. "ok" e "bom dia" não contam; "não atendeu, caixa postal" sim.
 * Abaixo disto, e sem áudio, a mensagem é tratada como conversa.
 */
const MINIMO_PARA_ANOTAR_SEM_LEITURA = 12;

/** O relato a aplicar e de onde ele veio. */
export type RetornoParaAplicar = {
  /** Linha de `retornos_de_ligacao` que este relato fecha. */
  retornoId: string;
  /** Id da mensagem do corretor (vai nos detalhes da linha `ligacao`). */
  mensagemId: string;
  /** O que a IA lê: na correção, o relato anterior + a correção. */
  relato: string;
  /** O que vai na linha `ligacao` do histórico: só o que esta mensagem disse. */
  textoDaLigacao: string;
  audioPath: string | null;
  /** O corretor mandou áudio (guardado ou não). */
  ehAudio: boolean;
  /**
   * A mensagem citou o aviso ou a confirmação deste lead (ou respondeu à
   * pergunta "Esse retorno é sobre"): o corretor falava DESTE cliente. Se
   * não for relato, ele recebe o pedido para contar de novo; sem citação, a
   * conversa passa calada.
   */
  citouOLead: boolean;
  /** Hora da mensagem: "sábado" se resolve a partir dela. */
  enviadaEm: Date;
  corrigeId: string | null;
  corrigido: Aplicado | null;
};

export type Contexto = {
  supabase: Banco;
  grupoId: string;
  instanceName: string;
  grupoJid: string;
  corretorId: string;
  suspenso: boolean;
  /**
   * Se algo já foi gravado na ficha do lead. Num erro inesperado, é o que
   * separa "peça para mandar de novo" (nada anotado) de "não peça" (mandar de
   * novo duplicaria o que já entrou).
   */
  estado: { gravouNoLead: boolean; nomeDoLead: string | null };
};

export async function responderNoGrupo(ctx: Contexto, texto: string): Promise<string | null> {
  try {
    const r = await enviarMensagemWhatsappParaGrupo({ instanceName: ctx.instanceName, grupoJid: ctx.grupoJid, texto });
    if (!r.enviado) console.warn(`[retorno] resposta no grupo não saiu: ${r.motivo ?? "?"}`);
    return r.enviado ? (r.messageId ?? null) : null;
  } catch (erro) {
    console.error("[retorno] resposta no grupo falhou:", erro);
    return null;
  }
}

/** Atualiza a linha do retorno; erro só vai para o log (o retorno já foi aplicado). */
export async function fecharRetorno(
  ctx: Contexto,
  retornoId: string,
  valores: Database["public"]["Tables"]["retornos_de_ligacao"]["Update"],
): Promise<void> {
  const { error } = await ctx.supabase
    .from("retornos_de_ligacao")
    .update(valores)
    .eq("id", retornoId)
    .eq("grupo_id", ctx.grupoId);
  if (error) console.error(`[retorno] linha ${retornoId} não atualizada: ${error.message}`);
}

async function fichaDoLead(
  ctx: Contexto,
  lead: { nome: string; etapa: EtapaFunil; empreendimento_id: string | null },
): Promise<string> {
  const linhas = [`Nome: ${lead.nome}`, `Etapa no funil: ${ETAPA_LABEL[lead.etapa] ?? lead.etapa}`];
  if (lead.empreendimento_id) {
    const { data } = await ctx.supabase
      .from("empreendimentos")
      .select("nome")
      .eq("id", lead.empreendimento_id)
      .eq("grupo_id", ctx.grupoId)
      .maybeSingle();
    if (data?.nome) linhas.push(`Imóvel de interesse: ${data.nome}`);
  }
  return linhas.join("\n");
}

/*
 * Custo da leitura no medidor da plataforma (0211 soma tokens de qualquer
 * origem). Origem e ação próprias: não é resposta ao cliente, então não
 * entra na cota (0197) nem conta como tentativa de atendimento.
 */
async function registrarCusto(ctx: Contexto, r: CustoDaLeitura): Promise<void> {
  const { error } = await ctx.supabase.from("ia_interacoes").insert({
    grupo_id: ctx.grupoId,
    corretor_id: ctx.corretorId,
    origem: "retorno_ligacao",
    acao: "retorno_lido",
    prompt_versao: PROMPT_VERSAO,
    modelo: r.modelo,
    latencia_ms: r.latenciaMs,
    tokens_entrada: r.tokensEntrada,
    tokens_saida: r.tokensSaida,
  });
  if (error) console.error(`[retorno] custo da leitura não registrado: ${error.message}`);
}

/**
 * Aplica o relato ao lead e confirma no grupo. Confere de novo que o lead é
 * do corretor e do grupo: entre o aviso e o relato ele pode ter mudado de dono.
 */
export async function aplicarRetornoAoLead(
  ctx: Contexto,
  leadId: string,
  envio: EnvioDoLead | null,
  r: RetornoParaAplicar,
): Promise<void> {
  const { supabase, grupoId, corretorId } = ctx;
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, nome, etapa, corretor_id, visita_agendada_em, empreendimento_id")
    .eq("id", leadId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (error) throw new Error(`lead do retorno: ${error.message}`);
  if (!lead) {
    await responderNoGrupo(ctx, TEXTO_CLIENTE_NAO_ENCONTRADO);
    return;
  }
  if (lead.corretor_id !== corretorId) {
    await responderNoGrupo(ctx, TEXTO_NAO_E_MAIS_SEU(lead.nome?.trim() || NOME_SEM_NOME));
    return;
  }
  const nome = lead.nome?.trim() || NOME_SEM_NOME;
  const etapaAtual = lead.etapa as EtapaFunil;
  const conteudo = r.textoDaLigacao.trim() || LIGACAO_SO_EM_AUDIO;
  const detalhesBase: Record<string, Json> = {
    origem: ORIGEM,
    mensagem_id: r.mensagemId,
    audio_path: r.audioPath,
    ...(r.corrigeId ? { corrige_id: r.corrigeId } : {}),
  };

  const dossieAtual = ctx.suspenso ? null : await buscarDossieAtual(leadId);
  const leitura = ctx.suspenso
    ? null
    : await lerRetornoDaLigacao({
        relato: r.relato,
        fichaAtual: await fichaDoLead(ctx, { nome, etapa: etapaAtual, empreendimento_id: lead.empreendimento_id }),
        dossieAtual: textoDoDossie(dossieAtual),
        agora: r.enviadaEm,
      });

  ctx.estado.nomeDoLead = nome;
  // Conversa no grupo ("bom dia", "ok", recado ao gestor): nada vai para o lead.
  if (leitura?.ok && leitura.leitura === NAO_E_RELATO) {
    if (leitura.custo) await registrarCusto(ctx, leitura.custo);
    await ignorarMensagem(ctx, r.retornoId, leadId);
    if (r.citouOLead) await responderNoGrupo(ctx, TEXTO_NAO_ENTENDI_A_LIGACAO(nome));
    return;
  }

  // Sem leitura (grupo suspenso ou IA fora): o relato fica anotado como veio.
  if (!leitura || !leitura.ok) {
    if (!r.ehAudio && r.textoDaLigacao.trim().length < MINIMO_PARA_ANOTAR_SEM_LEITURA) {
      await ignorarMensagem(ctx, r.retornoId, leadId);
      return;
    }
    ctx.estado.gravouNoLead = true;
    await registrarInteracao(supabase, {
      leadId,
      corretorId,
      tipo: "ligacao",
      conteudo,
      detalhes: { ...detalhesBase, resultado: null, sem_leitura: true },
    });
    const confirmacao = await responderNoGrupo(ctx, TEXTO_SEM_LEITURA(nome));
    await fecharRetorno(ctx, r.retornoId, {
      lead_id: leadId,
      envio_id: envio?.id ?? null,
      status: "sem_leitura",
      confirmacao_mensagem_id: confirmacao,
      corrige_id: r.corrigeId,
    });
    return;
  }

  await registrarCusto(ctx, leitura);
  const lido = leitura.leitura;
  const efeitos = planejarEfeitos({
    leitura: lido,
    lead: { etapa: etapaAtual, visitaAgendadaEm: lead.visita_agendada_em },
    envio: envio ? { tentativas: envio.tentativas, retornoEm: envio.retornoEm } : null,
    corrigido: r.corrigido,
    agora: new Date(),
  });

  ctx.estado.gravouNoLead = true;
  await registrarInteracao(supabase, {
    leadId,
    corretorId,
    tipo: "ligacao",
    conteudo,
    detalhes: { ...detalhesBase, resultado: lido.resultado },
  });

  /*
   * Visita antes da etapa: "visita marcada" sem a data gravada seria mentira
   * na ficha. Escrita direta, e não por `reservar_horario_visita`: aquela
   * função é a trava do horário que a IA OFERECE ao cliente (recusa fora da
   * grade do corretor e move a etapa sem histórico, sem grupo nem dono no
   * filtro). Aqui quem marcou foi o próprio corretor, ao telefone. O choque
   * de horário é barrado pela trava de 60 min da 0224 (exclusão em visitas).
   */
  let visitaGravada = true;
  if (efeitos.visita) {
    const { error: erroVisita } = await supabase
      .from("leads")
      .update({ visita_agendada_em: efeitos.visita.para })
      .eq("id", leadId)
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId);
    if (erroVisita) {
      // A trava de 60 min da 0224 recusa duas visitas do corretor ao mesmo tempo.
      console.error(`[retorno] visita do lead ${leadId} não gravada: ${erroVisita.message}`);
      visitaGravada = false;
    }
  }

  let etapaFinal = etapaAtual;
  if (efeitos.etapa && !(efeitos.etapa.para === "visita_agendada" && !visitaGravada)) {
    const { de, para } = efeitos.etapa;
    const { data: movidos, error: erroEtapa } = await supabase
      .from("leads")
      .update({ etapa: para, etapa_alterada_em: new Date().toISOString() })
      .eq("id", leadId)
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId)
      .select("id");
    if (erroEtapa) console.error(`[retorno] etapa do lead ${leadId} não mudou: ${erroEtapa.message}`);
    if (!erroEtapa && (movidos?.length ?? 0) > 0) {
      etapaFinal = para;
      await registrarInteracao(supabase, {
        leadId,
        corretorId,
        tipo: "etapa",
        conteudo: textoMudancaEtapa(ETAPA_LABEL[de] ?? de, ETAPA_LABEL[para] ?? para),
        detalhes: {
          de,
          para,
          origem: ORIGEM,
          ...(para === "perdido" && lido.motivoPerda ? { motivo_perda: lido.motivoPerda } : {}),
        },
      });
    }
  }

  const dossie = dossieComORelato(leadId, dossieAtual, lido);
  if (dossie) {
    await salvarDossie(leadId, dossie);
    // `salvarDossie` pode avançar o lead para qualificado sozinho
    // (avancarLeadParaQualificado): a confirmação diz onde ele ficou de fato.
    const { data: depois } = await supabase
      .from("leads")
      .select("etapa")
      .eq("id", leadId)
      .eq("grupo_id", grupoId)
      .maybeSingle();
    if (depois?.etapa) etapaFinal = depois.etapa as EtapaFunil;
  }

  const tentativa = envio ? await atualizarAviso(ctx, envio.id, efeitos) : efeitos.tentativa;

  const paraTexto: LeituraDoRetorno = {
    ...lido,
    etapa: lido.etapa === "perdido" && etapaFinal !== "perdido" ? null : lido.etapa,
    visitaEm: visitaGravada ? lido.visitaEm : null,
  };
  const confirmacao = await responderNoGrupo(
    ctx,
    textoDaConfirmacao({
      nome,
      leitura: paraTexto,
      tentativa,
      mudancas: {
        etapaNova: etapaFinal !== etapaAtual ? etapaFinal : null,
        visitaDesmarcada: visitaGravada && efeitos.visita !== null && efeitos.visita.para === null,
        // A correção sem visita devolveu a data que havia antes do retorno corrigido.
        visitaRestaurada:
          visitaGravada && efeitos.visita?.para && !lido.visitaEm ? efeitos.visita.para : null,
        // Recusada na leitura (data inválida) ou no banco (horário já ocupado).
        visitaNaoAnotada: lido.visitaRecusada || (Boolean(efeitos.visita?.para) && !visitaGravada),
        perdaSemMotivo: lido.perdaSemMotivo,
      },
    }),
  );
  await fecharRetorno(ctx, r.retornoId, {
    lead_id: leadId,
    envio_id: envio?.id ?? null,
    resultado: lido.resultado,
    leitura: { ...lido, relato: r.relato, aplicado: efeitos.aplicado } as unknown as Json,
    status: "aplicado",
    confirmacao_mensagem_id: confirmacao,
    corrige_id: r.corrigeId,
  });
}

/**
 * A mensagem não era relato de ligação. O texto não fica guardado (era
 * conversa do corretor, não dado do cliente); o lead fica na linha só para a
 * exclusão do lead (LGPD) achar um áudio que tenha sido guardado.
 */
async function ignorarMensagem(ctx: Contexto, retornoId: string, leadId: string): Promise<void> {
  await fecharRetorno(ctx, retornoId, { status: "ignorada", texto: null, lead_id: leadId });
}

/** Grava tentativas e retorno no aviso; devolve o número da tentativa para a confirmação. */
async function atualizarAviso(
  ctx: Contexto,
  envioId: string,
  efeitos: ReturnType<typeof planejarEfeitos>,
): Promise<number> {
  const erros: string[] = [];
  let tentativa = efeitos.tentativa;
  if (efeitos.deltaTentativas !== 0) {
    const { data, error } = await ctx.supabase.rpc("somar_tentativa_de_ligacao", {
      p_envio: envioId,
      p_grupo: ctx.grupoId,
      p_delta: efeitos.deltaTentativas,
    });
    if (error) erros.push(error.message);
    else if (typeof data === "number" && efeitos.tentativa > 0) tentativa = data;
  }
  const tabela = () => ctx.supabase.from("lead_envios_grupo");
  if (typeof efeitos.retornoEm === "string") {
    // Só o PRIMEIRO resultado que encerra a espera conta.
    const { error } = await tabela()
      .update({ retorno_em: efeitos.retornoEm })
      .eq("id", envioId)
      .eq("grupo_id", ctx.grupoId)
      .is("retorno_em", null);
    if (error) erros.push(error.message);
  } else if (efeitos.retornoEm === null) {
    const { error } = await tabela().update({ retorno_em: null }).eq("id", envioId).eq("grupo_id", ctx.grupoId);
    if (error) erros.push(error.message);
  }
  if (erros.length) console.error(`[retorno] aviso ${envioId} não atualizado: ${erros.join("; ")}`);
  return tentativa;
}
