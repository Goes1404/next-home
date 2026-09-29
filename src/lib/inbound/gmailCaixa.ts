import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { buscaDesde, mensagemParaEmail, type MensagemGmail } from "./gmail";
import { processarEmailDeLead } from "./processarEmail";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

async function tokenDeAcesso(refreshToken: string): Promise<{ token?: string; erro?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !j.access_token) return { erro: j.error ?? `http_${res.status}` };
  return { token: j.access_token };
}

/** Na primeira leitura, olha só as últimas 48h: não reimporta o ano inteiro. */
const JANELA_INICIAL_MS = 48 * 3600_000;

/**
 * Lê as caixas conectadas, do corretor lido há mais tempo para o mais
 * recente. Teto de caixas e de mensagens por tique: cada e-mail custa uma
 * chamada de IA para extrair o lead, e o tique divide 60s com o resto.
 */
export async function lerCaixasDoGmail(limiteCaixas = 1, limiteMensagens = 5): Promise<number> {
  if (!gmailConfigurado()) return 0;
  const supabase = createServiceClient();
  const { data: contas } = await supabase
    .from("contas_email_google")
    .select("corretor_id, refresh_token, ultima_leitura_em, lidos_total")
    // Caixa com erro (acesso revogado) vai para o fim: não pode tomar a vez
    // das que funcionam a cada tique.
    .order("ultimo_erro", { ascending: true, nullsFirst: true })
    .order("ultima_leitura_em", { ascending: true, nullsFirst: true })
    .limit(limiteCaixas);

  let novos = 0;
  for (const conta of contas ?? []) {
    const inicioDaLeitura = new Date();
    const { token, erro } = await tokenDeAcesso(conta.refresh_token);
    if (!token) {
      // `invalid_grant` = o corretor revogou o acesso ou o token venceu: a
      // tela de Perfil mostra isso e pede para reconectar.
      // A marca de leitura NÃO avança: reconectado, ele lê o que chegou no meio.
      await supabase.from("contas_email_google").update({ ultimo_erro: erro ?? "sem token" }).eq("corretor_id", conta.corretor_id);
      continue;
    }
    const desde = conta.ultima_leitura_em ? new Date(conta.ultima_leitura_em) : new Date(Date.now() - JANELA_INICIAL_MS);
    const cab = { Authorization: `Bearer ${token}` };
    // Até 25 ids (o Gmail devolve do mais novo para o mais velho); lidos do
    // mais VELHO para o mais novo, para a marca de leitura poder avançar até
    // onde o teto deixou.
    const lista = await fetch(`${API}/messages?${new URLSearchParams({ q: buscaDesde(desde), maxResults: "25" })}`, {
      headers: cab,
      signal: AbortSignal.timeout(8000),
    });
    if (!lista.ok) {
      await supabase.from("contas_email_google").update({ ultimo_erro: `lista http_${lista.status}` }).eq("corretor_id", conta.corretor_id);
      continue;
    }
    const { messages } = (await lista.json()) as { messages?: { id: string }[] };
    const fila = [...(messages ?? [])].reverse();
    let lidos = 0;
    let marca: Date | null = inicioDaLeitura;
    for (const { id } of fila) {
      if (lidos >= limiteMensagens) {
        // Sobrou e-mail: a marca fica no último lido, e o próximo tique segue dali.
        break;
      }
      const r = await fetch(`${API}/messages/${id}?format=full`, { headers: cab, signal: AbortSignal.timeout(8000) });
      if (!r.ok) {
        marca = null;
        break;
      }
      const mensagem = (await r.json()) as MensagemGmail & { internalDate?: string };
      const resultado = await processarEmailDeLead(mensagemParaEmail(mensagem), { corretorDono: conta.corretor_id });
      novos += resultado.totalInseridos;
      lidos++;
      if (lidos >= limiteMensagens && fila.length > lidos) {
        marca = mensagem.internalDate ? new Date(Number(mensagem.internalDate)) : null;
      }
    }
    /*
     * `marca = null`: falhou no meio, não avança (a deduplicação por
     * `email_message_id` torna a releitura segura).
     */
    await supabase
      .from("contas_email_google")
      .update({
        ultimo_erro: null,
        lidos_total: (conta.lidos_total ?? 0) + lidos,
        ...(marca ? { ultima_leitura_em: marca.toISOString() } : {}),
      })
      .eq("corretor_id", conta.corretor_id);
  }
  return novos;
}
