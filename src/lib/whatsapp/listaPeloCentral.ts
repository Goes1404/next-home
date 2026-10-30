import "server-only";

import { elegivel, type FiltroLeadsCampanha } from "@/lib/crm/publicoDaCampanha";
import { inicioDoDiaEmSaoPaulo } from "@/lib/imagens/imagensTipos";
import { conferirLimite } from "@/lib/planos/usoDaIa";
import type { createServiceClient } from "@/lib/supabase/service";
import { momentoEmSaoPaulo, type LimiteDoDia } from "./antiBan";
import { acenderCorrenteDeDisparo } from "./autoDisparo";
import { montarFilaCampanha } from "./campaignQueue";
import { lerCasaDoGrupo } from "./casaDoGrupo";
import { contextoDaLista, previsaoDeTermino, variaveisSemValor, MOTIVO_ENVIO_INCERTO, type ContextoTemplate } from "./listaDeTransmissao";
import type { CriterioDaLista } from "./listasVivas";
import { diasDesde, inicioDoPrimeiroContato, motivoDoPrimeiroContato, vagasDePrimeiroContato } from "./primeiroContato";
import { contarPrimeirosContatos } from "./primeiroContatoNoEnvio";
import { conferirNumerosNoWhatsapp, provedorConfigurado } from "./provider";
import { idsProtegidosDeNovaLista, leadsDoCorretor } from "./publicoDaLista";
import { calcularLimiteDoDia } from "./repositorio";
import { lerSinaisDaLista } from "./sinaisDaLista";
import { MOTIVO_TEXTO_PARECIDO, MOTIVO_TEXTO_SEM_IA } from "./variacaoDeTexto";

/**
 * A lista de transmissão pedida pelo número central (onda 3, frente L,
 * 30/10/2026; spec do CRM pelo WhatsApp 3.5 itens 14 e 15, 4.4 e 4.6).
 *
 * Mora no domínio, e não em `src/lib/central/`, de propósito: o central não
 * escreve em tabela do CRM. As ações de lá resolvem o pedido ("o Vitta pra
 * quem quer Barueri até 600 mil") e chamam estas funções depois do "sim".
 *
 * NADA aqui envia mensagem. A lista entra na MESMA fila da tela de listas
 * (`whatsapp_campanhas` + `whatsapp_campanhas_fila`) e quem manda é o
 * disparador de sempre, item por item, com todas as travas de hoje: janela e
 * expediente, lista ainda ativa, pausa automática, pedido de parada, o mesmo
 * telefone em outro cadastro, conversa nas últimas 24 h, primeiro contato
 * (10 por dia, 30 por semana, nada nos 7 dias depois de conectar ou cair,
 * sem foto), texto conferido contra as mensagens do número (0173) e a cota
 * do dia. Um caminho de envio paralelo seria um segundo lugar para esquecer
 * uma delas, e foi esquecendo uma que caíram o número da Bruna e o do Ramos.
 *
 * A criação repete, passo a passo, o `criarCampanha` da tela
 * (`campanhas/acoes.ts`), que não serve aqui porque depende da sessão do
 * navegador: número conectado, variáveis do texto com valor, público pela
 * régua de `publicoDaCampanha` com a proteção de lista nova (7 dias /
 * pendente em outra), número sem WhatsApp fora antes da fila, limite do
 * plano conferido antes de enfileirar, `ignorar_janela` sempre falso e a fila
 * montada por `montarFilaCampanha`. A guarda `listaPeloCentral.test.ts` cobra
 * a ordem.
 *
 * Roda pela chave de serviço (não há sessão no WhatsApp): o grupo e o
 * corretor de quem foi identificado são filtrados à mão em toda consulta, e
 * a lista é SEMPRE do número de quem pediu. O gestor não dispara pelo número
 * de outro corretor nem para a carteira de outro (spec 3.5, item 14).
 */

type Supa = ReturnType<typeof createServiceClient>;

/** O que fala com rede ou com outro cliente do banco: o teste troca. */
export type ExternosDaLista = {
  /** O limite de hoje do número pelo uso (`calcularLimiteDoDia`), o mesmo do disparador e da tela. */
  limiteDoDia: (instanciaId: string, conectadoEm: Date) => Promise<LimiteDoDia>;
  /** Quem NÃO tem WhatsApp (consulta ao provedor antes da fila). */
  conferirNumeros: (p: { instanceName: string; telefones: string[] }) => Promise<Map<string, boolean>>;
  provedorConfigurado: () => boolean;
  /** O limite de mensagens de lista do PLANO, por grupo e por mês. */
  limiteDoPlano: (grupoId: string, pedido: number) => Promise<{ ok: true } | { ok: false; erro: string }>;
  /** A região da casa do grupo, para a reserva de `{imovel}`. */
  regiaoDaCasa: (grupoId: string) => Promise<string | null>;
  /** Acende a corrente do disparador, como a tela faz ao criar e ao retomar. */
  acender: () => void;
};

export const EXTERNOS_DA_LISTA: ExternosDaLista = {
  limiteDoDia: (instanciaId, conectadoEm) => calcularLimiteDoDia(instanciaId, conectadoEm),
  conferirNumeros: (p) => conferirNumerosNoWhatsapp(p),
  provedorConfigurado: () => provedorConfigurado(),
  limiteDoPlano: async (grupoId, pedido) => {
    const r = await conferirLimite(grupoId, "lista", pedido);
    return r.ok ? { ok: true } : { ok: false, erro: r.erro };
  },
  regiaoDaCasa: async (grupoId) => (await lerCasaDoGrupo(grupoId)).regiao ?? null,
  acender: () => acenderCorrenteDeDisparo(),
};

