import "server-only";

import { marcarCamposDoCorretor } from "@/lib/crm/camposDoCorretor";
import { registrarInteracao } from "@/lib/crm/interacoes";
import { textoMudancaEtapa } from "@/lib/crm/timeline";
import type { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { localizarTelefoneNoGrupo } from "@/lib/whatsapp/repositorio";

/**
 * Escritas na ficha do lead pedidas pelo número central (onda 1, 30/10/2026;
 * spec do CRM pelo WhatsApp 3.1 itens 1 e 2, 4.4 e 4.6).
 *
 * Mora no domínio, e não em `src/lib/central/`, de propósito: o central não
 * escreve em tabela do CRM (guarda em `central/ferramentas.test.ts`). As
 * ações de lá resolvem o pedido e chamam estas funções depois do "sim".
 *
 * Roda pela chave de serviço (não há sessão de navegador no WhatsApp), então
 * a permissão que a RLS daria no painel é conferida aqui, em toda consulta:
 * sempre o grupo de quem foi identificado e, para corretor, o dono do lead
 * (`soDoCorretor`). O gestor mexe em qualquer lead do grupo, como no painel.
 */

type Supa = ReturnType<typeof createServiceClient>;
type MudancaNoLead = Database["public"]["Tables"]["leads"]["Update"];

/** Marca nos `detalhes` da linha do tempo: diz que veio do número central. */
const ORIGEM = "central_whatsapp";

/**
 * A origem do lead cadastrado pelo central é a do cadastro à mão do painel:
 * é a mesma pessoa cadastrando, só que pelo WhatsApp. Com ela o lead fica
 * "trazido pelo corretor" (`classificar_trazido_por`, 0200), entra no canal
 * "Cadastro manual" dos gráficos e não dispara a notificação de lead novo
 * para quem acabou de cadastrar (`cadastradoPeloCorretor`). Uma origem nova
 * cairia em "Outros" e na regra de "origem desconhecida" de cada um deles.
 */
const ORIGEM_DO_CADASTRO = "painel/manual";

async function nomeDoCorretor(supabase: Supa, grupoId: string, corretorId: string): Promise<string | null> {
  const { data } = await supabase
    .from("corretores")
    .select("nome")
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  return data?.nome?.trim() || null;
}

// ── Cadastro ───────────────────────────────────────────────────────────────

export type OndeOTelefoneEsta =
  | { onde: "em_nenhuma" }
  | { onde: "na_dele"; leadId: string; nome: string; arquivado: boolean }
  | { onde: "de_outro_corretor"; leadId: string; dono: string | null }
  | { onde: "nao_sei" };

/**
 * Onde o telefone já é lead no grupo, pela MESMA regra da palavra-chave
 * (`localizarTelefoneNoGrupo`, regra N6), mais o que a resposta ao corretor
 * precisa: o nome do lead dele (e se está arquivado) ou o nome do dono.
 */
export async function ondeEstaOTelefone(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; telefoneE164: string },
): Promise<OndeOTelefoneEsta> {
  const achado = await localizarTelefoneNoGrupo(supabase, {
    corretorId: p.corretorId,
    grupoId: p.grupoId,
    telefoneCliente: p.telefoneE164,
  });
  if (achado.onde === "na_dele") {
    const { data } = await supabase
      .from("leads")
      .select("nome, arquivado_em")
      .eq("id", achado.leadId)
      .eq("grupo_id", p.grupoId)
      .maybeSingle();
    return { onde: "na_dele", leadId: achado.leadId, nome: data?.nome?.trim() || "sem nome", arquivado: Boolean(data?.arquivado_em) };
  }
  if (achado.onde === "de_outro_corretor") {
    const { data } = await supabase
      .from("leads")
      .select("corretor_id")
      .eq("id", achado.leadId)
      .eq("grupo_id", p.grupoId)
      .maybeSingle();
    const dono = data?.corretor_id ? await nomeDoCorretor(supabase, p.grupoId, data.corretor_id) : null;
    return { onde: "de_outro_corretor", leadId: achado.leadId, dono };
  }
  return achado;
}

export type LeadNovo = {
  nome: string;
  /** Como se escreve, "(11) 98765-4321": é o que o corretor lê no cartão. */
  telefone: string;
  /** 55 + DDD + número: é por ele que a duplicidade é conferida. */
  telefoneE164: string;
  regiaoInteresse: string | null;
  rendaMensal: number | null;
  orcamentoMax: number | null;
  dormitoriosMin: number | null;
  mensagem: string | null;
};

