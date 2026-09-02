/**
 * "Quem está esperando resposta" — o aviso que faz o painel ir até a pessoa.
 *
 * ## Por que existe
 *
 * Medido em 02/09/2026: em sete dias entraram 649 mensagens de cliente e
 * saíram 544 respostas da corretora — ela trabalha muito. Só que a última
 * escrita no PAINEL era de três dias antes, e havia **8 clientes sem
 * resposta, o mais antigo desde 25/08**. O trabalho acontece no WhatsApp,
 * que está sempre aberto; o painel espera ser aberto, e perde.
 *
 * Enquanto o painel esperar, toda melhoria de tela é invisível. Este módulo
 * inverte isso: o aviso sai atrás da pessoa.
 *
 * ## As duas regras que impedem virar paisagem
 *
 * 1. **Silêncio quando não há notícia.** Sem ninguém esperando além do
 *    limiar, nenhum e-mail é enviado — não existe "resumo de hoje: tudo em
 *    dia". Aviso que chega todo dia deixa de ser lido, e é a regra que este
 *    projeto já aplicou ao alerta de evolução da conversa e à faixa de queda.
 * 2. **O assunto é o PIOR caso, nunca o rótulo do relatório.** "Resumo
 *    diário" não é aberto; "Priscila espera resposta há 2 dias" é.
 *
 * Módulo puro, sem I/O: quem lê o banco é a rota do cron.
 */

/** Abaixo disso não é atraso, é o intervalo normal de uma conversa. */
export const HORAS_PARA_AVISAR = 4;

/** Nunca mais que isto no corpo do e-mail: lista longa não é lida. */
export const MAXIMO_NA_LISTA = 8;

export type PessoaEsperando = {
  nome: string;
  esperandoDesde: string;
  conversaId: string;
};

export type EsperaMedida = PessoaEsperando & { horas: number };

export function medirEspera(pessoas: PessoaEsperando[], agora: Date): EsperaMedida[] {
  return pessoas
    .map((p) => ({
      ...p,
      horas: Math.floor((agora.getTime() - new Date(p.esperandoDesde).getTime()) / 3_600_000),
    }))
    .filter((p) => p.horas >= HORAS_PARA_AVISAR)
    .sort((a, b) => b.horas - a.horas);
}

/** "há 6 horas", "há 2 dias" — dias a partir de 24h, que é como se fala. */
export function tempoDeEspera(horas: number): string {
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function assuntoDoAviso(esperas: EsperaMedida[]): string {
  const pior = esperas[0];
  if (esperas.length === 1) return `${pior.nome} espera resposta ${tempoDeEspera(pior.horas)}`;
  return `${esperas.length} pessoas esperando — a mais antiga ${tempoDeEspera(pior.horas)}`;
}

export function corpoDoAviso({
  esperas,
  urlPainel,
}: {
  esperas: EsperaMedida[];
  urlPainel: string;
}): { texto: string; html: string } {
  const mostrar = esperas.slice(0, MAXIMO_NA_LISTA);
  const sobrando = esperas.length - mostrar.length;

  const linhas = mostrar.map((e) => `${e.nome} — ${tempoDeEspera(e.horas)}`);
  if (sobrando > 0) linhas.push(`e mais ${sobrando} ${sobrando === 1 ? "pessoa" : "pessoas"}`);

  const texto = [
    esperas.length === 1
      ? "Uma pessoa escreveu e ainda não teve resposta:"
      : `${esperas.length} pessoas escreveram e ainda não tiveram resposta:`,
    "",
    ...linhas.map((l) => `• ${l}`),
    "",
    `Abrir: ${urlPainel}/corretor`,
  ].join("\n");

  const itens = mostrar
    .map(
      (e) =>
        `<li style="margin:0 0 8px"><a href="${urlPainel}/corretor/conversas?c=${e.conversaId}" style="color:#0f172a;text-decoration:none"><strong>${escapar(e.nome)}</strong></a> — ${tempoDeEspera(e.horas)}</li>`,
    )
    .join("");

  const html = [
    `<div style="font:15px/1.5 system-ui,-apple-system,sans-serif;color:#0f172a;max-width:520px">`,
    `<p style="margin:0 0 14px">${
      esperas.length === 1
        ? "Uma pessoa escreveu e ainda não teve resposta:"
        : `<strong>${esperas.length} pessoas</strong> escreveram e ainda não tiveram resposta:`
    }</p>`,
    `<ul style="margin:0 0 18px;padding-left:18px">${itens}</ul>`,
    sobrando > 0
      ? `<p style="margin:0 0 18px;color:#64748b">e mais ${sobrando} ${sobrando === 1 ? "pessoa" : "pessoas"}.</p>`
      : "",
    `<p style="margin:0"><a href="${urlPainel}/corretor" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;display:inline-block">Abrir o painel</a></p>`,
    `</div>`,
  ].join("");

  return { texto, html };
}

/** O nome vem do WhatsApp do cliente: pode ter `<` e `&`. */
function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