/** Lotes do `in(...)`: a URL do PostgREST tem tamanho. */
const LOTE = 150;

function emLotes<T>(itens: T[], tamanho = LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** O começo de amanhã em São Paulo (ISO): a linha entre "sai hoje" e "fica para amanhã". */
export function inicioDeAmanhaEmSaoPaulo(agora: Date): string {
  return new Date(new Date(inicioDoDiaEmSaoPaulo(agora)).getTime() + 86_400_000).toISOString();
}

// ── O número de quem pediu ───────────────────────────────────────────────

export type SituacaoDoNumero =
  | { conectado: false; motivo: string }
  | {
      conectado: true;
      instanciaId: string;
      instanceName: string;
      telefone: string | null;
      /** Quantas mensagens de lista ainda cabem hoje na cota do número. */
      saldoDaCota: number;
      limiteDoDia: LimiteDoDia;
      /** Primeiros contatos que ainda cabem agora (a régua do disparador). */
      vagasDePrimeiroContato: number;
      /** Por que não cabe primeiro contato, quando não cabe (texto da tela). */
      motivoSemPrimeiroContato: string | null;
      /** Itens de outras listas já na fila para hoje: gastam a mesma cota antes. */
      naFilaHoje: number;
      expediente: { inicioHora: number; fimHora: number };
      /** O disjuntor do número (falhas seguidas do WhatsApp), quando ligado. */
      bloqueadoAte: string | null;
    };

export const MOTIVO_SEM_PROVEDOR =
  "Nenhum provedor de WhatsApp está conectado a este ambiente. Conecte o seu número em Minha IA → WhatsApp primeiro.";
export const MOTIVO_DESCONECTADO =
  "O seu WhatsApp não está conectado ao sistema, e a lista sai do SEU número. Conecte o número em Minha IA → WhatsApp e peça de novo.";

function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/**
 * A situação do número DE QUEM PEDIU (nunca o de outro corretor): conectado?
 * Quanto cabe hoje na cota e no primeiro contato? As contas são as da tela
 * (`statusDisparo`: limite pelo uso menos o que já saiu hoje) e as do
 * disparador (primeiro contato: conexão ou volta da queda, contador da 0222).
 */
export async function situacaoDoNumero(
  supabase: Supa,
  externos: ExternosDaLista,
  p: { grupoId: string; corretorId: string; agora: Date },
): Promise<SituacaoDoNumero> {
  if (!externos.provedorConfigurado()) return { conectado: false, motivo: MOTIVO_SEM_PROVEDOR };
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(
      "id, instance_name, status_conexao, telefone_conectado, conectado_em, aquecimento_desde, bloqueado_ate, envios_campanha_contador, envios_campanha_data, expediente_inicio, expediente_fim",
    )
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .maybeSingle();
  // Sem número conectado a lista nasceria parada (a mesma recusa da tela).
  if (!instancia || instancia.status_conexao !== "conectado" || !instancia.conectado_em) {
    return { conectado: false, motivo: MOTIVO_DESCONECTADO };
  }

  const conectadoEm = new Date(instancia.conectado_em);
  const enviosHoje = instancia.envios_campanha_data === hojeEmSaoPaulo(p.agora) ? (instancia.envios_campanha_contador ?? 0) : 0;
  const limite = await externos.limiteDoDia(instancia.id, conectadoEm);

  // Primeiro contato: exatamente a conta do disparador antes de cada envio.
  const diasDesdeInicio = diasDesde(
    inicioDoPrimeiroContato(conectadoEm, instancia.aquecimento_desde ? new Date(instancia.aquecimento_desde) : null),
    p.agora,
  );
  const feitos = await contarPrimeirosContatos(supabase, p.corretorId, p.agora);
  // Contador ilegível: nenhum primeiro contato sai (o disparador faz igual).
  const vagas = feitos ? vagasDePrimeiroContato({ diasDesdeInicio, enviadosHoje: feitos.hoje, enviadosNaSemana: feitos.semana }) : 0;

  return {
    conectado: true,
    instanciaId: instancia.id,
    instanceName: instancia.instance_name ?? "",
    telefone: instancia.telefone_conectado ?? null,
    saldoDaCota: Math.max(0, limite.limite - enviosHoje),
    limiteDoDia: limite,
    vagasDePrimeiroContato: vagas,
    motivoSemPrimeiroContato: vagas > 0 ? null : motivoDoPrimeiroContato({ diasDesdeInicio }),
    naFilaHoje: await naFilaParaHoje(supabase, p),
    expediente: { inicioHora: instancia.expediente_inicio ?? 9, fimHora: instancia.expediente_fim ?? 21 },
    bloqueadoAte: instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > p.agora ? instancia.bloqueado_ate : null,
  };
}

/** Itens pendentes das listas em andamento do corretor marcados para sair ainda hoje. */
async function naFilaParaHoje(supabase: Supa, p: { grupoId: string; corretorId: string; agora: Date }): Promise<number> {
  const { data: ativas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("status", "em_andamento");
  const ids = (ativas ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id")
    .eq("grupo_id", p.grupoId)
    .in("campanha_id", ids)
    .eq("status", "pendente")
    .lt("agendado_para", inicioDeAmanhaEmSaoPaulo(p.agora))
    .limit(5000);
  return (data ?? []).length;
}

/**
 * Quantas mensagens desta lista devem sair HOJE, em estimativa (a mesma
 * honestidade da previsão da tela: o intervalo é sorteado).
 *
 * Quem já conversou com o corretor sai no ritmo da cota; quem nunca falou,
 * só até as vagas de primeiro contato. A cota que sobra desconta o que outras
 * listas já têm na fila para hoje, e o relógio desconta o que resta da janela
 * (9h–20h59, segunda a sábado) e do expediente (`previsaoDeTermino`).
 */
export function quantosSaemHoje(p: {
  pessoas: number;
  nuncaFalaram: number;
  vagasDePrimeiroContato: number;
  saldoDaCota: number;
  naFilaHoje: number;
  expediente: { inicioHora: number; fimHora: number };
  agora: Date;
}): number {
  if (momentoEmSaoPaulo(p.agora).diaSemana === 0) return 0;
  const pelaRegua = p.pessoas - p.nuncaFalaram + Math.min(p.nuncaFalaram, p.vagasDePrimeiroContato);
  const previsao = previsaoDeTermino({
    pendentes: pelaRegua,
    saldoHoje: Math.max(0, p.saldoDaCota - p.naFilaHoje),
    agora: p.agora,
    expediente: { inicioHora: Math.max(9, p.expediente.inicioHora), fimHora: Math.min(21, p.expediente.fimHora) },
  });
  return pelaRegua - previsao.continuaAmanha;
}

// ── Quem recebe ──────────────────────────────────────────────────────────

/** O que o central precisa de cada pessoa para recortar e contar (além do `Lead` da tela). */
export type PessoaDaLista = {
  id: string;
  nome: string;
  telefone: string;
  telefoneE164: string | null;
  etapa: string;
  regiaoInteresse: string | null;
  dormitoriosMin: number | null;
  orcamentoMax: number | string | null;
  orcamentoMin: number | string | null;
  rendaMensal: number | string | null;
  empreendimentoId: string | null;
  imovelInteresseId: string | null;
  dossie: { orcamento_max: number | string | null; orcamento_min: number | string | null; urgencia_mudanca: string | null } | null;
  /** Mensagens NOSSAS seguidas sem resposta (0060): a régua do teto de insistência. */
  tentativasSemResposta: number;
  /** A nossa última tentativa de contato (0060), parte do "parado há N dias". */
  ultimaTentativaEm: string | null;
};

type LinhaDoPerfil = {
  id: string;
  telefone_e164: string | null;
  regiao_interesse: string | null;
  dormitorios_min: number | null;
  orcamento_max: number | string | null;
  orcamento_min: number | string | null;
  renda_mensal: number | string | null;
  empreendimento_id: string | null;
  imovel_interesse_id: string | null;
  ultima_tentativa_em: string | null;
};

const COLUNAS_DO_PERFIL =
  "id, telefone_e164, regiao_interesse, dormitorios_min, orcamento_max, orcamento_min, renda_mensal, empreendimento_id, imovel_interesse_id, ultima_tentativa_em";

/** A pessoa é o telefone, não o cadastro: a chave do telefone para não mandar duas vezes. */
function chaveDoTelefone(e164: string | null, telefone: string): string {
  return e164 || telefone.replace(/\D/g, "");
}

/**
 * Quem pode entrar numa lista nova do corretor, pela régua da TELA:
 * `leadsDoCorretor` (só a carteira dele, mesmo para o gestor), `elegivel`
 * (quem pediu para sair, fechado, perdido e sem telefone ficam de fora) e
 * `idsProtegidosDeNovaLista` (pendente em outra lista ou lista nos últimos 7
 * dias). Por cima, um cadastro por TELEFONE (lista da Rute, 16/10/2026: a
 * pessoa com dois cadastros receberia a mesma lista duas vezes). Lança erro
 * de leitura: quem chama falha fechado, como a tela.
 *
 * `protegidas` são as elegíveis que a proteção tirou, no mesmo formato (um
 * por telefone, sem repetir telefone de quem está livre): NUNCA entram na
 * lista, servem só para a resposta de "ninguém" dizer quantas o filtro
 * achou e a proteção tirou (conversa da Bruna, 30/10/2026).
 */
export async function publicoDaListaPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; filtro: FiltroLeadsCampanha; imovelSlug: string | null },
): Promise<{ pessoas: PessoaDaLista[]; protegidas: PessoaDaLista[]; protegidos: number; duplicados: number }> {
  const leads = await leadsDoCorretor(supabase, p.corretorId);
  const base = leads.filter((l) => elegivel(l, p.filtro, { imovelSlug: p.imovelSlug }));
  const protegidos = await idsProtegidosDeNovaLista(supabase, p.corretorId);
  const livres = base.filter((l) => !protegidos.has(l.id));

  const ids = base.map((l) => l.id);
  const perfis = new Map<string, LinhaDoPerfil>();
  const dossies = new Map<string, NonNullable<PessoaDaLista["dossie"]>>();
  for (const lote of emLotes(ids)) {
    const [{ data: linhas, error }, { data: obs }] = await Promise.all([
      supabase.from("leads").select(COLUNAS_DO_PERFIL).eq("grupo_id", p.grupoId).eq("corretor_id", p.corretorId).in("id", lote),
      supabase
        .from("lead_observacoes_ia")
        .select("lead_id, orcamento_max, orcamento_min, urgencia_mudanca")
        .eq("grupo_id", p.grupoId)
        .in("lead_id", lote),
    ]);
    if (error) throw new Error(`Falha ao ler o perfil dos leads: ${error.message}`);
    for (const l of (linhas ?? []) as LinhaDoPerfil[]) perfis.set(l.id, l);
    for (const d of obs ?? []) dossies.set(d.lead_id, d);
  }

  const vistos = new Set<string>();
  let duplicados = 0;
  // Um por telefone: o primeiro cadastro de cada telefone, na ordem da carteira.
  const umPorTelefone = (lista: typeof base, contar: boolean): PessoaDaLista[] => {
    const r: PessoaDaLista[] = [];
    for (const l of lista) {
      const perfil = perfis.get(l.id);
      // Fora do grupo de quem pediu (não deveria acontecer: a carteira é dele).
      if (!perfil) continue;
      const chave = chaveDoTelefone(perfil.telefone_e164, l.telefone as string);
      if (vistos.has(chave)) {
        if (contar) duplicados++;
        continue;
      }
      vistos.add(chave);
      r.push({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone as string,
        telefoneE164: perfil.telefone_e164,
        etapa: l.etapa,
        regiaoInteresse: perfil.regiao_interesse,
        dormitoriosMin: perfil.dormitorios_min,
        orcamentoMax: perfil.orcamento_max,
        orcamentoMin: perfil.orcamento_min,
        rendaMensal: perfil.renda_mensal,
        empreendimentoId: perfil.empreendimento_id,
        imovelInteresseId: perfil.imovel_interesse_id,
        dossie: dossies.get(l.id) ?? null,
        tentativasSemResposta: l.tentativasSemResposta ?? 0,
        ultimaTentativaEm: perfil.ultima_tentativa_em ?? null,
      });
    }
    return r;
  };
  const pessoas = umPorTelefone(livres, true);
  const protegidas = umPorTelefone(
    base.filter((l) => protegidos.has(l.id)),
    false,
  );
  return { pessoas, protegidas, protegidos: base.length - livres.length, duplicados };
}

/** Os cadastros do mesmo telefone de cada pessoa, na carteira do corretor (arquivados também), como `cadastrosDoMesmoTelefone`. */
async function cadastrosDasPessoas(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; pessoas: Pick<PessoaDaLista, "id" | "telefoneE164">[] },
): Promise<{ cadastrosDe: Map<string, string[]>; ultimaTentativa: Map<string, string> } | null> {
  const telefones = [...new Set(p.pessoas.map((x) => x.telefoneE164).filter((t): t is string => Boolean(t)))];
  const cadastrosDoTelefone = new Map<string, string[]>();
  const ultimaTentativa = new Map<string, string>();
  for (const lote of emLotes(telefones)) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, telefone_e164, ultima_tentativa_em")
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.corretorId)
      .in("telefone_e164", lote);
    if (error) return null;
    for (const l of data ?? []) {
      if (l.ultima_tentativa_em) ultimaTentativa.set(l.id, l.ultima_tentativa_em);
      if (!l.telefone_e164) continue;
      cadastrosDoTelefone.set(l.telefone_e164, [...(cadastrosDoTelefone.get(l.telefone_e164) ?? []), l.id]);
    }
  }
  const cadastrosDe = new Map(
    p.pessoas.map((x) => [x.id, [...new Set([x.id, ...(x.telefoneE164 ? (cadastrosDoTelefone.get(x.telefoneE164) ?? []) : [])])]]),
  );
  return { cadastrosDe, ultimaTentativa };
}