export type CadastroPeloCentral =
  | { desfecho: "cadastrado"; leadId: string }
  | { desfecho: "ja_existe"; onde: Exclude<OndeOTelefoneEsta, { onde: "em_nenhuma" | "nao_sei" }> }
  | { desfecho: "falhou" };

/**
 * Cadastra o lead na carteira de quem pediu (gestor: na dele mesmo).
 *
 * Confere a duplicidade DE NOVO, mesmo que a proposta já tenha conferido:
 * entre a proposta e o "sim" cabe até 1 hora, e nesse tempo o número pode
 * ter chegado por anúncio ou por outro corretor.
 *
 * - `corretor_id` vai preenchido: vazio, o gatilho `leads_distribuir` (0007)
 *   sortearia outro dono pela roleta;
 * - `telefone_e164` NUNCA entra no insert (coluna gerada, ver
 *   `cadastrarLeadDeConvite`);
 * - `consentimento_lgpd` fica no default `false`: ninguém marcou a caixa do
 *   formulário do painel, e escrever `true` afirmaria um consentimento que
 *   não aconteceu;
 * - os campos que a pessoa informou ficam protegidos da IA
 *   (`campos_do_corretor`, 0110), como na qualificação do painel.
 */
export async function cadastrarLeadPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; lead: LeadNovo },
): Promise<CadastroPeloCentral> {
  const onde = await ondeEstaOTelefone(supabase, { grupoId: p.grupoId, corretorId: p.corretorId, telefoneE164: p.lead.telefoneE164 });
  if (onde.onde === "nao_sei") return { desfecho: "falhou" };
  if (onde.onde !== "em_nenhuma") return { desfecho: "ja_existe", onde };

  const { lead } = p;
  const informados = [
    "nome",
    ...(lead.regiaoInteresse ? ["regiao_interesse"] : []),
    ...(lead.rendaMensal !== null ? ["renda_mensal"] : []),
    ...(lead.orcamentoMax !== null ? ["orcamento_max"] : []),
    ...(lead.dormitoriosMin !== null ? ["dormitorios_min"] : []),
  ];
  const { data, error } = await supabase
    .from("leads")
    .insert({
      nome: lead.nome,
      telefone: lead.telefone,
      grupo_id: p.grupoId,
      corretor_id: p.corretorId,
      origem: ORIGEM_DO_CADASTRO,
      origem_atribuicao: "manual",
      regiao_interesse: lead.regiaoInteresse,
      renda_mensal: lead.rendaMensal,
      orcamento_max: lead.orcamentoMax,
      dormitorios_min: lead.dormitoriosMin,
      mensagem: lead.mensagem,
      campos_do_corretor: marcarCamposDoCorretor([], informados),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[central] falha ao cadastrar o lead:", error?.message);
    return { desfecho: "falhou" };
  }
  // A origem é a do painel; a linha do tempo diz que foi pelo WhatsApp.
  await registrarInteracao(supabase, {
    leadId: data.id,
    corretorId: p.corretorId,
    tipo: "sistema",
    conteudo: "Cadastrado pelo número central (WhatsApp).",
    detalhes: { origem: ORIGEM },
  });
  return { desfecho: "cadastrado", leadId: data.id };
}

/**
 * O "desfaz" do cadastro (spec 4.6): o lead volta ARQUIVADO, não apagado.
 * Arquivado é o recorte que todas as telas, listas e campanhas já respeitam
 * (`leadArquivado.test.ts`), e nada do que aconteceu com ele no meio do
 * caminho (uma mensagem, uma visita) se perde.
 *
 * Só arquiva se o lead continua de quem o cadastrou, no grupo: se a gestão o
 * repassou nesse meio-tempo, ele já é de outra pessoa e o desfaz não alcança.
 */
export async function arquivarLeadCadastradoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadId: string },
): Promise<{ ok: boolean }> {
  const { data, error } = await supabase
    .from("leads")
    .update({ arquivado_em: new Date().toISOString(), arquivado_motivo: null })
    .eq("id", p.leadId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .is("arquivado_em", null)
    .select("id");
  if (error) console.error("[central] falha ao arquivar o lead desfeito:", error.message);
  if (error || !data?.length) return { ok: false };
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: p.corretorId,
    tipo: "sistema",
    conteudo: "Cadastro desfeito pelo número central: lead arquivado.",
    detalhes: { origem: ORIGEM, desfeito: true },
  });
  return { ok: true };
}

