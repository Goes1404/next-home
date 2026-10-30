// A busca da central de ajuda (29/10/2026). Módulo PURO, roda no navegador.
//
// Sem índice nem dependência: são uma dúzia de artigos. A busca ignora
// acento e maiúscula ("notificacao" acha "Notificação"), quebra a frase em
// palavras e exige que TODAS apareçam em algum lugar do artigo (título,
// resumo, palavras-chave ou texto). A ordem vem do peso de onde cada palavra
// apareceu: título vale mais que palavra-chave, que vale mais que o texto.

import type { Artigo } from "./artigos";

/** Sem acento, minúsculas, só letras e dígitos separados por espaço. */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palavras que não ajudam a achar nada ("como", "o", "de"). */
const VAZIAS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "um", "uma", "como", "para", "pra", "meu", "minha", "que", "eu", "se", "por"]);

function termosDa(consulta: string): string[] {
  return normalizarParaBusca(consulta)
    .split(" ")
    .filter((t) => t.length > 0 && !VAZIAS.has(t));
}

function textoDoArtigo(a: Artigo): string {
  return a.secoes.flatMap((s) => [s.titulo ?? "", ...(s.paragrafos ?? []), ...(s.passos ?? [])]).join(" ");
}

/**
 * Os artigos que casam com a consulta, do mais ao menos relevante. Consulta
 * vazia (ou só de palavras vazias) devolve todos, na ordem original.
 */
export function buscarArtigos(artigos: readonly Artigo[], consulta: string): Artigo[] {
  const termos = termosDa(consulta);
  if (termos.length === 0) return [...artigos];

  const pontuados: { artigo: Artigo; pontos: number; ordem: number }[] = [];
  artigos.forEach((artigo, ordem) => {
    const titulo = normalizarParaBusca(artigo.titulo);
    const resumo = normalizarParaBusca(artigo.resumo);
    const palavras = normalizarParaBusca(artigo.palavras.join(" "));
    const texto = normalizarParaBusca(textoDoArtigo(artigo));
    let pontos = 0;
    for (const termo of termos) {
      const noTitulo = titulo.includes(termo) ? 5 : 0;
      const nasPalavras = palavras.includes(termo) ? 3 : 0;
      const noResumo = resumo.includes(termo) ? 2 : 0;
      const noTexto = texto.includes(termo) ? 1 : 0;
      const doTermo = noTitulo + nasPalavras + noResumo + noTexto;
      // Todas as palavras precisam aparecer: uma que falta tira o artigo.
      if (doTermo === 0) return;
      pontos += doTermo;
    }
    pontuados.push({ artigo, pontos, ordem });
  });
  return pontuados.sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem).map((p) => p.artigo);
}
