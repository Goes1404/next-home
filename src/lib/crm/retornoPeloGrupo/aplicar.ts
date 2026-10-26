import "server-only";

import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { lerAudioDoRelato } from "./audio";
import {
  aplicarRetornoAoLead,
  fecharRetorno,
  responderNoGrupo,
  type Contexto,
  type RetornoParaAplicar,
} from "./aplicarAoLead";
import { aplicadoGuardado } from "./efeitos";
import { escolherLeadDoRetorno, lerMensagemDoGrupo, reconhecerAutorNoGrupo } from "./identificar";
import { carregarSituacao, type Banco } from "./situacao";
import { TEXTO_AUDIO_NAO_ENTENDIDO, TEXTO_NAO_E_MAIS_SEU, TEXTO_SEM_LEAD_AGUARDANDO, textoDaPergunta } from "./textos";

const NOME_SEM_NOME = "Cliente sem nome";

export type CorretorDoGrupo = { id: string; whatsapp: string; whatsapp_lid: string | null };

/**
 * O relato que o corretor mandou no grupo dele, do começo ao fim (spec 6.2).
 *
 * A linha de `retornos_de_ligacao` nasce ANTES de qualquer coisa lenta, com
 * status 'falhou', e só vira 'aplicado'/'sem_leitura'/'aguardando_escolha' no
 * fim: a Evolution reentrega a mesma mensagem (o `unique` descarta a cópia) e,
 * se o processo morrer no meio, a linha fica visível como 'falhou' em vez de
 * sumir. 'falhou' também cobre o relato que não virou retorno de ninguém
 * (sem cliente aguardando, cliente de outro corretor, áudio não entendido).
 */
