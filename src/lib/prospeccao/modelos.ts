// Os padrões de cada modelo de amostra (0253, 02/11/2026).
//
// Módulo PURO. A captação e o painel gravam em `prospeccao_leads.amostra` só
// o que é da loja (cores, chamada, gancho, horário); o resto vem daqui.
// Produtos e preços são ILUSTRATIVOS, e a amostra diz isso na faixa do topo.

import type { ConfigDaAmostra, Modelo, ModoDoPedido, ProdutoDaAmostra } from "./tipos";

type Padrao = Required<
  Pick<
    ConfigDaAmostra,
    "categorias" | "novidades" | "promocoes" | "vitrine" | "modo" | "servicos" | "resolve" | "calculadora" | "heroA" | "heroB"
  >
> & { selo: [string, string]; titulo: [string, string]; chamada: string; adesivos: { a: [string, string]; b: [string, string] } };

// ── Varejo (beleza, presentes, papelaria, moda, pet) ─────────────────────
const VAREJO_NOVIDADES: ProdutoDaAmostra[] = [
  { n: "Body splash floral 200 ml", c: "Perfumaria", p: "39,90", b: ["tall", "#FFB3CC", "#E8457E", "#3B0F2E"], bg: "#FFEAF1", t: "Novo" },
  { n: "Perfume feminino frutado 75 ml", c: "Perfumaria", p: "129,90", b: ["round", "#FFE08A", "#EE9A2E", "#C99A2E"], bg: "#FFF5DF", t: "Novo" },
  { n: "Batom matte longa duração", c: "Maquiagem", p: "24,90", b: ["lipstick", "#C2185B", "#5E0B2D", "#E9C77B"], bg: "#FCE4EC", t: "Novo" },
  { n: "Kit esmaltes da estação", c: "Unhas", p: "29,90", b: ["nail", "#F7A1B8", "#D94F7A", "#3B0F2E"], bg: "#FFEDF2", t: "Novo" },
];
const VAREJO_PROMOCOES: ProdutoDaAmostra[] = [
  { n: "Hidratante corporal 400 ml", c: "Cuidados", p: "22,90", o: "32,90", b: ["tube", "#B9EBDD", "#3FA88A", "#FFFFFF"], bg: "#E7F7F1", t: "-30%" },
  { n: "Máscara capilar 250 g", c: "Cabelos", p: "19,90", o: "27,90", b: ["jar", "#FFD9E4", "#F07EA6", "#A3124F"], bg: "#FFEFF4", t: "-28%" },
  { n: "Base líquida cobertura média", c: "Maquiagem", p: "39,90", o: "54,90", b: ["tall", "#F3D2B8", "#C98E62", "#3B2416"], bg: "#FBF0E7", t: "-27%" },
  { n: "Perfume masculino amadeirado", c: "Perfumaria", p: "99,90", o: "139,90", b: ["square", "#9DB3C7", "#2F4A63", "#C99A2E"], bg: "#EAF0F5", t: "-29%" },
];

// ── Serviços com hora marcada (salão, barbearia, estética, oficina) ──────
const SERVICOS_NOVIDADES: ProdutoDaAmostra[] = [
  { n: "Corte e finalização", c: "Cabelo", p: "70,00", b: ["scissors", "#C9B6FF", "#5B3FA8", "#3B0F2E"], bg: "#F1ECFF", t: "Mais pedido" },
  { n: "Pacote mensal de 4 sessões", c: "Pacotes", p: "220,00", b: ["gift", "#B9E3C6", "#4F7F62", "#E9C77B"], bg: "#EDF7F0", t: "Fidelidade" },
  { n: "Manicure e pedicure", c: "Unhas", p: "55,00", b: ["nail", "#F7A1B8", "#D94F7A", "#3B0F2E"], bg: "#FFEDF2", t: "Novo" },
  { n: "Hidratação profunda", c: "Tratamento", p: "90,00", b: ["jar", "#FFD9E4", "#F07EA6", "#A3124F"], bg: "#FFEFF4", t: "Novo" },
];
const SERVICOS_PROMOCOES: ProdutoDaAmostra[] = [
  { n: "Escova de terça a quinta", c: "Cabelo", p: "45,00", o: "60,00", b: ["tall", "#FFE7B0", "#F2A93B", "#3B2416"], bg: "#FFF6E3", t: "-25%" },
  { n: "Combo corte + barba", c: "Barbearia", p: "75,00", o: "95,00", b: ["scissors", "#9DB3C7", "#2F4A63", "#C99A2E"], bg: "#EAF0F5", t: "-21%" },
  { n: "Lavagem completa do carro", c: "Estética automotiva", p: "79,90", o: "99,90", b: ["car", "#BFE0F7", "#3D8FCF", "#1F2A33"], bg: "#EAF4FC", t: "-20%" },
  { n: "Limpeza de pele", c: "Estética", p: "120,00", o: "160,00", b: ["round", "#F3D2B8", "#C98E62", "#FFFFFF"], bg: "#FBF0E7", t: "-25%" },
];

