"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResultadoConversa = { erro?: string; ok?: string };

/**
 * Server Action é POST na rota, não navegação: o `proxy.ts` não cobre isto.
 */
async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return supabase;
}

/**
 * Devolve a palavra ao bot nesta conversa, agora.
 *
 * O webhook silencia a IA por 24 horas assim que o corretor responde do
 * celular (`pausarBotPorAtendimentoHumano`). A regra é boa — o bot não pode
 * falar por cima de um atendimento humano — mas até aqui não havia saída
 * nenhuma: sem tela e sem botão, a única forma de destravar era esperar o
 * dia passar ou dar UPDATE no banco. Foi por isso que, em produção, o bot
 * nunca respondeu uma única mensagem.
 *
 * Não passa pelo cliente qual conversa é de quem: a RLS da 0018 já recorta
 * (`corretor_id = corretor_atual()` ou gestor), então um id de outro
 * corretor simplesmente não atualiza linha nenhuma.
 */
export async function retomarBotNaConversa(conversaId: string): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  /*
   * `liberado_por_palavra_chave` entra AQUI, e a ausência dela é o defeito
   * que fazia este botão mentir: `botDeveResponder` exige TRÊS coisas —
   * bot ativo, pausa vencida e conversa liberada — e a versão anterior
   * mexia só nas duas primeiras. O corretor clicava, a tela dizia "IA
   * reativada nesta conversa", e o bot continuava mudo.
   *
   * Reativar pela tela É a autorização explícita, do mesmo jeito que
   * digitar a palavra-chave no chat: quem clicou foi o dono da conversa,
   * logado, olhando para ela.
   */
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: true, pausado_humano_ate: null, liberado_por_palavra_chave: true })
    .eq("id", conversaId)
    .select("id");

  if (error) {
    console.error("[conversas] falha ao retomar bot:", error.message);
    return { erro: "Não foi possível reativar a IA agora." };
  }
  if (!data || data.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }

  revalidatePath("/corretor/conversas");
  return { ok: "IA reativada nesta conversa." };
}

/**
 * Silencia a IA nesta conversa por tempo indeterminado.
 *
 * Diferente da pausa automática de 24h, esta é uma decisão explícita: fica
 * em `bot_ativo = false` até o corretor reativar. É o caso do cliente que
 * pediu para falar só com gente, e do número que atende também a conversa
 * pessoal do corretor.
 */
export async function silenciarBotNaConversa(conversaId: string): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: false })
    .eq("id", conversaId)
    .select("id");

  if (error) {
    console.error("[conversas] falha ao silenciar bot:", error.message);
    return { erro: "Não foi possível desligar a IA agora." };
  }
  if (!data || data.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }

  revalidatePath("/corretor/conversas");
  return { ok: "IA desligada nesta conversa." };
}

export type MensagemConversa = {
  id: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  criadoEm: string;
  /** Vínculo com a telemetria (0040) — é o que torna ESTE balão avaliável. */
  interacaoId: string | null;
  /** Avaliação já dada a esta resposta, se houver. */
  avaliacao: "boa" | "ruim" | null;
};

/** Últimas mensagens, para o corretor conferir antes de devolver a palavra ao bot. */
export async function lerMensagens(conversaId: string): Promise<MensagemConversa[]> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .select("id, remetente, conteudo, created_at, interacao_id")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[conversas] falha ao ler mensagens:", error.message);
    return [];
  }

  /*
   * A avaliação mora em ia_interacoes, não na mensagem. Segunda query em
   * vez de embed do PostgREST: o tipo gerado à mão (types.ts) não conhece
   * a relação, e duas queries simples valem mais que um cast.
   */
  const idsInteracao = (data ?? []).map((m) => m.interacao_id).filter((v): v is string => v !== null);
  const avaliacoes = new Map<string, "boa" | "ruim" | null>();
  if (idsInteracao.length > 0) {
    const { data: interacoes } = await supabase
      .from("ia_interacoes")
      .select("id, avaliacao")
      .in("id", idsInteracao);
    for (const i of interacoes ?? []) avaliacoes.set(i.id, i.avaliacao);
  }

  return (data ?? [])
    .map((m) => ({
      id: m.id,
      remetente: m.remetente as MensagemConversa["remetente"],
      conteudo: m.conteudo,
      criadoEm: m.created_at,
      interacaoId: m.interacao_id,
      avaliacao: m.interacao_id ? (avaliacoes.get(m.interacao_id) ?? null) : null,
    }))
    .reverse();
}

/**
 * O corretor avaliou UMA resposta específica do bot.
 *
 * Substitui `avaliarUltimaResposta`, que só alcançava a interação mais
 * recente da conversa — se o bot respondeu cinco vezes e a terceira foi
 * ruim, o rótulo mais valioso do golden dataset era impossível de gravar.
 * O vínculo balão→interação (0040) resolve: o Live Chat passa o id exato.
 *
 * É o gesto mais barato do loop de melhoria contínua: a marcação fica em
 * `ia_interacoes.avaliacao` e o export do golden dataset
 * (scripts/eval/exportarGolden.ts) transforma cada `ruim` num caso de
 * teste — a falha real de hoje vira o teste automático que impede a mesma
 * falha amanhã. A RLS da 0029 garante que só o dono da conversa avalia.
 */
export async function avaliarInteracao(
  interacaoId: string,
  avaliacao: "boa" | "ruim",
): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("ia_interacoes")
    .update({ avaliacao })
    .eq("id", interacaoId)
    .select("id");

  if (error) return { erro: "Não foi possível registrar a avaliação." };
  if (!data || data.length === 0) return { erro: "Resposta não encontrada na sua carteira." };

  revalidatePath("/corretor/conversas");
  return { ok: avaliacao === "ruim" ? "Anotado — esta resposta vira caso de teste do próximo ajuste da IA." : "Avaliação registrada." };
}