// ── Atualização da ficha ───────────────────────────────────────────────────

/** Os campos que o central muda na ficha (o resto fica com o painel). */
export const CAMPOS_DA_FICHA = ["etapa", "renda_mensal", "orcamento_max", "regiao_interesse"] as const;
export type CampoDaFicha = (typeof CAMPOS_DA_FICHA)[number];
export type ValoresDaFicha = Partial<Record<CampoDaFicha, string | number | null>>;

export type FichaDoLead = {
  id: string;
  nome: string;
  corretorId: string | null;
  etapa: EtapaFunil;
  etapaAlteradaEm: string | null;
  rendaMensal: number | null;
  orcamentoMax: number | null;
  regiaoInteresse: string | null;
  visitaAgendadaEm: string | null;
  camposDoCorretor: unknown;
};

/**
 * A ficha de um lead do grupo. `soDoCorretor` (o corretor identificado) recorta
 * a carteira dele; `null` é o gestor, que vê o grupo inteiro. Arquivado não
 * conta, como no `resolverLead`, salvo no desfaz (`comArquivado`).
 */
export async function lerFichaNoGrupo(
  supabase: Supa,
  p: { grupoId: string; leadId: string; soDoCorretor: string | null; comArquivado?: boolean },
): Promise<FichaDoLead | null> {
  let consulta = supabase
    .from("leads")
    .select("id, nome, corretor_id, etapa, etapa_alterada_em, renda_mensal, orcamento_max, regiao_interesse, visita_agendada_em, campos_do_corretor")
    .eq("id", p.leadId)
    .eq("grupo_id", p.grupoId);
  if (!p.comArquivado) consulta = consulta.is("arquivado_em", null);
  if (p.soDoCorretor) consulta = consulta.eq("corretor_id", p.soDoCorretor);
  const { data, error } = await consulta.maybeSingle();
  if (error) throw new Error(`ficha do lead: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    nome: data.nome?.trim() || "Cliente sem nome",
    corretorId: data.corretor_id,
    etapa: data.etapa as EtapaFunil,
    etapaAlteradaEm: data.etapa_alterada_em ?? null,
    rendaMensal: numeroOuNulo(data.renda_mensal),
    orcamentoMax: numeroOuNulo(data.orcamento_max),
    regiaoInteresse: data.regiao_interesse?.trim() || null,
    visitaAgendadaEm: data.visita_agendada_em ?? null,
    camposDoCorretor: data.campos_do_corretor,
  };
}

/** O nome do dono, para o gestor saber de quem é o lead que está mexendo. */
export async function nomeDoDono(supabase: Supa, grupoId: string, corretorId: string): Promise<string | null> {
  return nomeDoCorretor(supabase, grupoId, corretorId);
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** O valor atual de um campo, na forma em que a mudança é escrita. */
export function valorNaFicha(f: FichaDoLead, campo: CampoDaFicha): string | number | null {
  if (campo === "etapa") return f.etapa;
  if (campo === "renda_mensal") return f.rendaMensal;
  if (campo === "orcamento_max") return f.orcamentoMax;
  return f.regiaoInteresse;
}

function mesmoValor(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

/** Só o que de fato muda: pedir a etapa em que o lead já está não é mudança. */
export function mudancasReais(f: FichaDoLead, pedido: ValoresDaFicha): ValoresDaFicha {
  const saida: ValoresDaFicha = {};
  for (const campo of CAMPOS_DA_FICHA) {
    if (!(campo in pedido) || pedido[campo] === undefined) continue;
    if (!mesmoValor(valorNaFicha(f, campo), pedido[campo])) saida[campo] = pedido[campo] ?? null;
  }
  return saida;
}

/** O que o desfaz precisa para voltar a ficha (vai inteiro no `desfazer` da ação). */
export type RegistroDaAtualizacao = {
  leadId: string;
  antes: ValoresDaFicha;
  depois: ValoresDaFicha;
  /** Para "há quanto tempo na etapa" não recomeçar do zero no desfaz. */
  etapaAlteradaEmAntes: string | null;
  /** As marcas de "campo do corretor" que ESTA atualização acrescentou. */
  marcasAcrescentadas: string[];
  notaId: string | null;
};

export type AtualizacaoPeloCentral =
  | { desfecho: "nao_achou" }
  | { desfecho: "nada_mudou" }
  | { desfecho: "atualizado"; registro: RegistroDaAtualizacao; anotacaoFalhou: boolean };

/**
 * Aplica etapa, renda, orçamento, região e anotação, como o painel faria
 * (`moverEtapa`, `salvarQualificacao`, `adicionarNota`), num update só.
 *
 * O "antes" é capturado AQUI, no momento de gravar, e não na proposta: é ele
 * que o desfaz devolve, e a ficha pode ter mudado entre a proposta e o "sim".
 * A mudança de etapa vai à linha do tempo com o "de → para", como no painel;
 * a anotação é uma linha `nota` com autor, como a do painel.
 */
export async function atualizarFichaPeloCentral(
  supabase: Supa,
  p: {
    grupoId: string;
    leadId: string;
    /** Quem pediu (autor das linhas do tempo). */
    autorId: string;
    soDoCorretor: string | null;
    mudancas: ValoresDaFicha;
    anotacao: string | null;
  },
): Promise<AtualizacaoPeloCentral> {
  const ficha = await lerFichaNoGrupo(supabase, { grupoId: p.grupoId, leadId: p.leadId, soDoCorretor: p.soDoCorretor });
  if (!ficha) return { desfecho: "nao_achou" };

  const reais = mudancasReais(ficha, p.mudancas);
  const campos = Object.keys(reais) as CampoDaFicha[];
  if (campos.length === 0 && !p.anotacao) return { desfecho: "nada_mudou" };

  const antes: ValoresDaFicha = {};
  for (const c of campos) antes[c] = valorNaFicha(ficha, c);
  const daQualificacao = campos.filter((c) => c !== "etapa");
  const marcasAntes = marcarCamposDoCorretor(ficha.camposDoCorretor, []);
  const marcasDepois = marcarCamposDoCorretor(ficha.camposDoCorretor, daQualificacao);

  if (campos.length > 0) {
    let escrita = supabase
      .from("leads")
      .update({
        ...comoEscrita(reais),
        ...(reais.etapa ? { etapa_alterada_em: new Date().toISOString() } : {}),
        ...(daQualificacao.length > 0 ? { campos_do_corretor: marcasDepois } : {}),
      })
      .eq("id", p.leadId)
      .eq("grupo_id", p.grupoId)
      .is("arquivado_em", null);
    if (p.soDoCorretor) escrita = escrita.eq("corretor_id", p.soDoCorretor);
    const { data, error } = await escrita.select("id");
    if (error) throw new Error(`atualizar ficha: ${error.message}`);
    if (!data?.length) return { desfecho: "nao_achou" };
  }

  if (reais.etapa) {
    const de = ficha.etapa;
    const para = reais.etapa as EtapaFunil;
    await registrarInteracao(supabase, {
      leadId: p.leadId,
      corretorId: p.autorId,
      tipo: "etapa",
      conteudo: textoMudancaEtapa(ETAPA_LABEL[de] ?? de, ETAPA_LABEL[para] ?? para),
      detalhes: { de, para, origem: ORIGEM },
    });
  }

  let notaId: string | null = null;
  if (p.anotacao) {
    const { data, error } = await supabase
      .from("lead_interacoes")
      .insert({
        lead_id: p.leadId,
        // Explícito, e não só pelo gatilho: é por ele que o desfaz acha a nota.
        grupo_id: p.grupoId,
        corretor_id: p.autorId,
        tipo: "nota",
        conteudo: p.anotacao,
        detalhes: { origem: ORIGEM },
      })
      .select("id")
      .single();
    if (error) console.error("[central] anotação não gravada:", error.message);
    notaId = data?.id ?? null;
  }

  return {
    desfecho: "atualizado",
    anotacaoFalhou: Boolean(p.anotacao) && !notaId,
    registro: {
      leadId: p.leadId,
      antes,
      depois: reais,
      etapaAlteradaEmAntes: ficha.etapaAlteradaEm,
      marcasAcrescentadas: marcasDepois.filter((m) => !marcasAntes.includes(m)),
      notaId,
    },
  };
}

/** Os valores da ficha nas colunas e nos tipos de `leads`. */
function comoEscrita(v: ValoresDaFicha): MudancaNoLead {
  const saida: MudancaNoLead = {};
  if (v.etapa) saida.etapa = String(v.etapa);
  if ("renda_mensal" in v) saida.renda_mensal = numeroOuNulo(v.renda_mensal);
  if ("orcamento_max" in v) saida.orcamento_max = numeroOuNulo(v.orcamento_max);
  if ("regiao_interesse" in v) saida.regiao_interesse = v.regiao_interesse == null ? null : String(v.regiao_interesse);
  return saida;
}

export type DesfazimentoDaAtualizacao =
  | { desfecho: "nao_achou" }
  | { desfecho: "desfeito"; voltaram: ValoresDaFicha; mantidos: CampoDaFicha[]; notaRemovida: boolean };

/**
 * O "desfaz" da atualização (spec 4.6): cada campo volta ao valor de antes.
 *
 * Só volta o campo que ainda está como o central deixou. Se alguém mexeu
 * nele depois (no painel, a IA da conversa), a mudança dessa pessoa é mais
 * nova que o desfaz e fica: devolver o valor antigo por cima dela seria
 * desfazer o trabalho de outro. O que ficou vai em `mantidos`, para a
 * resposta dizer.
 *
 * A anotação criada é REMOVIDA, e não marcada: é o texto que a própria
 * pessoa ditou há pouco, e uma linha "desfeita" ao lado dela na ficha
 * continuaria dizendo o que ela quis apagar. A volta da etapa entra na linha
 * do tempo, como qualquer mudança de etapa.
 */
export async function desfazerAtualizacaoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; autorId: string; soDoCorretor: string | null; registro: RegistroDaAtualizacao },
): Promise<DesfazimentoDaAtualizacao> {
  const { registro } = p;
  const ficha = await lerFichaNoGrupo(supabase, {
    grupoId: p.grupoId,
    leadId: registro.leadId,
    soDoCorretor: p.soDoCorretor,
    comArquivado: true,
  });
  if (!ficha) return { desfecho: "nao_achou" };

  const voltaram: ValoresDaFicha = {};
  const mantidos: CampoDaFicha[] = [];
  for (const campo of CAMPOS_DA_FICHA) {
    if (!(campo in registro.depois)) continue;
    if (mesmoValor(valorNaFicha(ficha, campo), registro.depois[campo])) voltaram[campo] = registro.antes[campo] ?? null;
    else mantidos.push(campo);
  }

  const campos = Object.keys(voltaram) as CampoDaFicha[];
  if (campos.length > 0) {
    const tiraMarcas = registro.marcasAcrescentadas.filter((m) => campos.includes(m as CampoDaFicha));
    const marcas = marcarCamposDoCorretor(ficha.camposDoCorretor, []).filter((m) => !tiraMarcas.includes(m));
    let escrita = supabase
      .from("leads")
      .update({
        ...comoEscrita(voltaram),
        ...(voltaram.etapa ? { etapa_alterada_em: registro.etapaAlteradaEmAntes ?? new Date().toISOString() } : {}),
        ...(tiraMarcas.length > 0 ? { campos_do_corretor: marcas } : {}),
      })
      .eq("id", registro.leadId)
      .eq("grupo_id", p.grupoId);
    if (p.soDoCorretor) escrita = escrita.eq("corretor_id", p.soDoCorretor);
    const { data, error } = await escrita.select("id");
    if (error) throw new Error(`desfazer ficha: ${error.message}`);
    if (!data?.length) return { desfecho: "nao_achou" };
    if (voltaram.etapa) {
      const de = registro.depois.etapa as EtapaFunil;
      const para = voltaram.etapa as EtapaFunil;
      await registrarInteracao(supabase, {
        leadId: registro.leadId,
        corretorId: p.autorId,
        tipo: "etapa",
        conteudo: textoMudancaEtapa(ETAPA_LABEL[de] ?? de, ETAPA_LABEL[para] ?? para),
        detalhes: { de, para, origem: ORIGEM, desfeito: true },
      });
    }
  }

  let notaRemovida = false;
  if (registro.notaId) {
    const { data, error } = await supabase
      .from("lead_interacoes")
      .delete()
      .eq("id", registro.notaId)
      .eq("lead_id", registro.leadId)
      .eq("grupo_id", p.grupoId)
      .eq("tipo", "nota")
      .select("id");
    if (error) console.error("[central] anotação desfeita não removida:", error.message);
    notaRemovida = Boolean(data?.length);
  }

  return { desfecho: "desfeito", voltaram, mantidos, notaRemovida };
}
