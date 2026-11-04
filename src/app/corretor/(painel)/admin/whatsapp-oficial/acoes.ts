"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { createServiceClient } from "@/lib/supabase/service";
import { tokenDoPiloto, versaoGraph } from "@/lib/whatsapp/oficial/configuracao";
import { concluirEmbeddedSignup } from "@/lib/whatsapp/oficial/embeddedSignup";
import { chamarGraph } from "@/lib/whatsapp/oficial/graph";
import {
  nomeParaMeta,
  problemasDoModelo,
  type BotaoDoModelo,
  type DefinicaoDoModelo,
  type VariavelDoModelo,
} from "@/lib/whatsapp/oficial/modelos";
import { enviarModeloParaAprovacao, sincronizarModelos } from "@/lib/whatsapp/oficial/modelosServidor";
import { atualizarNumeroPelaMeta, numeroDoGrupo } from "@/lib/whatsapp/oficial/numeros";

/**
 * As ações da tela do número oficial (0256). Todas: a guarda de gestor pela
 * SESSÃO primeiro (`exigirGestorNaAcao`), a escrita pela chave de serviço
 * depois (as tabelas são só do servidor), sempre com o grupo do gestor como
 * filtro: o id que chega do navegador nunca escolhe o grupo.
 */

type Resultado = { ok?: string; erro?: string };
const CAMINHO = "/corretor/admin/whatsapp-oficial";

async function gestorENumero() {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro } as const;
  const supabase = createServiceClient();
  const numero = await numeroDoGrupo(supabase, guarda.corretor.grupoId);
  return { corretor: guarda.corretor, supabase, numero } as const;
}

/**
 * Cadastro à mão do número (piloto da Next Home), com o token do ambiente.
 *
 * Só para o grupo da Next Home: o token do ambiente é o da PLATAFORMA, e um
 * gestor de outra imobiliária cadastrando um id qualquer passaria a mandar
 * pelo número de alguém que a plataforma enxerga. Os outros grupos conectam
 * pelo Embedded Signup, com o token deles.
 */
export async function cadastrarNumeroManual(dados: { wabaId: string; phoneNumberId: string }): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  if (ctx.corretor.grupoId !== GRUPO_NEXT_HOME_ID) {
    return { erro: "Conecte o número pelo botão da Meta (Embedded Signup)." };
  }
  if (ctx.numero) return { erro: "A imobiliária já tem um número oficial. Desligue o atual antes de cadastrar outro." };
  const token = tokenDoPiloto();
  if (!token) return { erro: "Falta o token da API oficial (WHATSAPP_OFICIAL_TOKEN) no ambiente." };

  const wabaId = dados.wabaId.trim();
  const phoneNumberId = dados.phoneNumberId.trim();
  if (!/^\d{5,25}$/.test(wabaId) || !/^\d{5,25}$/.test(phoneNumberId)) {
    return { erro: "Os dois ids são só números (copie do WhatsApp Manager → Configuração da API)." };
  }

  // O número existe e o token o enxerga? Pergunta antes de gravar.
  const confere = await chamarGraph<{ display_phone_number?: string; verified_name?: string }>({
    versao: versaoGraph(),
    caminho: phoneNumberId,
    token,
    consulta: { fields: "display_phone_number,verified_name" },
  });
  if (!confere.ok) return { erro: `A Meta não reconheceu o número: ${confere.erro.detalhe ?? confere.erro.mensagem}` };

  const { data: numero, error } = await ctx.supabase
    .from("whatsapp_numeros_oficiais")
    .insert({
      grupo_id: ctx.corretor.grupoId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      numero: confere.dados.display_phone_number?.replace(/\D/g, "") ?? null,
      nome_exibicao: confere.dados.verified_name ?? null,
      origem: "manual",
      conectado_por: ctx.corretor.id,
    })
    .select("*")
    .single();
  if (error || !numero) {
    return { erro: error?.code === "23505" ? "Este número já está cadastrado na plataforma." : "Não consegui cadastrar o número agora." };
  }
  await atualizarNumeroPelaMeta(ctx.supabase, numero);

  // O webhook do app só recebe o que é DESTA conta (WABA) se o app estiver
  // assinado nela. Idempotente: repetir não faz mal, e sem isso nada do número
  // chega (nem resposta, nem entrega, nem o "parar"). O passo de `register` do
  // número (PIN de duas etapas) fica no guia: o PIN é do dono, não daqui.
  const assinatura = await chamarGraph<{ success?: boolean }>({
    versao: versaoGraph(),
    caminho: `${wabaId}/subscribed_apps`,
    token,
    metodo: "POST",
  });
  revalidatePath(CAMINHO);
  if (!assinatura.ok) {
    return {
      ok: `Número oficial cadastrado, mas a Meta não ligou as notificações da conta (${assinatura.erro.detalhe ?? assinatura.erro.mensagem}). Sem elas, respostas e entregas não chegam: veja o passo 6 de docs/WHATSAPP-OFICIAL-ATIVAR.md.`,
    };
  }
  return { ok: "Número oficial cadastrado, com as notificações da conta ligadas." };
}

