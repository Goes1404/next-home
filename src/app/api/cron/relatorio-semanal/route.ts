import { NextResponse, type NextRequest } from "next/server";
import { enviarEmail } from "@/lib/email";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { enderecoDoPainel } from "@/lib/marcaDoCrm/marca";
import { createServiceClient } from "@/lib/supabase/service";
import { coletarNumerosDaSemana } from "@/lib/admin/numerosDaSemana";
import { leituraDoGrupo, type LeituraDoGrupo } from "@/lib/admin/numerosDaEquipe";
import {
  acharNoticias,
  assuntoDoRelatorio,
  corpoDoRelatorio,
  type Achado,
} from "@/lib/admin/relatorioSemanal";
import { jaMandouNaSemana, textoDoResumoSemanal } from "@/lib/admin/resumoSemanalNoWhatsapp";
import { coletarSemanaDoGrupo } from "@/lib/admin/semanaDoGrupo";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";

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
 *
 * Roda POR GRUPO (L18): um laço de grupos, cada um com os próprios números e
 * os próprios gestores. A chave de serviço enxerga todos; somar o banco
 * inteiro e mandar a todo gestor entregaria os números de uma empresa à
 * outra.
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
 * Para quem vai o relatório de um grupo: os GESTORES dele.
 *
 * Preferência pelo e-mail do cadastro; reserva no e-mail do login, pela
 * mesma razão do aviso de queda — medido em 31/08, **0 de 8 corretores**
 * têm `corretores.email` preenchido, e sem a reserva o recurso nasceria
 * sem destinatário.
 */
async function destinatarios(
  supabase: ReturnType<typeof createServiceClient>,
  grupoId: string,
): Promise<{ nome: string; email: string }[]> {
  const { data: gestores } = await supabase
    .from("corretores")
    .select("nome, email, user_id")
    .eq("grupo_id", grupoId)
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

/**
 * O resumo da semana no WhatsApp de cada gestor do grupo que deixou ligado
 * (0246). Sai pelo canal dos avisos ao corretor (`avisarCorretor`): do
 * número do PRÓPRIO gestor para ele mesmo, mais a notificação no celular —
 * não é contato com cliente, então não gasta cota anti-ban nem espera a
 * janela comercial (mesma regra do resumo do dia).
 *
 * Uma vez por semana por gestor: o carimbo `relatorio_semanal_whatsapp_em`
 * é gravado ANTES do envio (claim), e um segundo POST do pg_cron na mesma
 * manhã não manda de novo. Sem a 0246 (coluna ausente), a leitura falha e
 * nada sai — falha fechada.
 */
async function mandarResumoNoWhatsapp(
  supabase: ReturnType<typeof createServiceClient>,
  p: { grupoId: string; nomeDaCasa: string; leitura: LeituraDoGrupo; achado: Achado | null },
): Promise<number> {
  const { data: gestores, error } = await supabase
    .from("corretores")
    .select("id, relatorio_semanal_whatsapp, relatorio_semanal_whatsapp_em")
    .eq("grupo_id", p.grupoId)
    .eq("papel", "gestor")
    .eq("ativo", true);
  if (error) return 0;
  const agora = new Date();
  const querem = (gestores ?? []).filter(
    (g) => g.relatorio_semanal_whatsapp === true && !jaMandouNaSemana(g.relatorio_semanal_whatsapp_em, agora),
  );
  if (querem.length === 0) return 0;

  const semana = await coletarSemanaDoGrupo(p.leitura, hojeEmSaoPaulo(agora), async (corretorId) => {
    const { data, error: erroParados } = await supabase.rpc("leads_parados_do_corretor", { p_corretor: corretorId });
    return erroParados ? null : Number(data ?? 0);
  });
  const texto = textoDoResumoSemanal({
    nomeDaCasa: p.nomeDaCasa,
    semana,
    achado: p.achado,
    linkDoPainel: linkDoPainel(p.grupoId, "/corretor/admin"),
  });

  let enviados = 0;
  for (const gestor of querem) {
    // O claim: só um tique grava o carimbo desta semana.
    let claim = supabase
      .from("corretores")
      .update({ relatorio_semanal_whatsapp_em: agora.toISOString() })
      .eq("id", gestor.id)
      .eq("grupo_id", p.grupoId);
    claim = gestor.relatorio_semanal_whatsapp_em
      ? claim.eq("relatorio_semanal_whatsapp_em", gestor.relatorio_semanal_whatsapp_em)
      : claim.is("relatorio_semanal_whatsapp_em", null);
    const { data: ganhou } = await claim.select("id");
    if (!ganhou?.length) continue;
    if (await avisarCorretor(supabase, gestor.id, texto, "/corretor/admin")) enviados++;
  }
  return enviados;
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data: grupos, error } = await supabase.from("grupos").select("id");
    if (error) throw error;

    let enviados = 0;
    let destinatariosTotal = 0;
    let noWhatsapp = 0;
    const semDestinatario: string[] = [];
    for (const { id: grupoId } of grupos ?? []) {
      const leitura = await leituraDoGrupo(supabase, grupoId);
      const numeros = await coletarNumerosDaSemana(leitura);
      const achados = acharNoticias(numeros);
      const { texto, html } = corpoDoRelatorio({ achados, numeros, urlPainel: enderecoDoPainel(grupoId) });
      // O nome da casa no assunto é o do grupo que recebe (um por volta do laço).
      const nomeDaCasa = (await lerMarcaDoCrm(grupoId)).nome;
      const assunto = assuntoDoRelatorio(achados, nomeDaCasa);

      /*
       * O resumo no WhatsApp do gestor (0246, 29/10/2026), ANTES do e-mail:
       * gestor sem e-mail cadastrado também tem WhatsApp. Uma falha aqui não
       * derruba o e-mail de ninguém.
       */
      noWhatsapp += await mandarResumoNoWhatsapp(supabase, {
        grupoId,
        nomeDaCasa,
        leitura,
        achado: achados[0] ?? null,
      }).catch((e) => {
        console.error("[relatorio] resumo no WhatsApp falhou:", e);
        return 0;
      });

      /*
       * O e-mail ficou desligado (03/09/2026, pedido do dono: "e-mail não se
       * mostrou canal eficiente"); o cron voltou em 30/10/2026 por causa do
       * resumo no WhatsApp. O e-mail só sai com RELATORIO_SEMANAL_POR_EMAIL=sim.
       */
      if (process.env.RELATORIO_SEMANAL_POR_EMAIL !== "sim") continue;
      const para = await destinatarios(supabase, grupoId);
      if (para.length === 0) {
        semDestinatario.push(grupoId);
        continue;
      }
      destinatariosTotal += para.length;
      for (const destino of para) {
        const r = await enviarEmail({ para: destino.email, assunto, html, texto });
        if (r.enviado) enviados++;
      }
    }
    if (semDestinatario.length > 0) {
      console.warn("[relatorio] grupo sem gestor com e-mail — relatório não enviado:", semDestinatario.join(", "));
    }

    return NextResponse.json({ ok: true, enviados, destinatarios: destinatariosTotal, semDestinatario, noWhatsapp });
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
