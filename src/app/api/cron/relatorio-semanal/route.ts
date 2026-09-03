import { NextResponse, type NextRequest } from "next/server";
import { enviarEmail } from "@/lib/email";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { coletarNumerosDaSemana } from "@/lib/admin/numerosDaSemana";
import {
  acharNoticias,
  assuntoDoRelatorio,
  corpoDoRelatorio,
} from "@/lib/admin/relatorioSemanal";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * O relatório semanal do gestor (roadmap geral, H4).
 *
 * As métricas-norte mandam "medir toda semana", e até 01/09/2026 medir
 * queria dizer alguém abrir o banco e escrever SQL. Foi por isso que a
 * queda de três dias do WhatsApp, a campanha com 1 resposta em 88 e os 21%
 * de cobertura da IA só apareceram quando alguém foi procurar. Este cron é
 * o "alguém foi procurar", toda segunda de manhã.
 *
 * Falha FECHADA como os outros: sem `CRON_SECRET` em produção, recusa.
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
      console.error("Relatório semanal recusado: CRON_SECRET não configurado em produção.");
      return false;
    }
    return true;
  }
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return recebido.length > 0 && segredoConfere(recebido, segredo);
}

/**
 * Para quem vai o relatório: os GESTORES.
 *
 * Preferência pelo e-mail do cadastro; reserva no e-mail do login, pela
 * mesma razão do aviso de queda — medido em 31/08, **0 de 8 corretores**
 * têm `corretores.email` preenchido, e sem a reserva o recurso nasceria
 * sem destinatário.
 */
async function destinatarios(): Promise<{ nome: string; email: string }[]> {
  const supabase = createServiceClient();

  const { data: gestores } = await supabase
    .from("corretores")
    .select("nome, email, user_id")
    .eq("papel", "gestor")
    .eq("ativo", true);

  const lista: { nome: string; email: string }[] = [];

  for (const g of gestores ?? []) {
    let email = g.email;
    if (!email && g.user_id) {
      try {
        const { data } = await supabase.auth.admin.getUserById(g.user_id);
        email = data.user?.email ?? null;
      } catch {
        email = null;
      }
    }
    if (email) lista.push({ nome: g.nome, email });
  }

  return lista;
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  try {
    const numeros = await coletarNumerosDaSemana();
    const achados = acharNoticias(numeros);
    const { texto, html } = corpoDoRelatorio({ achados, numeros, urlPainel: site.url });
    const assunto = assuntoDoRelatorio(achados);

    const para = await destinatarios();
    if (para.length === 0) {
      console.warn("[relatorio] nenhum gestor com e-mail — relatório não enviado.");
      return NextResponse.json({ ok: true, enviados: 0, motivo: "sem_destinatario", achados });
    }

    let enviados = 0;
    for (const destino of para) {
      const r = await enviarEmail({ para: destino.email, assunto, html, texto });
      if (r.enviado) enviados++;
    }

    return NextResponse.json({ ok: true, enviados, destinatarios: para.length, achados });
  } catch (e) {
    // O relatório não pode derrubar nada — mas também não pode falhar em
    // silêncio, ou volta a ser "ninguém olha".
    console.error("[relatorio] falhou:", e);
    return NextResponse.json({ erro: "falha ao montar o relatório" }, { status: 500 });
  }
}

/**
 * Mesma coisa por POST — o `net.http_post` do pg_cron é mais simples de
 * assinar, e é o verbo que `configurar_*` usa.
 *
 * Sem esta linha o cron responde **405 para sempre, em silêncio**: o job roda
 * no horário, a Vercel recusa o método, e nada em `cron.job_run_details`
 * parece errado porque a requisição foi enviada com sucesso. Foi assim que se
 * descobriu aqui — disparando a rota à mão depois de agendar, em vez de
 * confiar no "agendado com sucesso".
 */
export const POST = GET;
