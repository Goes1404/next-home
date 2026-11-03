import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { idDoApp, versaoGraph } from "./configuracao";
import { chamarGraph } from "./graph";
import {
  botoesDoBanco,
  estadoDaMeta,
  exemplosDoBanco,
  pedidoDeCriacao,
  problemasDoModelo,
  type DefinicaoDoModelo,
} from "./modelos";
import { tokenDoNumero, type NumeroOficial } from "./numeros";

type Supa = ReturnType<typeof createServiceClient>;
export type ModeloOficial = Database["public"]["Tables"]["whatsapp_modelos_oficiais"]["Row"];

/** A linha do banco no formato da validação e do pedido à Meta. */
export function definicaoDe(m: ModeloOficial): DefinicaoDoModelo {
  return {
    nome: m.nome,
    idioma: m.idioma,
    categoria: m.categoria,
    corpo: m.corpo,
    exemplos: exemplosDoBanco(m.exemplos),
    cabecalho: m.cabecalho,
    cabecalhoTexto: m.cabecalho_texto,
    rodape: m.rodape,
    botoes: botoesDoBanco(m.botoes),
  };
}

/** Teto da foto de exemplo do cabeçalho (a Meta aceita até 5 MB em imagem). */
const MAXIMO_DA_FOTO = 5 * 1024 * 1024;

/**
 * Sobe a foto de exemplo do cabeçalho pela API de upload retomável da Meta e
 * devolve o "handle" que o pedido de criação exige (documentação conferida em
 * 03/11/2026: `POST /{app-id}/uploads` abre a sessão; `POST /upload:<id>`
 * com `Authorization: OAuth` e `file_offset: 0` manda o arquivo; a resposta
 * traz `{ h }`).
 */
async function handleDaFoto(url: string, token: string): Promise<{ handle: string } | { erro: string }> {
  const app = idDoApp();
  if (!app) return { erro: "Falta o id do app da Meta (WHATSAPP_OFICIAL_APP_ID) para subir a foto do cabeçalho." };

  let foto: Response;
  try {
    foto = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return { erro: "Não consegui baixar a foto do cabeçalho." };
  }
  if (!foto.ok) return { erro: "A foto do cabeçalho não está acessível pelo link." };
  const tipo = (foto.headers.get("content-type") ?? "").split(";")[0].trim();
  if (tipo !== "image/jpeg" && tipo !== "image/png") return { erro: "A foto do cabeçalho precisa ser JPG ou PNG." };
  const dados = new Uint8Array(await foto.arrayBuffer());
  if (dados.byteLength === 0 || dados.byteLength > MAXIMO_DA_FOTO) return { erro: "A foto do cabeçalho precisa ter até 5 MB." };

  const sessao = await chamarGraph<{ id?: string }>({
    versao: versaoGraph(),
    caminho: `${app}/uploads`,
    token,
    metodo: "POST",
    consulta: { file_name: tipo === "image/png" ? "cabecalho.png" : "cabecalho.jpg", file_length: String(dados.byteLength), file_type: tipo },
  });
  if (!sessao.ok || !sessao.dados.id) {
    return { erro: `A Meta não abriu o envio da foto: ${sessao.ok ? "sem id" : (sessao.erro.detalhe ?? sessao.erro.mensagem)}` };
  }
  const envio = await chamarGraph<{ h?: string }>({
    versao: versaoGraph(),
    caminho: sessao.dados.id,
    token,
    metodo: "POST",
    autorizacao: "OAuth",
    binario: { dados, cabecalhos: { file_offset: "0" } },
    prazoMs: 30_000,
  });
  if (!envio.ok || !envio.dados.h) {
    return { erro: `A Meta não recebeu a foto: ${envio.ok ? "sem handle" : (envio.erro.detalhe ?? envio.erro.mensagem)}` };
  }
  return { handle: envio.dados.h };
}

