/**
 * Termos de uso do painel (fase 2D, 20/10/2026).
 *
 * RASCUNHO: texto provisório escrito em português simples para o advogado
 * revisar. Ele descreve o que o produto FAZ hoje, sem prometer o que não faz
 * (nada de "seu número nunca será bloqueado"). Ao trocar o texto depois da
 * revisão, troque também `VERSAO_DOS_TERMOS`: é a versão que decide quem
 * precisa aceitar de novo (o layout do painel redireciona quem não aceitou a
 * vigente). Aceite fica em `aceites_de_termos` (0198) e não se desfaz.
 */

/** A versão vigente. Mudou o texto, mudou a versão: todo mundo aceita de novo. */
export const VERSAO_DOS_TERMOS = "2026-10-20-rascunho";

/** Enquanto for `true`, a página avisa que o texto ainda será revisado. */
export const TERMOS_SAO_RASCUNHO = true;

export type SecaoDosTermos = { titulo: string; paragrafos: string[] };

export const SECOES_DOS_TERMOS: SecaoDosTermos[] = [
  {
    titulo: "O que é este painel",
    paragrafos: [
      "Este painel ajuda você a organizar seus contatos (leads), as conversas de WhatsApp, os imóveis e as vendas da sua imobiliária. Ele é oferecido à sua imobiliária, que convidou você para usá-lo.",
    ],
  },
  {
    titulo: "Sua conta",
    paragrafos: [
      "A conta é pessoal. Não passe sua senha para ninguém. Tudo o que for feito com a sua conta fica registrado como feito por você.",
      "Se a sua imobiliária desativar a sua conta, você deixa de entrar no painel.",
    ],
  },
  {
    titulo: "Seu número de WhatsApp",
    paragrafos: [
      "O número que você conectar é seu. A conexão é feita por um serviço que liga o seu WhatsApp ao painel, do mesmo jeito que o WhatsApp Web. Não é um serviço do WhatsApp nem da Meta.",
      "O WhatsApp pode restringir ou bloquear qualquer número, principalmente quando muitas mensagens são enviadas para quem não conhece você. O painel tem cuidados para diminuir esse risco (limite de mensagens por dia, intervalo entre elas e horário de envio), mas não consegue impedir que isso aconteça. O risco de bloqueio do número é seu.",
      "Um número de WhatsApp só pode estar ligado a uma conta da plataforma por vez. Para usá-lo em outra, é preciso desconectá-lo antes.",
    ],
  },
  {
    titulo: "A assistente de IA",
    paragrafos: [
      "Quando ligada, a assistente responde seus clientes no WhatsApp em seu nome. Ela pode errar: confira o que ela diz e assuma a conversa sempre que precisar. Você pode desligá-la a qualquer momento.",
      "A assistente tem um limite de respostas por mês, definido no plano da sua imobiliária. Quando o limite acaba, ela para de responder e você atende normalmente.",
    ],
  },
  {
    titulo: "Os dados dos seus clientes",
    paragrafos: [
      "Cadastre e procure apenas pessoas que podem ser contatadas por você para tratar de imóveis, e respeite quem pedir para não receber mais mensagens. Use os dados só para o atendimento imobiliário, como pede a Lei Geral de Proteção de Dados (LGPD).",
      "As conversas e as fichas dos clientes ficam guardadas no painel. O gestor da sua imobiliária vê as fichas dos leads da equipe, mas não lê as suas conversas pelo painel.",
    ],
  },
  {
    titulo: "Mudanças nestes termos",
    paragrafos: [
      "Quando estes termos mudarem, o painel vai pedir que você leia e aceite a nova versão antes de continuar.",
    ],
  },
];

/**
 * Depois de aceitar: quem ainda entra com a senha provisória vai direto
 * trocá-la (a tela de senha mora dentro do painel e passaria pelos termos
 * de novo antes, o que daria a ordem termos → senha sem volta).
 */
export function caminhoDepoisDoAceite(deveTrocarSenha: boolean): string {
  return deveTrocarSenha ? "/corretor/senha" : "/corretor";
}
