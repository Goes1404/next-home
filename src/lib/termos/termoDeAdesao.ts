/**
 * Termo de adesão ao CRM da Astro Soluções (0247, 29/10/2026).
 *
 * RASCUNHO PARA O ADVOGADO DO DONO REVISAR. Não é o texto final: foi escrito
 * em português simples a partir do que o produto FAZ hoje (cobrança mensal,
 * teste grátis de 7 dias, suspensão por atraso, cancelamento com 90 dias de
 * retenção, WhatsApp por conexão não oficial, IA que pode errar). Serve a
 * qualquer ramo (imobiliária, corretora de seguros, escritório de advocacia,
 * comércio): nada aqui supõe imóvel.
 *
 * Diferença para os termos de USO (`termos.ts`, 0198, desligados no layout
 * desde 23/10/2026): aqueles eram para TODA pessoa do painel; este é o
 * CONTRATO da conta, aceito uma vez por versão pelo gestor (ou pelo
 * profissional independente, que é o gestor do próprio grupo). Corretor e
 * atendente da equipe NÃO são bloqueados por ele.
 *
 * Mudou o texto depois da revisão: troque `VERSAO_DO_TERMO_DE_ADESAO`. A
 * versão nova faz o gestor de cada conta aceitar de novo no próximo acesso;
 * os aceites antigos ficam em `aceites_do_termo_de_adesao` como prova.
 */

import { DIAS_DE_RETENCAO } from "@/lib/grupos/encerramentoRegras";
import { DIAS_ATE_SUSPENDER, DIAS_DE_TESTE_GRATIS } from "@/lib/planos/cobranca";

/** A versão vigente. Mudou o texto, mudou a versão: cada conta aceita de novo. */
export const VERSAO_DO_TERMO_DE_ADESAO = "2026-10-29-rascunho";

/** Enquanto for `true`, a página avisa que o texto ainda será revisado. */
export const TERMO_DE_ADESAO_E_RASCUNHO = true;

export type SecaoDoTermo = { titulo: string; paragrafos: string[] };

