/**
 * Favoritos do visitante do site (26/09/2026): ficam só no aparelho dele
 * (localStorage), sem conta e sem cookie de rastreio. Viajam no formulário
 * quando ele deixa o contato, e aí viram sinal de interesse na ficha.
 *
 * Todo acesso ao storage é protegido: ele pode lançar (modo privado, dados
 * bloqueados) e o site tem de funcionar igual sem ele.
 */
const CHAVE = "nh-favoritos";
export const TETO_FAVORITOS = 12;
/** Para comparar lado a lado, mais que isso não cabe na tela. */
export const TETO_COMPARAR = 3;
const EVENTO = "nh-favoritos";

export function lerFavoritos(): string[] {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return Array.isArray(lista) ? lista.filter((s): s is string => typeof s === "string").slice(0, TETO_FAVORITOS) : [];
  } catch {
    return [];
  }
}

function gravar(lista: string[]) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, TETO_FAVORITOS)));
  } catch {
    /* sem storage: o favorito vale só nesta tela */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Liga ou desliga. O mais recente fica na frente; o mais antigo sai no teto. */
export function alternarFavorito(slug: string): boolean {
  const atual = lerFavoritos();
  const tem = atual.includes(slug);
  gravar(tem ? atual.filter((s) => s !== slug) : [slug, ...atual]);
  return !tem;
}

export function ouvirFavoritos(aoMudar: () => void): () => void {
  const f = () => aoMudar();
  window.addEventListener(EVENTO, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(EVENTO, f);
    window.removeEventListener("storage", f);
  };
}

/** Lê `?imoveis=a,b,c` com o mesmo formato de slug e o teto da comparação. */
export function slugsParaComparar(valor: string | string[] | undefined): string[] {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto) return [];
  return [...new Set(texto.split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]{2,120}$/.test(s)))].slice(0, TETO_COMPARAR);
}
