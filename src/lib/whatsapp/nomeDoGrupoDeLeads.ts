// Como se chama o grupo de WhatsApp de cada corretor (27/10/2026). Cada
// imobiliária escolhe o padrão; sem escolha vale o de fábrica. Puro: a tela
// usa para a prévia e a sincronização para achar o grupo — uma conta só.

/** `{corretor}` vira o nome do corretor; `{imobiliaria}`, o nome da casa. */
export const PADRAO_DE_FABRICA = "{corretor} & {imobiliaria}";

const MAX_CARACTERES = 60;
const MARCADORES = ["corretor", "imobiliaria"];

/** Maiúsculas, sem acento nem emoji; símbolos viram um espaço só. */
export function chaveDoNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** O nome que o grupo do corretor deve ter, como o gestor o veria. */
export function nomeEsperadoDoGrupo(padrao: string | null, corretor: string, imobiliaria: string): string {
  return (padrao || PADRAO_DE_FABRICA).split("{corretor}").join(corretor.trim()).split("{imobiliaria}").join(imobiliaria.trim());
}

/**
 * O padrão que o gestor digitou. Vazio volta ao de fábrica (`null`). Sem
 * `{corretor}` (ou com ele repetido) todos os grupos teriam o mesmo nome, e
 * nenhum seria vinculado.
 */
export function validarPadraoDoNome(entrada: string): { ok: true; padrao: string | null } | { ok: false; erro: string } {
  const padrao = entrada.trim();
  if (!padrao) return { ok: true, padrao: null };
  if (padrao.length > MAX_CARACTERES) return { ok: false, erro: `Use no máximo ${MAX_CARACTERES} caracteres.` };
  if (padrao.split("{corretor}").length !== 2) return { ok: false, erro: "Coloque {corretor} uma vez, no lugar do nome do corretor." };
  const desconhecido = [...padrao.matchAll(/\{([^}]*)\}/g)].find((m) => !MARCADORES.includes(m[1]));
  if (desconhecido) return { ok: false, erro: `"{${desconhecido[1]}}" não é usado. Use só {corretor} e {imobiliaria}.` };
  return { ok: true, padrao };
}
