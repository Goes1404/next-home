/**
 * Etiquetas do cache de dados do site público (F2 do roadmap de performance,
 * 13/09/2026). Módulo PURO — sem `next/cache`, sem Supabase — para que a
 * action que revalida e a consulta que cacheia importem a mesma string sem
 * arrastar o resto uma da outra (a lição do `limitesPdf.ts`).
 *
 * Uma etiqueta por ENTIDADE, não por rota: a mesma linha de `empreendimentos`
 * alimenta home, listagem, regiões, mapa, similares e sitemap. Antes, mudar
 * um imóvel disparava 28 `revalidatePath` espalhados por quatro arquivos e
 * ainda assim o catálogo era baixado do banco duas vezes por requisição —
 * porque não havia cache nenhum para revalidar.
 */
export const TAG_CATALOGO = "catalogo";
export const TAG_CORRETORES = "corretores";
export const TAG_CREDITO = "credito";

/**
 * Validade de fundo, em segundos. É rede de segurança, não o mecanismo: a
 * revalidação de verdade é por etiqueta, no instante em que o painel grava.
 * Uma hora cobre o caso de alguém editar direto no banco.
 */
export const REVALIDA_EM_SEGUNDOS = 3600;
