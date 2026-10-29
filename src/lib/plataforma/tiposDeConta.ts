// As duas contas da plataforma: imobiliária e corretor independente.
//
// Módulo PURO. Cada tipo tem o seu formulário (`/plataforma/grupos/novo/
// imobiliaria` e `/plataforma/grupos/novo/independente`), mas os dois acabam
// no MESMO `NovoGrupoValidado` e na mesma action/RPC (`criar_grupo`): aqui só
// se monta e valida o pedido; a regra de criar o grupo continua uma só
// (`validarNovoGrupo`).
//
// Ramo (29/10/2026, 0244): os dois formulários escolhem o ramo do negócio
// (imobiliária, seguros, advocacia... ou "outro" com texto). O TIPO continua
// sendo "com equipe" (imobiliaria) ou "uma pessoa" (independente) — o nome
// técnico ficou; o ramo é o que personaliza o CRM. Fora da imobiliária o
// documento profissional (CRECI-J/F) passa a ser o do ramo e é opcional.

import { normalizarParaEmail } from "@/lib/corretores/credenciaisIniciais";
import { lerDiaDoVencimentoDigitado, lerMensalidadeDigitada } from "@/lib/planos/pagamentosDigitados";
import { validarNovoGrupo, type DadosNovoGrupo, type NovoGrupoValidado } from "./dadosDoGrupo";
import { cnpjValido, cpfValido, soDigitos } from "./documentos";
import type { Plano } from "./rotulosDoGrupo";
import { documentoProfissionalDaFicha, validarRamo, type Ramo } from "@/lib/ramos/ramos";

/** Preços de tabela (desenho multi-grupo §10), em reais por mês. */
export const PRECO_ESSENCIAL = 97;
export const PRECO_PROFISSIONAL = 147;
export const PRECO_POR_USUARIO_DA_IMOBILIARIA = 127;

export const PLANOS_DO_INDEPENDENTE = ["essencial", "profissional"] as const;
export type PlanoDoIndependente = (typeof PLANOS_DO_INDEPENDENTE)[number];

export const USUARIOS_MAXIMO = 500;

export function ehPlanoDoIndependente(valor: string): valor is PlanoDoIndependente {
  return (PLANOS_DO_INDEPENDENTE as readonly string[]).includes(valor);
}

/** A mensalidade que o plano pede. Imobiliária: R$ 127 por usuário; independente: preço fixo. */
export function mensalidadeDoPlano(plano: Plano, usuarios = 1): number {
  switch (plano) {
    case "essencial":
      return PRECO_ESSENCIAL;
    case "profissional":
      return PRECO_PROFISSIONAL;
    case "imobiliaria":
      return PRECO_POR_USUARIO_DA_IMOBILIARIA * Math.max(1, Math.trunc(usuarios) || 1);
    case "custo":
      return 0;
  }
}

