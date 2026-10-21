import "server-only";

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { createServiceClient } from "@/lib/supabase/service";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { enderecoDoCliente, marcaDoCrm, MARCA_NEXT_HOME, type LinhaDaMarca, type MarcaDoCrm } from "./marca";

/**
 * Leitura da marca do grupo e do endereço dos links do cliente (21/10/2026).
 *
 * Pela chave de serviço porque os crons e o webhook não têm sessão; o grupo
 * vem de quem chama, que já o conferiu (a sessão do painel, a ficha do
 * corretor, a instância do webhook). A leitura é de UMA linha pelo id.
 *
 * Cache simples de 60 s por processo: um cron que avisa 40 corretores do
 * mesmo grupo lê o grupo uma vez, e a tela do painel não paga uma consulta a
 * cada navegação. Falha NÃO entra no cache. O grupo 1 nunca consulta nada:
 * é a marca de `site.ts`.
 *
 * Nunca lança. Leitura que falha devolve a marca genérica do grupo (nunca a
 * da Next Home); calar um aviso ao corretor por uma piscada do banco seria
 * pior que um aviso com "Imobiliária" no título.
 *
 * Antes da 0208 ser aplicada `logo_url` não existe e o select dá 42703: aí
 * lê só os nomes, e o painel mostra o nome escrito.
 */

const VALIDADE_MS = 60_000;

type Entrada<T> = { ate: number; valor: Promise<T | null> };

function memoria<T>() {
  const mapa = new Map<string, Entrada<T>>();
  return {
    obter(chave: string, agora: number): Promise<T | null> | null {
      const e = mapa.get(chave);
      return e && e.ate > agora ? e.valor : null;
    },
    guardar(chave: string, agora: number, valor: Promise<T | null>): Promise<T | null> {
      mapa.set(chave, { ate: agora + VALIDADE_MS, valor });
      // Resultado nulo (falha) sai do cache na hora: tenta de novo na próxima.
      void valor.then((v) => {
        if (v === null && mapa.get(chave)?.valor === valor) mapa.delete(chave);
      });
      return valor;
    },
    limpar() {
      mapa.clear();
    },
  };
}

const marcas = memoria<LinhaDaMarca | "inexistente">();
const enderecos = memoria<{ host: string | null }>();

/** Para os testes e para quem acabou de gravar a logo. */
export function esquecerMarcasLidas(): void {
  marcas.limpar();
  enderecos.limpar();
}

async function lerLinha(grupoId: string): Promise<LinhaDaMarca | "inexistente" | null> {
  try {
    const servico = createServiceClient();
    const completa = await comRetentativa("marca do grupo", () =>
      servico.from("grupos").select("nome, ia_nome_da_casa, logo_url").eq("id", grupoId).maybeSingle(),
    );
    if (!completa.error) return completa.data ? (completa.data as LinhaDaMarca) : "inexistente";
    if (completa.error.code === "42703") {
      const soNomes = await servico.from("grupos").select("nome, ia_nome_da_casa").eq("id", grupoId).maybeSingle();
      if (!soNomes.error) {
        return soNomes.data ? { ...(soNomes.data as Omit<LinhaDaMarca, "logo_url">), logo_url: null } : "inexistente";
      }
    }
    console.error(`[marca do grupo] grupo ${grupoId}: leitura falhou, usando o nome genérico: ${completa.error.message}`);
  } catch (erro) {
    console.error(`[marca do grupo] grupo ${grupoId}: leitura falhou, usando o nome genérico:`, erro);
  }
  return null;
}

export async function lerMarcaDoCrm(grupoId: string, agora = Date.now()): Promise<MarcaDoCrm> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return MARCA_NEXT_HOME;
  const emCache = marcas.obter(grupoId, agora);
  const linha = await (emCache ?? marcas.guardar(grupoId, agora, lerLinha(grupoId)));
  return marcaDoCrm(grupoId, linha === "inexistente" ? null : linha);
}

async function lerHostPrincipal(grupoId: string): Promise<{ host: string | null } | null> {
  try {
    const { data, error } = await comRetentativa("endereço principal do grupo", () =>
      createServiceClient()
        .from("enderecos_do_site")
        .select("host")
        .eq("grupo_id", grupoId)
        .eq("principal", true)
        .maybeSingle(),
    );
    if (error) {
      console.error(`[marca do grupo] endereço do grupo ${grupoId} não lido: ${error.message}`);
      return null;
    }
    return { host: data?.host ?? null };
  } catch (erro) {
    console.error(`[marca do grupo] endereço do grupo ${grupoId} não lido:`, erro);
    return null;
  }
}

/**
 * Onde abre o link que o CLIENTE do grupo recebe (seleção, documentos,
 * agenda): grupo 1 `site.url`; outro grupo, o site principal dele se existir,
 * senão o painel. Erro de leitura cai no painel (o link continua abrindo).
 */
export async function lerEnderecoDoCliente(grupoId: string, agora = Date.now()): Promise<string> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return enderecoDoCliente(grupoId, null);
  const emCache = enderecos.obter(grupoId, agora);
  const lido = await (emCache ?? enderecos.guardar(grupoId, agora, lerHostPrincipal(grupoId)));
  return enderecoDoCliente(grupoId, lido?.host ?? null);
}
