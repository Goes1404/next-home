import "server-only";

import {
  arquivarLeadCadastradoPeloCentral,
  atualizarFichaPeloCentral,
  cadastrarLeadPeloCentral,
  desfazerAtualizacaoPeloCentral,
  lerFichaNoGrupo,
  mudancasReais,
  nomeDoDono,
  ondeEstaOTelefone,
  valorNaFicha,
  type CampoDaFicha,
  type LeadNovo,
  type OndeOTelefoneEsta,
  type RegistroDaAtualizacao,
  type ValoresDaFicha,
} from "@/lib/crm/leadPeloCentral";
import { formatarTelefoneBr, normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import { formatarMoedaBRL, normalizarPrecoBRL } from "@/lib/precos/moneyUtils";
import { createServiceClient } from "@/lib/supabase/service";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import type { Acao, Consulta, ContextoDoCentral } from "../executar";
import { resolverLead, respostaDeLeadIncerto } from "./resolverLead";

/**
 * Frente B — ações de lead da onda 1: cadastrar_lead (1), atualizar_lead (2).
 *
 * Contrato em `../executar.ts`: `preparar` resolve no banco e NUNCA grava;
 * depois do "sim", `executar` grava só com os `dados` resolvidos; `desfazer`
 * volta atrás (spec 4.6). Toda escrita passa pelas funções de domínio de
 * `@/lib/crm/leadPeloCentral`, que conferem grupo e dono de novo: o
 * contexto vem da identificação, e o que a IA escreveu só serve para achar.
 *
 * A foto (cadastrar_lead_da_foto) chama `cadastrar_lead.preparar` com
 * `{ nome, telefone, observacao }` lidos da imagem: são os mesmos nomes dos
 * argumentos do catálogo e não podem mudar sem ela.
 */

type Supa = ReturnType<typeof createServiceClient>;

const reais = (n: number) => formatarMoedaBRL(n).replace(/\s/g, " ");

/** Texto do cérebro, aparado e com teto. Vazio vira `null`. */
function texto(v: unknown, teto: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, teto) : null;
}

/** "5 mil", "R$ 5.000", 5000: o cérebro manda de qualquer jeito. */
function valor(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  return normalizarPrecoBRL(v);
}

function dormitorios(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

export type TelefoneLido = { tipo: "ok"; telefone: string; e164: string } | { tipo: "incompleto" } | { tipo: "invalido" } | { tipo: "faltou" };

/**
 * O telefone do cadastro tem de vir INTEIRO, com DDD (spec 3.1): o final do
 * número ("o final é 0000") não identifica ninguém. Abaixo de 10 dígitos não
 * se completa nada, nem com o DDD 11 que a importação presume: aqui quem
 * digita está conversando e pode mandar o número certo.
 */
export function lerTelefone(v: unknown): TelefoneLido {
  const bruto = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return { tipo: "faltou" };
  if (digitos.length < 10) return { tipo: "incompleto" };
  const e164 = normalizarTelefoneBrasileiro(bruto);
  if (!e164 || !e164.startsWith("55") || (e164.length !== 12 && e164.length !== 13)) return { tipo: "invalido" };
  return { tipo: "ok", telefone: formatarTelefoneBr(e164), e164 };
}

/** A resposta (sem proposta) quando o telefone já é lead no grupo. */
function respostaDeTelefoneExistente(onde: Exclude<OndeOTelefoneEsta, { onde: "em_nenhuma" | "nao_sei" }>, telefone: string): unknown {
  if (onde.onde === "na_dele") {
    return {
      jaExiste: true,
      mensagem: onde.arquivado
        ? `O ${telefone} já é o seu cliente ${onde.nome}, que está arquivado. Não cadastrei de novo: dá para restaurar no painel.`
        : `O ${telefone} já é o seu cliente ${onde.nome}. Não cadastrei de novo.`,
    };
  }
  // Regra de hoje (N6, como na palavra-chave): não duplica nem muda de
  // carteira; quem pediu fica sabendo de quem é (spec 3.1).
  return {
    jaExiste: true,
    mensagem: `O ${telefone} já é cliente ${onde.dono ? `de ${onde.dono}` : "de outro corretor"} na imobiliária. Não cadastrei para não duplicar; fale com ${onde.dono ?? "o gestor"} se o cliente deve ser seu.`,
  };
}

function resumoDoCadastro(l: LeadNovo, origem: string | null): string {
  const partes = [l.nome, l.telefone];
  if (l.regiaoInteresse) partes.push(l.regiaoInteresse);
  if (l.rendaMensal !== null) partes.push(`renda ${reais(l.rendaMensal)}`);
  if (l.orcamentoMax !== null) partes.push(`orçamento ${reais(l.orcamentoMax)}`);
  if (l.dormitoriosMin !== null) partes.push(`${l.dormitoriosMin} ${l.dormitoriosMin === 1 ? "dormitório" : "dormitórios"}`);
  if (origem) partes.push(`veio de ${origem}`);
  return `Cadastrar ${partes.join(", ")}`;
}

/** Os `dados` do cadastro: o lead já normalizado, que é só o que o "sim" grava. */
function comoLeadNovo(d: Record<string, unknown>): LeadNovo | null {
  const nome = texto(d.nome, 120);
  const telefone = texto(d.telefone, 40);
  const telefoneE164 = texto(d.telefoneE164, 20);
  if (!nome || !telefone || !telefoneE164) return null;
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    nome,
    telefone,
    telefoneE164,
    regiaoInteresse: texto(d.regiaoInteresse, 120),
    rendaMensal: numero(d.rendaMensal),
    orcamentoMax: numero(d.orcamentoMax),
    dormitoriosMin: numero(d.dormitoriosMin),
    mensagem: texto(d.mensagem, 2000),
  };
}

