import "server-only";

import { randomInt } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/service";
import { cifrar } from "./cifra";
import { chaveDeCifra, idDoApp, segredoDoApp, versaoGraph } from "./configuracao";
import { chamarGraph } from "./graph";
import { atualizarNumeroPelaMeta } from "./numeros";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Embedded Signup (F5 do roadmap): o cliente da Astro conecta o WhatsApp
 * oficial DELE, pela janela da Meta, sem mandar token nem senha a ninguém.
 *
 * Do lado do navegador (`ConectarPelaMeta.tsx`), a janela da Meta devolve um
 * `code` (vale 30 s) e os ids da conta (WABA) e do número. Aqui, servidor a
 * servidor, como a Meta exige:
 *   1. troca o `code` pelo token de negócio do cliente;
 *   2. assina os webhooks da conta do cliente para o nosso app;
 *   3. registra o número na Cloud API, com um PIN de duas etapas novo;
 *   4. guarda o número com o token CIFRADO, e pergunta à Meta nome,
 *      qualidade e limite.
 *
 * Pré-requisitos da plataforma (docs/WHATSAPP-OFICIAL-ATIVAR.md): a Astro
 * ser Tech Provider (empresa verificada + App Review com as permissões
 * `whatsapp_business_messaging` e `whatsapp_business_management`), uma
 * configuração de Embedded Signup v4 no app, e o cartão do cliente na conta
 * de mensagens DELE (decisão de 03/11/2026: cada cliente paga a Meta).
 */

export type ResultadoDaConexao =
  | { ok: true; numeroId: string; pin: string; aviso: string | null }
  | { erro: string };

export async function concluirEmbeddedSignup(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; code: string; wabaId: string; phoneNumberId: string },
): Promise<ResultadoDaConexao> {
  const app = idDoApp();
  const segredo = segredoDoApp();
  const chave = chaveDeCifra();
  if (!app || !segredo) return { erro: "O app da Meta não está configurado (id e segredo)." };
  if (!chave) return { erro: "Falta a chave de cifra (WHATSAPP_OFICIAL_CHAVE_CIFRA) para guardar o acesso com segurança." };
  if (!/^\d+$/.test(p.wabaId) || !/^\d+$/.test(p.phoneNumberId)) return { erro: "A Meta não devolveu os ids da conta e do número." };

  // 1. O token do cliente. O `code` vale 30 s: esta é a primeira chamada.
  const troca = await chamarGraph<{ access_token?: string }>({
    versao: versaoGraph(),
    caminho: "oauth/access_token",
    token: "",
    metodo: "GET",
    consulta: { client_id: app, client_secret: segredo, code: p.code },
  });
  if (!troca.ok || !troca.dados.access_token) {
    return { erro: `A Meta não liberou o acesso: ${troca.ok ? "sem token" : (troca.erro.detalhe ?? troca.erro.mensagem)}. Tente conectar de novo.` };
  }
  const token = troca.dados.access_token;

  // O mesmo número já está em outro grupo? Um número, um grupo: o webhook
  // acha a imobiliária pelo número.
  const { data: existente } = await supabase
    .from("whatsapp_numeros_oficiais")
    .select("id, grupo_id")
    .eq("phone_number_id", p.phoneNumberId)
    .maybeSingle();
  if (existente && existente.grupo_id !== p.grupoId) {
    return { erro: "Este número já está conectado a outra conta da plataforma. Fale com o suporte da Astro." };
  }

  // 2. Os webhooks da conta do cliente vêm para o nosso app.
  const assinatura = await chamarGraph<{ success?: boolean }>({
    versao: versaoGraph(),
    caminho: `${p.wabaId}/subscribed_apps`,
    token,
    metodo: "POST",
  });
  if (!assinatura.ok) {
    return { erro: `Não consegui ligar as notificações da conta: ${assinatura.erro.detalhe ?? assinatura.erro.mensagem}` };
  }

  // 3. O número na Cloud API. O PIN vira a verificação em duas etapas do
  // número: quem conecta precisa anotar (a tela mostra uma vez).
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const registro = await chamarGraph<{ success?: boolean }>({
    versao: versaoGraph(),
    caminho: `${p.phoneNumberId}/register`,
    token,
    corpo: { messaging_product: "whatsapp", pin },
  });
  const aviso = registro.ok
    ? null
    : `A Meta não registrou o número agora (${registro.erro.detalhe ?? registro.erro.mensagem}). Ele fica cadastrado; tente "Atualizar dados da Meta" em alguns minutos.`;

  // 4. Guarda, com o token cifrado.
  const linha = {
    grupo_id: p.grupoId,
    waba_id: p.wabaId,
    phone_number_id: p.phoneNumberId,
    token_cifrado: cifrar(token, chave),
    origem: "embedded_signup" as const,
    conectado_por: p.corretorId,
    estado: "ativo" as const,
    motivo_estado: null,
    atualizado_em: new Date().toISOString(),
  };
  const { data: numero, error } = existente
    ? await supabase.from("whatsapp_numeros_oficiais").update(linha).eq("id", existente.id).select("*").single()
    : await supabase.from("whatsapp_numeros_oficiais").insert(linha).select("*").single();
  if (error || !numero) {
    return {
      erro:
        error?.code === "23505"
          ? "A imobiliária já tem um número oficial ativo. Desligue o atual antes de conectar outro."
          : "Não consegui guardar o número agora.",
    };
  }
  await atualizarNumeroPelaMeta(supabase, numero);
  return { ok: true, numeroId: numero.id, pin, aviso };
}
