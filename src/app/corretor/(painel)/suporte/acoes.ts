"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { avisarAtendimento } from "@/lib/notificacoes/avisosDaPlataforma";
import {
  corpoDoAviso,
  tituloDoAvisoDoPainel,
  validarChamadoDoPainel,
  type ErrosDoChamado,
} from "@/lib/plataforma/chamadoDeSuporte";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Abrir um chamado com a Astro pelo painel (`/corretor/suporte`, 0240,
 * 29/10/2026).
 *
 * Do navegador vêm SÓ o assunto e a mensagem. Quem é (nome, ficha), de onde
 * vem (grupo) e o e-mail saem da sessão: `getCorretorLogado` antes de a
 * chave existir, e o e-mail pelo `getUser()` (quem muda dado confere no
 * Auth). Nada da carteira (lead, cliente, conversa) entra no chamado por
 * conta própria: só o que a pessoa escreveu.
 *
 * Limite no banco: 5 chamados por pessoa por hora, contra o clique repetido
 * e o script com a sessão de alguém.
 *
 * Depois da resposta, o aviso no celular dos administradores da plataforma:
 * "Suporte: <nome da conta>", o assunto e o começo da mensagem.
 */

export type ResultadoDoChamado = { ok: true } | { ok: false; erro: string; erros?: ErrosDoChamado };

const JANELA_MS = 60 * 60 * 1000;
const LIMITE_POR_JANELA = 5;

export async function abrirChamado(
  _estadoAnterior: ResultadoDoChamado | undefined,
  formData: FormData,
): Promise<ResultadoDoChamado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sua sessão terminou. Entre de novo para enviar." };

  const validado = validarChamadoDoPainel({ assunto: formData.get("assunto"), mensagem: formData.get("mensagem") });
  if (!validado.ok) return { ok: false, erro: "Confira os campos destacados.", erros: validado.erros };

  const supabase = await createClient();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) return { ok: false, erro: "Sua sessão terminou. Entre de novo para enviar." };

  const agora = Date.now();
  const servico = createServiceClient();

  const { count, error: erroDoLimite } = await servico
    .from("chamados_de_suporte")
    .select("id", { count: "exact", head: true })
    .eq("corretor_origem_id", corretor.id)
    .gte("criado_em", new Date(agora - JANELA_MS).toISOString());
  if (erroDoLimite) {
    console.error(`[suporte] limite não conferido para ${corretor.id}: ${erroDoLimite.message}`);
  } else if ((count ?? 0) >= LIMITE_POR_JANELA) {
    return { ok: false, erro: "Você já mandou vários chamados nesta hora. A equipe da Astro já foi avisada; espere a resposta." };
  }

  // O nome da conta só para o título do aviso; sem ele o aviso sai genérico.
  const { data: grupo } = await servico.from("grupos").select("nome").eq("id", corretor.grupoId).maybeSingle();

  const { error } = await servico.from("chamados_de_suporte").insert({
    // A hora da action, a mesma régua do limite acima.
    criado_em: new Date(agora).toISOString(),
    origem: "painel",
    assunto: validado.assunto,
    mensagem: validado.mensagem,
    nome: corretor.nome,
    email: sessao.user.email ?? null,
    whatsapp: null,
    grupo_origem_id: corretor.grupoId,
    corretor_origem_id: corretor.id,
  });
  if (error) {
    console.error(`[suporte] chamado de ${corretor.id} não gravado: ${error.message}`);
    return { ok: false, erro: "Não conseguimos registrar o chamado agora. Tente de novo em instantes." };
  }

  avisarAtendimento({
    titulo: tituloDoAvisoDoPainel(grupo?.nome),
    corpo: corpoDoAviso(validado.assunto, validado.mensagem),
    url: "/plataforma/suporte",
    tag: `suporte-${corretor.id}-${agora}`,
  });
  revalidatePath("/corretor/suporte");
  return { ok: true };
}