// ── atualizar_lead ─────────────────────────────────────────────────────────

const ROTULO_DO_CAMPO: Record<CampoDaFicha, string> = {
  etapa: "etapa",
  renda_mensal: "renda",
  orcamento_max: "orçamento",
  regiao_interesse: "região",
};

function valorLegivel(campo: CampoDaFicha, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (campo === "etapa") return ETAPA_LABEL[v as EtapaFunil] ?? String(v);
  if (campo === "renda_mensal" || campo === "orcamento_max") return reais(Number(v));
  return String(v);
}

/** "etapa Mensagem enviada → Documentação; renda R$ 6.200": o antes só aparece se havia. */
function descreverMudancas(antes: ValoresDaFicha, depois: ValoresDaFicha): string[] {
  return (Object.keys(depois) as CampoDaFicha[]).map((c) => {
    const de = antes[c];
    const para = valorLegivel(c, depois[c]);
    return de === null || de === undefined || de === "" ? `${ROTULO_DO_CAMPO[c]} ${para}` : `${ROTULO_DO_CAMPO[c]} ${valorLegivel(c, de)} → ${para}`;
  });
}

/** O que o cérebro pediu, nas colunas da ficha. Etapa fora do funil é ignorada. */
function mudancasPedidas(a: Record<string, unknown>): ValoresDaFicha {
  const m: ValoresDaFicha = {};
  const etapa = texto(a.etapa, 40)?.toLowerCase();
  if (etapa && (ETAPAS_FUNIL as readonly string[]).includes(etapa)) m.etapa = etapa;
  const renda = valor(a.renda);
  if (renda !== null) m.renda_mensal = renda;
  const orcamento = valor(a.orcamento);
  if (orcamento !== null) m.orcamento_max = orcamento;
  const regiao = texto(a.regiao, 120);
  if (regiao) m.regiao_interesse = regiao;
  return m;
}

/** Os `dados` da atualização, de volta do JSON da proposta. */
function mudancasDosDados(v: unknown): ValoresDaFicha {
  if (!v || typeof v !== "object") return {};
  const d = v as Record<string, unknown>;
  const m: ValoresDaFicha = {};
  if (typeof d.etapa === "string" && (ETAPAS_FUNIL as readonly string[]).includes(d.etapa)) m.etapa = d.etapa;
  if (typeof d.renda_mensal === "number") m.renda_mensal = d.renda_mensal;
  if (typeof d.orcamento_max === "number") m.orcamento_max = d.orcamento_max;
  if (typeof d.regiao_interesse === "string") m.regiao_interesse = d.regiao_interesse;
  return m;
}

/** Corretor: só a carteira dele. Gestor: o grupo inteiro (`null`). */
const soDoCorretor = (ctx: ContextoDoCentral) => (ctx.papel === "gestor" ? null : ctx.corretorId);

// ── As ações ──────────────────────────────────────────────────────────────

/**
 * As ações com o banco por parâmetro: o teste passa o banco falso; em
 * produção é a chave de serviço, uma por chamada.
 */
