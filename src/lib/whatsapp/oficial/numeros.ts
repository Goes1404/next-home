import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { decifrar } from "./cifra";
import { chaveDeCifra, tokenDoPiloto, versaoGraph } from "./configuracao";
import { chamarGraph } from "./graph";

type Supa = ReturnType<typeof createServiceClient>;
export type NumeroOficial = Database["public"]["Tables"]["whatsapp_numeros_oficiais"]["Row"];

/**
 * O número oficial: ler, resolver o token e atualizar o que a Meta informa.
 *
 * Toda leitura tolera a tabela não existir (migration 0256 não aplicada:
 * 42P01) e devolve "sem número". É o que deixa este código subir para
 * produção antes da migration sem quebrar nada: tudo do número oficial
 * simplesmente fica desligado.
 */

function tabelaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "42P01" || erro?.code === "42703" || erro?.code === "PGRST205";
}

/** O número ativo (ou pausado) do grupo; desligado não conta. */
export async function numeroDoGrupo(supabase: Supa, grupoId: string): Promise<NumeroOficial | null> {
  const { data, error } = await supabase
    .from("whatsapp_numeros_oficiais")
    .select("*")
    .eq("grupo_id", grupoId)
    .neq("estado", "desligado")
    .maybeSingle();
  if (error) {
    if (!tabelaAusente(error)) console.warn("[oficial] número do grupo não lido:", error.message);
    return null;
  }
  return data;
}

/** O número pelo id da Meta (o webhook chega sem grupo). */
export async function numeroPorPhoneId(supabase: Supa, phoneNumberId: string): Promise<NumeroOficial | null> {
  const { data, error } = await supabase
    .from("whatsapp_numeros_oficiais")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) {
    if (!tabelaAusente(error)) console.warn("[oficial] número pelo id da Meta não lido:", error.message);
    return null;
  }
  return data;
}

/** Os números de uma conta (WABA): modelos e qualidade chegam pela conta. */
export async function numerosDaConta(supabase: Supa, wabaId: string): Promise<NumeroOficial[]> {
  const { data, error } = await supabase.from("whatsapp_numeros_oficiais").select("*").eq("waba_id", wabaId);
  if (error) {
    if (!tabelaAusente(error)) console.warn("[oficial] números da conta não lidos:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * O token para falar com a Meta por este número: o do cliente (cifrado, F5)
 * ou, no número cadastrado à mão (piloto), o do ambiente. Sem token, nada
 * sai, e o painel diz por quê.
 */
export function tokenDoNumero(
  numero: Pick<NumeroOficial, "token_cifrado" | "origem">,
): { token: string } | { erro: string } {
  if (numero.token_cifrado) {
    const chave = chaveDeCifra();
    if (!chave) return { erro: "Falta a chave de cifra (WHATSAPP_OFICIAL_CHAVE_CIFRA) para ler o token deste número." };
    const token = decifrar(numero.token_cifrado, chave);
    return token ? { token } : { erro: "O token deste número não decifrou: a chave de cifra mudou? Conecte o número de novo." };
  }
  const piloto = tokenDoPiloto();
  if (numero.origem === "manual" && piloto) return { token: piloto };
  return { erro: "Falta o token da API oficial (WHATSAPP_OFICIAL_TOKEN)." };
}

/** O limite de pessoas novas por 24 h que a Meta dá ao portfólio. */
export function limiteDiario(limite: string | null | undefined): number {
  const v = (limite ?? "").toUpperCase();
  if (v.includes("UNLIMITED")) return Number.POSITIVE_INFINITY;
  if (v.includes("100K")) return 100_000;
  if (v.includes("10K")) return 10_000;
  if (v.includes("2K") || v.includes("2000")) return 2_000;
  if (v.includes("1K") || v.includes("1000")) return 1_000;
  // TIER_250, desconhecido ou nulo: o menor, que é o de toda conta nova. Errar
  // para baixo atrasa a lista; errar para cima faz a Meta recusar mensagens.
  return 250;
}

type DadosDoNumeroNaMeta = {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  whatsapp_business_manager_messaging_limit?: string;
};

/**
 * Pergunta à Meta o nome, a qualidade e o limite do número e grava. Campo
 * novo da Meta primeiro (`whatsapp_business_manager_messaging_limit`); se a
 * conta não o conhecer, o antigo.
 */
export async function atualizarNumeroPelaMeta(
  supabase: Supa,
  numero: NumeroOficial,
): Promise<{ ok: true; numero: NumeroOficial } | { erro: string }> {
  const credencial = tokenDoNumero(numero);
  if ("erro" in credencial) return credencial;

  const base = "display_phone_number,verified_name,quality_rating";
  let r = await chamarGraph<DadosDoNumeroNaMeta>({
    versao: versaoGraph(),
    caminho: numero.phone_number_id,
    token: credencial.token,
    consulta: { fields: `${base},whatsapp_business_manager_messaging_limit` },
  });
  if (!r.ok && r.erro.codigo === 100) {
    r = await chamarGraph<DadosDoNumeroNaMeta>({
      versao: versaoGraph(),
      caminho: numero.phone_number_id,
      token: credencial.token,
      consulta: { fields: `${base},messaging_limit_tier` },
    });
  }
  if (!r.ok) return { erro: `A Meta não respondeu sobre o número: ${r.erro.detalhe ?? r.erro.mensagem}` };

  const d = r.dados;
  const { data, error } = await supabase
    .from("whatsapp_numeros_oficiais")
    .update({
      numero: d.display_phone_number?.replace(/\D/g, "") ?? numero.numero,
      nome_exibicao: d.verified_name ?? numero.nome_exibicao,
      qualidade: d.quality_rating ?? numero.qualidade,
      limite_de_envio: d.whatsapp_business_manager_messaging_limit ?? d.messaging_limit_tier ?? numero.limite_de_envio,
      atualizado_na_meta_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", numero.id)
    .select("*")
    .single();
  if (error || !data) return { erro: "Não consegui gravar os dados do número agora." };
  return { ok: true, numero: data };
}

/** Pausa o número (conta restrita, token vencido...) com o motivo à vista. */
export async function pausarNumero(supabase: Supa, numeroId: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_numeros_oficiais")
    .update({ estado: "pausado", motivo_estado: motivo, atualizado_em: new Date().toISOString() })
    .eq("id", numeroId)
    .eq("estado", "ativo");
  if (error) console.error("[oficial] não consegui pausar o número:", error.message);
}
