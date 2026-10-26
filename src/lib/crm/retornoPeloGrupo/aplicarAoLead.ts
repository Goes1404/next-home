import "server-only";

import { registrarInteracao } from "@/lib/crm/interacoes";
import { textoMudancaEtapa } from "@/lib/crm/timeline";
import type { Database, Json } from "@/lib/supabase/types";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { enviarMensagemWhatsappParaGrupo } from "@/lib/whatsapp/provider";
import { buscarDossieAtual, salvarDossie } from "@/lib/whatsapp/repositorio";
import type { DossieClienteIA } from "@/lib/whatsapp/types";
import { planejarEfeitos, type Aplicado } from "./efeitos";
import type { LeituraDoRetorno } from "./leituraDoRetorno";
import { lerRetornoDaLigacao } from "./ler";
import type { Banco, EnvioDoLead } from "./situacao";
import { TEXTO_NAO_E_MAIS_SEU, TEXTO_SEM_LEITURA, textoDaConfirmacao } from "./textos";

const ORIGEM = "grupo_whatsapp";
const PROMPT_VERSAO = "retorno-da-ligacao-v1";
const NOME_SEM_NOME = "Cliente sem nome";
const LIGACAO_SO_EM_AUDIO = "Relato da ligação em áudio (sem transcrição).";

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

const SCORE_DA_TEMPERATURA = { quente: 80, morno: 55, frio: 25 } as const;

/**
 * O dossiê atual com só o que o relato trouxe por cima. Chave ausente em
 * `fatos` não toca no que já se sabia; `salvarDossie` repete a regra no banco.
 */
export function dossieComORelato(
  leadId: string,
  atual: DossieClienteIA | null,
  leitura: LeituraDoRetorno,
): DossieClienteIA | null {
  const temNovidade = Object.keys(leitura.fatos).length > 0 || leitura.resumo || leitura.proximoPasso;
  if (!temNovidade) return null;
  const agora = new Date().toISOString();
  const base: DossieClienteIA = atual ?? {
    id: "",
    leadId,
    orcamentoMin: null,
    orcamentoMax: null,
    rendaMensal: null,
    regiaoInteresse: null,
    dormitoriosMin: null,
    nomeCliente: null,
    email: null,
    memoria: null,
    formaPagamento: null,
    profissao: null,
    compraEmConjunto: null,
    perfilFamiliar: null,
    urgenciaMudanca: null,
    exigenciasEspecificas: [],
    objecoesIdentificadas: [],
    temperaturaScore: SCORE_DA_TEMPERATURA.morno,
    temperaturaLabel: "morno",
    resumoExecutivo: "",
    proximoPassoSugerido: null,
    createdAt: agora,
    updatedAt: agora,
  };
  const novo: DossieClienteIA = { ...base, ...leitura.fatos };
  if (leitura.fatos.temperaturaLabel && leitura.fatos.temperaturaLabel !== base.temperaturaLabel) {
    novo.temperaturaScore = SCORE_DA_TEMPERATURA[leitura.fatos.temperaturaLabel];
  }
  if (leitura.resumo) novo.resumoExecutivo = leitura.resumo;
  if (leitura.proximoPasso) novo.proximoPassoSugerido = leitura.proximoPasso;
  return novo;
}

/*
 * Custo da leitura no medidor da plataforma (0211 soma tokens de qualquer
 * origem). Origem e ação próprias: não é resposta ao cliente, então não
 * entra na cota (0197) nem conta como tentativa de atendimento.
 */
async function registrarCusto(
  ctx: Contexto,
  r: { modelo: string; latenciaMs: number; tokensEntrada: number | null; tokensSaida: number | null },
): Promise<void> {
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
  if (!lead || lead.corretor_id !== corretorId) {
    await responderNoGrupo(ctx, TEXTO_NAO_E_MAIS_SEU(lead?.nome || NOME_SEM_NOME));
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
        dossieAtual: dossieAtual?.resumoExecutivo || null,
        agora: r.enviadaEm,
      });

  // Sem leitura (grupo suspenso ou IA fora): o relato fica anotado como veio.
  if (!leitura || !leitura.ok) {
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

  await registrarInteracao(supabase, {
    leadId,
    corretorId,
    tipo: "ligacao",
    conteudo,
    detalhes: { ...detalhesBase, resultado: lido.resultado },
  });

  // Visita antes da etapa: "visita marcada" sem a data gravada seria mentira na ficha.
  let visitaGravada = true;
  if (efeitos.visita) {
    const { error: erroVisita } = await supabase
      .from("leads")
      .update({ visita_agendada_em: efeitos.visita.para })
      .eq("id", leadId)
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId);
    if (erroVisita) {
      // O índice da 0074 recusa duas visitas do corretor no mesmo instante.
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
  if (dossie) await salvarDossie(leadId, dossie);

  if (envio) await atualizarAviso(ctx, envio.id, efeitos);

  const paraTexto: LeituraDoRetorno = {
    ...lido,
    etapa: lido.etapa === "perdido" && etapaFinal !== "perdido" ? null : lido.etapa,
    visitaEm: visitaGravada ? lido.visitaEm : null,
  };
  const confirmacao = await responderNoGrupo(
    ctx,
    textoDaConfirmacao({ nome, leitura: paraTexto, tentativa: efeitos.tentativa }),
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

async function atualizarAviso(
  ctx: Contexto,
  envioId: string,
  efeitos: ReturnType<typeof planejarEfeitos>,
): Promise<void> {
  const tabela = () => ctx.supabase.from("lead_envios_grupo");
  const erros: string[] = [];
  if (efeitos.tentativas !== null) {
    const { error } = await tabela()
      .update({ tentativas_ligacao: efeitos.tentativas })
      .eq("id", envioId)
      .eq("grupo_id", ctx.grupoId);
    if (error) erros.push(error.message);
  }
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
}
