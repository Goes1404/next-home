/**
 * O endereço de um imóvel no site, feito a partir do nome.
 *
 * O slug é a URL pública (`/empreendimentos/<slug>`), é a chave que o
 * `linkDaPagina` do prompt monta para a assistente mandar ao cliente, e é
 * por ele que `corretor_destaques` referencia o imóvel. Ou seja: nasce uma
 * vez e não deveria mudar — link já enviado vira 404, e 404 com a marca da
 * imobiliária em cima é pior que não mandar link.
 *
 * A forma é a mesma dos slugs que já estão no banco (`terra-alta-barueri`,
 * `vista-alphagran`): sem acento, minúsculo, hífen no lugar do resto.
 *
 * Módulo puro: sem `supabase`, sem `server-only`. A checagem de
 * disponibilidade é I/O e mora na action — aqui só a forma, que é o que se
 * testa.
 */

/** Teto do slug. Nome comprido vira URL comprida, e URL comprida some na SERP. */
const LIMITE = 60;

export function slugificarImovel(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITE)
    .replace(/-+$/g, "");
}

/**
 * O primeiro slug livre a partir da base.
 *
 * `ocupados` é o conjunto que a action leu do banco. O sufixo começa em 2
 * porque "imovel-2" se lê como o segundo imóvel de mesmo nome; "imovel-1"
 * sugeriria que existe um "imovel-0".
 *
 * Nome que vira slug vazio (só emoji, só pontuação) cai em "imovel": slug
 * vazio produziria a URL da LISTAGEM, e o imóvel novo passaria a responder
 * no lugar de `/empreendimentos`.
 */
export function slugLivre(nome: string, ocupados: ReadonlySet<string>): string {
  const base = slugificarImovel(nome) || "imovel";
  if (!ocupados.has(base)) return base;

  for (let n = 2; n <= 50; n++) {
    const candidato = `${base}-${n}`;
    if (!ocupados.has(candidato)) return candidato;
  }

  return `${base}-${Date.now().toString(36)}`;
}
