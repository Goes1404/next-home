import { MENSAGEM_ENDERECO_DE_ACESSO } from "@/lib/corretores/acessoDaConta";
import { limparEmail } from "@/lib/corretores/convite";
import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";
import { validarSlugDoGrupo } from "@/lib/grupos/slugDoGrupo";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { ehPlano, ehTipoDeGrupo, type Plano, type TipoDeGrupo } from "./rotulosDoGrupo";

/**
 * A validação dos formulários da plataforma (fase 2A, Task 6).
 *
 * Roda na action ANTES do banco: `criar_grupo` e os CHECKs de `grupos`
 * também recusam tipo, plano, slug e documento fora da regra, mas com o erro
 * cru do Postgres ("violates check constraint …"), que não diz ao operador o
 * que corrigir. Aqui cada recusa tem uma frase.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de grupo vindo da tela: fora do formato, nem vai ao banco. */
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

/**
 * O e-mail como padrão de `ilike` que só casa com ele mesmo. `%`, `_` e a
 * barra invertida são escapados. O `*` não tem escape: o PostgREST troca
 * todo `*` por `%` antes do Postgres, inclusive o escapado. Ele vira `_`
 * (um caractere qualquer): casa com o próprio `*`, e o pior caso é acusar
 * "em uso" um endereço que difere só nessa letra.
 */
export function padraoDoEmail(email: string): string {
  return email.replace(/[\\%_]/g, (c) => "\\" + c).replaceAll("*", "_");
}

export type DadosNovoGrupo = {
  nome: string;
  slug: string;
  tipo: string;
  plano: string;
  contatoNome: string;
  contatoEmail: string;
  contatoTelefone: string;
  primeiroNome: string;
  primeiroCreci: string;
  primeiroWhatsapp: string;
  primeiroEmail: string;
};

export type NovoGrupoValidado = {
  nome: string;
  slug: string;
  tipo: TipoDeGrupo;
  plano: Plano;
  contato: { nome: string; email: string; telefone: string | null };
  primeiro: { nome: string; creci: string; whatsapp: string; email: string };
};

export type DadosDoGrupo = {
  contatoNome: string;
  contatoEmail: string;
  contatoTelefone: string;
  razaoSocial: string;
  documento: string;
  creci: string;
  creciTipo: string;
  encarregadoNome: string;
  encarregadoEmail: string;
};

/** As colunas de `grupos` que a tela de grupo edita. Plano, tipo e slug, não. */
export type DadosDoGrupoValidados = {
  contato_cobranca_nome: string | null;
  contato_cobranca_email: string | null;
  contato_cobranca_telefone: string | null;
  razao_social: string | null;
  documento: string | null;
  creci: string | null;
  creci_tipo: "J" | "F" | null;
  encarregado_lgpd_nome: string | null;
  encarregado_lgpd_email: string | null;
};

type Validacao<T> = { ok: true; dados: T } | { ok: false; erro: string };

const ERRO_DO_ENDERECO =
  "Endereço inválido: use de 3 a 63 letras minúsculas, números e hífen, sem hífen nas pontas.";

/** Texto com espaços repetidos colapsados; vazio vira `null`. */
function texto(valor: string): string | null {
  const limpo = valor.trim().replace(/\s+/g, " ");
  return limpo === "" ? null : limpo;
}

/** E-mail opcional: vazio é `null`; preenchido tem de valer. `undefined` = inválido. */
function emailOpcional(valor: string): string | null | undefined {
  if (valor.trim() === "") return null;
  return limparEmail(valor) ?? undefined;
}

/** Telefone opcional, no formato que o resto do sistema usa (`55` + DDD + número). */
function telefoneOpcional(valor: string): string | null | undefined {
  if (valor.trim() === "") return null;
  const n = normalizarTelefoneBr(valor);
  return n && n.length >= 12 && n.length <= 13 ? n : undefined;
}

