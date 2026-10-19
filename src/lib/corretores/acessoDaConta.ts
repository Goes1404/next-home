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

export type AcaoDeAcesso = "convidar" | "reenviar_convite" | "link_de_senha" | "trocar_email";

export type ContaParaAcesso = {
  temLogin: boolean;
  email: string | null;
  /** Tem login, mas ainda não criou a própria senha (convite não aceito). */
  convitePendente: boolean;
};

/** A conta usa o endereço provisório antigo (`@nexthome.com`)? */
export function usaEnderecoProvisorio(conta: ContaParaAcesso): boolean {
  return conta.temLogin && conta.email !== null && ehEmailDeAcesso(conta.email);
}

/** As ações de acesso que a linha do corretor oferece, na ordem da tela. */
export function acoesDeAcesso(conta: ContaParaAcesso): AcaoDeAcesso[] {
  if (!conta.temLogin) return ["convidar"];
  if (usaEnderecoProvisorio(conta)) return ["trocar_email"];
  return [conta.convitePendente ? "reenviar_convite" : "link_de_senha", "trocar_email"];
}
