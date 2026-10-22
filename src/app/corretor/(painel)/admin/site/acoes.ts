"use server";

import { createHash } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { revalidarSitePublico } from "@/lib/sites/revalidar";
import { TAG_SITE_DO_GRUPO } from "@/lib/sites/tags";
import {
  caminhoDaCapa,
  ehCapaDoGrupo,
  formatoDaCapa,
  pastaDaCapa,
  problemaDaCapa,
  validarSiteDigitado,
  type SiteDigitado,
} from "@/lib/sites/siteEditavel";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Meu site" (0209): o gestor edita o site público do PRÓPRIO grupo.
 *
 * Quem pode é `exigirGestorNaAcao()`, sempre primeiro; o grupo é o da SESSÃO
 * e nunca vem do navegador. As colunas `site_*` não têm UPDATE para o logado,
 * então a gravação vai pela chave de serviço, depois da guarda e só na linha
 * do grupo do gestor. A Next Home (grupo 1) não edita aqui: o site dela vem
 * de `site.ts`, e guardar campo que o site ignora só esconderia uma surpresa
 * para o dia em que ele passasse a lê-los.
 */

const BUCKET = "empreendimentos";
const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";
const AVISO_SITE_DA_NEXT_HOME = "O site da Next Home vem da instalação; esta tela é dos outros grupos.";

export type ResultadoDoSite =
  | { ok: true }
  | { ok: false; erro: string; erros?: Partial<Record<keyof SiteDigitado, string>> };

export type ResultadoDaCapa = { ok: true; url: string | null } | { ok: false; erro: string };

type Servico = ReturnType<typeof createServiceClient>;

function atualizarTelas() {
  revalidatePath("/corretor/admin/site");
  revalidateTag(TAG_SITE_DO_GRUPO, "max");
  // As páginas do site derrubadas aqui leem o catálogo cacheado: a mesma regra
  // de toda action que revalida a vitrine (`cacheDoCatalogo.test.ts`).
  revalidarCatalogo();
  revalidarSitePublico();
}

async function registrar(servico: Servico, grupoId: string, gestorId: string, detalhes: Record<string, string | null>) {
  const { error } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "site_do_grupo_alterado",
    ator_id: gestorId,
    alvo_corretor_id: null,
    detalhes: { origem: "gestor", ...detalhes },
  });
  if (error) console.error(`[meu site] evento (${grupoId}) não gravado: ${error.message}`);
}

/** Salva o que o formulário edita (texto, cor, contatos). Campo vazio apaga. */
export async function salvarMeuSite(digitado: SiteDigitado): Promise<ResultadoDoSite> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { ok: false, erro: guarda.erro ?? "Acesso negado." };
  const { grupoId, id: gestorId } = guarda.corretor;
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: AVISO_SITE_DA_NEXT_HOME };

  const lido = validarSiteDigitado(digitado);
  if (!lido.ok) return { ok: false, erro: "Corrija os campos marcados.", erros: lido.erros };
  const v = lido.valor;

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("grupos")
    .update({
      site_cor: v.cor,
      site_cor_secundaria: v.corSecundaria,
      site_cor_fundo: v.corFundo,
      site_cor_texto: v.corTexto,
      site_cor_escuro: v.corEscuro,
      site_cor_secundaria_escuro: v.corSecundariaEscuro,
      site_cor_fundo_escuro: v.corFundoEscuro,
      site_cor_texto_escuro: v.corTextoEscuro,
      site_titulo: v.titulo,
      site_frase: v.frase,
      site_sobre: v.sobre,
      site_whatsapp: v.whatsapp,
      site_email: v.email,
      site_endereco: v.endereco,
      site_instagram: v.instagram,
      site_facebook: v.facebook,
    })
    .eq("id", grupoId)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error(`[meu site] grupo ${grupoId}: não gravado: ${error?.message ?? "grupo não encontrado"}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  // O evento diz QUAIS campos ficaram preenchidos, nunca o conteúdo digitado.
  await registrar(servico, grupoId, gestorId, {
    campos: Object.entries(v)
      .filter(([, valor]) => valor !== null)
      .map(([campo]) => campo)
      .join(","),
  });
  atualizarTelas();
  return { ok: true };
}

/** Apaga as capas antigas do grupo, menos a que acabou de entrar (melhor esforço). */
async function apagarCapasAntigas(servico: Servico, grupoId: string, manter: string | null): Promise<void> {
  try {
    const pasta = pastaDaCapa(grupoId);
    const { data } = await servico.storage.from(BUCKET).list(pasta, { limit: 100 });
    const velhas = (data ?? []).map((a) => `${pasta}/${a.name}`).filter((c) => c !== manter && ehCapaDoGrupo(grupoId, c));
    if (velhas.length > 0) await servico.storage.from(BUCKET).remove(velhas);
  } catch (erro) {
    console.warn(`[meu site] ${grupoId}: capa antiga não apagada:`, erro);
  }
}

export async function trocarCapaDoSite(dados: FormData): Promise<ResultadoDaCapa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { ok: false, erro: guarda.erro ?? "Acesso negado." };
  const { grupoId, id: gestorId } = guarda.corretor;
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: AVISO_SITE_DA_NEXT_HOME };

  const arquivo = dados.get("capa");
  if (!(arquivo instanceof File) || typeof arquivo.arrayBuffer !== "function") {
    return { ok: false, erro: "Escolha a foto de capa." };
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const problema = problemaDaCapa(bytes);
  if (problema) return { ok: false, erro: problema };
  const formato = formatoDaCapa(bytes)!;

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const caminho = caminhoDaCapa(grupoId, hash, formato.extensao);
  const servico = createServiceClient();

  const { error: erroDoEnvio } = await servico.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: formato.mime, upsert: true });
  if (erroDoEnvio) {
    console.error(`[meu site] ${grupoId}: envio da capa falhou: ${erroDoEnvio.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  const url = servico.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;

  const { data, error } = await servico.from("grupos").update({ site_capa_url: url }).eq("id", grupoId).select("id");
  if (error || !data || data.length === 0) {
    console.error(`[meu site] grupo ${grupoId}: capa não gravada: ${error?.message ?? "grupo não encontrado"}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  await apagarCapasAntigas(servico, grupoId, caminho);
  await registrar(servico, grupoId, gestorId, { capa: "trocada" });
  atualizarTelas();
  return { ok: true, url };
}

export async function tirarCapaDoSite(): Promise<ResultadoDaCapa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { ok: false, erro: guarda.erro ?? "Acesso negado." };
  const { grupoId, id: gestorId } = guarda.corretor;
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: AVISO_SITE_DA_NEXT_HOME };

  const servico = createServiceClient();
  const { data, error } = await servico.from("grupos").update({ site_capa_url: null }).eq("id", grupoId).select("id");
  if (error || !data || data.length === 0) {
    console.error(`[meu site] grupo ${grupoId}: capa não removida: ${error?.message ?? "grupo não encontrado"}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  await apagarCapasAntigas(servico, grupoId, null);
  await registrar(servico, grupoId, gestorId, { capa: "removida" });
  atualizarTelas();
  return { ok: true, url: null };
}