export async function concluirConexaoPelaMeta(dados: { code: string; wabaId: string; phoneNumberId: string }): Promise<
  { ok: string; pin: string; aviso: string | null } | { erro: string }
> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro ?? "Sem permissão." };
  if (ctx.numero && ctx.numero.phone_number_id !== dados.phoneNumberId) {
    return { erro: "A imobiliária já tem um número oficial ativo. Desligue o atual antes de conectar outro." };
  }
  const r = await concluirEmbeddedSignup(ctx.supabase, {
    grupoId: ctx.corretor.grupoId,
    corretorId: ctx.corretor.id,
    code: dados.code,
    wabaId: dados.wabaId,
    phoneNumberId: dados.phoneNumberId,
  });
  if ("erro" in r) return r;
  revalidatePath(CAMINHO);
  return { ok: "Número oficial conectado.", pin: r.pin, aviso: r.aviso };
}

export async function atualizarDadosDaMeta(): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  if (!ctx.numero) return { erro: "Nenhum número oficial cadastrado." };
  const r = await atualizarNumeroPelaMeta(ctx.supabase, ctx.numero);
  if ("erro" in r) return { erro: r.erro };
  const modelos = await sincronizarModelos(ctx.supabase, r.numero);
  revalidatePath(CAMINHO);
  return { ok: "erro" in modelos ? `Número atualizado. Modelos: ${modelos.erro}` : `Número e ${modelos.atualizados} modelo(s) atualizados.` };
}

export async function salvarConfiguracao(dados: {
  liberado: boolean;
  teto: number | null;
  resposta: "ia" | "mensagem_fixa" | "nenhuma";
  mensagemFixa: string;
}): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  if (!ctx.numero) return { erro: "Nenhum número oficial cadastrado." };
  if (dados.teto !== null && (!Number.isInteger(dados.teto) || dados.teto < 0 || dados.teto > 1_000_000)) {
    return { erro: "O teto do mês é um número inteiro de mensagens (ou vazio, sem teto)." };
  }
  if (!["ia", "mensagem_fixa", "nenhuma"].includes(dados.resposta)) return { erro: "Escolha quem responde." };
  const fixa = dados.mensagemFixa.trim();
  if (dados.resposta === "mensagem_fixa" && !fixa) return { erro: "Escreva a mensagem fixa." };
  if (fixa.length > 1000) return { erro: "A mensagem fixa passa de 1.000 caracteres." };

  const { error } = await ctx.supabase
    .from("whatsapp_numeros_oficiais")
    .update({
      liberado_para_corretores: dados.liberado,
      teto_mensal: dados.teto,
      resposta: dados.resposta,
      mensagem_fixa: fixa || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", ctx.numero.id)
    .eq("grupo_id", ctx.corretor.grupoId);
  if (error) return { erro: "Não consegui salvar agora." };
  revalidatePath(CAMINHO);
  return { ok: "Configuração salva." };
}

export async function reativarNumero(): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  if (!ctx.numero || ctx.numero.estado !== "pausado") return { erro: "O número não está pausado." };
  await ctx.supabase
    .from("whatsapp_numeros_oficiais")
    .update({ estado: "ativo", motivo_estado: null, atualizado_em: new Date().toISOString() })
    .eq("id", ctx.numero.id)
    .eq("grupo_id", ctx.corretor.grupoId);
  revalidatePath(CAMINHO);
  return { ok: "Número reativado. As listas voltam no próximo ciclo." };
}

/** Desliga o número: as listas oficiais em andamento pausam com o motivo. */
export async function desligarNumero(): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  if (!ctx.numero) return { erro: "Nenhum número oficial cadastrado." };
  await ctx.supabase
    .from("whatsapp_numeros_oficiais")
    .update({ estado: "desligado", motivo_estado: "Desligado pelo gestor.", atualizado_em: new Date().toISOString() })
    .eq("id", ctx.numero.id)
    .eq("grupo_id", ctx.corretor.grupoId);
  await ctx.supabase
    .from("whatsapp_campanhas")
    .update({ status: "pausada", pausa_automatica: "O número oficial foi desligado pelo gestor." })
    .eq("grupo_id", ctx.corretor.grupoId)
    .eq("numero_oficial_id", ctx.numero.id)
    .eq("status", "em_andamento");
  revalidatePath(CAMINHO);
  return { ok: "Número desligado. As listas oficiais em andamento foram pausadas." };
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

export type ModeloEditado = {
  id?: string | null;
  titulo: string;
  categoria: "MARKETING" | "UTILITY";
  corpo: string;
  exemplos: Partial<Record<VariavelDoModelo, string>>;
  cabecalho: "nenhum" | "imagem" | "texto";
  cabecalhoTexto: string;
  cabecalhoImagemUrl: string;
  rodape: string;
  botoes: BotaoDoModelo[];
};

/**
 * Salva o rascunho do modelo. Só rascunho (ou reprovado/erro) muda: modelo
 * aprovado é o que a Meta aprovou, e editar aqui o separaria do de lá.
 */
