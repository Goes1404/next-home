// O pedido de contratação da página de vendas (29/10/2026).
//
// Pedido do dono: "permita a pessoa clicar no plano, e leve ela para as
// próximas telas". Não há gateway de pagamento: o fluxo `/astro/contratar`
// colhe um pedido QUALIFICADO (plano, tamanho da equipe, contato) e a equipe
// da Astro cria a conta pelos formulários de `/plataforma/grupos/novo`.
//
// Módulo PURO: o assistente (navegador) e a action (servidor) validam com as
// MESMAS regras, e a tela da plataforma monta o pré-preenchimento daqui.
// Preços e teto de usuários saem de `tiposDeConta.ts`, os mesmos que a
// plataforma cobra: mudou lá, muda aqui.
//
// Mínimo de usuários da Imobiliária: 1. Nem `tiposDeConta.ts` (`lerUsuarios`
// aceita de 1 a USUARIOS_MAXIMO) nem `limitesDoPlano.ts` declaram mínimo; o
// formulário da plataforma só SUGERE 3. O assistente também sugere 3.

import { normalizarWhatsapp } from "@/lib/whatsapp";
import {
  mensalidadeComoTexto,
  mensalidadeDoPlano,
  PRECO_ESSENCIAL,
  PRECO_POR_USUARIO_DA_IMOBILIARIA,
  PRECO_PROFISSIONAL,
  slugSugerido,
  USUARIOS_MAXIMO,
  type FormularioDaImobiliaria,
  type FormularioDoIndependente,
} from "./tiposDeConta";

export const PLANOS_CONTRATAVEIS = ["essencial", "profissional", "imobiliaria"] as const;
export type PlanoContratavel = (typeof PLANOS_CONTRATAVEIS)[number];

export const USUARIOS_MINIMO = 1;
export const USUARIOS_SUGERIDOS = 3;
export { USUARIOS_MAXIMO };

/** O mínimo de tempo com o formulário aberto antes do envio: menos que isso é robô. */
export const TEMPO_MINIMO_NO_FORMULARIO_MS = 4000;

export const STATUS_DO_PEDIDO = ["novo", "em_contato", "convertido", "descartado"] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

export const ROTULO_DO_STATUS: Record<StatusDoPedido, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  convertido: "Convertido",
  descartado: "Descartado",
};

export function ehStatusDoPedido(valor: unknown): valor is StatusDoPedido {
  return typeof valor === "string" && (STATUS_DO_PEDIDO as readonly string[]).includes(valor);
}

/** O que a página de vendas mostra de cada plano (nome comercial e preço). */
export const PLANO_CONTRATAVEL: Record<
  PlanoContratavel,
  { nome: string; resumo: string; preco: number; porUsuario: boolean }
> = {
  essencial: {
    nome: "Autônomo Essencial",
    resumo: "Para o corretor que trabalha sozinho e quer a IA atendendo por ele.",
    preco: PRECO_ESSENCIAL,
    porUsuario: false,
  },
  profissional: {
    nome: "Autônomo Profissional",
    resumo: "Para quem anuncia toda semana e precisa de mais artes, vídeos e listas.",
    preco: PRECO_PROFISSIONAL,
    porUsuario: false,
  },
  imobiliaria: {
    nome: "Imobiliária",
    resumo: "Equipe, gestor, roleta de leads, site próprio e a marca da imobiliária no CRM.",
    preco: PRECO_POR_USUARIO_DA_IMOBILIARIA,
    porUsuario: true,
  },
};

export function ehPlanoContratavel(valor: unknown): valor is PlanoContratavel {
  return typeof valor === "string" && (PLANOS_CONTRATAVEIS as readonly string[]).includes(valor);
}

/** `?plano=` da URL: só os três ids conhecidos; o resto vira "nenhum escolhido". */
export function lerPlanoDaUrl(valor: string | string[] | null | undefined): PlanoContratavel | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return ehPlanoContratavel(v) ? v : null;
}

/** O link do cartão do plano para o assistente. */
export function hrefDeContratar(plano: PlanoContratavel): string {
  return `/astro/contratar?plano=${plano}`;
}

/** Usuários dentro da faixa (inteiro, de 1 a 500). Lixo vira o mínimo. */
export function limitarUsuarios(n: number): number {
  if (!Number.isFinite(n)) return USUARIOS_MINIMO;
  return Math.min(USUARIOS_MAXIMO, Math.max(USUARIOS_MINIMO, Math.trunc(n)));
}

/** O total por mês: preço fixo no autônomo, R$ 127 x usuários na imobiliária. */
export function totalMensal(plano: PlanoContratavel, usuarios: number): number {
  return mensalidadeDoPlano(plano, plano === "imobiliaria" ? limitarUsuarios(usuarios) : 1);
}

export function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
export type Uf = (typeof UFS)[number];

export function ehUf(valor: unknown): valor is Uf {
  return typeof valor === "string" && (UFS as readonly string[]).includes(valor);
}

