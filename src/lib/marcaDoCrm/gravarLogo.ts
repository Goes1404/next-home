import "server-only";

import { createHash } from "node:crypto";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { createServiceClient } from "@/lib/supabase/service";
import { esquecerMarcasLidas } from "./ler";
import { caminhoDaLogo, ehLogoDoGrupo, formatoDaLogo, pastaDaLogo, problemaDaLogo } from "./logo";

/**
 * Grava ou tira a logo de UM grupo (0208). Quem chama já decidiu QUEM pode
 * (`exigirAdminDaPlataformaNaAcao` ou `exigirGestorNaAcao`, que dá o grupo da
 * sessão): aqui a chave de serviço só age na linha e na pasta do grupo
 * recebido. `grupos.logo_url` não tem UPDATE para o logado.
 *
 * Nunca lança: o resultado diz o que dizer na tela.
 */

const BUCKET = "empreendimentos";
const ERRO_GENERICO = "Não foi possível salvar a logo agora. Tente de novo.";

export type ResultadoDaLogo = { ok: true; url: string | null } | { ok: false; erro: string };

export const AVISO_LOGO_DA_NEXT_HOME = "A Next Home usa o logotipo da instalação; a logo por imagem é dos outros grupos.";

type Servico = ReturnType<typeof createServiceClient>;

/** Apaga as logos antigas do grupo, menos a que acabou de entrar (melhor esforço). */
async function apagarLogosAntigas(servico: Servico, grupoId: string, manter: string | null): Promise<void> {
  try {
    const { data } = await servico.storage.from(BUCKET).list(pastaDaLogo(grupoId), { limit: 100 });
    const velhas = (data ?? [])
      .map((a) => `${pastaDaLogo(grupoId)}/${a.name}`)
      .filter((caminho) => caminho !== manter && ehLogoDoGrupo(grupoId, caminho));
    if (velhas.length > 0) await servico.storage.from(BUCKET).remove(velhas);
  } catch (erro) {
    console.warn(`[logo do grupo] ${grupoId}: logo antiga não apagada:`, erro);
  }
}

export async function gravarLogoDoGrupo(grupoId: string, arquivo: File | null): Promise<ResultadoDaLogo> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: AVISO_LOGO_DA_NEXT_HOME };
  if (!arquivo || typeof arquivo.arrayBuffer !== "function") return { ok: false, erro: "Escolha o arquivo da logo." };

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const problema = problemaDaLogo(bytes);
  if (problema) return { ok: false, erro: problema };
  const formato = formatoDaLogo(bytes)!;

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const caminho = caminhoDaLogo(grupoId, hash, formato.extensao);
  const servico = createServiceClient();

  const { error: erroDoEnvio } = await servico.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: formato.mime, upsert: true });
  if (erroDoEnvio) {
    console.error(`[logo do grupo] ${grupoId}: envio falhou: ${erroDoEnvio.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  const url = servico.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;

  const { data, error } = await servico.from("grupos").update({ logo_url: url }).eq("id", grupoId).select("id");
  if (error || !data || data.length === 0) {
    console.error(`[logo do grupo] ${grupoId}: logo_url não gravada: ${error?.message ?? "grupo não encontrado"}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  await apagarLogosAntigas(servico, grupoId, caminho);
  esquecerMarcasLidas();
  return { ok: true, url };
}

export async function tirarLogoDoGrupo(grupoId: string): Promise<ResultadoDaLogo> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: AVISO_LOGO_DA_NEXT_HOME };
  const servico = createServiceClient();
  const { data, error } = await servico.from("grupos").update({ logo_url: null }).eq("id", grupoId).select("id");
  if (error || !data || data.length === 0) {
    console.error(`[logo do grupo] ${grupoId}: logo não removida: ${error?.message ?? "grupo não encontrado"}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  await apagarLogosAntigas(servico, grupoId, null);
  esquecerMarcasLidas();
  return { ok: true, url: null };
}