export function validarNovoGrupo(d: DadosNovoGrupo): Validacao<NovoGrupoValidado> {
  const nome = texto(d.nome);
  if (!nome || nome.length < 3) return { ok: false, erro: "Informe o nome do grupo." };

  const slug = d.slug.trim().toLowerCase();
  const slugValido = validarSlugDoGrupo(slug);
  if (!slugValido.ok) {
    return {
      ok: false,
      erro:
        slugValido.motivo === "reservado"
          ? "Esse endereço é reservado pela plataforma. Escolha outro."
          : ERRO_DO_ENDERECO,
    };
  }

  if (!ehTipoDeGrupo(d.tipo)) return { ok: false, erro: "Escolha o tipo do grupo." };
  if (!ehPlano(d.plano)) return { ok: false, erro: "Escolha o plano." };

  const primeiroNome = texto(d.primeiroNome);
  if (!primeiroNome || primeiroNome.length < 3) return { ok: false, erro: "Informe o nome do primeiro acesso." };
  const creci = texto(d.primeiroCreci);
  if (!creci) return { ok: false, erro: "Informe o CRECI do primeiro acesso." };
  const whatsapp = normalizarTelefoneBr(d.primeiroWhatsapp);
  if (!whatsapp || whatsapp.length < 12 || whatsapp.length > 13) {
    return { ok: false, erro: "WhatsApp inválido. Use DDD + número, por exemplo (11) 98765-4321." };
  }
  const email = limparEmail(d.primeiroEmail);
  if (!email) return { ok: false, erro: "E-mail do primeiro acesso inválido." };
  if (ehEmailDeAcesso(email)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };

  // Contato de cobrança: todo em branco = o primeiro acesso (o caso do
  // independente, que é quem paga); preenchido, nome e e-mail valem.
  const semContato = [d.contatoNome, d.contatoEmail, d.contatoTelefone].every((v) => v.trim() === "");
  let contato: NovoGrupoValidado["contato"];
  if (semContato) {
    contato = { nome: primeiroNome, email, telefone: whatsapp };
  } else {
    const contatoNome = texto(d.contatoNome);
    const contatoEmail = limparEmail(d.contatoEmail);
    const contatoTelefone = telefoneOpcional(d.contatoTelefone);
    if (!contatoNome) return { ok: false, erro: "Informe o nome do contato de cobrança." };
    if (!contatoEmail) return { ok: false, erro: "E-mail do contato de cobrança inválido." };
    if (contatoTelefone === undefined) return { ok: false, erro: "Telefone do contato de cobrança inválido." };
    contato = { nome: contatoNome, email: contatoEmail, telefone: contatoTelefone };
  }

  return {
    ok: true,
    dados: {
      nome,
      slug,
      tipo: d.tipo,
      plano: d.plano,
      contato,
      primeiro: { nome: primeiroNome, creci, whatsapp, email },
    },
  };
}

export function validarDadosDoGrupo(d: DadosDoGrupo): Validacao<DadosDoGrupoValidados> {
  const contatoEmail = emailOpcional(d.contatoEmail);
  if (contatoEmail === undefined) return { ok: false, erro: "E-mail do contato de cobrança inválido." };
  const contatoTelefone = telefoneOpcional(d.contatoTelefone);
  if (contatoTelefone === undefined) return { ok: false, erro: "Telefone do contato de cobrança inválido." };

  // Mesma regra do CHECK `grupos_documento_check`: 11 (CPF) ou 14 (CNPJ) dígitos.
  const digitos = d.documento.replace(/\D/g, "");
  if (digitos !== "" && digitos.length !== 11 && digitos.length !== 14) {
    return { ok: false, erro: "CPF ou CNPJ inválido: informe 11 ou 14 dígitos." };
  }

  const creciTipo = d.creciTipo.trim().toUpperCase();
  if (creciTipo !== "" && creciTipo !== "J" && creciTipo !== "F") {
    return { ok: false, erro: "Tipo do CRECI inválido: J (empresa) ou F (pessoa)." };
  }

  const encarregadoEmail = emailOpcional(d.encarregadoEmail);
  if (encarregadoEmail === undefined) return { ok: false, erro: "E-mail do encarregado de dados inválido." };

  return {
    ok: true,
    dados: {
      contato_cobranca_nome: texto(d.contatoNome),
      contato_cobranca_email: contatoEmail,
      contato_cobranca_telefone: contatoTelefone,
      razao_social: texto(d.razaoSocial),
      documento: digitos === "" ? null : digitos,
      creci: texto(d.creci),
      creci_tipo: creciTipo === "" ? null : (creciTipo as "J" | "F"),
      encarregado_lgpd_nome: texto(d.encarregadoNome),
      encarregado_lgpd_email: encarregadoEmail,
    },
  };
}