export async function processarRetornoDoCorretor(p: {
  supabase: Banco;
  grupoId: string;
  instanceName: string;
  corretor: CorretorDoGrupo;
  payload: unknown;
}): Promise<void> {
  const { supabase, grupoId, corretor } = p;
  const msg = lerMensagemDoGrupo(p.payload);
  if (!msg) return;

  // Gestor ou qualquer outro participante: silêncio, nada gravado (spec 6.4).
  if (!reconhecerAutorNoGrupo(msg.autorIds, corretor)) {
    console.info(`[retorno] mensagem ${msg.mensagemId} no grupo de leads não é do corretor; ignorada.`);
    return;
  }

  const { data: criadas, error } = await supabase
    .from("retornos_de_ligacao")
    .upsert(
      { grupo_id: grupoId, corretor_id: corretor.id, mensagem_id: msg.mensagemId, texto: msg.texto || null, status: "falhou" },
      { onConflict: "grupo_id,mensagem_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`registro do retorno: ${error.message}`);
  const retornoId = criadas?.[0]?.id;
  if (!retornoId) return; // reentrega da mesma mensagem

  const ctx: Contexto = {
    supabase,
    grupoId,
    instanceName: p.instanceName,
    grupoJid: msg.grupoJid,
    corretorId: corretor.id,
    suspenso: await grupoSuspenso(grupoId),
  };

  let texto = msg.texto;
  let audioPath: string | null = null;
  if (msg.ehAudio) {
    // Grupo suspenso não transcreve: o áudio fica guardado como veio (spec 6.7).
    const audio = await lerAudioDoRelato({
      supabase,
      grupoId,
      instanceName: p.instanceName,
      mensagemId: msg.mensagemId,
      payload: p.payload,
      transcrever: !ctx.suspenso,
    });
    if (!audio.ok) {
      await responderNoGrupo(ctx, TEXTO_AUDIO_NAO_ENTENDIDO);
      return;
    }
    texto = audio.texto ?? "";
    audioPath = audio.audioPath;
    await fecharRetorno(ctx, retornoId, { texto: texto || null, audio_path: audioPath });
  }

  const situacao = await carregarSituacao(supabase, grupoId, corretor.id, msg.citadaId);
  const decisao = escolherLeadDoRetorno({
    corretorId: corretor.id,
    citadaId: msg.citadaId,
    texto,
    aguardando: situacao.aguardando,
    avisos: situacao.avisos,
    confirmacoes: situacao.confirmacoes,
    perguntas: situacao.perguntas,
  });

  const desteRelato: RetornoParaAplicar = {
    retornoId,
    mensagemId: msg.mensagemId,
    relato: texto,
    textoDaLigacao: texto,
    audioPath,
    enviadaEm: msg.enviadaEm,
    corrigeId: null,
    corrigido: null,
  };

  switch (decisao.tipo) {
    case "lead": {
      await aplicarRetornoAoLead(ctx, decisao.leadId, situacao.envios.get(decisao.leadId) ?? null, desteRelato);
      return;
    }

    case "correcao": {
      const { data: anterior } = await supabase
        .from("retornos_de_ligacao")
        .select("id, texto, leitura")
        .eq("id", decisao.retornoId)
        .eq("grupo_id", grupoId)
        .eq("corretor_id", corretor.id)
        .maybeSingle();
      if (!anterior) {
        await responderNoGrupo(ctx, TEXTO_SEM_LEAD_AGUARDANDO);
        return;
      }
      const guardado = (anterior.leitura as { relato?: unknown } | null)?.relato;
      const relatoAnterior = typeof guardado === "string" ? guardado : (anterior.texto ?? "");
      await aplicarRetornoAoLead(ctx, decisao.leadId, situacao.envios.get(decisao.leadId) ?? null, {
        ...desteRelato,
        relato: `${relatoAnterior}\nCorreção do corretor: ${texto}`,
        corrigeId: anterior.id,
        corrigido: aplicadoGuardado(anterior.leitura),
      });
      return;
    }

    case "escolha": {
      await resolverPergunta(ctx, retornoId, decisao.retornoId, decisao.indice, situacao.envios);
      return;
    }

    case "perguntar": {
      const nomes = decisao.opcoes.map((o) => o.nome?.trim() || NOME_SEM_NOME);
      const perguntaId = await responderNoGrupo(ctx, textoDaPergunta(nomes));
      // Sem a pergunta no grupo não há em cima do que responder: fica 'falhou'.
      if (perguntaId) {
        await fecharRetorno(ctx, retornoId, {
          status: "aguardando_escolha",
          opcoes: decisao.opcoes.map((o) => o.leadId),
          confirmacao_mensagem_id: perguntaId,
        });
      }
      return;
    }

    case "nao_e_mais_seu": {
      await responderNoGrupo(ctx, TEXTO_NAO_E_MAIS_SEU(situacao.nomes.get(decisao.leadId)?.trim() || NOME_SEM_NOME));
      return;
    }

    case "nenhum": {
      await responderNoGrupo(ctx, TEXTO_SEM_LEAD_AGUARDANDO);
      return;
    }
  }
}

/**
 * "1" em cima da pergunta: o relato guardado vai para o lead escolhido. A
 * pergunta é tomada com um update condicional, para dois "1" seguidos não
 * aplicarem o mesmo relato duas vezes.
 */
async function resolverPergunta(
  ctx: Contexto,
  respostaId: string,
  perguntaId: string,
  indice: number,
  envios: Awaited<ReturnType<typeof carregarSituacao>>["envios"],
): Promise<void> {
  const { data: tomadas, error } = await ctx.supabase
    .from("retornos_de_ligacao")
    .update({ status: "falhou" })
    .eq("id", perguntaId)
    .eq("grupo_id", ctx.grupoId)
    .eq("corretor_id", ctx.corretorId)
    .eq("status", "aguardando_escolha")
    .select("id, mensagem_id, texto, audio_path, opcoes, created_at");
  if (error) throw new Error(`pergunta do retorno: ${error.message}`);
  const pendente = tomadas?.[0];
  const leadId = pendente?.opcoes?.[indice];
  if (!pendente || !leadId) return;

  await fecharRetorno(ctx, respostaId, { status: "aplicado", lead_id: leadId, leitura: { escolha: indice } });

  const texto = pendente.texto ?? "";
  await aplicarRetornoAoLead(ctx, leadId, envios.get(leadId) ?? null, {
    retornoId: pendente.id,
    mensagemId: pendente.mensagem_id,
    relato: texto,
    textoDaLigacao: texto,
    audioPath: pendente.audio_path,
    enviadaEm: new Date(pendente.created_at),
    corrigeId: null,
    corrigido: null,
  });
}