/**
 * Quem, entre as pessoas, NUNCA escreveu ao corretor: a pergunta de
 * `nuncaFalouComOCorretor` (a régua de primeiro contato do disparador), feita
 * para a lista inteira de uma vez. Conta qualquer cadastro do mesmo telefone
 * na carteira dele, arquivado ou não (o disparador olha os irmãos do item).
 *
 * Em dúvida, primeiro contato: erro de leitura, ou conversa cujas falas não
 * couberam no lote, contam como "nunca falou". É o lado que protege o número
 * e que faz a conta de "cabem hoje" errar para menos.
 */
export async function quemNuncaFalou(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; pessoas: Pick<PessoaDaLista, "id" | "telefoneE164">[] },
): Promise<Set<string>> {
  const todos = new Set(p.pessoas.map((x) => x.id));
  if (p.pessoas.length === 0) return todos;

  // Os outros cadastros de cada telefone, como `cadastrosDoMesmoTelefone`.
  const cadastros = await cadastrosDasPessoas(supabase, p);
  if (!cadastros) return todos;
  const { cadastrosDe } = cadastros;

  const leadDaConversa = new Map<string, string>();
  for (const lote of emLotes([...new Set([...cadastrosDe.values()].flat())])) {
    const { data, error } = await supabase.from("whatsapp_conversas").select("id, lead_id").eq("grupo_id", p.grupoId).in("lead_id", lote);
    if (error) return todos;
    for (const c of data ?? []) if (c.lead_id) leadDaConversa.set(c.id, c.lead_id);
  }

  const leadsQueFalaram = new Set<string>();
  for (const lote of emLotes([...leadDaConversa.keys()], 100)) {
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("conversa_id")
      .eq("grupo_id", p.grupoId)
      .in("conversa_id", lote)
      .eq("remetente", "cliente")
      .limit(5000);
    if (error) continue;
    for (const m of data ?? []) {
      const lead = leadDaConversa.get(m.conversa_id);
      if (lead) leadsQueFalaram.add(lead);
    }
  }

  const nunca = new Set<string>();
  for (const [id, cadastros] of cadastrosDe) if (!cadastros.some((c) => leadsQueFalaram.has(c))) nunca.add(id);
  return nunca;
}

