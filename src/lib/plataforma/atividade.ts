import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { contaSemUso, DIAS_SEM_USO, maisRecente } from "./painelDeNumeros";

/**
 * Quais contas estão sem uso há 7 dias, para o painel de números da
 * plataforma (29/10/2026). Pela chave de serviço, depois da guarda (a função
 * pede a PROVA de `exigirAdminDaPlataforma*`, como `grupos.ts`).
 *
 * "Sem uso" = nenhum lead criado E nenhum login da equipe nos últimos 7 dias
 * (`contaSemUso`, módulo puro). As fontes, escolhidas pelo custo:
 *
 * - leads: UMA contagem por conta (`head: true`, nenhuma linha volta — o
 *   administrador da plataforma só conta leads), todas em paralelo. Uma
 *   leitura só para todos os grupos traria as linhas, o que a regra proíbe;
 * - login: o `last_sign_in_at` do Auth, que é a verdade (o mesmo da
 *   prontidão da equipe e dos administradores). `listUsers` em páginas de
 *   1.000 traz todos os logins em uma ou duas chamadas, em vez de um
 *   `getUserById` por corretor; o casamento login → conta é pela ficha
 *   (`corretores.user_id`). Não há outra fonte de atividade do corretor no
 *   banco que valha o mesmo (o painel não grava "visto em").
 *
 * Falha em qualquer fonte devolve `null` e a tela diz "não medido": aqui o
 * erro não derruba a lista (é um indicador, não o cadastro), mas também não
 * vira zero calado.
 */

const POR_PAGINA = 1000;
/** Teto de páginas do Auth: 20 mil logins. Passou disso, o indicador some em vez de mentir. */
const PAGINAS_DO_AUTH = 20;

export async function lerContasSemUso(
  _prova: { userId: string },
  grupos: readonly { id: string; situacao: string }[],
  agora: Date = new Date(),
): Promise<Set<string> | null> {
  const vivos = grupos.filter((g) => g.situacao !== "encerrado").map((g) => g.id);
  if (vivos.length === 0) return new Set();
  const servico = createServiceClient();
  const desde = new Date(agora.getTime() - DIAS_SEM_USO * 86_400_000).toISOString();

  try {
    const [logins, fichas, leads] = await Promise.all([
      (async () => {
        const porUsuario = new Map<string, string | null>();
        for (let pagina = 1; pagina <= PAGINAS_DO_AUTH; pagina++) {
          const { data, error } = await servico.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
          if (error) throw new Error(`logins não listados: ${error.message}`);
          const usuarios = data?.users ?? [];
          for (const u of usuarios) porUsuario.set(u.id, u.last_sign_in_at ?? null);
          if (usuarios.length < POR_PAGINA) return porUsuario;
        }
        throw new Error("logins passaram do teto de páginas");
      })(),
      (async () => {
        const todas: { user_id: string | null; grupo_id: string }[] = [];
        for (let de = 0; ; de += POR_PAGINA) {
          const { data, error } = await servico
            .from("corretores")
            .select("user_id, grupo_id")
            .in("grupo_id", vivos)
            .eq("ativo", true)
            .not("user_id", "is", null)
            .order("id")
            .range(de, de + POR_PAGINA - 1);
          if (error) throw new Error(`fichas não lidas: ${error.message}`);
          todas.push(...(data ?? []));
          if ((data?.length ?? 0) < POR_PAGINA) return todas;
        }
      })(),
      Promise.all(
        vivos.map(async (grupoId) => {
          const { count, error } = await servico
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("grupo_id", grupoId)
            .gte("created_at", desde);
          if (error) throw new Error(`leads não contados: ${error.message}`);
          return [grupoId, count ?? 0] as const;
        }),
      ),
    ]);

    const loginsDoGrupo = new Map<string, (string | null)[]>();
    for (const f of fichas) {
      if (!f.user_id) continue;
      loginsDoGrupo.set(f.grupo_id, [...(loginsDoGrupo.get(f.grupo_id) ?? []), logins.get(f.user_id) ?? null]);
    }
    const semUso = new Set<string>();
    for (const [grupoId, leadsNosUltimosDias] of leads) {
      const ultimoLoginDaEquipe = maisRecente(loginsDoGrupo.get(grupoId) ?? []);
      if (contaSemUso({ leadsNosUltimosDias, ultimoLoginDaEquipe, agora })) semUso.add(grupoId);
    }
    return semUso;
  } catch (erro) {
    console.error(`[plataforma] contas sem uso não medidas: ${erro instanceof Error ? erro.message : String(erro)}`);
    return null;
  }
}