// ── Alimentação (padaria, restaurante, lanchonete, delivery) ─────────────
const ALIMENTACAO_NOVIDADES: ProdutoDaAmostra[] = [
  { n: "Pão de fermentação natural", c: "Padaria", p: "18,90", b: ["bread", "#F3D2B8", "#B9763E", "#7A4A1E"], bg: "#FBF0E7", t: "Saiu agora" },
  { n: "Bolo de cenoura com chocolate", c: "Confeitaria", p: "42,00", b: ["cake", "#FFD1A6", "#E07B39", "#5A2E0E"], bg: "#FFF1E5", t: "Novo" },
  { n: "Café coado da casa", c: "Cafeteria", p: "7,50", b: ["cup", "#E8C7A8", "#9A5B34", "#9A5B34"], bg: "#F7EDE4", t: "Mais pedido" },
  { n: "Prato executivo do dia", c: "Almoço", p: "32,90", b: ["plate", "#FFE08A", "#E0A030", "#C2471B"], bg: "#FFF5DF", t: "Hoje" },
];
const ALIMENTACAO_PROMOCOES: ProdutoDaAmostra[] = [
  { n: "Combo café + pão na chapa", c: "Café da manhã", p: "12,90", o: "16,50", b: ["cup", "#E8C7A8", "#9A5B34", "#9A5B34"], bg: "#F7EDE4", t: "-22%" },
  { n: "Kit festa: 100 salgados", c: "Encomendas", p: "89,90", o: "110,00", b: ["plate", "#FFD9A0", "#D98A2B", "#8A3B12"], bg: "#FFF3E0", t: "-18%" },
  { n: "Pão francês (dúzia)", c: "Padaria", p: "9,90", o: "12,00", b: ["bread", "#F3D2B8", "#B9763E", "#7A4A1E"], bg: "#FBF0E7", t: "-17%" },
  { n: "Bolo de aniversário 2 kg", c: "Encomendas", p: "149,90", o: "179,90", b: ["cake", "#F7C7D6", "#C2477A", "#5A2E0E"], bg: "#FDEEF3", t: "-17%" },
];

type Fileira = NonNullable<ConfigDaAmostra["heroA"]>;

const HERO_VAREJO_A: Fileira = [["tall", "#FF8FB8", "#D81B6A", "#3B0F2E", 150], ["round", "#FFE08A", "#F2A93B", "#C99A2E", 118], ["square", "#C9B6FF", "#8C6DE0", "#3B0F2E", 122], ["tube", "#9FE3D0", "#3FA88A", "#FFFFFF", 132]];
const HERO_VAREJO_B: Fileira = [["jar", "#FFD1DF", "#F48FB1", "#A3124F", 80], ["lipstick", "#E2185B", "#7A0F3A", "#E9C77B", 120], ["tall", "#FFF6D6", "#F5D47A", "#C99A2E", 128]];