export type ConversaDaPessoa = {
  /** O cliente já escreveu ao menos uma vez numa conversa com ESTE corretor. */
  respondeu: boolean;
  /** O último contato (ISO): a última mensagem da conversa, de qualquer lado, ou a nossa última tentativa. `null` = nunca houve. */
  ultimoContatoEm: string | null;
};

/**
 * Os filtros "já respondeu / nunca respondeu" e "parado há N dias" do
 * `montar_lista` (conversa da Bruna, 30/10/2026), para várias pessoas de uma
 * vez. A pessoa é o telefone: contam todos os cadastros dele na carteira do
 * corretor (arquivados também), como em `quemNuncaFalou`.
 *
 * - **Respondeu**: alguma conversa do lead COM ESTE CORRETOR
 *   (`whatsapp_conversas.corretor_id`) tem mensagem com remetente
 *   `cliente`. A pergunta vai pela `conversas_com_fala_do_cliente` (0156, a
 *   mesma da tela de Conversas): EXISTS por conversa, que para na primeira
 *   fala em vez de trazer todas as mensagens.
 * - **Último contato**: a régua das Listas sugeridas
 *   (`listasSugeridasDados.ts`): o maior entre `ultima_interacao_em` das
 *   conversas com o corretor (toda mensagem gravada a toca, dos dois lados,
 *   lista enviada inclusive) e `leads.ultima_tentativa_em`. Sem nenhum dos
 *   dois a pessoa nunca teve contato: não está "parada", é nova.
 *
 * Lança erro de leitura: sem provar quem respondeu, o filtro não recorta
 * (quem chama responde que não conseguiu conferir).
 */
