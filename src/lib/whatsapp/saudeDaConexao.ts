/**
 * O número está no ar? E, se não está, o que dizer ao corretor.
 *
 * ## Por que este arquivo existe
 *
 * Em 28/08/2026 o WhatsApp da instância caiu às 16h22 e ninguém soube por
 * TRÊS DIAS: fila parada, zero mensagem, zero aviso. O sistema tem quatro
 * proteções do número — espaçamento, cota, disjuntor e janela de horário —
 * e nenhuma delas conta que o número saiu do ar. As proteções evitam o
 * estrago; nenhuma avisa do apagão.
 *
 * ## Por que a decisão e o TEXTO moram juntos, e aqui
 *
 * O mesmo estado é dito em dois lugares — a faixa no painel e o e-mail —, e
 * eles não podem divergir: aviso que diz uma coisa na tela e outra no e-mail
 * é pior que aviso nenhum. Mesma lição de `turnoDeAtendimento.ts`, onde o
 * playground e o eval já divergiram do webhook por terem cópia própria do
 * preparo.
 *
 * O que este módulo NÃO faz é igualmente decidido: não lê banco, não envia
 * e-mail, não formata HTML. É função pura sobre uma foto do estado, para
 * poder ser testada sem rede e sem relógio real.
 *
 * ## A régua de gravidade
 *
 * Uma cor por gravidade, e a ordem importa — um número caído com disjuntor
 * aberto é, antes de tudo, um número caído:
 *
 *   caiu           (perigo)  parou, e só o corretor resolve
 *   envios_pausados(alerta)  o sistema se protegeu e volta sozinho
 *   fila_esperando (info)    está funcionando, só não agora
 *
 * Três avisos da mesma cor voltariam a ser um aviso só — a mesma lição da
 * régua de etapas do funil.
 */

import { diasDesdeConexao, limiteDiarioCampanha } from "./antiBan";

export type GravidadeAviso = "perigo" | "alerta" | "info";

export type TipoDeAviso = "caiu" | "envios_pausados" | "fila_esperando";

export interface AvisoDaConexao {
  tipo: TipoDeAviso;
  gravidade: GravidadeAviso;
  /** Uma linha, sem ponto final — é o que vai no assunto do e-mail também. */
  titulo: string;
  /** Duas ou três frases. Fala do que PAROU, não do estado interno. */
  detalhe: string;
  /** Rótulo do botão principal, ou null quando não há nada a fazer. */
  acao: string | null;
  /** Só o estado que exige ação do corretor manda e-mail. */
  mereceEmail: boolean;
}

/** A foto do estado que este módulo precisa. Nada além disso. */
export interface FotoDaConexao {
  statusConexao: string;
  /** Marco da curva de aquecimento. `null` = número nunca foi pareado. */
  conectadoEm: Date | null;
  /** Quando o provedor deixou de responder, se soubermos. */
  desconectadoEm: Date | null;
  bloqueadoAte: Date | null;
  /** Data do contador de envios, no formato do banco (YYYY-MM-DD, fuso SP). */
  enviosCampanhaData: string | null;
  enviosCampanhaContador: number;
  /** Itens ainda `pendente` na fila deste número. */
  pendentes: number;
}

const FUSO = "America/Sao_Paulo";

const dataHoraSP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const horaSP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
});

/** "28/08 às 16h22" — o formato que o corretor lê, não ISO. */
export function quandoEmSaoPaulo(data: Date): string {
  const partes = dataHoraSP.formatToParts(data);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")} às ${p("hour")}h${p("minute")}`;
}

function horaDoDia(data: Date): string {
  return horaSP.format(data).replace(":", "h");
}

/** O dia corrente no fuso de São Paulo, no formato da coluna do banco. */
function diaEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

function pluralMensagens(n: number): string {
  return n === 1 ? "1 mensagem" : `${n} mensagens`;
}

/**
 * Há quanto tempo, em palavras. "faz 3 dias" pesa mais que um timestamp —
 * é a duração que faz o corretor entender o tamanho do estrago.
 */