/**
 * Manda o modelo para a aprovação da Meta. Valida aqui antes (o que a Meta
 * reprovaria volta na hora, em português, sem gastar uma análise dela).
 */
export async function enviarModeloParaAprovacao(
  supabase: Supa,
  modelo: ModeloOficial,
  numero: NumeroOficial,
): Promise<{ ok: true } | { erro: string }> {
  const definicao = definicaoDe(modelo);
  const problemas = problemasDoModelo(definicao);
  if (problemas.length > 0) return { erro: problemas.join(" ") };

  const credencial = tokenDoNumero(numero);
  if ("erro" in credencial) return credencial;

  let handle: string | null = null;
  if (definicao.cabecalho === "imagem") {
    if (!modelo.cabecalho_imagem_url) return { erro: "Escolha a foto de exemplo do cabeçalho." };
    const r = await handleDaFoto(modelo.cabecalho_imagem_url, credencial.token);
    if ("erro" in r) return r;
    handle = r.handle;
  }

  const r = await chamarGraph<{ id?: string; status?: string; category?: string }>({
    versao: versaoGraph(),
    caminho: `${numero.waba_id}/message_templates`,
    token: credencial.token,
    corpo: pedidoDeCriacao(definicao, handle),
  });
  const agora = new Date().toISOString();
  if (!r.ok) {
    const motivo = r.erro.detalhe ?? r.erro.mensagem;
    await supabase
      .from("whatsapp_modelos_oficiais")
      .update({ estado: "erro", motivo, atualizado_em: agora })
      .eq("id", modelo.id);
    return { erro: `A Meta recusou o modelo: ${motivo}` };
  }
  await supabase
    .from("whatsapp_modelos_oficiais")
    .update({
      meta_id: r.dados.id ?? null,
      estado: estadoDaMeta(r.dados.status) ?? "em_analise",
      // A Meta pode reclassificar a categoria (utilidade que vira marketing).
      categoria: r.dados.category?.toUpperCase() === "UTILITY" ? "UTILITY" : "MARKETING",
      motivo: null,
      enviado_em: agora,
      atualizado_em: agora,
    })
    .eq("id", modelo.id);
  return { ok: true };
}

type ModeloNaMeta = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  quality_score?: { score?: string };
  rejected_reason?: string;
};

/**
 * Traz da Meta o estado de todos os modelos da conta. O webhook já avisa cada
 * mudança; isto cobre o que se perdeu (webhook fora do ar, modelo criado
 * antes de o número ser cadastrado aqui).
 */
export async function sincronizarModelos(supabase: Supa, numero: NumeroOficial): Promise<{ atualizados: number } | { erro: string }> {
  const credencial = tokenDoNumero(numero);
  if ("erro" in credencial) return credencial;
  const r = await chamarGraph<{ data?: ModeloNaMeta[] }>({
    versao: versaoGraph(),
    caminho: `${numero.waba_id}/message_templates`,
    token: credencial.token,
    consulta: { fields: "id,name,language,status,category,quality_score,rejected_reason", limit: "200" },
  });
  if (!r.ok) return { erro: `A Meta não listou os modelos: ${r.erro.detalhe ?? r.erro.mensagem}` };

  let atualizados = 0;
  for (const m of r.dados.data ?? []) {
    const estado = estadoDaMeta(m.status);
    if (!m.name || !estado) continue;
    const motivo = m.rejected_reason && m.rejected_reason !== "NONE" ? m.rejected_reason : null;
    const { data } = await supabase
      .from("whatsapp_modelos_oficiais")
      .update({
        meta_id: m.id ?? null,
        estado,
        motivo,
        qualidade: m.quality_score?.score ?? null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("numero_oficial_id", numero.id)
      .eq("nome", m.name)
      .eq("idioma", m.language ?? "pt_BR")
      .select("id");
    atualizados += data?.length ?? 0;
  }
  return { atualizados };
}