const PADROES: Record<Modelo, Padrao> = {
  varejo: {
    selo: ["Novidades", "toda semana na loja"],
    titulo: ["Tudo o que você procura", "agora a um toque."],
    chamada: "Veja o que acabou de chegar, separe seus favoritos pelo celular e retire na loja sem fila.",
    adesivos: { a: ["Chegou hoje", "Coleção nova"], b: ["Separado para você", "Retire na loja"] },
    categorias: [["Promoções", "promo"], ["Novidades", "new"], ["Perfumaria", "perfume"], ["Maquiagem", "make"], ["Cabelos", "hair"], ["Unhas", "nail"], ["Presentes", "gift"]],
    novidades: VAREJO_NOVIDADES,
    promocoes: VAREJO_PROMOCOES,
    vitrine: { titulo: "Vitrine da semana", texto: "As novidades e promoções que hoje só aparecem nos stories, organizadas num lugar só e atualizadas pela equipe da loja.", aba1: "Novidades", aba2: "Promoções", cta: "Ver novidades" },
    modo: "retire",
    servicos: null,
    resolve: [
      { hoje: "Promoção que some com o story", titulo: "Vitrine sempre no ar", texto: "Novidades e ofertas num endereço que a cliente abre quando quiser." },
      { hoje: "Cliente que compra e não volta", titulo: "Clube de cashback", texto: "Cada compra vira saldo, e o WhatsApp chama a cliente de volta sozinho." },
      { hoje: "Pedido montado mensagem a mensagem", titulo: "Reserva pronta", texto: "A lista chega completa no WhatsApp da loja, é só separar." },
    ],
    calculadora: { clientes: 300, ticket: 60 },
    heroA: HERO_VAREJO_A,
    heroB: HERO_VAREJO_B,
  },
  servicos: {
    selo: ["Agenda online", "aberta 24 horas"],
    titulo: ["Seu horário marcado", "sem precisar ligar."],
    chamada: "Escolha o serviço, o dia e o horário pelo celular. A equipe confirma e um lembrete chega no dia anterior.",
    adesivos: { a: ["Horário confirmado", "Sábado às 10h"], b: ["Lembrete enviado", "Amanhã você tem horário"] },
    categorias: [["Agendar", "agenda"], ["Promoções", "promo"], ["Cabelo", "tesoura"], ["Unhas", "nail"], ["Estética", "skin"], ["Pacotes", "gift"]],
    novidades: SERVICOS_NOVIDADES,
    promocoes: SERVICOS_PROMOCOES,
    vitrine: { titulo: "Serviços e pacotes", texto: "Preços e pacotes claros, para a cliente chegar sabendo o que vai fazer.", aba1: "Serviços", aba2: "Promoções", cta: "Ver serviços" },
    modo: "agenda",
    servicos: ["Corte e finalização", "Manicure e pedicure", "Hidratação profunda"],
    resolve: [
      { hoje: "Agenda no caderno e no WhatsApp", titulo: "Agenda online", texto: "A cliente marca sozinha, no horário livre, sem troca de mensagens." },
      { hoje: "Cliente que esquece e falta", titulo: "Lembrete automático", texto: "Uma mensagem no dia anterior confirma ou libera o horário." },
      { hoje: "Cliente que some depois do serviço", titulo: "Pacote de fidelidade", texto: "Saldo e aviso na hora de voltar, pelo WhatsApp." },
    ],
    calculadora: { clientes: 200, ticket: 80 },
    heroA: [["scissors", "#C9B6FF", "#5B3FA8", "#3B0F2E", 120], ["round", "#FFE08A", "#F2A93B", "#C99A2E", 110], ["nail", "#F7A1B8", "#D94F7A", "#3B0F2E", 128]],
    heroB: [["jar", "#FFD1DF", "#F48FB1", "#A3124F", 80], ["tall", "#FFF6D6", "#F5D47A", "#C99A2E", 120], ["gift", "#B9E3C6", "#4F7F62", "#E9C77B", 90]],
  },
  alimentacao: {
    selo: ["Peça pelo celular", "e retire sem fila"],
    titulo: ["O cardápio na sua mão", "e o pedido pronto."],
    chamada: "Veja o que saiu do forno, monte seu pedido pelo celular e retire no balcão, ou receba em casa.",
    adesivos: { a: ["Saiu do forno", "Pão de fermentação natural"], b: ["Pedido confirmado", "Pronto em 15 minutos"] },
    categorias: [["Promoções", "promo"], ["Padaria", "pao"], ["Cafeteria", "cafe"], ["Encomendas", "box"], ["Novidades", "new"], ["Delivery", "moto"]],
    novidades: ALIMENTACAO_NOVIDADES,
    promocoes: ALIMENTACAO_PROMOCOES,
    vitrine: { titulo: "Cardápio do dia", texto: "O que tem hoje, com preço, atualizado pela equipe em segundos.", aba1: "Cardápio", aba2: "Promoções", cta: "Ver cardápio" },
    modo: "retire",
    servicos: null,
    resolve: [
      { hoje: "Pedido anotado no WhatsApp", titulo: "Pedido pronto", texto: "A lista chega completa, com horário de retirada ou endereço." },
      { hoje: "Encomenda combinada no improviso", titulo: "Encomendas organizadas", texto: "Bolos e salgados com data, quantidade e sinal, sem esquecer nada." },
      { hoje: "Cliente do dia a dia sem cadastro", titulo: "Cartão fidelidade digital", texto: "O décimo café grátis, sem cartão de papel." },
    ],
    calculadora: { clientes: 400, ticket: 25 },
    heroA: [["bread", "#F3D2B8", "#B9763E", "#7A4A1E", 92], ["cup", "#E8C7A8", "#9A5B34", "#9A5B34", 104], ["cake", "#FFD1A6", "#E07B39", "#5A2E0E", 118]],
    heroB: [["plate", "#FFE08A", "#E0A030", "#C2471B", 80], ["cake", "#F7C7D6", "#C2477A", "#5A2E0E", 110], ["bread", "#F3D2B8", "#B9763E", "#7A4A1E", 84]],
  },
  // O modelo do CRM (imobiliárias e outros ramos) ganha página própria na
  // fase 2; até lá usa a estrutura de serviços, com agenda de atendimento.
  crm: {
    selo: ["Atendimento", "no WhatsApp com IA"],
    titulo: ["Seu lead respondido", "em segundos."],
    chamada: "A IA atende o cliente no WhatsApp a qualquer hora, organiza o funil e marca o atendimento na sua agenda.",
    adesivos: { a: ["Lead novo", "Atendido em 8 segundos"], b: ["Visita marcada", "Sábado às 10h"] },
    categorias: [["Leads", "new"], ["Agenda", "agenda"], ["Campanhas", "promo"], ["Funil", "box"]],
    novidades: SERVICOS_NOVIDADES,
    promocoes: SERVICOS_PROMOCOES,
    vitrine: { titulo: "O que a plataforma faz", texto: "Atendimento, funil e agenda num lugar só.", aba1: "Recursos", aba2: "Planos", cta: "Ver como funciona" },
    modo: "agenda",
    servicos: ["Apresentação de 15 minutos", "Teste grátis acompanhado"],
    resolve: [],
    calculadora: null,
    heroA: HERO_VAREJO_A,
    heroB: HERO_VAREJO_B,
  },
};