/** 127 vira "127,00": o valor como o campo de mensalidade mostra e lê. */
export function mensalidadeComoTexto(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** O endereço sugerido a partir do nome (o formulário usa até o operador mexer). */
export function slugSugerido(nome: string): string {
  return normalizarParaEmail(nome).slice(0, 63).replace(/-+$/, "");
}

/** O que o grupo recebe além do que `criar_grupo` grava (colunas de `grupos`). */
export type CadastroDoGrupo = {
  ramo: Ramo;
  ramo_descricao: string | null;
  razao_social: string | null;
  documento: string;
  /** O documento do grupo; `null` no ramo sem registro obrigatório deixado em branco (0244). */
  creci: string | null;
  creci_tipo: "J" | "F" | null;
  mensalidade: number;
  dia_do_vencimento: number;
};

export type PedidoValidado = { grupo: NovoGrupoValidado; cadastro: CadastroDoGrupo };
export type ResultadoDoPedido = { ok: true; dados: PedidoValidado } | { ok: false; erro: string };

export type FormularioDaImobiliaria = {
  /** O ramo (0244). Ausente = imobiliária (formulário de antes do campo). */
  ramo?: string;
  ramoDescricao?: string;
  nomeFantasia: string;
  slug: string;
  razaoSocial: string;
  cnpj: string;
  creciJ: string;
  usuarios: string;
  mensalidade: string;
  diaDoVencimento: string;
  contatoNome: string;
  contatoEmail: string;
  contatoTelefone: string;
  gestorNome: string;
  gestorEmail: string;
  gestorWhatsapp: string;
};

export type FormularioDoIndependente = {
  /** O ramo (0244). Ausente = imobiliária (formulário de antes do campo). */
  ramo?: string;
  ramoDescricao?: string;
  nome: string;
  slug: string;
  cpf: string;
  creciF: string;
  email: string;
  whatsapp: string;
  plano: string;
  mensalidade: string;
  diaDoVencimento: string;
};

type Lido<T> = { ok: true; valor: T } | { ok: false; erro: string };

function lerUsuarios(texto: string): Lido<number> {
  const limpo = texto.trim();
  if (!/^\d{1,3}$/.test(limpo) || Number(limpo) < 1 || Number(limpo) > USUARIOS_MAXIMO) {
    return { ok: false, erro: `Informe o número de usuários, de 1 a ${USUARIOS_MAXIMO}.` };
  }
  return { ok: true, valor: Number(limpo) };
}

/** Mensalidade em branco = a do plano (calculada). */
function lerMensalidade(texto: string, padrao: number): Lido<number> {
  const lida = lerMensalidadeDigitada(texto);
  if (!lida.ok) return lida;
  return { ok: true, valor: lida.valor ?? padrao };
}

/** O ramo do formulário; ausente vale imobiliária (o formulário de antes). */
function lerRamoDoFormulario(f: { ramo?: string; ramoDescricao?: string }) {
  const r = validarRamo(f.ramo === undefined ? "imobiliaria" : f.ramo, f.ramoDescricao);
  return r.ok ? r : { ok: false as const, erro: r.erro };
}

export function validarImobiliaria(f: FormularioDaImobiliaria): ResultadoDoPedido {
  const ramo = lerRamoDoFormulario(f);
  if (!ramo.ok) return ramo;
  const documento = soDigitos(f.cnpj);
  if (!cnpjValido(documento)) return { ok: false, erro: "CNPJ inválido. Confira os 14 números." };
  const razao = f.razaoSocial.trim().replace(/\s+/g, " ");
  if (razao.length < 3) return { ok: false, erro: "Informe a razão social." };
  // CRECI-J na imobiliária; nos outros ramos, o registro do ramo, opcional.
  const creci = documentoProfissionalDaFicha(ramo.dados.ramo, f.creciJ);
  if (!creci) return { ok: false, erro: "Informe o CRECI-J da imobiliária." };

  const usuarios = lerUsuarios(f.usuarios);
  if (!usuarios.ok) return usuarios;
  const mensalidade = lerMensalidade(f.mensalidade, mensalidadeDoPlano("imobiliaria", usuarios.valor));
  if (!mensalidade.ok) return mensalidade;
  const dia = lerDiaDoVencimentoDigitado(f.diaDoVencimento);
  if (!dia.ok) return dia;

  // O gestor entra com o CRECI da imobiliária na ficha (a ficha exige um).
  const pedido: DadosNovoGrupo = {
    nome: f.nomeFantasia,
    slug: f.slug,
    tipo: "imobiliaria",
    plano: "imobiliaria",
    contatoNome: f.contatoNome,
    contatoEmail: f.contatoEmail,
    contatoTelefone: f.contatoTelefone,
    primeiroNome: f.gestorNome,
    primeiroCreci: creci,
    primeiroWhatsapp: f.gestorWhatsapp,
    primeiroEmail: f.gestorEmail,
  };
  const grupo = validarNovoGrupo(pedido);
  if (!grupo.ok) return grupo;

  return {
    ok: true,
    dados: {
      grupo: grupo.dados,
      cadastro: {
        ramo: ramo.dados.ramo,
        ramo_descricao: ramo.dados.ramoDescricao,
        razao_social: razao,
        documento,
        // No grupo, o documento digitado (o marcador "Não informado" fica só na ficha).
        creci: f.creciJ.trim() ? creci : null,
        creci_tipo: f.creciJ.trim() ? "J" : null,
        mensalidade: mensalidade.valor,
        dia_do_vencimento: dia.valor,
      },
    },
  };
}

/**
 * O corretor independente é UMA pessoa: ele é o gestor do próprio grupo e o
 * contato de cobrança (o pedido sai com o contato em branco, que
 * `validarNovoGrupo` preenche com o primeiro acesso). O grupo leva o nome
 * dele; o CPF é o documento e não há razão social.
 */
export function validarIndependente(f: FormularioDoIndependente): ResultadoDoPedido {
  const ramo = lerRamoDoFormulario(f);
  if (!ramo.ok) return ramo;
  const documento = soDigitos(f.cpf);
  if (!cpfValido(documento)) return { ok: false, erro: "CPF inválido. Confira os 11 números." };
  const creci = documentoProfissionalDaFicha(ramo.dados.ramo, f.creciF);
  if (!creci) return { ok: false, erro: "Informe o CRECI-F do corretor." };
  if (!ehPlanoDoIndependente(f.plano)) return { ok: false, erro: "Escolha o plano: Essencial ou Profissional." };

  const mensalidade = lerMensalidade(f.mensalidade, mensalidadeDoPlano(f.plano));
  if (!mensalidade.ok) return mensalidade;
  const dia = lerDiaDoVencimentoDigitado(f.diaDoVencimento);
  if (!dia.ok) return dia;

  const grupo = validarNovoGrupo({
    nome: f.nome,
    slug: f.slug,
    tipo: "independente",
    plano: f.plano,
    contatoNome: "",
    contatoEmail: "",
    contatoTelefone: "",
    primeiroNome: f.nome,
    primeiroCreci: creci,
    primeiroWhatsapp: f.whatsapp,
    primeiroEmail: f.email,
  });
  if (!grupo.ok) return grupo;

  return {
    ok: true,
    dados: {
      grupo: grupo.dados,
      cadastro: {
        ramo: ramo.dados.ramo,
        ramo_descricao: ramo.dados.ramoDescricao,
        razao_social: null,
        documento,
        creci: f.creciF.trim() ? creci : null,
        creci_tipo: f.creciF.trim() ? "F" : null,
        mensalidade: mensalidade.valor,
        dia_do_vencimento: dia.valor,
      },
    },
  };
}