export async function conversasComOCorretor(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; pessoas: Pick<PessoaDaLista, "id" | "telefoneE164" | "ultimaTentativaEm">[] },
): Promise<Map<string, ConversaDaPessoa>> {
  const resultado = new Map<string, ConversaDaPessoa>();
  if (p.pessoas.length === 0) return resultado;

  const cadastros = await cadastrosDasPessoas(supabase, p);
  if (!cadastros) throw new Error("Falha ao ler os cadastros do mesmo telefone.");
  const { cadastrosDe, ultimaTentativa } = cadastros;
  for (const x of p.pessoas) if (x.ultimaTentativaEm) ultimaTentativa.set(x.id, x.ultimaTentativaEm);

  const conversasDoLead = new Map<string, { id: string; ultimaEm: string | null }[]>();
  for (const lote of emLotes([...new Set([...cadastrosDe.values()].flat())])) {
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .select("id, lead_id, ultima_interacao_em")
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.corretorId)
      .in("lead_id", lote);
    if (error) throw new Error(`Falha ao ler as conversas: ${error.message}`);
    for (const c of data ?? []) {
      if (!c.lead_id) continue;
      conversasDoLead.set(c.lead_id, [...(conversasDoLead.get(c.lead_id) ?? []), { id: c.id, ultimaEm: c.ultima_interacao_em ?? null }]);
    }
  }

  // O RPC recebe o lote no corpo (não na URL): lotes maiores que o do `in`.
  const comFala = new Set<string>();
  const conversaIds = [...conversasDoLead.values()].flat().map((c) => c.id);
  for (const lote of emLotes(conversaIds, 500)) {
    const { data, error } = await supabase.rpc("conversas_com_fala_do_cliente", { p_ids: lote });
    if (error) throw new Error(`Falha ao conferir quem respondeu: ${error.message}`);
    for (const id of (data ?? []) as string[]) comFala.add(id);
  }

  for (const [id, ids] of cadastrosDe) {
    const conversas = ids.flatMap((c) => conversasDoLead.get(c) ?? []);
    const datas = [...conversas.map((c) => c.ultimaEm), ...ids.map((c) => ultimaTentativa.get(c) ?? null)].filter((d): d is string => Boolean(d));
    resultado.set(id, {
      respondeu: conversas.some((c) => comFala.has(c.id)),
      ultimoContatoEm: datas.length ? datas.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null,
    });
  }
  return resultado;
}

/** "Já respondeu" / "nunca respondeu": pessoa sem leitura conta como não lida, e "sim" não a aceita. */
export function respondeuComoPedido(conversa: ConversaDaPessoa | undefined, respondeu: "sim" | "nao"): boolean {
  if (!conversa) return false;
  return respondeu === "sim" ? conversa.respondeu : !conversa.respondeu;
}

/** Parado há N dias ou mais: houve contato, e o último foi há N dias ou mais. Sem contato nenhum não é "parado" (é novo). */
export function paradoHaPeloMenos(conversa: ConversaDaPessoa | undefined, dias: number, agora: Date): boolean {
  if (!conversa?.ultimoContatoEm) return false;
  return Date.parse(conversa.ultimoContatoEm) <= agora.getTime() - dias * 86_400_000;
}

