import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { vencimentoDaSenha, senhaTrocadaEm } from "@/lib/auth/politicaDeSenha";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { inicioDoDiaEmSP } from "@/lib/notificacoes/relogio";
import { decidirAvisoDeSenha, horaDoAvisoDeSenha, notificacaoDaSenha } from "@/lib/notificacoes/regrasDaSenha";

type Supa = ReturnType<typeof createServiceClient>;

/** Página da lista de usuários do Auth. */
const POR_PAGINA = 1000;
/** Teto de páginas por tique: 10 mil contas é muito acima do que existe. */
const MAX_PAGINAS = 10;

/**
 * "Sua senha vai vencer" no celular de cada corretor (29/10/2026).
 *
 * A data da última troca está no `app_metadata` do usuário do Auth (só a
 * chave de serviço escreve, `politicaDeSenha.ts`), por isso a varredura lê
 * a lista do Auth — e só na hora do aviso (9h de São Paulo).
 *
 * O claim é `corretores.aviso_senha_em`, gravado ANTES do envio e só se o
 * último aviso não é de hoje (faltando até 7 dias) ou é de antes do
 * vencimento (vencida: aviso único). Um usuário com duas fichas (dois
 * grupos) recebe em cada uma: a inscrição do aparelho é por ficha. Sem a
 * coluna (0236 não aplicada) a leitura falha e nada sai. Nunca lança.
 */
export async function avisarSenhasVencendo(supabase: Supa, agora = new Date()): Promise<number> {
  if (!horaDoAvisoDeSenha(agora)) return 0;
  try {
    const metadados = new Map<string, Record<string, unknown>>();
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
      if (error) {
        console.warn("[senha vencendo] lista do Auth falhou:", error.message);
        return 0;
      }
      for (const u of data.users) {
        // Sem a data, a conta não é avisada: nem entra na consulta de fichas.
        if (senhaTrocadaEm(u.app_metadata)) metadados.set(u.id, u.app_metadata);
      }
      if (data.users.length < POR_PAGINA) break;
    }
    if (metadados.size === 0) return 0;

    // Em lotes de 100: a lista de ids vai na URL do PostgREST.
    const ids = [...metadados.keys()];
    const fichas: { id: string; user_id: string | null; aviso_senha_em: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .from("corretores")
        .select("id, user_id, aviso_senha_em")
        .eq("ativo", true)
        .in("user_id", ids.slice(i, i + 100));
      if (error) {
        console.warn("[senha vencendo] fichas não lidas (0236 aplicada?):", error.message);
        return 0;
      }
      fichas.push(...(data ?? []));
    }

    const diaInicio = inicioDoDiaEmSP(agora).toISOString();
    let avisados = 0;
    for (const ficha of fichas) {
      const appMetadata = ficha.user_id ? metadados.get(ficha.user_id) : undefined;
      const aviso = decidirAvisoDeSenha({ appMetadata, ultimoAviso: ficha.aviso_senha_em, agora });
      if (!aviso) continue;

      // Vencida: vale o aviso de antes do vencimento; vencendo: o de antes de hoje.
      const corte =
        aviso.tipo === "vencida" ? vencimentoDaSenha(senhaTrocadaEm(appMetadata)!).toISOString() : diaInicio;
      const { data: claim } = await supabase
        .from("corretores")
        .update({ aviso_senha_em: agora.toISOString() })
        .eq("id", ficha.id)
        .or(`aviso_senha_em.is.null,aviso_senha_em.lt.${corte}`)
        .select("id");
      if (!claim?.length) continue;

      const n = await notificarCorretor(supabase, ficha.id, {
        ...notificacaoDaSenha(aviso),
        url: "/corretor/senha",
        tag: "senha",
      });
      if (n > 0) avisados++;
    }
    return avisados;
  } catch (err) {
    console.warn("[senha vencendo] falhou:", err);
    return 0;
  }
}
