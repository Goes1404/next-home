import { ehEmailDeAcesso } from "./credenciaisIniciais";

/**
 * O que a tela de Contas oferece para o acesso de cada corretor, e as frases
 * que a tela e as actions dividem.
 *
 * Módulo PURO: a tela (client) e as actions do gestor e da plataforma
 * (servidor) usam a mesma regra. Duas cópias da regra divergiriam no dia em
 * que uma tela oferecesse um botão que a action recusa.
 */

/**
 * E-mail ocupado, em qualquer grupo. A frase não diz ONDE: o login é global
 * (um e-mail, uma conta na plataforma), e dizer "já é da Imobiliária X"
 * contaria ao gestor quem trabalha na concorrência.
 */
export const MENSAGEM_EMAIL_EM_USO = "Esse e-mail já tem acesso à plataforma. Use outro.";

/**
 * Conta antiga com `nome@nexthome.com`: o domínio é de TERCEIRO, então
 * convite e recuperação iriam para a caixa de um estranho. O único caminho é
 * trocar o e-mail primeiro.
 */
export const MENSAGEM_ENDERECO_PROVISORIO =
  "Este acesso usa um endereço provisório. Troque o e-mail para mandar o link.";

/** Quem digitou um endereço do domínio antigo para convidar ou trocar. */
export const MENSAGEM_ENDERECO_DE_ACESSO =
  "Esse é um endereço provisório e não recebe e-mail. Use o e-mail real do corretor.";

/**
 * O alvo também administra a imobiliária (e não é quem está agindo). O
 * gestor não manda link, não reenvia convite nem troca o e-mail de outro
 * gestor: tomar o login de alguém é o jeito de ler as conversas dele, e a
 * regra da plataforma é que nenhum gestor lê conversa de outro.
 */
export const MENSAGEM_OUTRO_GESTOR =
  "Esta pessoa também administra a imobiliária. Para entrar de novo, ela mesma pede um link em \"Esqueci a senha\", na tela de entrar.";

/** O alvo administra a plataforma: mesma regra, por mais forte razão. */
export const MENSAGEM_ADMIN_DA_PLATAFORMA =
  "Esta conta administra a plataforma. Para entrar de novo, a própria pessoa pede um link em \"Esqueci a senha\", na tela de entrar.";

/**
 * A conta já foi usada: trocar o e-mail mandaria o link de senha para um
 * endereço que o gestor escolheu, e ele entraria na conta de outra pessoa.
 */
export const MENSAGEM_EMAIL_DE_CONTA_USADA =
  "Esta pessoa já entrou no painel. Por segurança, a administração não troca o e-mail de uma conta que já foi usada.";

/** Conta antiga `@nexthome.com` que já foi usada: nada a oferecer. */
export const MENSAGEM_PROVISORIO_JA_USADO =
  "Este acesso usa um endereço provisório e já foi usado. A pessoa continua entrando com a senha que tem; o e-mail dele não é trocado pela administração.";

export type AcaoDeAcesso = "convidar" | "reenviar_convite" | "link_de_senha" | "trocar_email";

export type ContaParaAcesso = {
  temLogin: boolean;
  email: string | null;
  /** Tem login, mas ainda não criou a própria senha (convite não aceito). */
  convitePendente: boolean;
  /** Administra a imobiliária e não é quem está olhando a tela. */
  outroGestor?: boolean;
};

/** A conta usa o endereço provisório antigo (`@nexthome.com`)? */
export function usaEnderecoProvisorio(conta: ContaParaAcesso): boolean {
  return conta.temLogin && conta.email !== null && ehEmailDeAcesso(conta.email);
}

/**
 * As ações de acesso que a linha do corretor oferece, na ordem da tela.
 *
 * Link para copiar e troca de e-mail só para conta que nunca entrou (convite
 * pendente). Conta já usada recebe o link de senha só no e-mail dela; outro
 * gestor não recebe nada pela mão do gestor. As actions conferem tudo de novo
 * pelo Auth (`last_sign_in_at`), que é a verdade; esta lista só evita
 * oferecer um botão que a action recusaria.
 */
export function acoesDeAcesso(conta: ContaParaAcesso): AcaoDeAcesso[] {
  if (!conta.temLogin) return ["convidar"];
  if (conta.outroGestor) return [];
  if (usaEnderecoProvisorio(conta)) return conta.convitePendente ? ["trocar_email"] : [];
  return conta.convitePendente ? ["reenviar_convite", "trocar_email"] : ["link_de_senha"];
}

/** Por que a linha não oferece nenhuma ação de acesso (ou `null` se oferece). */
export function motivoSemAcaoDeAcesso(conta: ContaParaAcesso): string | null {
  if (acoesDeAcesso(conta).length > 0) return null;
  if (conta.outroGestor) return MENSAGEM_OUTRO_GESTOR;
  if (usaEnderecoProvisorio(conta)) return MENSAGEM_PROVISORIO_JA_USADO;
  return null;
}