// ── Criar a lista (depois do "sim") ──────────────────────────────────────

export type ImovelDaLista = {
  id: string;
  nome: string;
  slug: string;
  bairro: string;
  cidade: string;
  precoAPartir: number | null;
  dormitorios: number[];
};

/** As variáveis do texto que saem do imóvel e de quem pede (`contextoDaLista`, o da tela). */
export function contextoDoPedido(p: { imovel: ImovelDaLista | null; link: string | null; corretorNome: string | null }): ContextoTemplate {
  return contextoDaLista({
    imovel: p.imovel
      ? {
          nome: p.imovel.nome,
          bairro: p.imovel.bairro,
          cidade: p.imovel.cidade,
          precoAPartir: p.imovel.precoAPartir,
          tipologias: p.imovel.dormitorios.map((d) => ({ dormitorios: d })) as never,
        }
      : null,
    linkDoImovel: p.link,
    corretorNome: p.corretorNome,
  });
}

export type ResultadoDaListaNova =
  | { ok: true; campanhaId: string; total: number; semWhatsapp: number }
  | { ok: false; erro: string };

/**
 * Cria a lista e a fila, pelo número de quem pediu. O que o "sim" confirmou
 * são os `leadIds`; aqui o público é refeito com a régua da tela e só vale
 * a INTERSEÇÃO (a mesma segurança de "Escolher um por um"): quem pediu para
 * sair, entrou em outra lista ou mudou de carteira desde a proposta não entra.
 */
export async function criarListaPeloCentral(
  supabase: Supa,
  externos: ExternosDaLista,
  p: {
    grupoId: string;
    corretorId: string;
    corretorNome: string | null;
    titulo: string;
    imovel: ImovelDaLista | null;
    link: string | null;
    /** `compradores` só com imóvel; o resto vai como a seleção que o "sim" confirmou. */
    filtro: "selecionados" | "compradores";
    leadIds: string[];
    mensagemBase: string;
  },
): Promise<ResultadoDaListaNova> {
  const titulo = p.titulo.trim();
  if (!titulo || !p.mensagemBase.trim()) return { ok: false, erro: "Faltou o título ou o texto da lista." };
  if (!externos.provedorConfigurado()) return { ok: false, erro: MOTIVO_SEM_PROVEDOR };

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("status_conexao, instance_name")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .maybeSingle();
  if (instancia?.status_conexao !== "conectado") return { ok: false, erro: MOTIVO_DESCONECTADO };

  const contexto = contextoDoPedido({ imovel: p.imovel, link: p.link, corretorNome: p.corretorNome });
  if (variaveisSemValor(p.mensagemBase, contexto).length > 0) {
    return { ok: false, erro: "O texto usa um dado que o cadastro do imóvel não tem. Mande o texto de novo sem ele." };
  }
  if (p.filtro === "compradores" && !p.imovel) return { ok: false, erro: "Compradores só existem em relação a um imóvel." };
  const imovelSlug = p.filtro === "compradores" ? p.imovel!.slug : null;

  let elegiveis: PessoaDaLista[];
  try {
    const publico = await publicoDaListaPeloCentral(supabase, {
      grupoId: p.grupoId,
      corretorId: p.corretorId,
      filtro: p.filtro,
      imovelSlug,
    });
    const escolhidos = new Set(p.leadIds);
    elegiveis = publico.pessoas.filter((x) => escolhidos.has(x.id));
  } catch {
    // Falha fechada (a tela faz igual): sem provar quem recebeu lista
    // recentemente, ninguém entra na fila.
    return { ok: false, erro: "Não consegui conferir os contatos recentes agora. Peça de novo daqui a pouco." };
  }
  if (elegiveis.length === 0) {
    return { ok: false, erro: "Ninguém da lista pode receber agora: entraram em outra lista, pediram para sair ou mudaram de carteira." };
  }

  // Número sem WhatsApp sai ANTES da fila (07/10/2026, a conta da Bruna).
  // Só sai quem o provedor diz que NÃO tem; "não sei" fica.
  const existencia = await externos.conferirNumeros({
    instanceName: instancia.instance_name ?? "",
    telefones: elegiveis.map((x) => x.telefone),
  });
  const antes = elegiveis.length;
  elegiveis = elegiveis.filter((x) => existencia.get(x.telefone) !== false);
  const semWhatsapp = antes - elegiveis.length;
  if (elegiveis.length === 0) return { ok: false, erro: "Nenhum dos números desta lista tem WhatsApp. Confira os telefones dos clientes." };

  // O limite do PLANO, antes de enfileirar qualquer coisa: a lista que não
  // cabe é recusada inteira, com a conta (o limite do dia é outra régua).
  const plano = await externos.limiteDoPlano(p.grupoId, elegiveis.length);
  if (!plano.ok) return { ok: false, erro: plano.erro };

  const criterio: CriterioDaLista = { filtro: p.filtro, imovelSlug, recorte: null };
  const { data: campanha, error: erroCampanha } = await supabase
    .from("whatsapp_campanhas")
    .insert({
      corretor_id: p.corretorId,
      titulo: titulo.slice(0, 120),
      empreendimento_id: p.imovel?.id ?? null,
      mensagem_base: p.mensagemBase,
      mensagem_base_b: null,
      total_leads: elegiveis.length,
      status: "em_andamento",
      // Sempre false: lista "de qualquer hora" não existe (09/10 e 27/10/2026).
      ignorar_janela: false,
      criterio,
      viva: false,
      viva_ate: null,
      // Sem foto: primeiro contato vai sem mídia (0217), e a foto vai quando a pessoa responder.
      midias: [],
      contexto_template: contexto,
      template_id: null,
    })
    .select("id")
    .single();
  if (erroCampanha || !campanha) return { ok: false, erro: "Não consegui criar a lista agora." };

  // Fila SEM IA, como na tela: a reescrita e a conferência do texto (0173)
  // acontecem no envio, um item por vez.
  const fila = montarFilaCampanha({
    campanhaId: campanha.id,
    leads: elegiveis.map((x) => ({ id: x.id, nome: x.nome, telefone: x.telefone })),
    mensagemBase: p.mensagemBase,
    empreendimentoNome: p.imovel?.nome,
    contexto,
    regiaoDaCasa: await externos.regiaoDaCasa(p.grupoId),
  });
  const { error: erroFila } = await supabase.from("whatsapp_campanhas_fila").insert(
    fila.map((item) => ({
      campanha_id: campanha.id,
      lead_id: item.leadId,
      telefone: item.telefone,
      mensagem_personalizada: item.mensagemPersonalizada,
      personalizado_por_ia: item.personalizadoPorIA,
      status: item.status,
      agendado_para: item.agendadoPara,
      variante: item.variante ?? null,
    })),
  );
  if (erroFila) {
    // Lista sem fila é um card fantasma no histórico: melhor desfazer.
    await supabase.from("whatsapp_campanhas").delete().eq("id", campanha.id).eq("grupo_id", p.grupoId).eq("corretor_id", p.corretorId);
    return { ok: false, erro: "Não consegui montar a fila de envio agora." };
  }

  externos.acender();
  return { ok: true, campanhaId: campanha.id, total: elegiveis.length, semWhatsapp };
}

