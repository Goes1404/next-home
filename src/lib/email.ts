import "server-only";

import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";

/**
 * O único caminho de e-mail do projeto.
 *
 * ## Por que ele nasceu
 *
 * Até 31/08/2026 não havia e-mail nenhum aqui — nem SMTP, nem provedor — e
 * isso era aceitável enquanto todo aviso pudesse ser dado na tela ou no
 * WhatsApp. O incidente de 28/08 quebrou essa premissa: o número saiu do ar
 * e ficou três dias fora sem ninguém saber. **O canal natural para avisar o
 * corretor era justamente o WhatsApp que tinha caído** — avisar por lá seria
 * avisar num telefone mudo. Sobrou a tela do painel, que só é vista por quem
 * abre, e foi exatamente por isso que os três dias passaram.
 *
 * ## Falha fechada, e em silêncio para o usuário
 *
 * Sem `RESEND_API_KEY` a função não envia e devolve `enviado: false` com o
 * motivo — mesmo padrão do webhook e do cron, que recusam em vez de fingir.
 * O que ela NUNCA faz é lançar: quem chama é um cron no meio de um ciclo de
 * disparo, e derrubar o disparo de campanha porque um aviso não saiu seria
 * trocar um problema pequeno por um grande.
 *
 * Ambiente sem a chave é o estado normal do desenvolvimento e do sandbox de
 * teste: o log sai uma vez, com o assunto, para o aviso ficar auditável
 * mesmo quando não há como enviar.
 */

const ENDERECO_API = "https://api.resend.com/emails";

/** Remetente. Só vale depois que o domínio estiver verificado no Resend. */
const REMETENTE_PADRAO = "Next Home <avisos@nexthomeimobiliaria.com.br>";

export type ResultadoEmail =
  | { enviado: true; id: string | null }
  | {
      enviado: false;
      motivo: "sem_chave" | "sem_destinatario" | "endereco_de_acesso" | "recusado" | "rede";
      detalhe?: string;
    };

export interface Email {
  para: string;
  assunto: string;
  /** Corpo em HTML. */
  html: string;
  /** Corpo em texto puro — sempre mande os dois: cliente que não renderiza
   *  HTML mostraria uma tela em branco. */
  texto: string;
}

export async function enviarEmail(email: Email): Promise<ResultadoEmail> {
  const chave = process.env.RESEND_API_KEY;

  if (!email.para?.includes("@")) {
    return { enviado: false, motivo: "sem_destinatario" };
  }

  /*
   * Endereço de ACESSO ao painel não é caixa de mensagem — e o domínio é de
   * TERCEIRO (`nexthome.com` resolve para 72.20.123.54). Sem esta recusa, no
   * dia em que alguém religar os crons de e-mail, o aviso de queda do número
   * e o relatório semanal do gestor sairiam para um estranho, com contagem
   * de lead e retrato da operação dentro.
   *
   * Recusa em vez de lançar: o chamador está no meio de um ciclo de disparo,
   * mesmo contrato de falha fechada do resto desta função.
   */
  if (ehEmailDeAcesso(email.para)) {
    console.warn(
      `[email] destinatário é endereço de acesso ao painel, não enviado: "${email.assunto}" para ${email.para}`,
    );
    return { enviado: false, motivo: "endereco_de_acesso" };
  }

  if (!chave) {
    console.warn(
      `[email] RESEND_API_KEY ausente — não enviado: "${email.assunto}" para ${email.para}`,
    );
    return { enviado: false, motivo: "sem_chave" };
  }

  try {
    const resposta = await fetch(ENDERECO_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE || REMETENTE_PADRAO,
        to: [email.para],
        subject: email.assunto,
        html: email.html,
        text: email.texto,
      }),
      // O chamador é um cron com orçamento de tempo apertado: aviso que
      // demora não pode segurar o ciclo de disparo.
      signal: AbortSignal.timeout(8000),
    });

    if (!resposta.ok) {
      const detalhe = (await resposta.text()).slice(0, 300);
      console.error(`[email] recusado (HTTP ${resposta.status}): ${detalhe}`);
      return { enviado: false, motivo: "recusado", detalhe };
    }

    const corpo = (await resposta.json().catch(() => null)) as { id?: string } | null;
    return { enviado: true, id: corpo?.id ?? null };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    console.error(`[email] falha de rede: ${detalhe}`);
    return { enviado: false, motivo: "rede", detalhe };
  }
}
