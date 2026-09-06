import type Lenis from "lenis";

/**
 * Instância ativa do Lenis.
 *
 * O Lenis assume o scroll da página e desliga o `scroll-behavior: smooth`
 * nativo (ver `.lenis.lenis-smooth` em globals.css). Sem uma referência a
 * ele, links de âncora saltam secamente. Guardar a instância aqui deixa
 * qualquer componente pedir uma rolagem suave de verdade.
 */
let instancia: Lenis | null = null;

export function registrarLenis(l: Lenis | null): void {
  instancia = l;
}

/** Deslocamento para o topo não ficar embaixo do header fixo. */
const OFFSET_HEADER = -88;

export function rolarPara(id: string): void {
  const alvo = document.getElementById(id);
  if (!alvo) return;

  if (instancia) {
    instancia.scrollTo(alvo, { offset: OFFSET_HEADER, duration: 1 });
    return;
  }
  // Sem Lenis (movimento reduzido, ou antes da hidratação) o `scroll-mt`
  // das seções já cuida do offset.
  alvo.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Recalcula o limite de rolagem depois que a página CRESCEU sem recarregar.
 *
 * O Lenis assume o scroll do documento e guarda o limite (altura do conteúdo
 * menos a da janela) para clampar cada quadro. Quando uma lista carrega mais
 * uma página no cliente — "Ver mais 40" em Pessoas —, o documento fica mais
 * alto num único frame e o limite antigo continua valendo: a roda anda até o
 * fim de ANTES e trava, com quarenta linhas visíveis abaixo e inalcançáveis.
 * Foi exatamente o defeito relatado em 06/09/2026.
 *
 * `resize()` relê as medidas; o `requestAnimationFrame` existe porque o React
 * ainda não pintou as linhas novas no instante em que o estado muda — medir
 * antes da pintura devolveria a mesma altura de antes.
 *
 * Sem Lenis (movimento reduzido, ou antes da hidratação) não há nada a fazer:
 * o scroll nativo já acompanha o documento sozinho.
 */
export function recalcularRolagem(): void {
  if (!instancia) return;
  requestAnimationFrame(() => instancia?.resize());
}