export function padraoDoModelo(modelo: Modelo): Padrao {
  return PADROES[modelo];
}

export type TextosDoModo = {
  nav: string;
  titulo: string;
  texto: string;
  botao: string;
  passo3Titulo: string;
  passo3Texto: string;
  sacola: string;
  pedidoInicio: string;
  pedidoFim: string;
};

export const TEXTOS_DO_MODO: Record<ModoDoPedido, TextosDoModo> = {
  retire: {
    nav: "Reserve e retire",
    titulo: "Reserve pelo site, retire na loja",
    texto: "Sem frete, sem espera. A cliente separa o que quer e a loja recebe o pedido pronto no WhatsApp.",
    botao: "Reservar na loja",
    passo3Titulo: "Passe e retire",
    passo3Texto: "A equipe confirma e separa tudo. É só chegar e levar.",
    sacola: "Enviar reserva",
    pedidoInicio: "Oi! Quero reservar para retirar na loja:",
    pedidoFim: "Pode separar para mim?",
  },
  entrega: {
    nav: "Receba em casa",
    titulo: "Peça pelo site, receba em casa",
    texto: "A cliente monta o pedido, informa o endereço e a loja recebe tudo pronto no WhatsApp para despachar.",
    botao: "Adicionar ao pedido",
    passo3Titulo: "Receba ou retire",
    passo3Texto: "Entrega rápida na região ou retirada na loja, como a cliente preferir.",
    sacola: "Enviar pedido",
    pedidoInicio: "Oi! Quero fazer um pedido para entrega:",
    pedidoFim: "Endereço: (preenchido no site)\nPagamento: Pix",
  },
  encomenda: {
    nav: "Encomendas",
    titulo: "Encomende pelo site, receba embalado",
    texto: "A cliente escolhe, a loja recebe o pedido completo no WhatsApp e prepara a entrega.",
    botao: "Encomendar",
    passo3Titulo: "Receba em casa",
    passo3Texto: "Embalado e entregue na região, na data combinada.",
    sacola: "Enviar encomenda",
    pedidoInicio: "Oi! Quero encomendar:",
    pedidoFim: "É para presente, pode embalar?",
  },
  agenda: {
    nav: "Como agendar",
    titulo: "Escolha pelo site, confirme no WhatsApp",
    texto: "A cliente escolhe os serviços e a equipe recebe o pedido de horário pronto, sem troca de mensagens.",
    botao: "Quero este",
    passo3Titulo: "Venha no horário",
    passo3Texto: "A equipe confirma o horário e um lembrete chega no dia anterior.",
    sacola: "Pedir horário",
    pedidoInicio: "Oi! Quero marcar horário para:",
    pedidoFim: "Quais horários vocês têm?",
  },
};