// ── Acompanhar, pausar, retomar e desfazer ───────────────────────────────

export type StatusDaLista = "rascunho" | "em_andamento" | "pausada" | "concluida" | "cancelada";

export type ListaDoCorretor = {
  id: string;
  titulo: string;
  imovel: string | null;
  imovelId: string | null;
  status: StatusDaLista;
  criadaEm: string;
  totalLeads: number;
  pausaAutomatica: string | null;
};

/** As listas DESTE corretor (nunca as de um colega, nem para o gestor: é o que a tela mostra). */
export async function listasDoCorretor(supabase: Supa, p: { grupoId: string; corretorId: string }): Promise<ListaDoCorretor[]> {
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .select("id, titulo, status, created_at, total_leads, pausa_automatica, empreendimento_id, empreendimento:empreendimentos(nome)")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .neq("status", "rascunho")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((c) => {
    const imovel = (Array.isArray(c.empreendimento) ? c.empreendimento[0] : c.empreendimento) as { nome: string } | null | undefined;
    return {
      id: c.id,
      titulo: c.titulo,
      imovel: imovel?.nome ?? null,
      imovelId: c.empreendimento_id ?? null,
      status: c.status,
      criadaEm: c.created_at,
      totalLeads: c.total_leads,
      pausaAutomatica: c.status === "pausada" ? c.pausa_automatica : null,
    };
  });
}

export type NumerosDaLista = {
  pessoas: number;
  enviados: number;
  responderam: number;
  /** Ainda na fila para sair hoje. */
  naFilaHoje: number;
  /** Na fila, mas marcados para amanhã ou depois (primeiro contato sem vaga, cota, horário). */
  ficaramParaDepois: number;
  /** Desses, quantos esperam vaga de primeiro contato. */
  esperandoPrimeiroContato: number;
  /** Não vão sair: pediram para sair, sem WhatsApp, conversa recente, duplicado... */
  naoVaoSair: number;
};

/**
 * Os NÚMEROS de uma lista do corretor, lidos da fila (as mesmas colunas que
 * a tela mostra em "Ver quem recebeu"). Nenhum nome e nenhum texto de
 * cliente: o central responde quantos, e quem é fica no painel.
 */
export async function numerosDaLista(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; campanhaId: string; agora: Date },
): Promise<NumerosDaLista | null> {
  const { data: dona } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("id", p.campanhaId)
    .maybeSingle();
  if (!dona) return null;
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("status, agendado_para, erro_motivo")
    .eq("grupo_id", p.grupoId)
    .eq("campanha_id", p.campanhaId)
    .limit(10000);
  const amanha = inicioDeAmanhaEmSaoPaulo(p.agora);
  const itens = data ?? [];
  const pendentes = itens.filter((i) => i.status === "pendente");
  const depois = pendentes.filter((i) => new Date(i.agendado_para).getTime() >= new Date(amanha).getTime());
  return {
    pessoas: itens.length,
    enviados: itens.filter((i) => i.status === "enviado" || i.status === "respondido").length,
    responderam: itens.filter((i) => i.status === "respondido").length,
    naFilaHoje: pendentes.length - depois.length,
    ficaramParaDepois: depois.length,
    esperandoPrimeiroContato: depois.filter((i) => (i.erro_motivo ?? "").startsWith("Esta pessoa nunca falou com você")).length,
    naoVaoSair: itens.filter((i) => i.status === "erro").length,
  };
}

