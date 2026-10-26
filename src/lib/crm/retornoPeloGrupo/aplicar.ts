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
import { cadeiaDaCorrecao } from "./correcao";
import {
  escolherLeadDoRetorno,
  indiceEscolhido,
  lerMensagemDoGrupo,
  reconhecerAutorNoGrupo,
  type MensagemDoGrupo,
} from "./identificar";
import { buscarEnvioDoLead, carregarSituacao, type Banco, type EnvioDoLead } from "./situacao";
import {
  TEXTO_ANOTEI_EM_PARTE,
  TEXTO_AUDIO_NAO_ENTENDIDO,
  TEXTO_NAO_CONSEGUI_ANOTAR,
  TEXTO_NAO_E_MAIS_SEU,
  TEXTO_SEM_LEAD_AGUARDANDO,
  textoDaPergunta,
} from "./textos";

const NOME_SEM_NOME = "Cliente sem nome";

export type CorretorDoGrupo = { id: string; whatsapp: string; whatsapp_lid: string | null };

/**
 * O relato que o corretor mandou no grupo dele, do começo ao fim (spec 6.2).
 *
 * A linha de `retornos_de_ligacao` nasce ANTES de qualquer coisa lenta, com
 * status 'falhou', e só vira 'aplicado'/'sem_leitura'/'aguardando_escolha'/
 * 'ignorada' no fim: a Evolution reentrega a mesma mensagem (o `unique`
 * descarta a cópia) e, se o processo morrer no meio, a linha fica visível como
 * 'falhou' em vez de sumir. 'falhou' também cobre o relato que não virou
 * retorno de ninguém (cliente de outro corretor, áudio não entendido).
 * 'ignorada' é a conversa do grupo que não conta ligação ("bom dia", "ok",
 * mensagem sem cliente aguardando): sem texto guardado e sem resposta, a não
 * ser que cite o aviso ou a confirmação.
 *
 * Como o `unique` barra a reentrega, um erro inesperado depois do registro
 * perderia o relato calado: por isso o erro fica anotado na linha e, se nada
 * foi gravado na ficha, o corretor recebe o pedido para mandar de novo.
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
    suspenso: false,
    estado: { gravouNoLead: false, nomeDoLead: null },
  };

  try {
    ctx.suspenso = await grupoSuspenso(grupoId);
    await seguirComORetorno(ctx, retornoId, msg, p.payload);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[retorno] relato ${msg.mensagemId} não foi aplicado:`, erro);
    try {
      await fecharRetorno(ctx, retornoId, { status: "falhou", leitura: { erro: motivo.slice(0, 500) } });
    } catch (erroAoAnotar) {
      console.error("[retorno] nem o erro foi anotado:", erroAoAnotar);
    }
    // Nada na ficha: pede de novo. Algo já entrou: só avisa, mandar de novo duplicaria.
    await responderNoGrupo(
      ctx,
      ctx.estado.gravouNoLead ? TEXTO_ANOTEI_EM_PARTE(ctx.estado.nomeDoLead ?? NOME_SEM_NOME) : TEXTO_NAO_CONSEGUI_ANOTAR,
    );
  }
}

async function seguirComORetorno(
  ctx: Contexto,
  retornoId: string,
  msg: MensagemDoGrupo,
  payload: unknown,
): Promise<void> {
  const { supabase, grupoId, corretorId } = ctx;
  let texto = msg.texto;
  let audioPath: string | null = null;
  if (msg.ehAudio) {
    // Grupo suspenso não transcreve: o áudio fica guardado como veio (spec 6.7).
    const audio = await lerAudioDoRelato({
      supabase,
      grupoId,
      instanceName: ctx.instanceName,
      mensagemId: msg.mensagemId,
      payload,
      transcrever: !ctx.suspenso,
    });
    if (!audio.ok) {
      // O caminho vai para a linha mesmo assim: é por ela que a exclusão acha o arquivo.
      if (audio.audioPath) await fecharRetorno(ctx, retornoId, { audio_path: audio.audioPath });
      await responderNoGrupo(ctx, TEXTO_AUDIO_NAO_ENTENDIDO);
      return;
    }
    texto = audio.texto ?? "";
    audioPath = audio.audioPath;
    await fecharRetorno(ctx, retornoId, { texto: texto || null, audio_path: audioPath });
  }

  const situacao = await carregarSituacao(supabase, grupoId, corretorId, msg.citadaId);
  const decisao = escolherLeadDoRetorno({
    corretorId,
    citadaId: msg.citadaId,
    texto,
    aguardando: situacao.aguardando,
    avisos: situacao.avisos,
    confirmacoes: situacao.confirmacoes,
    perguntas: situacao.perguntas,
  });

  // O aviso do lead: o da situação ou, se ele já encerrou a espera (correção,
  // 2ª ligação em cima do aviso), lido direto.
  const envioDe = async (leadId: string): Promise<EnvioDoLead | null> =>
    situacao.envios.get(leadId) ?? (await buscarEnvioDoLead(supabase, grupoId, corretorId, leadId));

  // Citar uma mensagem qualquer (a do gestor, a do cliente) não é falar do lead.
  const citouOAviso =
    msg.citadaId !== null &&
    [...situacao.avisos, ...situacao.aguardando].some((a) => a.avisoMensagemId === msg.citadaId);
  const desteRelato: RetornoParaAplicar = {
    retornoId,
    mensagemId: msg.mensagemId,
    relato: texto,
    textoDaLigacao: texto,
    audioPath,
    ehAudio: msg.ehAudio,
    citouOLead: citouOAviso,
    enviadaEm: msg.enviadaEm,
    corrigeId: null,
    corrigido: null,
  };

  switch (decisao.tipo) {
    case "lead": {
      await aplicarRetornoAoLead(ctx, decisao.leadId, await envioDe(decisao.leadId), desteRelato);
      return;
    }

    case "correcao": {
      const cadeia = await cadeiaDaCorrecao(supabase, grupoId, corretorId, decisao.retornoId);
      if (!cadeia) {
        await responderNoGrupo(ctx, TEXTO_SEM_LEAD_AGUARDANDO);
        return;
      }
      await aplicarRetornoAoLead(ctx, decisao.leadId, await envioDe(decisao.leadId), {
        ...desteRelato,
        relato: `${cadeia.relato}\nCorreção do corretor: ${texto}`,
        citouOLead: true,
        corrigeId: cadeia.ultimo.id,
        corrigido: cadeia.aplicado,
      });
      return;
    }

    case "escolha": {
      await resolverPergunta(ctx, retornoId, decisao.retornoId, decisao.indice, envioDe);
      return;
    }

    case "perguntar": {
      const nomes = decisao.opcoes.map((o) => o.nome?.trim() || NOME_SEM_NOME);
      const opcoes = decisao.opcoes.map((o) => o.leadId);
      /*
       * Número fora da lista em cima da pergunta: repete a MESMA pergunta, sem
       * criar outra pendência (senão o "3" viraria o relato a aplicar). A
       * pendência original passa a apontar para a pergunta nova. Texto livre
       * em cima da pergunta é relato novo, e ganha a própria pergunta.
       */
      const citada =
        msg.citadaId && indiceEscolhido(texto) !== null
          ? situacao.perguntas.find((q) => q.mensagemId === msg.citadaId)
          : undefined;
      if (citada) {
        const repetidaId = await responderNoGrupo(ctx, textoDaPergunta(nomes));
        if (repetidaId) await fecharRetorno(ctx, citada.retornoId, { confirmacao_mensagem_id: repetidaId, opcoes });
        await fecharRetorno(ctx, retornoId, { leitura: { pergunta_repetida: citada.retornoId } });
        return;
      }
      const perguntaId = await responderNoGrupo(ctx, textoDaPergunta(nomes));
      // Sem a pergunta no grupo não há em cima do que responder: fica 'falhou'.
      if (perguntaId) {
        await fecharRetorno(ctx, retornoId, { status: "aguardando_escolha", opcoes, confirmacao_mensagem_id: perguntaId });
      }
      return;
    }

    case "nao_e_mais_seu": {
      await responderNoGrupo(ctx, TEXTO_NAO_E_MAIS_SEU(situacao.nomes.get(decisao.leadId)?.trim() || NOME_SEM_NOME));
      return;
    }

    case "nenhum": {
      // Ninguém aguardando e nada citado: é conversa do grupo. Responder a
      // cada "bom dia" encheria o grupo do corretor de avisos do sistema.
      await fecharRetorno(ctx, retornoId, { status: "ignorada", texto: null });
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
  envioDe: (leadId: string) => Promise<EnvioDoLead | null>,
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
  try {
    await aplicarRetornoAoLead(ctx, leadId, await envioDe(leadId), {
      retornoId: pendente.id,
      mensagemId: pendente.mensagem_id,
      relato: texto,
      textoDaLigacao: texto,
      audioPath: pendente.audio_path,
      ehAudio: pendente.audio_path !== null,
      // Respondeu à pergunta: está falando deste cliente.
      citouOLead: true,
      enviadaEm: new Date(pendente.created_at),
      corrigeId: null,
      corrigido: null,
    });
  } catch (erro) {
    // Nada gravado ainda: a pergunta volta a valer, e o "1" de novo resolve.
    if (!ctx.estado.gravouNoLead) await fecharRetorno(ctx, pendente.id, { status: "aguardando_escolha" });
    throw erro;
  }
}