export function criarAcoesDeLeads(banco: () => Supa = () => createServiceClient()): Record<string, Acao> {
  const cadastrar_lead: Acao = {
    async preparar(ctx, a) {
      const nome = texto(a.nome, 120);
      if (!nome || nome.length < 2) return { tipo: "resposta", resultado: { erro: "Falta o nome do cliente. Peça o nome para cadastrar." } };
      const tel = lerTelefone(a.telefone);
      if (tel.tipo === "faltou" || tel.tipo === "incompleto") {
        return {
          tipo: "resposta",
          resultado: { erro: "Preciso do telefone inteiro do cliente, com DDD (ex.: 11 98765-4321). Só o final do número não identifica ninguém." },
        };
      }
      if (tel.tipo === "invalido") {
        return { tipo: "resposta", resultado: { erro: "Esse telefone não parece um número válido. Peça o número com DDD." } };
      }

      const supabase = banco();
      const onde = await ondeEstaOTelefone(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, telefoneE164: tel.e164 });
      if (onde.onde === "nao_sei") return { tipo: "resposta", resultado: { erro: "Não consegui conferir se esse telefone já é cliente. Tente de novo em instantes." } };
      if (onde.onde !== "em_nenhuma") return { tipo: "resposta", resultado: respostaDeTelefoneExistente(onde, tel.telefone) };

      const origem = texto(a.origem, 80);
      const observacao = texto(a.observacao, 1800);
      const lead: LeadNovo = {
        nome,
        telefone: tel.telefone,
        telefoneE164: tel.e164,
        regiaoInteresse: texto(a.regiao, 120),
        rendaMensal: valor(a.renda),
        orcamentoMax: valor(a.orcamento),
        dormitoriosMin: dormitorios(a.dormitorios),
        // A origem que a pessoa disse ("indicação", "plantão") vai no texto da
        // ficha: a coluna `origem` é código que os gráficos e a etiqueta leem.
        mensagem: [origem ? `Veio de: ${origem}` : null, observacao].filter(Boolean).join("\n") || null,
      };
      return { tipo: "proposta", resumo: resumoDoCadastro(lead, origem), dados: { ...lead } };
    },

    async executar(ctx, dados) {
      const lead = comoLeadNovo(dados);
      if (!lead) return { ok: false, texto: "Não consegui cadastrar: faltou nome ou telefone." };
      const r = await cadastrarLeadPeloCentral(banco(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, lead });
      if (r.desfecho === "ja_existe") {
        const msg = respostaDeTelefoneExistente(r.onde, lead.telefone) as { mensagem: string };
        return { ok: false, texto: msg.mensagem };
      }
      if (r.desfecho === "falhou") return { ok: false, texto: `Não consegui cadastrar ${lead.nome} agora.` };
      return { ok: true, texto: `${lead.nome} cadastrado na sua carteira.`, desfazer: { leadId: r.leadId, nome: lead.nome } };
    },

    async desfazer(ctx, d) {
      const leadId = texto(d.leadId, 64);
      const nome = texto(d.nome, 120) ?? "o cliente";
      if (!leadId) return { ok: false, texto: "Não sei qual cadastro desfazer." };
      const r = await arquivarLeadCadastradoPeloCentral(banco(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, leadId });
      return r.ok
        ? { ok: true, texto: `Desfeito: ${nome} foi arquivado (não apagado; dá para restaurar no painel).` }
        : { ok: false, texto: `Não consegui desfazer o cadastro de ${nome}: ele já foi arquivado ou não está mais na sua carteira.` };
    },
  };

  const atualizar_lead: Acao = {
    async preparar(ctx, a) {
      const pedido = texto(a.lead, 120);
      if (!pedido) return { tipo: "resposta", resultado: { erro: "Qual cliente? Peça o nome ou o telefone." } };
      const mudancas = mudancasPedidas(a);
      const anotacao = texto(a.anotacao, 2000);
      if (Object.keys(mudancas).length === 0 && !anotacao) {
        return { tipo: "resposta", resultado: { erro: "Não entendi o que mudar na ficha: etapa, renda, orçamento, região ou uma anotação?" } };
      }

      const supabase = banco();
      const achado = await resolverLead(ctx, pedido, supabase);
      if (achado.tipo !== "um") return { tipo: "resposta", resultado: respostaDeLeadIncerto(achado, pedido) };
      const ficha = await lerFichaNoGrupo(supabase, { grupoId: ctx.grupoId, leadId: achado.lead.id, soDoCorretor: soDoCorretor(ctx) });
      if (!ficha) return { tipo: "resposta", resultado: respostaDeLeadIncerto({ tipo: "nenhum" }, pedido) };

      // "Visita marcada" sem a data seria mentira na ficha (o mesmo cuidado
      // do retorno pelo grupo): a data vem pela ferramenta de visita.
      if (mudancas.etapa === "visita_agendada" && ficha.etapa !== "visita_agendada" && !ficha.visitaAgendadaEm) {
        return {
          tipo: "resposta",
          resultado: { erro: `Para pôr ${ficha.nome} em visita marcada, preciso do dia e da hora: marque a visita.` },
        };
      }

      const reaisMudancas = mudancasReais(ficha, mudancas);
      if (Object.keys(reaisMudancas).length === 0 && !anotacao) {
        return { tipo: "resposta", resultado: { mensagem: `A ficha de ${ficha.nome} já está assim; nada a mudar.` } };
      }

      const antes: ValoresDaFicha = {};
      for (const c of Object.keys(reaisMudancas) as CampoDaFicha[]) antes[c] = valorNaFicha(ficha, c);
      const partes = descreverMudancas(antes, reaisMudancas);
      if (anotacao) partes.push(`anotação "${anotacao}"`);
      // O gestor mexendo no lead de outra pessoa vê de quem é antes do "sim".
      const dono =
        ctx.papel === "gestor" && ficha.corretorId && ficha.corretorId !== ctx.corretorId
          ? await nomeDoDono(supabase, ctx.grupoId, ficha.corretorId)
          : null;
      return {
        tipo: "proposta",
        resumo: `${ficha.nome}${dono ? ` (cliente de ${dono})` : ""}: ${partes.join("; ")}`,
        dados: { leadId: ficha.id, nome: ficha.nome, mudancas: reaisMudancas, anotacao },
      };
    },

    async executar(ctx, dados) {
      const leadId = texto(dados.leadId, 64);
      const nome = texto(dados.nome, 120) ?? "o cliente";
      if (!leadId) return { ok: false, texto: "Não sei qual cliente atualizar." };
      const r = await atualizarFichaPeloCentral(banco(), {
        grupoId: ctx.grupoId,
        leadId,
        autorId: ctx.corretorId,
        soDoCorretor: soDoCorretor(ctx),
        mudancas: mudancasDosDados(dados.mudancas),
        anotacao: texto(dados.anotacao, 2000),
      });
      if (r.desfecho === "nao_achou") return { ok: false, texto: `Não achei mais ${nome} na sua carteira; nada foi mudado.` };
      if (r.desfecho === "nada_mudou") return { ok: true, texto: `A ficha de ${nome} já estava assim.` };
      const partes = descreverMudancas(r.registro.antes, r.registro.depois);
      if (r.registro.notaId) partes.push("anotação feita");
      const aviso = r.anotacaoFalhou ? " A anotação não entrou; mande de novo." : "";
      return {
        ok: true,
        texto: `${nome} atualizado: ${partes.join("; ") || "nada mudou"}.${aviso}`,
        desfazer: { nome, registro: r.registro },
      };
    },

    async desfazer(ctx, d) {
      const nome = texto(d.nome, 120) ?? "o cliente";
      const registro = d.registro as RegistroDaAtualizacao | undefined;
      if (!registro || typeof registro.leadId !== "string") return { ok: false, texto: "Não sei qual atualização desfazer." };
      const r = await desfazerAtualizacaoPeloCentral(banco(), {
        grupoId: ctx.grupoId,
        autorId: ctx.corretorId,
        soDoCorretor: soDoCorretor(ctx),
        registro: {
          leadId: registro.leadId,
          antes: registro.antes ?? {},
          depois: registro.depois ?? {},
          etapaAlteradaEmAntes: registro.etapaAlteradaEmAntes ?? null,
          marcasAcrescentadas: Array.isArray(registro.marcasAcrescentadas) ? registro.marcasAcrescentadas : [],
          notaId: registro.notaId ?? null,
        },
      });
      if (r.desfecho === "nao_achou") return { ok: false, texto: `Não consegui desfazer: ${nome} não está mais na sua carteira.` };
      const voltou = (Object.keys(r.voltaram) as CampoDaFicha[]).map((c) => `${ROTULO_DO_CAMPO[c]} ${valorLegivel(c, r.voltaram[c])}`);
      if (r.notaRemovida) voltou.push("anotação apagada");
      const ficou = r.mantidos.length
        ? ` Não mexi em ${r.mantidos.map((c) => ROTULO_DO_CAMPO[c]).join(", ")}: mudou de novo depois.`
        : "";
      return voltou.length
        ? { ok: true, texto: `Desfeito: ${nome} voltou ao que era (${voltou.join("; ")}).${ficou}` }
        : { ok: false, texto: `Nada a desfazer em ${nome}.${ficou}` };
    },
  };

  return { cadastrar_lead, atualizar_lead };
}

export const CONSULTAS_LEADS: Record<string, Consulta> = {};
export const ACOES_LEADS: Record<string, Acao> = criarAcoesDeLeads();