/**
 * Pausar UMA lista (o `pausarCampanha` da tela): só o estado. O disparador
 * pega apenas lista `em_andamento` e confere de novo antes de cada mensagem.
 */
export async function pausarListaPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; campanhaId: string },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .update({ status: "pausada" })
    .eq("id", p.campanhaId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("status", "em_andamento")
    .select("id");
  return data && data.length > 0 ? { ok: true } : { ok: false, erro: "Esta lista não está enviando agora." };
}

/**
 * Retomar UMA lista (o `retomarCampanha` da tela, passo a passo): os sinais
 * de hoje viram a base da pausa automática (0172), para ela só voltar com
 * sinais NOVOS; a conferência de texto recomeça para os itens que esperavam
 * texto; e a corrente do disparador acende. Retomar não reagenda nada: as
 * travas valem de novo em cada envio.
 */
export async function retomarListaPeloCentral(
  supabase: Supa,
  externos: ExternosDaLista,
  p: { grupoId: string; corretorId: string; campanhaId: string },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  // A lista é DESTE corretor, no grupo dele, antes de ler os sinais dela.
  const { data: dona } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("id", p.campanhaId)
    .eq("status", "pausada")
    .maybeSingle();
  if (!dona) return { ok: false, erro: "Esta lista não está pausada." };

  const sinais = await lerSinaisDaLista(supabase, p.campanhaId);
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .update({ status: "em_andamento", pausa_automatica: null, ...(sinais ? { pausa_base: sinais } : {}) })
    .eq("id", p.campanhaId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("status", "pausada")
    .select("id");
  if (!data || data.length === 0) return { ok: false, erro: "Esta lista não está pausada." };

  await supabase
    .from("whatsapp_campanhas_fila")
    .update({ tentativas_texto: 0 })
    .eq("campanha_id", p.campanhaId)
    .eq("grupo_id", p.grupoId)
    .eq("status", "pendente")
    .gt("tentativas_texto", 0);
  await supabase
    .from("whatsapp_campanhas_fila")
    .update({ erro_motivo: null })
    .eq("campanha_id", p.campanhaId)
    .eq("grupo_id", p.grupoId)
    .eq("status", "pendente")
    .in("erro_motivo", [MOTIVO_TEXTO_PARECIDO, MOTIVO_TEXTO_SEM_IA]);
  externos.acender();
  return { ok: true };
}

/** Saiu alguma mensagem desta lista? "Pode ter saído" (envio sem comprovante) conta como saída. */
async function mensagensQueSairam(supabase: Supa, p: { grupoId: string; campanhaId: string }): Promise<number> {
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("status, erro_motivo")
    .eq("grupo_id", p.grupoId)
    .eq("campanha_id", p.campanhaId)
    .in("status", ["enviado", "respondido", "erro"])
    .limit(10000);
  return (data ?? []).filter((i) => i.status !== "erro" || i.erro_motivo === MOTIVO_ENVIO_INCERTO).length;
}

export type DesfazerDaLista =
  /** `enviados` > 0 só se uma mensagem já estava no meio do envio ao cancelar. */
  | { desfecho: "cancelada"; removidos: number; enviados: number }
  | { desfecho: "pausada"; enviados: number }
  | { desfecho: "ja_terminou"; status: StatusDaLista }
  | { desfecho: "nao_achou" };

/**
 * O "desfaz" da lista criada pelo central (spec 4.6): o que não saiu ainda
 * pode ser desfeito; a lista que já começou a sair só PAUSA, porque mensagem
 * entregue não volta.
 *
 * Pausa primeiro: a partir daí o disparador não pega mais a lista, e a
 * contagem do que saiu para de mudar. Sem nada enviado, cancela como o
 * `cancelarCampanha` da tela (estado `cancelada` e pendentes apagados). Se
 * uma mensagem que já estava no meio do envio aparecer depois de cancelar,
 * o resultado conta (`enviados`), para a resposta não dizer "nada saiu".
 */
export async function desfazerListaPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; campanhaId: string },
): Promise<DesfazerDaLista> {
  await pausarListaPeloCentral(supabase, p);
  const { data: lista } = await supabase
    .from("whatsapp_campanhas")
    .select("id, status")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("id", p.campanhaId)
    .maybeSingle();
  if (!lista) return { desfecho: "nao_achou" };
  if (lista.status !== "pausada") return { desfecho: "ja_terminou", status: lista.status };

  const saidas = await mensagensQueSairam(supabase, p);
  if (saidas > 0) return { desfecho: "pausada", enviados: saidas };

  const { data: mudou } = await supabase
    .from("whatsapp_campanhas")
    .update({ status: "cancelada", viva: false })
    .eq("id", p.campanhaId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("status", "pausada")
    .select("id");
  // Retomada por outra mão entre a pausa e o cancelamento: fica como está.
  if (!mudou || mudou.length === 0) return { desfecho: "pausada", enviados: 0 };
  const { data: removidos } = await supabase
    .from("whatsapp_campanhas_fila")
    .delete()
    .eq("campanha_id", p.campanhaId)
    .eq("grupo_id", p.grupoId)
    .eq("status", "pendente")
    .select("id");
  return { desfecho: "cancelada", removidos: removidos?.length ?? 0, enviados: await mensagensQueSairam(supabase, p) };
}