export async function salvarModelo(m: ModeloEditado): Promise<{ ok: string; id: string } | { erro: string }> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro ?? "Sem permissão." };
  if (!ctx.numero) return { erro: "Cadastre o número oficial antes dos modelos." };

  const definicao: DefinicaoDoModelo = {
    nome: nomeParaMeta(m.titulo),
    idioma: "pt_BR",
    categoria: m.categoria,
    corpo: m.corpo.trim(),
    exemplos: m.exemplos,
    cabecalho: m.cabecalho,
    cabecalhoTexto: m.cabecalhoTexto.trim() || null,
    rodape: m.rodape.trim() || null,
    botoes: m.botoes.map((b) => ({ tipo: b.tipo === "parar" ? "parar" : "interesse", texto: b.texto.trim() })),
  };
  const problemas = problemasDoModelo(definicao);
  if (problemas.length > 0) return { erro: problemas.join(" ") };

  // A foto de exemplo do cabeçalho tem de ser do catálogo DESTE grupo: o
  // servidor a baixa para mandar à Meta, e um link qualquer faria o servidor
  // buscar o endereço que alguém escolhesse.
  let imagem: string | null = null;
  if (definicao.cabecalho === "imagem") {
    const url = m.cabecalhoImagemUrl.trim();
    const { data: midia } = await ctx.supabase
      .from("midias")
      .select("url")
      .eq("grupo_id", ctx.corretor.grupoId)
      .eq("url", url)
      .limit(1)
      .maybeSingle();
    if (!midia || !/^https:\/\//.test(url)) return { erro: "Escolha a foto de exemplo entre as fotos do catálogo." };
    imagem = url;
  }

  const linha = {
    grupo_id: ctx.corretor.grupoId,
    numero_oficial_id: ctx.numero.id,
    nome: definicao.nome,
    idioma: definicao.idioma,
    categoria: definicao.categoria,
    corpo: definicao.corpo,
    exemplos: definicao.exemplos,
    cabecalho: definicao.cabecalho,
    cabecalho_texto: definicao.cabecalhoTexto ?? null,
    cabecalho_imagem_url: imagem,
    rodape: definicao.rodape ?? null,
    botoes: definicao.botoes,
    criado_por: ctx.corretor.id,
    estado: "rascunho" as const,
    motivo: null,
    atualizado_em: new Date().toISOString(),
  };

  if (m.id) {
    const { data, error } = await ctx.supabase
      .from("whatsapp_modelos_oficiais")
      .update(linha)
      .eq("id", m.id)
      .eq("grupo_id", ctx.corretor.grupoId)
      .in("estado", ["rascunho", "rejeitado", "erro"])
      .select("id");
    if (error) return { erro: error.code === "23505" ? "Já existe um modelo com esse nome." : "Não consegui salvar agora." };
    if (!data?.length) return { erro: "Este modelo já foi para a Meta e não muda mais. Crie outro." };
    revalidatePath(CAMINHO);
    return { ok: "Modelo salvo.", id: m.id };
  }
  const { data, error } = await ctx.supabase.from("whatsapp_modelos_oficiais").insert(linha).select("id").single();
  if (error || !data) {
    return { erro: error?.code === "23505" ? "Já existe um modelo com esse nome. Mude o título." : "Não consegui salvar agora." };
  }
  revalidatePath(CAMINHO);
  return { ok: "Modelo salvo como rascunho.", id: data.id };
}

export async function enviarModeloParaAMeta(modeloId: string): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  if (!ctx.numero) return { erro: "Nenhum número oficial cadastrado." };
  const { data: modelo } = await ctx.supabase
    .from("whatsapp_modelos_oficiais")
    .select("*")
    .eq("id", modeloId)
    .eq("grupo_id", ctx.corretor.grupoId)
    .eq("numero_oficial_id", ctx.numero.id)
    .maybeSingle();
  if (!modelo) return { erro: "Modelo não encontrado." };
  if (!["rascunho", "rejeitado", "erro"].includes(modelo.estado)) return { erro: "Este modelo já está com a Meta." };
  const r = await enviarModeloParaAprovacao(ctx.supabase, modelo, ctx.numero);
  revalidatePath(CAMINHO);
  return "erro" in r ? { erro: r.erro } : { ok: "Modelo enviado. A Meta costuma responder em minutos; o estado muda sozinho aqui." };
}

export async function excluirRascunhoDeModelo(modeloId: string): Promise<Resultado> {
  const ctx = await gestorENumero();
  if ("erro" in ctx) return { erro: ctx.erro };
  const { data } = await ctx.supabase
    .from("whatsapp_modelos_oficiais")
    .delete()
    .eq("id", modeloId)
    .eq("grupo_id", ctx.corretor.grupoId)
    .in("estado", ["rascunho", "erro"])
    .select("id");
  if (!data?.length) return { erro: "Só rascunho (ou modelo com erro) sai daqui. O que está na Meta se apaga no WhatsApp Manager." };
  revalidatePath(CAMINHO);
  return { ok: "Rascunho excluído." };
}
