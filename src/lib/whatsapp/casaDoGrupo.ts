import "server-only";

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerLinksDoImovel } from "@/lib/imovelPublico/ler";
import { createServiceClient } from "@/lib/supabase/service";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { casaDoGrupo, type IdentidadeDaCasa, type LinhaDaCasa } from "./casa";

/**
 * A identidade da casa do grupo do NÚMERO que atende (fase 4, 0199).
 *
 * Pela chave de serviço porque o webhook e os crons não têm sessão. O grupo
 * vem de quem chama, que já o validou (a instância do webhook, a sessão do
 * painel); a leitura é de UMA linha de `grupos`, pelo id.
 *
 * Nunca lança. Leitura que falha cai no padrão do grupo (`casaDoGrupo(null)`):
 * no grupo 1, o texto de antes; nos outros, sem nome — nunca o da Next Home.
 * Calar a IA por uma piscada do banco seria pior que uma apresentação sem o
 * nome da casa.
 *
 * Antes da 0199 ser aplicada as colunas `ia_*` não existem e o select dá
 * 42703: aí lê só o nome, e a IA fala como antes.
 */
export async function lerCasaDoGrupo(grupoId: string): Promise<IdentidadeDaCasa> {
  const casa = await lerCasaSemLinks(grupoId);
  if (grupoId === GRUPO_NEXT_HOME_ID) return casa;
  // Os links de imóvel que a IA manda: do site do grupo, ou da ficha do painel.
  const links = await lerLinksDoImovel(grupoId);
  return links ? { ...casa, links } : casa;
}

async function lerCasaSemLinks(grupoId: string): Promise<IdentidadeDaCasa> {
  try {
    const servico = createServiceClient();
    const completa = await comRetentativa("casa do grupo", () =>
      servico
        .from("grupos")
        .select("nome, ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom")
        .eq("id", grupoId)
        .maybeSingle(),
    );
    if (!completa.error) return casaDoGrupo((completa.data as LinhaDaCasa | null) ?? null, grupoId);

    if (completa.error.code === "42703") {
      const soNome = await servico.from("grupos").select("nome").eq("id", grupoId).maybeSingle();
      if (!soNome.error) {
        return casaDoGrupo(
          soNome.data
            ? { nome: soNome.data.nome, ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: null, ia_tom: null }
            : null,
          grupoId,
        );
      }
    }
    console.error(`[casa do grupo] grupo ${grupoId}: leitura falhou, usando o padrão: ${completa.error.message}`);
  } catch (erro) {
    console.error(`[casa do grupo] grupo ${grupoId}: leitura falhou, usando o padrão:`, erro);
  }
  return casaDoGrupo(null, grupoId);
}
