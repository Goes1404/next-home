import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeituraDoGrupo } from "@/lib/admin/numerosDaEquipe";

/**
 * Conta oculta (0189, 19/10/2026): a conta existe e trabalha, mas NÃO aparece
 * para ninguém — nem no site, nem na roleta e no sorteio do anúncio, nem nas
 * telas da equipe. Só o gestor a vê, na seção "Contas ocultas" da tela de
 * Contas, para conseguir desativar ou reativar.
 *
 * Este é o PONTO ÚNICO do recorte no código. Ele existe porque a RLS da 0189
 * (que esconde a linha de `anon` e do corretor comum) NÃO alcança dois
 * leitores: o gestor, a quem a policy mostra tudo — e as telas da equipe são
 * justamente dele —, e a chave de serviço, que ignora RLS. Toda leitura de
 * corretores que alimenta tela de equipe, lista pública ou distribuição de
 * lead passa por aqui (guarda: `contaOculta.test.ts`).
 *
 * Consulta à parte e tolerante a erro, como `ehContaSoWhatsapp`: sem a 0189
 * aplicada a coluna não existe, e embutida na leitura da equipe ela derrubaria
 * a tela inteira. Na dúvida, ninguém é oculto — o comportamento de antes.
 */
type Cliente = SupabaseClient;

/**
 * De onde a marca é lida (plataforma multi-grupo, 0190–0194):
 *   - a sessão: a RLS já recorta o grupo de quem está logado;
 *   - a chave de serviço, com `grupoId`: ela ignora a RLS, e quem a usa passa
 *     o grupo que já validou (o do gestor, o do site, o da caixa de e-mail);
 *   - a leitura da equipe recortada pelo grupo (`LeituraDoGrupo`), que não
 *     expõe o cliente cru e aplica o grupo por construção.
 */
type Fonte = Cliente | LeituraDoGrupo;

export async function idsDeContasOcultas(fonte: Fonte, grupoId?: string): Promise<Set<string>> {
  try {
    const { data, error } = await ("ler" in fonte
      ? fonte.ler((c) => c.from("corretores").select("id").eq("oculta", true))
      : grupoId
        ? fonte.from("corretores").select("id").eq("oculta", true).eq("grupo_id", grupoId)
        : fonte.from("corretores").select("id").eq("oculta", true));
    if (error) return new Set();
    return new Set(((data ?? []) as { id: string }[]).map((c) => c.id));
  } catch {
    return new Set();
  }
}

/**
 * Tira da lista o que pertence a uma conta oculta. `chave` diz de onde sai o
 * corretor de cada item (o `id` da linha de corretor, por padrão; o
 * `corretor_id` de uma instância, de um evento, de uma lista...). Item sem
 * corretor fica: não há conta a esconder.
 */
export function semContasOcultas<T>(
  lista: readonly T[],
  ocultas: ReadonlySet<string>,
  chave: (item: T) => string | null | undefined = (item) => (item as { id?: string }).id,
): T[] {
  if (ocultas.size === 0) return [...lista];
  return lista.filter((item) => {
    const id = chave(item);
    return !id || !ocultas.has(id);
  });
}

/**
 * O mesmo recorte para uma consulta de LEADS da equipe, como filtro `.or()`
 * do PostgREST. Lead SEM dono continua: `corretor_id not in (...)` sozinho
 * daria nulo para ele e o tiraria da lista calado — e "sem dono" é justamente
 * o que o gestor vai resolver. `null` quando não há conta oculta.
 */
export function filtroForaDasContasOcultas(ocultas: ReadonlySet<string>): string | null {
  if (ocultas.size === 0) return null;
  return `corretor_id.is.null,corretor_id.not.in.(${[...ocultas].join(",")})`;
}

/**
 * Atalho: busca as ocultas e filtra uma lista de linhas de corretor. Com a
 * chave de serviço, passe o grupo (`grupoId`): a leitura da marca fica nele.
 */
export async function filtrarContasOcultas<T extends { id: string }>(
  supabase: Cliente,
  lista: readonly T[],
  grupoId?: string,
): Promise<T[]> {
  return semContasOcultas(lista, await idsDeContasOcultas(supabase, grupoId));
}
