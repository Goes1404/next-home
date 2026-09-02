import { NextResponse, type NextRequest } from "next/server";
import { enviarEmail } from "@/lib/email";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assuntoDoAviso,
  corpoDoAviso,
  medirEspera,
  type PessoaEsperando,
} from "@/lib/crm/quemEstaEsperando";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * O aviso de quem está esperando resposta.
 *
 * Medido em 02/09/2026: 649 mensagens de cliente e 544 respostas da corretora
 * em sete dias — ela trabalha muito —, e a última escrita no PAINEL era de
 * três dias antes, com 8 clientes sem resposta e o mais antigo desde 25/08.
 * O trabalho acontece no WhatsApp, que está sempre aberto; o painel espera
 * ser aberto, e perde. Enquanto ele esperar, nenhuma melhoria de tela é
 * vista. Este cron inverte: o aviso sai atrás da pessoa.
 *
 * É POR CORRETOR: cada um recebe só quem está esperando por ELE. Um resumo
 * único para o gestor devolveria a mesma pergunta que o painel já fazia —
 * "isso é meu?".
 *
 * Falha FECHADA como os outros crons: sem `CRON_SECRET` em produção, recusa.
 */

function segredoConfere(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function requisicaoAutenticada(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET || null;
  if (!segredo) {
    if (process.env.NODE_ENV === "production") {
      console.error("Aviso de espera recusado: CRON_SECRET não configurado em produção.");
      return false;
    }
    return true;
  }
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return recebido.length > 0 && segredoConfere(recebido, segredo);
}

/**
 * O e-mail de um corretor.
 *
 * Preferência pelo cadastro, reserva no login — medido em 31/08, **0 de 8
 * corretores** têm `corretores.email` preenchido, e sem a reserva o recurso
 * nasceria sem destinatário.
 */
async function emailDoCorretor(
  supabase: ReturnType<typeof createServiceClient>,
  corretorId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("corretores")
    .select("email, user_id")
    .eq("id", corretorId)
    .eq("ativo", true)
    .maybeSingle();
  if (!data) return null;
  if (data.email) return data.email;
  if (!data.user_id) return null;
  try {
    const { data: usuario } = await supabase.auth.admin.getUserById(data.user_id);
    return usuario.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // A mesma view que alimenta o topo da fila do Início (0087). Usar a
    // mesma fonte é o que garante que o e-mail e a tela nunca discordem.
    const { data: esperando, error } = await supabase
      .from("whatsapp_esperando_resposta")
      .select("conversa_id, corretor_id, nome_cliente, telefone_cliente, esperando_desde");
    if (error) throw error;

    const porCorretor = new Map<string, PessoaEsperando[]>();
    for (const linha of esperando ?? []) {
      if (!linha.corretor_id || !linha.conversa_id || !linha.esperando_desde) continue;
      const lista = porCorretor.get(linha.corretor_id) ?? [];
      lista.push({
        nome: nomeParaExibir({ nome: linha.nome_cliente, telefone: linha.telefone_cliente }),
        esperandoDesde: linha.esperando_desde,
        conversaId: linha.conversa_id,
      });
      porCorretor.set(linha.corretor_id, lista);
    }

    const agora = new Date();
    let enviados = 0;
    let silenciosos = 0;

    for (const [corretorId, pessoas] of porCorretor) {
      const esperas = medirEspera(pessoas, agora);
      // Silêncio quando não há notícia: não existe "resumo de hoje: tudo em
      // dia". Aviso que chega todo dia deixa de ser lido.
      if (esperas.length === 0) {
        silenciosos++;
        continue;
      }

      const para = await emailDoCorretor(supabase, corretorId);
      if (!para) continue;

      const { texto, html } = corpoDoAviso({ esperas, urlPainel: site.url });
      const r = await enviarEmail({ para, assunto: assuntoDoAviso(esperas), texto, html });
      if (r.enviado) enviados++;
    }

    return NextResponse.json({ ok: true, enviados, silenciosos, corretores: porCorretor.size });
  } catch (e) {
    console.error("[espera] falhou:", e);
    return NextResponse.json({ erro: "falha ao montar o aviso" }, { status: 500 });
  }
}
