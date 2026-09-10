import type { StatusObra } from "@/lib/types";

/**
 * A cor do selo de estágio da obra, no site público.
 *
 * ## Por que colorir isto, e não outra coisa
 *
 * O selo aparece em TODO cartão do catálogo, no herói de cada imóvel e no
 * cartão do mapa — é o elemento colorido mais repetido do site. Colori-lo
 * espalha a paleta por toda parte sem acrescentar enfeite nenhum, porque a
 * cor aqui INFORMA: o estágio é o que decide se a pessoa está olhando algo
 * para morar em dois meses ou em dois anos.
 *
 * ## Quatro grupos para seis estágios, de propósito
 *
 * A régua da casa é "rampa para o que tem ordem, matiz para o que só tem
 * identidade". Estágio tem ordem, e a rampa vai do AZUL da marca (ainda vai
 * sair do papel) ao VERDE dela (pronto). Seis tons distintos seriam seis
 * degraus que ninguém distingue de relance num selo de 11px; o que muda a
 * decisão de quem compra são quatro momentos, e estágios que significam a
 * mesma coisa para ele dividem a mesma cor.
 *
 * "Últimas unidades" quebra a rampa de propósito — é a areia, o único tom
 * morno. Não é um degrau do tempo de obra, é escassez, e é o mesmo papel
 * dos terminais (`fechado`, `perdido`) na rampa de etapa do painel.
 *
 * ## Tinta, nunca token de tema
 *
 * Estes selos flutuam sobre a FOTO, com um véu escuro fixo por baixo. Token
 * de tema ali é o defeito que a guarda `naoCortaTexto` persegue: no tema
 * claro `text-acento-suave` é verde-escuro, e o selo sumia. Tinta clara
 * funciona nos dois temas porque o fundo dela não muda com o tema.
 */
export const STATUS_TINTA: Record<StatusObra, string> = {
  breve_lancamento: "text-azure-200",
  pre_lancamento: "text-azure-200",
  /* O momento alto do lançamento: o azul mais claro da escala é o que mais
     salta sobre o véu, e "lançamento" é o estágio que a casa quer gritar. */
  lancamento: "text-azure-100",
  em_construcao: "text-brand-200",
  ultimas_unidades: "text-sand-300",
  pronto_para_morar: "text-brand-100",
};

/** O mesmo tom, como fundo de um ponto — o marcador ao lado do rótulo. */
export const STATUS_PONTO: Record<StatusObra, string> = {
  breve_lancamento: "bg-azure-200",
  pre_lancamento: "bg-azure-200",
  lancamento: "bg-azure-100",
  em_construcao: "bg-brand-200",
  ultimas_unidades: "bg-sand-300",
  pronto_para_morar: "bg-brand-100",
};
