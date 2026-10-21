// Etiquetas de cache do site público. Num módulo à parte para quem só
// invalida (Server Actions do painel e da plataforma) não importar o
// resolvedor inteiro.

/** Etiqueta do cache de endereços: limpa ao ligar ou trocar um domínio. */
export const TAG_ENDERECOS = "enderecos-do-site";

/** Etiqueta do que o gestor edita em "Meu site" (0209): limpa ao salvar. */
export const TAG_SITE_DO_GRUPO = "site-do-grupo";
