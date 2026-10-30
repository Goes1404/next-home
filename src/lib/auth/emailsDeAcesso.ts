import "server-only";

import { enviarEmail, type ResultadoEmail } from "@/lib/email";
import type { TipoDeLink } from "./links";

/**
 * O e-mail que leva o link de convite ou de recuperação de senha.
 *
 * Devolve o desfecho de `enviarEmail` sem lançar: sem `RESEND_API_KEY` o
 * envio não acontece (`sem_chave`), e quem chama decide o que fazer — o
 * convite do gestor mostra o link na tela para ele copiar; o "esqueci a
 * senha" não mostra nada a ninguém.
 *
 * O texto não diz quanto tempo o link vale: o prazo é configuração do
 * projeto no Supabase (padrão de 1 hora) e muda sem passar por aqui. Diz o
 * que fazer quando ele vencer, que é o que a pessoa precisa saber.
 */
export async function enviarLinkDeAcesso(
  tipo: TipoDeLink,
  email: string,
  nomeDoGrupo: string,
  url: string,
  /** `grupos.teste_ate` (0241): o convite de conta em teste grátis diz até quando. */
  opcoes: { testeAte?: string | null; agora?: Date } = {},
): Promise<ResultadoEmail> {
  const { assunto, paragrafos, botao } = conteudo(tipo, nomeDoGrupo, frasesDoTeste(tipo, opcoes));
  const fechamento = [
    "Este link só funciona uma vez. Se ele não abrir, peça outro em \"Esqueci a senha\", na tela de entrar.",
    tipo === "invite"
      ? "Se você não esperava este convite, pode ignorar este e-mail."
      : "Se não foi você que pediu, pode ignorar este e-mail: sua senha continua a mesma.",
  ];

  const texto = [...paragrafos, `${botao}: ${url}`, ...fechamento].join("\n\n");
  const html = [
    ...paragrafos.map((p) => `<p>${escaparHtml(p)}</p>`),
    `<p><a href="${escaparHtml(url)}">${escaparHtml(botao)}</a></p>`,
    `<p>Se o botão não abrir, copie este endereço no navegador:<br>${escaparHtml(url)}</p>`,
    ...fechamento.map((p) => `<p>${escaparHtml(p)}</p>`),
  ].join("\n");

  return enviarEmail({ para: email, assunto, html, texto });
}

/**
 * O convite de conta em teste grátis diz até quando ele vai (o teste é de 7
 * dias, `testeGratis.ts`). Fora do teste (ou data inválida/passada), nada.
 */
export function frasesDoTeste(tipo: TipoDeLink, opcoes: { testeAte?: string | null; agora?: Date }): string[] {
  if (tipo !== "invite" || !opcoes.testeAte) return [];
  const fim = new Date(opcoes.testeAte);
  if (Number.isNaN(fim.getTime()) || fim.getTime() <= (opcoes.agora ?? new Date()).getTime()) return [];
  const dia = fim.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [`A conta está no teste grátis de 7 dias, até ${dia}.`];
}

// Texto neutro (revisão de 30/10/2026): a conta pode ser de qualquer ramo
// (0244), não só de uma imobiliária com corretores.
function conteudo(tipo: TipoDeLink, nomeDoGrupo: string, extras: string[] = []) {
  if (tipo === "invite") {
    return {
      assunto: `Seu acesso ao painel da ${nomeDoGrupo}`,
      paragrafos: [
        `Você recebeu acesso ao painel da ${nomeDoGrupo}.`,
        ...extras,
        "Para entrar pela primeira vez, crie a sua senha pelo link abaixo.",
      ],
      botao: "Criar minha senha",
    };
  }
  return {
    assunto: `Redefinir sua senha do painel da ${nomeDoGrupo}`,
    paragrafos: [
      `Recebemos um pedido para redefinir a senha do seu acesso ao painel da ${nomeDoGrupo}.`,
      "Para criar uma senha nova, use o link abaixo.",
    ],
    botao: "Criar uma senha nova",
  };
}

function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
