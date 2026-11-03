/**
 * O que fazer com cada erro da API oficial (conferido na página de códigos
 * de erro da Meta em 03/11/2026). Puro.
 *
 * Cinco desfechos, cada um protegendo uma coisa diferente:
 *   - `definitivo`: dado do lead ou do pedido (número sem WhatsApp, variável
 *     faltando). Tentar de novo dá no mesmo; o item vira erro.
 *   - `reagendar`: a Meta segurou por enquanto (limite por pessoa, excesso
 *     para o mesmo destinatário, serviço fora). Volta mais tarde, UMA vez no
 *     caso do 131049: a Meta avisa que tentar antes de 24 h só piora.
 *   - `optout`: a pessoa parou de receber marketing. Não tenta nunca mais e
 *     o consentimento vira revogado.
 *   - `pausar_lista`: o MODELO não serve (pausado, desativado, inexistente).
 *     Nenhum item desta lista vai sair até alguém trocar o modelo.
 *   - `pausar_numero`: a CONTA não serve (token vencido, conta restrita,
 *     pagamento, qualidade). Nada sai por este número até resolver.
 *
 * Erro desconhecido vira `reagendar` com tentativa contada: o disparador
 * desiste depois de três, como faz com a Evolution.
 */

export type DecisaoDoErro =
  | { tipo: "definitivo"; motivo: string }
  | { tipo: "reagendar"; motivo: string; minutos: number; umaVez?: boolean }
  | { tipo: "optout"; motivo: string }
  | { tipo: "pausar_lista"; motivo: string }
  | { tipo: "pausar_numero"; motivo: string }
  | { tipo: "incerto"; motivo: string };

export const MOTIVO_OFICIAL_SEM_WHATSAPP = "Este número não recebe mensagens do WhatsApp (sem conta, termos não aceitos ou aplicativo desatualizado).";
export const MOTIVO_OFICIAL_LIMITE_POR_PESSOA =
  "A Meta segurou esta mensagem: a pessoa já recebeu muitas mensagens de marketing (de todas as empresas). Tentamos de novo daqui a 24 h, uma vez.";
export const MOTIVO_OFICIAL_OPTOUT = "A pessoa parou de receber mensagens de marketing pelo WhatsApp. Não enviamos mais.";
export const MOTIVO_OFICIAL_INCERTO =
  "A Meta não confirmou a tempo: a mensagem pode ter saído. Não reenviamos para não mandar duas vezes.";

export function decidirErroDaMeta(erro: { codigo: number | null; incerto?: boolean }): DecisaoDoErro {
  if (erro.incerto) return { tipo: "incerto", motivo: MOTIVO_OFICIAL_INCERTO };
  switch (erro.codigo) {
    // Dado do destinatário.
    case 131026:
      return { tipo: "definitivo", motivo: MOTIVO_OFICIAL_SEM_WHATSAPP };
    case 131021:
      return { tipo: "definitivo", motivo: "O destinatário é o próprio número oficial." };
    case 131051:
      return { tipo: "definitivo", motivo: "Tipo de mensagem não suportado pela Meta." };
    // Pedido malformado: o mesmo pedido falha de novo.
    case 100:
    case 131008:
    case 131009:
    case 132000:
    case 132012:
    case 135000:
      return { tipo: "definitivo", motivo: "A Meta recusou os dados desta mensagem (variável do modelo faltando ou em formato errado)." };

    // A Meta segurou por agora.
    case 131049:
      return { tipo: "reagendar", motivo: MOTIVO_OFICIAL_LIMITE_POR_PESSOA, minutos: 24 * 60, umaVez: true };
    case 131056:
      return { tipo: "reagendar", motivo: "Mensagens demais para esta pessoa em pouco tempo. Tentamos de novo mais tarde.", minutos: 60 };
    case 130429:
      return { tipo: "reagendar", motivo: "Limite de velocidade da Meta. Tentamos de novo em instantes.", minutos: 5 };
    case 130472:
      return { tipo: "definitivo", motivo: "A Meta não entregou: a pessoa está num grupo de experimento de marketing da Meta." };
    case 131000:
    case 131016:
    case 131057:
    case 133004:
      return { tipo: "reagendar", motivo: "Serviço da Meta indisponível agora. Tentamos de novo em 10 minutos.", minutos: 10 };

    // A pessoa saiu do marketing.
    case 131050:
      return { tipo: "optout", motivo: MOTIVO_OFICIAL_OPTOUT };

    // O modelo não serve.
    case 132001:
      return { tipo: "pausar_lista", motivo: "O modelo não existe nesse idioma ou ainda não foi aprovado pela Meta." };
    case 132005:
      return { tipo: "pausar_lista", motivo: "O texto do modelo ficou longo demais para a Meta." };
    case 132007:
      return { tipo: "pausar_lista", motivo: "A Meta considerou o modelo contra as regras do WhatsApp." };
    case 132015:
      return { tipo: "pausar_lista", motivo: "A Meta pausou o modelo por baixa qualidade (bloqueios ou denúncias). Edite ou troque o modelo." };
    case 132016:
      return { tipo: "pausar_lista", motivo: "A Meta desativou o modelo de vez, depois de pausas repetidas. Crie um modelo novo." };

    // A conta não serve.
    case 0:
    case 190:
      return { tipo: "pausar_numero", motivo: "O acesso à conta da Meta venceu. Gere um token novo (veja o guia de ativação)." };
    case 3:
    case 10:
    case 200:
    case 131005:
      return { tipo: "pausar_numero", motivo: "O app não tem permissão para mandar mensagem por este número na Meta." };
    case 368:
    case 131031:
      return { tipo: "pausar_numero", motivo: "A Meta restringiu a conta por violação de política. Nada sai até resolver no WhatsApp Manager." };
    case 131048:
      return { tipo: "pausar_numero", motivo: "A Meta limitou este número por denúncias ou bloqueios. Confira a qualidade no WhatsApp Manager." };
    case 131042:
      return { tipo: "pausar_numero", motivo: "Problema na forma de pagamento da conta da Meta. Confira o cartão em reais." };
    case 131037:
      return { tipo: "pausar_numero", motivo: "O nome de exibição do número ainda não foi aprovado pela Meta." };
    case 131045:
    case 133010:
      return { tipo: "pausar_numero", motivo: "O número não está registrado na API oficial." };
    case 131047:
      // Só acontece com texto livre (resposta da IA): a janela de 24 h fechou.
      return { tipo: "definitivo", motivo: "Passaram 24 h desde a última mensagem do cliente: só modelo aprovado pode sair agora." };

    default:
      return { tipo: "reagendar", motivo: "Erro não identificado da Meta. Tentamos de novo em 10 minutos.", minutos: 10 };
  }
}