export const SECOES_DO_TERMO_DE_ADESAO: SecaoDoTermo[] = [
  {
    titulo: "1. Quem são as partes e o que se contrata",
    paragrafos: [
      "De um lado, a Astro Soluções (a CONTRATADA), que fornece o CRM. Do outro, a empresa ou o profissional titular desta conta (a CONTRATANTE), representado pela pessoa que aceita este termo e declara ter poderes para isso.",
      "O objeto é o uso do CRM da Astro Soluções como serviço pela internet (software como serviço): organização de contatos e oportunidades (leads), funil de vendas, agenda, conversas de WhatsApp, assistente de inteligência artificial, listas de transmissão e os demais recursos do plano contratado. O serviço é licenciado para uso, não vendido: o código e a marca continuam da Astro Soluções.",
    ],
  },
  {
    titulo: "2. Plano e mensalidade",
    paragrafos: [
      "O plano, a quantidade de usuários, os limites (respostas da IA, artes, vídeos e mensagens de lista por mês) e o valor da mensalidade são os informados na contratação e mostrados abaixo, como estão hoje no cadastro da conta. Mudança de plano ou de quantidade de usuários muda a mensalidade a partir da cobrança seguinte.",
      "A mensalidade é paga todo mês, no dia de vencimento da conta, por Pix, boleto ou cartão. Os valores podem ser reajustados uma vez a cada 12 meses, com aviso prévio de pelo menos 30 dias.",
    ],
  },
  {
    titulo: "3. Teste grátis",
    paragrafos: [
      `Quando a conta começa com teste grátis, ele dura ${DIAS_DE_TESTE_GRATIS} dias. A primeira mensalidade vence no fim do teste; sem o pagamento, o acesso é suspenso no mesmo dia, sem custo e sem multa.`,
    ],
  },
  {
    titulo: "4. Atraso e suspensão",
    paragrafos: [
      `Mensalidade vencida e não paga em até ${DIAS_ATE_SUSPENDER} dias suspende o acesso da conta: o painel deixa de funcionar para a equipe e a assistente de IA para de responder. Os dados continuam guardados, e o pagamento reativa a conta.`,
    ],
  },
  {
    titulo: "5. Obrigações da CONTRATANTE",
    paragrafos: [
      "Usar o CRM de acordo com a lei e com este termo; manter os acessos pessoais (cada pessoa com o seu login, sem compartilhar senha) e desativar quem sair da equipe; manter os dados de cobrança atualizados e pagar em dia.",
      "Cadastrar e contatar apenas pessoas com quem pode legalmente tratar do seu negócio, respeitar quem pedir para não receber mensagens e não usar o CRM para spam, golpes, conteúdo ilegal ou para burlar regras do WhatsApp.",
      "Conferir o que a assistente de IA e as mensagens automáticas dizem em nome da CONTRATANTE: o conteúdo enviado aos clientes é responsabilidade de quem o envia.",
    ],
  },
  {
    titulo: "6. Obrigações da CONTRATADA",
    paragrafos: [
      "Manter o CRM funcionando com zelo profissional, corrigir falhas que dependam dela, guardar os dados com medidas de segurança adequadas e prestar suporte pelo painel (\"Suporte da Astro\"), em dias úteis.",
      "Avisar com antecedência, sempre que possível, manutenções programadas e mudanças relevantes no serviço.",
    ],
  },
  {
    titulo: "7. WhatsApp e inteligência artificial",
    paragrafos: [
      "A conexão do WhatsApp é feita por um serviço que liga o número ao CRM do mesmo jeito que o WhatsApp Web. Não é um serviço do WhatsApp nem da Meta, e o WhatsApp pode restringir ou bloquear qualquer número, principalmente quando muitas mensagens vão para quem não conhece o remetente. O CRM tem cuidados para diminuir esse risco, mas não consegue impedi-lo: o risco de bloqueio do número é da CONTRATANTE.",
      "A assistente de IA pode errar. Ela pode ser desligada a qualquer momento e tem o limite mensal do plano; quando o limite acaba, ela para de responder e o atendimento segue pela equipe.",
    ],
  },
  {
    titulo: "8. Dados pessoais (LGPD)",
    paragrafos: [
      "Nos dados dos clientes, contatos e conversas cadastrados no CRM, a CONTRATANTE é a controladora e a CONTRATADA é a operadora, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018): a Astro Soluções trata esses dados só para prestar o serviço, conforme as instruções da CONTRATANTE, e não os vende nem os usa para outros fins.",
      "A equipe da Astro Soluções não lê conversas nem fichas de clientes no trabalho de administração da plataforma; o suporte vê só números e contagens, e todo acesso de suporte fica registrado e visível ao gestor da conta.",
      "Incidentes de segurança que possam afetar esses dados serão comunicados à CONTRATANTE. A política de privacidade completa está em /astro/privacidade.",
    ],
  },
  {
    titulo: "9. Cancelamento",
    paragrafos: [
      "A CONTRATANTE pode cancelar quando quiser, pedindo pelo suporte, sem multa. O acesso da equipe termina no cancelamento, e não há devolução proporcional de mensalidade já paga.",
      `Depois do cancelamento, os dados ficam guardados e bloqueados por ${DIAS_DE_RETENCAO} dias, período em que a CONTRATANTE pode pedir uma cópia ou desistir do cancelamento. Passado esse prazo, os dados são apagados de forma definitiva, salvo o que a lei obrigar a guardar.`,
      "A CONTRATADA pode encerrar a conta por falta de pagamento prolongada ou por uso que viole a lei ou este termo, com aviso prévio, salvo urgência.",
    ],
  },
  {
    titulo: "10. Responsabilidade",
    paragrafos: [
      "A CONTRATADA não responde por vendas não realizadas, bloqueios de número pelo WhatsApp, falhas de internet ou de serviços de terceiros fora do controle dela, nem pelo conteúdo que a CONTRATANTE envia. Em qualquer caso, a responsabilidade da CONTRATADA fica limitada ao valor pago pela CONTRATANTE nos 12 meses anteriores ao fato.",
    ],
  },
  {
    titulo: "11. Mudanças neste termo e foro",
    paragrafos: [
      "Quando este termo mudar, o painel pede ao gestor da conta que leia e aceite a nova versão. Continuar usando o CRM sem aceitar não é possível para o gestor.",
      "Fica eleito o foro da comarca da sede da CONTRATADA para resolver qualquer questão sobre este termo, salvo regra legal em contrário.",
    ],
  },
];

/**
 * O painel deve mandar esta pessoa aceitar o termo antes de qualquer tela?
 *
 * Só o GESTOR (o profissional independente é o gestor do próprio grupo);
 * corretor e atendente nunca. A conta da casa (Next Home, a dona da
 * plataforma, que não é cliente) fica de fora. E o aceite é da CONTA: se
 * outro gestor do grupo já aceitou a versão vigente, ninguém mais é parado.
 */
export function precisaAceitarTermoDeAdesao(entrada: {
  papel: "corretor" | "gestor";
  ehContaDaCasa: boolean;
  contaJaAceitou: boolean;
}): boolean {
  return entrada.papel === "gestor" && !entrada.ehContaDaCasa && !entrada.contaJaAceitou;
}

/**
 * O painel só cobra o aceite com isto ligado (29/10/2026, decisão do dono):
 * o texto ainda é rascunho para o advogado. Desligado, a página existe e
 * aceita, mas ninguém é redirecionado. Ligar depois da revisão do texto.
 */
export const TERMO_DE_ADESAO_OBRIGATORIO = false;

/** O endereço da página do termo (fora do `(painel)`, para não redirecionar para si mesma). */
export const CAMINHO_DO_TERMO_DE_ADESAO = "/corretor/termo-de-adesao";
