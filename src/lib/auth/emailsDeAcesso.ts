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
): Promise<ResultadoEmail> {
  const { assunto, paragrafos, botao } = conteudo(tipo, nomeDoGrupo);
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

function conteudo(tipo: TipoDeLink, nomeDoGrupo: string) {
  if (tipo === "invite") {
    return {
      assunto: `Seu acesso ao painel da ${nomeDoGrupo}`,
      paragrafos: [
        `Você recebeu acesso ao painel de corretores da ${nomeDoGrupo}.`,
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