/** "11987654321" → "(11) 98765-4321", conforme a pessoa digita. Aceita o 55 na frente. */
export function mascararWhatsapp(bruto: string): string {
  let d = bruto.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  // Celular (9 dígitos depois do DDD) quebra em 5+4; fixo em 4+4.
  const corte = resto.length > 8 ? 5 : 4;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/**
 * O WhatsApp brasileiro em dígitos com o 55 (`normalizarWhatsapp`), ou
 * `null`. Além do que `normalizarWhatsapp` confere: DDD de 11 a 99 e, no
 * celular de 11 dígitos, o 9 na frente. Fixo (10 dígitos) passa: há
 * WhatsApp Business em número fixo.
 */
export function whatsappValido(bruto: string): string | null {
  const n = normalizarWhatsapp(bruto);
  if (!n) return null;
  const local = n.slice(2);
  if (local.length !== 10 && local.length !== 11) return null;
  if (local[0] === "0" || local[1] === "0") return null;
  if (local.length === 11 && local[2] !== "9") return null;
  if (/^(\d)\1+$/.test(local.slice(2))) return null;
  return n;
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** A mesma régua de e-mail do pedido, para o contato do site (0240) não ter outra. */
export function emailValido(email: string): boolean {
  return EMAIL.test(email) && email.length <= 200;
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

/** O que o assistente manda ao servidor (tudo texto/número vindo do navegador). */
export type DadosDoPedido = {
  plano: string;
  usuarios: number;
  nome: string;
  whatsapp: string;
  email: string;
  imobiliaria: string;
  creci: string;
  cidade: string;
  uf: string;
};

export const DADOS_VAZIOS: DadosDoPedido = {
  plano: "",
  usuarios: USUARIOS_SUGERIDOS,
  nome: "",
  whatsapp: "",
  email: "",
  imobiliaria: "",
  creci: "",
  cidade: "",
  uf: "",
};

/** O pedido limpo, pronto para gravar. */
export type PedidoLimpo = {
  plano: PlanoContratavel;
  usuarios: number;
  nome: string;
  /** Dígitos com o 55. */
  whatsapp: string;
  email: string;
  imobiliaria: string | null;
  creci: string | null;
  cidade: string;
  uf: Uf;
};

export type CampoDoPedido = keyof DadosDoPedido;
export type ErrosDoPedido = Partial<Record<CampoDoPedido, string>>;

/** Os campos de cada passo do assistente (o 3º é a revisão, sem campo). */
export const CAMPOS_DO_PASSO: Record<1 | 2, CampoDoPedido[]> = {
  1: ["plano", "usuarios"],
  2: ["nome", "whatsapp", "email", "imobiliaria", "creci", "cidade", "uf"],
};

/**
 * Confere tudo e devolve o pedido limpo ou um erro por campo. O navegador
 * usa os erros para marcar os campos; o servidor, para recusar.
 */
export function validarPedido(d: Partial<DadosDoPedido>): { ok: true; pedido: PedidoLimpo } | { ok: false; erros: ErrosDoPedido } {
  const erros: ErrosDoPedido = {};
  const plano = ehPlanoContratavel(d.plano) ? d.plano : null;
  if (!plano) erros.plano = "Escolha um dos planos.";

  let usuarios = 1;
  if (plano === "imobiliaria") {
    const n = Number(d.usuarios);
    if (!Number.isInteger(n) || n < USUARIOS_MINIMO || n > USUARIOS_MAXIMO) {
      erros.usuarios = `Informe de ${USUARIOS_MINIMO} a ${USUARIOS_MAXIMO} usuários.`;
    } else {
      usuarios = n;
    }
  }

  const nome = texto(d.nome, 120);
  if (nome.length < 3 || !nome.includes(" ")) erros.nome = "Informe nome e sobrenome.";
  else if (nome.length > 120) erros.nome = "Nome longo demais.";

  const whatsapp = whatsappValido(typeof d.whatsapp === "string" ? d.whatsapp : "");
  if (!whatsapp) erros.whatsapp = "Informe um WhatsApp com DDD, como (11) 98765-4321.";

  const email = texto(d.email, 200).toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) erros.email = "Informe um e-mail válido.";

  const imobiliaria = texto(d.imobiliaria, 120);
  if (plano === "imobiliaria") {
    if (imobiliaria.length < 2) erros.imobiliaria = "Informe o nome da imobiliária.";
    else if (imobiliaria.length > 120) erros.imobiliaria = "Nome longo demais.";
  }

  const creci = texto(d.creci, 30);
  if (creci.length > 30) erros.creci = "CRECI longo demais.";

  const cidade = texto(d.cidade, 80);
  if (cidade.length < 2) erros.cidade = "Informe a cidade.";
  else if (cidade.length > 80) erros.cidade = "Nome da cidade longo demais.";

  const uf = typeof d.uf === "string" ? d.uf.trim().toUpperCase() : "";
  if (!ehUf(uf)) erros.uf = "Escolha o estado.";

  if (Object.keys(erros).length > 0 || !plano || !whatsapp || !ehUf(uf)) return { ok: false, erros };
  return {
    ok: true,
    pedido: {
      plano,
      usuarios,
      nome,
      whatsapp,
      email,
      imobiliaria: plano === "imobiliaria" ? imobiliaria : null,
      creci: creci || null,
      cidade,
      uf,
    },
  };
}

/** Só os erros dos campos de um passo (o assistente não avança com eles). */
export function errosDoPasso(passo: 1 | 2, d: Partial<DadosDoPedido>): ErrosDoPedido {
  const r = validarPedido(d);
  if (r.ok) return {};
  const saida: ErrosDoPedido = {};
  for (const campo of CAMPOS_DO_PASSO[passo]) if (r.erros[campo]) saida[campo] = r.erros[campo];
  return saida;
}

/** "Ana Paula Souza" → "Ana". */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/** A linha do plano: "Imobiliária, 5 usuários (R$ 635 por mês)". */
export function resumoDoPlano(plano: PlanoContratavel, usuarios: number): string {
  const total = reais(totalMensal(plano, usuarios));
  if (plano !== "imobiliaria") return `${PLANO_CONTRATAVEL[plano].nome} (${total} por mês)`;
  const n = limitarUsuarios(usuarios);
  return `${PLANO_CONTRATAVEL[plano].nome}, ${n} ${n === 1 ? "usuário" : "usuários"} (${total} por mês)`;
}

/**
 * A mensagem pronta do botão "Falar agora no WhatsApp": resume o pedido para
 * a Astro achar a linha na plataforma. Sem e-mail nem CRECI (o WhatsApp já
 * identifica quem escreve).
 */
export function mensagemDoPedidoParaAstro(p: Pick<PedidoLimpo, "plano" | "usuarios" | "nome" | "imobiliaria" | "cidade" | "uf">): string {
  const linhas = [
    `Olá! Acabei de pedir o plano ${resumoDoPlano(p.plano, p.usuarios)} pelo site.`,
    `Sou ${p.nome}${p.imobiliaria ? `, da ${p.imobiliaria}` : ""}, de ${p.cidade}/${p.uf}.`,
  ];
  // Espaço comum no lugar do inquebrável do "R$ 97": a mensagem é texto do WhatsApp.
  return linhas.join("\n").replace(/\u00a0/g, " ");
}

/** Para log: nunca o dado pessoal inteiro. "5511987654321" → "55119****4321". */
export function mascararParaLog(whatsapp: string): string {
  if (whatsapp.length < 8) return "****";
  return `${whatsapp.slice(0, 5)}****${whatsapp.slice(-4)}`;
}

// ── Pré-preenchimento dos formulários da plataforma ────────────────────────

/** A linha de `pedidos_de_contratacao` que o pré-preenchimento usa. */
export type PedidoGravado = {
  plano: string;
  usuarios: number;
  nome: string;
  whatsapp: string;
  email: string;
  imobiliaria: string | null;
  creci: string | null;
};

/** O "Novo corretor independente" já com o que a pessoa contou no pedido. */
export function formularioDoIndependenteDoPedido(p: PedidoGravado): Partial<FormularioDoIndependente> {
  const plano = p.plano === "profissional" ? "profissional" : "essencial";
  return {
    nome: p.nome,
    slug: slugSugerido(p.nome),
    creciF: p.creci ?? "",
    email: p.email,
    whatsapp: mascararWhatsapp(p.whatsapp),
    plano,
    mensalidade: mensalidadeComoTexto(mensalidadeDoPlano(plano)),
  };
}

/** A "Nova imobiliária" já com o que a pessoa contou: ela é o contato e o primeiro gestor. */
export function formularioDaImobiliariaDoPedido(p: PedidoGravado): Partial<FormularioDaImobiliaria> {
  const usuarios = limitarUsuarios(p.usuarios);
  const nome = p.imobiliaria ?? "";
  return {
    nomeFantasia: nome,
    slug: slugSugerido(nome),
    creciJ: p.creci ?? "",
    usuarios: String(usuarios),
    mensalidade: mensalidadeComoTexto(mensalidadeDoPlano("imobiliaria", usuarios)),
    contatoNome: p.nome,
    contatoEmail: p.email,
    contatoTelefone: mascararWhatsapp(p.whatsapp),
    gestorNome: p.nome,
    gestorEmail: p.email,
    gestorWhatsapp: mascararWhatsapp(p.whatsapp),
  };
}

/** O formulário de criar conta que corresponde ao plano do pedido. */
export function hrefDeCriarConta(pedido: { id: string; plano: string }): string {
  const tipo = pedido.plano === "imobiliaria" ? "imobiliaria" : "independente";
  return `/plataforma/grupos/novo/${tipo}?pedido=${pedido.id}`;
}