function haQuantoTempo(desde: Date, agora: Date): string | null {
  const minutos = Math.floor((agora.getTime() - desde.getTime()) / 60_000);
  if (minutos < 45) return null; // Queda recente pode ser oscilação; não dramatize.
  if (minutos < 120) return "faz cerca de 1 hora";
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `faz ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "faz 1 dia" : `faz ${dias} dias`;
}

function trechoDaFila(pendentes: number): string {
  if (pendentes === 0) return "";
  return ` E ${pluralMensagens(pendentes)} ${pendentes === 1 ? "está parada" : "estão paradas"} na fila, esperando.`;
}

/**
 * O veredito. `null` significa que está tudo certo — e o chamador não
 * desenha nada: faixa que aparece o tempo todo deixa de ser lida, que é o
 * pior desfecho possível para um alerta (a mesma lição do
 * `evolucaoConversa`).
 */
export function avaliarSaudeDaConexao(foto: FotoDaConexao, agora: Date): AvisoDaConexao | null {
  const conectado = foto.statusConexao === "conectado" && foto.conectadoEm !== null;

  // 1. O número caiu — ou nunca foi pareado. Antes de qualquer outra coisa:
  //    sem número no ar não há conversa, dossiê, follow-up nem lembrete de
  //    visita, e nada disso volta sozinho.
  if (!conectado) {
    if (foto.conectadoEm === null && foto.desconectadoEm === null) {
      return {
        tipo: "caiu",
        gravidade: "perigo",
        titulo: "Seu WhatsApp ainda não está conectado",
        detalhe:
          "Enquanto o número não for pareado, a assistente não atende ninguém e nenhuma mensagem sai." +
          trechoDaFila(foto.pendentes),
        acao: "Conectar meu número",
        mereceEmail: false, // Nunca conectou: não houve queda, e o corretor sabe.
      };
    }

    const desde = foto.desconectadoEm ?? foto.conectadoEm;
    const tempo = desde ? haQuantoTempo(desde, agora) : null;
    const quando = desde ? ` em ${quandoEmSaoPaulo(desde)}${tempo ? ` — ${tempo}` : ""}` : "";

    return {
      tipo: "caiu",
      gravidade: "perigo",
      titulo: "Seu WhatsApp saiu do ar",
      detalhe:
        `A conexão caiu${quando}. Ninguém está recebendo nem respondendo mensagem — ` +
        "nem a assistente, nem você." +
        trechoDaFila(foto.pendentes),
      acao: "Reconectar meu número",
      mereceEmail: true,
    };
  }

  // 2. Disjuntor aberto: o sistema pausou os envios sozinho depois de falhas
  //    seguidas do provedor. É proteção funcionando, não defeito — e volta
  //    sozinho, então não vira e-mail.
  if (foto.bloqueadoAte && foto.bloqueadoAte.getTime() > agora.getTime()) {
    return {
      tipo: "envios_pausados",
      gravidade: "alerta",
      titulo: "Pausamos os envios para proteger seu número",
      detalhe:
        "Mensagens seguidas falharam, então paramos por algumas horas — é o que evita o WhatsApp " +
        `restringir sua linha. Volta sozinho às ${horaDoDia(foto.bloqueadoAte)}, sem você fazer nada.` +
        trechoDaFila(foto.pendentes),
      acao: null,
      mereceEmail: false,
    };
  }

  // 3. Cota do dia esgotada com fila esperando. Não é problema: é a curva de
  //    aquecimento protegendo um número novo. Só aparece quando há de fato
  //    mensagem parada — sem fila, não há o que explicar.
  if (foto.pendentes > 0 && foto.conectadoEm) {
    const doDia =
      foto.enviosCampanhaData === diaEmSaoPaulo(agora) ? foto.enviosCampanhaContador : 0;
    const limite = limiteDiarioCampanha(diasDesdeConexao(foto.conectadoEm, agora));

    if (doDia >= limite) {
      return {
        tipo: "fila_esperando",
        gravidade: "info",
        titulo: `${pluralMensagens(foto.pendentes)} continuam amanhã`,
        detalhe:
          "Seu número já mandou tudo que podia hoje. As outras saem amanhã de manhã, sozinhas, " +
          "no ritmo que mantém a linha segura.",
        acao: null,
        mereceEmail: false,
      };
    }
  }

  return null;
}

/**
 * O e-mail, montado a partir do MESMO aviso que a faixa do painel usa.
 *
 * Duas fontes de texto divergiriam — e aviso que diz uma coisa na tela e
 * outra no e-mail é pior que aviso nenhum.
 *
 * Puro de propósito: montar HTML não precisa de rede, e o corpo do e-mail é
 * conteúdo que merece teste como qualquer outro texto que chega ao cliente.
 *
 * Sobre o estilo: tudo inline e sem fonte externa. Cliente de e-mail
 * descarta `<style>` com frequência e nenhum carrega Google Fonts de forma
 * confiável; modo escuro em e-mail cada cliente inverte de um jeito, então o
 * desenho não aposta nele — é claro sempre.
 */
export function montarEmailDeQueda(
  aviso: AvisoDaConexao,
  params: { nomeCorretor: string; urlPainel: string },
): { assunto: string; html: string; texto: string } {
  const assunto = `${aviso.titulo} — a assistente parou de atender`;
  const primeiroNome = params.nomeCorretor.trim().split(/\s+/)[0] || "Olá";
  const link = `${params.urlPainel.replace(/\/$/, "")}/corretor/whatsapp`;

  const texto = [
    `${primeiroNome},`,
    "",
    aviso.detalhe,
    "",
    "O que está parado enquanto isso:",
    "- mensagem que chega não é respondida, nem pela assistente nem por você;",
    "- disparos de campanha não saem;",
    "- lembrete de visita não sai, e quem tem visita marcada não será avisado.",
    "",
    `${aviso.acao ?? "Abrir o painel"}: ${link}`,
    "",
    "Você está recebendo por e-mail porque o canal que caiu foi justamente o",
    "WhatsApp — avisar por lá seria avisar num telefone mudo.",
    "",
    "Next Home Negócios Imobiliários",
  ].join("\n");

  const item = (t: string) =>
    `<tr><td style="padding:0 0 8px 0;font:14px/1.5 Helvetica,Arial,sans-serif;color:#183630">• ${t}</td></tr>`;

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#edf2f0;padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,63,55,0.14);border-radius:16px">
  <tr><td style="padding:24px 28px 0;font:600 17px Georgia,serif;color:#05211c">Next<span style="color:#00594f">Home</span></td></tr>
  <tr><td style="padding:18px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:rgba(190,18,60,0.08);border-left:3px solid #be123c;border-radius:0 10px 10px 0">
      <tr><td style="padding:14px 16px">
        <p style="margin:0;font:600 15px/1.35 Helvetica,Arial,sans-serif;color:#05211c">${aviso.titulo}</p>
        <p style="margin:6px 0 0;font:14px/1.6 Helvetica,Arial,sans-serif;color:#183630">${aviso.detalhe}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 28px 0">
    <p style="margin:0 0 12px;font:14px/1.65 Helvetica,Arial,sans-serif;color:#183630">${primeiroNome}, o que está parado enquanto isso:</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${item("Mensagem que chega não é respondida — nem pela assistente, nem por você.")}
      ${item("Disparos de campanha não saem.")}
      ${item("Lembrete de visita não sai, e quem tem visita marcada não será avisado.")}
    </table>
  </td></tr>
  <tr><td style="padding:24px 28px 0">
    <a href="${link}" style="display:inline-block;background:#00594f;color:#ffffff;font:600 15px Helvetica,Arial,sans-serif;text-decoration:none;padding:14px 24px;border-radius:999px">${aviso.acao ?? "Abrir o painel"}</a>
  </td></tr>
  <tr><td style="padding:24px 28px 28px">
    <p style="margin:0;border-top:1px solid rgba(0,63,55,0.14);padding-top:16px;font:12px/1.6 Helvetica,Arial,sans-serif;color:#5f7c76">
      Você está recebendo por e-mail porque o canal que caiu foi justamente o WhatsApp — avisar por lá seria avisar num telefone mudo. O painel mostra o mesmo aviso quando você abre.
    </p>
  </td></tr>
</table>
</body></html>`;

  return { assunto, html, texto };
}
