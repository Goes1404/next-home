/**
 * A credencial que o gestor entrega ao corretor no primeiro acesso.
 *
 * Módulo PURO de propósito: a action de administração e a guarda de
 * `email.ts` precisam da mesma regra, e módulo com dependência de servidor
 * arrastado para o grafo errado já quebrou o build desta base duas vezes
 * (`limitesPdf.ts`, `pessoasTipos.ts`). Puro também é o que torna a regra
 * testável sem banco.
 *
 * As duas metades são previsíveis por decisão do usuário — nome e telefone
 * são conhecidos de quem convive com a equipe. O que fecha essa janela não é
 * a senha, é `deve_trocar_senha: true`: o login seguinte cai em
 * `/corretor/senha` antes de qualquer tela (ver `src/app/corretor/actions.ts`).
 */

/**
 * Domínio dos e-mails de acesso.
 *
 * ATENÇÃO: `nexthome.com` NÃO é da Next Home — resolve para 72.20.123.54,
 * de terceiro. Nenhum e-mail pode sair para cá, e é por isso que
 * `enviarEmail` recusa este domínio. Se um dia a empresa passar a controlar
 * um domínio de verdade, trocar aqui e a guarda continua valendo.
 */
export const DOMINIO_ACESSO = "nexthome.com";

/** Prefixo fixo da senha inicial. Público por construção: a força está nos dígitos. */
const PREFIXO_SENHA = "nexthome";

/** Quantos dígitos finais do WhatsApp entram na senha. */
const DIGITOS_DA_SENHA = 4;

/**
 * Normalização de nome para endereço: sem acento, minúsculo, só `a-z0-9-`.
 *
 * Mora aqui, e não em `admin/acoes.ts`, porque é a MESMA regra que gera o
 * `slug` — e duas normalizações do mesmo nome divergem no primeiro "Antônio"
 * que aparecer. Esta base já pagou por conta duplicada em `montarResumo` e no
 * porteiro do anúncio (0094).
 */
export function normalizarParaEmail(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * `carolini@nexthome.com`.
 *
 * Recebe a PARTE LOCAL já escolhida (ver `candidatosDeEmail`), não o nome —
 * quem decide entre "carolini" e "carolini-ivina" precisa saber o que já está
 * ocupado, e isso é consulta ao banco, que não cabe num módulo puro.
 */
export function emailInicial(parteLocal: string): string {
  const limpo = parteLocal.trim().toLowerCase();
  if (!limpo) throw new Error("Parte local vazia: não dá para montar o e-mail de acesso.");
  return `${limpo}@${DOMINIO_ACESSO}`;
}

/**
 * As partes locais aceitáveis, da mais curta para a mais específica.
 *
 * O primeiro nome é o que se dita por WhatsApp e se digita no celular, então
 * vem primeiro. Mas ele NÃO é único como o slug era (`corretores_slug_key`):
 * um segundo "Eduardo" faria a criação falhar, porque e-mail no Auth é único.
 * Por isso a lista degrada — primeiro nome, depois com o sobrenome, e por fim
 * o slug inteiro, que volta a ter a garantia do banco.
 *
 * Degradar não é escolher em silêncio: o e-mail de fato criado aparece no
 * cartão de credenciais que o gestor copia.
 */
export function candidatosDeEmail(nome: string, slug: string): string[] {
  const partes = normalizarParaEmail(nome).split("-").filter(Boolean);
  const slugLimpo = normalizarParaEmail(slug);

  const brutos = [
    partes[0] ?? "",
    partes.slice(0, 2).join("-"),
    slugLimpo,
  ];

  // Nome de uma palavra só ("Ramos") gera os três iguais; sem o dedupe, o
  // laço de escolha tentaria o mesmo endereço três vezes.
  return [...new Set(brutos.filter(Boolean))];
}

/**
 * `5511975594931` → `nexthome4931`.
 *
 * LANÇA quando não há dígitos suficientes em vez de devolver algo curto: o
 * Auth recusaria a senha, e a recusa aconteceria no MEIO do lote — parte dos
 * corretores criada, parte não, sem ninguém saber onde parou.
 */
export function senhaInicial(whatsapp: string): string {
  const digitos = (whatsapp ?? "").replace(/\D/g, "");
  if (digitos.length < DIGITOS_DA_SENHA) {
    throw new Error(
      `WhatsApp "${whatsapp}" não tem ${DIGITOS_DA_SENHA} dígitos para montar a senha inicial.`,
    );
  }
  return PREFIXO_SENHA + digitos.slice(-DIGITOS_DA_SENHA);
}

/** O endereço é de acesso ao painel, não uma caixa que recebe mensagem. */
export function ehEmailDeAcesso(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DOMINIO_ACESSO}`);
}
