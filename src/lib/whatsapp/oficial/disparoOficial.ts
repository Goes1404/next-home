import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { telefoneCanonico } from "@/lib/central/telefone";
import { dentroDaJanela } from "@/lib/whatsapp/antiBan";
import { lerCasaDoGrupo } from "@/lib/whatsapp/casaDoGrupo";
import {
  atualizarProgressoCampanhas,
  cadastrosDoMesmoTelefone,
  contarPendentes,
  corretorFalouComOLead,
  leadParaEnvio,
  listaJaSaiuPara,
  midiasDoCatalogo,
} from "@/lib/whatsapp/campaignDispatcher";
import { MOTIVO_CONVERSA_RECENTE } from "@/lib/whatsapp/contextoDaCampanha";
import { motivoDoMesmoTelefone, motivoParaNaoEnviar } from "@/lib/whatsapp/listaDeTransmissao";
import type { MidiaDaLista } from "@/lib/whatsapp/midiasDaLista";
import {
  avancarLeadParaPrimeiroContato,
  destravarDisparo,
  registrarTentativaDeContato,
  travarDisparo,
} from "@/lib/whatsapp/repositorio";
import { leadsComConsentimento, registrarConsentimento } from "./consentimento";
import { enviarModeloOficial, type Remetente } from "./envio";
import { decidirErroDaMeta } from "./erros";
import { componentesDoEnvio, renderizarModelo, valoresDoEnvio } from "./modelos";
import { definicaoDe, type ModeloOficial } from "./modelosServidor";
import { limiteDiario, pausarNumero, tokenDoNumero, type NumeroOficial } from "./numeros";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O disparador das listas pelo número OFICIAL (F2 do roadmap).
 *
 * Fica de fora tudo o que existe para proteger número COMUM e que no número
 * oficial ou não faz sentido ou é proibido:
 *   - espaçamento de 1min30, aquecimento pelo uso, cota diária do número,
 *     teto de 10 primeiros contatos por dia: a Meta tem o limite dela
 *     (pessoas novas por 24 h, do portfólio), que este módulo respeita;
 *   - reescrita do texto pela IA (`variarSemRepetir`): o texto é o do modelo
 *     APROVADO; mudar uma palavra é mandar um modelo que a Meta não aprovou.
 *
 * Fica o que é regra do produto e cortesia:
 *   - janela de 9h às 20h59, de segunda a sábado (`dentroDaJanela`);
 *   - pausar e cancelar valem no meio da fila;
 *   - quem pediu para sair, foi arquivado ou mudou de dono não recebe
 *     (`motivoParaNaoEnviar`); o mesmo telefone não recebe duas vezes nem
 *     passa por cima de um pedido de parada noutro cadastro;
 *   - o corretor falou com o lead nas últimas 24 h: a lista não interrompe.
 *
 * E entra o que é da Meta e da lei:
 *   - só quem tem consentimento de marketing no WhatsApp registrado;
 *   - o modelo tem de estar aprovado, ser deste número e deste grupo;
 *   - o limite de pessoas por 24 h e o teto do mês que o gestor definiu;
 *   - cada erro da Meta tem seu desfecho (`erros.ts`).
 *
 * Mesma regra da Evolution: o item só vira `enviado` com o `wamid`. Entrega,
 * leitura, falha posterior e cobrança chegam pelo webhook (`statusOficial`).
 */

/** Itens por número numa chamada. A Meta aguenta muito mais; a função não. */
const ITENS_POR_CHAMADA = 40;
const TRAVA_SEGUNDOS = 120;
const MAX_TENTATIVAS = 3;

export const MOTIVO_SEM_CONSENTIMENTO =
  "Sem consentimento de marketing no WhatsApp registrado: a lista oficial só sai para quem autorizou.";
export const MOTIVO_MODELO_INDISPONIVEL = "O modelo desta lista não está aprovado (ou não é deste número). Troque o modelo para retomar.";
export const MOTIVO_TETO_DO_MES = "O teto mensal de mensagens do número oficial foi atingido. A lista volta no mês que vem, ou o gestor aumenta o teto.";

export type ResultadoOficial = {
  processados: number;
  enviados: number;
  erros: number;
  restantes: number;
  deveContinuar: boolean;
  diagnostico: string[];
};

export async function processarFilaOficial(params?: {
  corretorId?: string;
  orcamentoMs?: number;
  dono?: string;
  agora?: () => Date;
}): Promise<ResultadoOficial> {
  const agora = params?.agora ?? (() => new Date());
  const fim = Date.now() + (params?.orcamentoMs ?? 12_000);
  const dono = params?.dono ?? `oficial-${crypto.randomUUID()}`;
  const resultado: ResultadoOficial = { processados: 0, enviados: 0, erros: 0, restantes: 0, deveContinuar: false, diagnostico: [] };

  if (!dentroDaJanela(agora())) return resultado;

  const supabase = createServiceClient();

  // Eventos crus do webhook guardam 30 dias.
  await supabase
    .from("whatsapp_oficial_eventos")
    .delete()
    .lt("created_at", new Date(agora().getTime() - 30 * 86_400_000).toISOString());

  let consulta = supabase
    .from("whatsapp_campanhas")
    .select("id, numero_oficial_id")
    .eq("canal", "oficial")
    .eq("status", "em_andamento");
  if (params?.corretorId) consulta = consulta.eq("corretor_id", params.corretorId);
  const { data: listas, error } = await consulta;
  if (error) {
    // 42703/42P01: a 0255 ainda não foi aplicada; não há lista oficial.
    if (error.code !== "42703" && error.code !== "42P01") console.warn("[oficial] listas não lidas:", error.message);
    return resultado;
  }

  const porNumero = new Map<string, string[]>();
  for (const l of listas ?? []) {
    if (!l.numero_oficial_id) continue;
    porNumero.set(l.numero_oficial_id, [...(porNumero.get(l.numero_oficial_id) ?? []), l.id]);
  }

  for (const [numeroId, ids] of porNumero) {
    if (Date.now() >= fim) {
      resultado.deveContinuar = true;
      break;
    }
    const parcial = await processarNumero(supabase, numeroId, ids, { fim, dono, agora });
    resultado.processados += parcial.processados;
    resultado.enviados += parcial.enviados;
    resultado.erros += parcial.erros;
    resultado.restantes += parcial.restantes;
    if (parcial.deveContinuar) resultado.deveContinuar = true;
    resultado.diagnostico.push(...parcial.diagnostico);
  }
  return resultado;
}

async function processarNumero(
  supabase: Supa,
  numeroId: string,
  idsCampanhas: string[],
  ctx: { fim: number; dono: string; agora: () => Date },
): Promise<ResultadoOficial> {
  const r: ResultadoOficial = { processados: 0, enviados: 0, erros: 0, restantes: 0, deveContinuar: false, diagnostico: [] };

  const { data: numero } = await supabase.from("whatsapp_numeros_oficiais").select("*").eq("id", numeroId).maybeSingle();
  if (!numero || numero.estado !== "ativo") {
    r.diagnostico.push(
      numero?.estado === "pausado"
        ? `O número oficial está pausado: ${numero.motivo_estado ?? "veja a tela do número oficial"}.`
        : "O número oficial desta lista não está ativo.",
    );
    return r;
  }
  if (await grupoSuspenso(numero.grupo_id)) {
    r.diagnostico.push("As listas estão pausadas: mensalidade em atraso.");
    return r;
  }
  const credencial = tokenDoNumero(numero);
  if ("erro" in credencial) {
    r.diagnostico.push(credencial.erro);
    return r;
  }
  const remetente: Remetente = { phoneNumberId: numero.phone_number_id, token: credencial.token };

  const escopo = `oficial:${numero.id}`;
  if (!(await travarDisparo(escopo, ctx.dono, TRAVA_SEGUNDOS))) return r;

  try {
    const limite = limiteDiario(numero.limite_de_envio);
    const listasDoNumero = await idsDoNumero(supabase, numero.id);
    let pessoasEm24h = await pessoasNasUltimas24h(supabase, listasDoNumero, ctx.agora());
    let noMes = numero.teto_mensal === null ? 0 : await enviadasNoMes(supabase, listasDoNumero, ctx.agora());

    const casa = await lerCasaDoGrupo(numero.grupo_id);
    const modelos = new Map<string, ModeloOficial | null>();
    const ativas = [...idsCampanhas];

    while (r.processados < ITENS_POR_CHAMADA && ativas.length > 0) {
      if (Date.now() >= ctx.fim) {
        r.deveContinuar = true;
        break;
      }
      if (pessoasEm24h >= limite) {
        r.diagnostico.push(`Limite da Meta para este número: ${limite} pessoas novas em 24 h. A fila continua quando ele liberar.`);
        break;
      }
      if (numero.teto_mensal !== null && noMes >= numero.teto_mensal) {
        await supabase
          .from("whatsapp_campanhas")
          .update({ status: "pausada", pausa_automatica: MOTIVO_TETO_DO_MES })
          .in("id", ativas)
          .eq("status", "em_andamento");
        r.diagnostico.push(MOTIVO_TETO_DO_MES);
        break;
      }

      const { data: itens } = await supabase
        .from("whatsapp_campanhas_fila")
        .select("id, campanha_id, lead_id, telefone, tentativas, agendado_para, erro_meta_codigo")
        .in("campanha_id", ativas)
        .eq("status", "pendente")
        .lte("agendado_para", ctx.agora().toISOString())
        .order("agendado_para", { ascending: true })
        .limit(1);
      const item = itens?.[0];
      if (!item) break;

      // A lista pode ter sido pausada ou cancelada durante esta chamada.
      const { data: lista } = await supabase
        .from("whatsapp_campanhas")
        .select("id, corretor_id, grupo_id, criterio, midias, empreendimento_id, modelo_oficial_id, numero_oficial_id, empreendimento:empreendimentos(nome)")
        .eq("id", item.campanha_id)
        .eq("status", "em_andamento")
        .eq("canal", "oficial")
        .maybeSingle();
      if (!lista || lista.numero_oficial_id !== numero.id || lista.grupo_id !== numero.grupo_id) {
        ativas.splice(ativas.indexOf(item.campanha_id), 1);
        continue;
      }

      // O modelo: aprovado, deste número, deste grupo. Senão a lista pausa.
      if (!modelos.has(lista.id)) modelos.set(lista.id, await modeloUtilizavel(supabase, lista.modelo_oficial_id, numero));
      const modelo = modelos.get(lista.id) ?? null;
      if (!modelo) {
        await supabase
          .from("whatsapp_campanhas")
          .update({ status: "pausada", pausa_automatica: MOTIVO_MODELO_INDISPONIVEL })
          .eq("id", lista.id)
          .eq("status", "em_andamento");
        ativas.splice(ativas.indexOf(lista.id), 1);
        continue;
      }

      r.processados++;
      const erroNoItem = async (motivo: string) => {
        await supabase.from("whatsapp_campanhas_fila").update({ status: "erro", erro_motivo: motivo }).eq("id", item.id).eq("status", "pendente");
      };

      // As conferências de sempre, antes de gastar uma mensagem paga.
      const lead = item.lead_id ? await leadParaEnvio(supabase, item.lead_id) : null;
      const barrado = motivoParaNaoEnviar(lead, {
        corretor_id: lista.corretor_id,
        criterio: lista.criterio as { filtro?: string } | null,
      });
      if (barrado) {
        await erroNoItem(barrado);
        continue;
      }
      const irmaos = item.lead_id ? await cadastrosDoMesmoTelefone(supabase, item.lead_id) : [];
      const doMesmoTelefone = motivoDoMesmoTelefone({
        outroCadastroNaoContatar: irmaos.some((l) => l.nao_contatar_em !== null),
        jaRecebeuEstaLista: irmaos.length > 0 && (await listaJaSaiuPara(supabase, lista.id, irmaos.map((l) => l.id))),
      });
      if (doMesmoTelefone) {
        await erroNoItem(doMesmoTelefone);
        continue;
      }
      if (item.lead_id && (await corretorFalouComOLead(supabase, item.lead_id, irmaos.map((l) => l.id)))) {
        await erroNoItem(MOTIVO_CONVERSA_RECENTE);
        continue;
      }
      const leadId = item.lead_id;
      const consentidos = leadId ? await leadsComConsentimento(supabase, [leadId]) : null;
      if (!leadId || !consentidos?.has(leadId)) {
        await erroNoItem(MOTIVO_SEM_CONSENTIMENTO);
        continue;
      }

      // Os valores das variáveis e a foto do cabeçalho.
      const { data: dono } = await supabase.from("corretores").select("nome").eq("id", lista.corretor_id).maybeSingle();
      const imovel = (Array.isArray(lista.empreendimento) ? lista.empreendimento[0] : lista.empreendimento) as { nome: string } | null;
      const valores = valoresDoEnvio({
        nomeDoCliente: lead?.nome,
        imovel: imovel?.nome,
        nomeDoCorretor: dono?.nome,
        nomeDaCasa: casa.nomeDaCasa,
      });
      const definicao = definicaoDe(modelo);
      let imagem: string | null = null;
      if (definicao.cabecalho === "imagem") {
        const fotos = await midiasDoCatalogo(supabase, lista.empreendimento_id, (lista.midias ?? []) as MidiaDaLista[]);
        imagem = fotos.find((m) => m.tipo === "foto")?.url ?? modelo.cabecalho_imagem_url;
      }

      const envio = await enviarModeloOficial({
        remetente,
        telefone: item.telefone,
        nome: modelo.nome,
        idioma: modelo.idioma,
        componentes: componentesDoEnvio(definicao, valores, imagem),
      });

      if (!envio.enviado) {
        r.erros++;
        const decisao = decidirErroDaMeta(envio.erro);
        const tentativas = (item.tentativas ?? 0) + 1;
        const base = { erro_meta_codigo: envio.erro.codigo, erro_motivo: decisao.motivo, tentativas };
        if (decisao.tipo === "pausar_numero") {
          await supabase.from("whatsapp_campanhas_fila").update(base).eq("id", item.id);
          await pausarNumero(supabase, numero.id, decisao.motivo);
          r.diagnostico.push(decisao.motivo);
          break;
        }
        if (decisao.tipo === "pausar_lista") {
          await supabase.from("whatsapp_campanhas_fila").update(base).eq("id", item.id);
          await supabase
            .from("whatsapp_campanhas")
            .update({ status: "pausada", pausa_automatica: decisao.motivo })
            .eq("id", lista.id)
            .eq("status", "em_andamento");
          ativas.splice(ativas.indexOf(lista.id), 1);
          continue;
        }
        if (decisao.tipo === "reagendar") {
          const jaVoltou = decisao.umaVez && item.erro_meta_codigo === envio.erro.codigo;
          await supabase
            .from("whatsapp_campanhas_fila")
            .update(
              jaVoltou || (!decisao.umaVez && tentativas >= MAX_TENTATIVAS)
                ? { ...base, status: "erro" as const }
                : { ...base, agendado_para: new Date(Date.now() + decisao.minutos * 60_000).toISOString() },
            )
            .eq("id", item.id);
          continue;
        }
        if (decisao.tipo === "optout") {
          await registrarConsentimento(supabase, { leadId, concedido: false, origem: "meta_131050" });
        }
        await supabase.from("whatsapp_campanhas_fila").update({ ...base, status: "erro" }).eq("id", item.id);
        continue;
      }

      // Saiu: o item, a conversa oficial e o funil.
      r.enviados++;
      pessoasEm24h++;
      noMes++;
      const texto = renderizarModelo(modelo.corpo, valores);
      await supabase
        .from("whatsapp_campanhas_fila")
        .update({
          status: "enviado",
          enviado_em: new Date().toISOString(),
          wamid: envio.wamid,
          tentativas: (item.tentativas ?? 0) + 1,
          erro_motivo: null,
          mensagem_personalizada: texto,
          primeiro_contato: null,
        })
        .eq("id", item.id);
      await registrarNaConversaOficial(supabase, {
        numero,
        telefone: item.telefone,
        leadId,
        corretorId: lead?.corretor_id ?? lista.corretor_id,
        texto,
        wamid: envio.wamid,
        filaId: item.id,
      });
      await avancarLeadParaPrimeiroContato(leadId, "lista");
      await registrarTentativaDeContato(leadId);
      await travarDisparo(escopo, ctx.dono, TRAVA_SEGUNDOS);
    }

    await atualizarProgressoCampanhas(supabase, idsCampanhas);
    const restantes = await contarPendentes(supabase, idsCampanhas);
    r.restantes = restantes.total;
    if (restantes.total > 0 && r.processados >= ITENS_POR_CHAMADA) r.deveContinuar = true;
    return r;
  } finally {
    await destravarDisparo(escopo, ctx.dono);
  }
}

/** O modelo da lista, só se estiver aprovado e for deste número e grupo. */
async function modeloUtilizavel(supabase: Supa, modeloId: string | null, numero: NumeroOficial): Promise<ModeloOficial | null> {
  if (!modeloId) return null;
  const { data } = await supabase.from("whatsapp_modelos_oficiais").select("*").eq("id", modeloId).maybeSingle();
  if (!data || data.estado !== "aprovado" || data.numero_oficial_id !== numero.id || data.grupo_id !== numero.grupo_id) return null;
  return data;
}

/** As listas (de qualquer status) deste número: o limite conta todas. */
async function idsDoNumero(supabase: Supa, numeroId: string): Promise<string[]> {
  const { data } = await supabase.from("whatsapp_campanhas").select("id").eq("numero_oficial_id", numeroId);
  return (data ?? []).map((l) => l.id);
}

/**
 * Pessoas DIFERENTES que receberam lista por este número nas últimas 24 h.
 * É assim que a Meta conta o limite (pessoas fora da janela de atendimento,
 * em 24 h móveis). Conta pelos itens com `wamid`: só o que a Meta aceitou.
 */
async function pessoasNasUltimas24h(supabase: Supa, ids: string[], agora: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("telefone")
    .in("campanha_id", ids)
    .not("wamid", "is", null)
    .gte("enviado_em", new Date(agora.getTime() - 24 * 3_600_000).toISOString())
    .limit(100_000);
  return new Set((data ?? []).map((l) => telefoneCanonico(l.telefone))).size;
}

/** Mensagens de lista que saíram por este número no mês (de São Paulo). */
async function enviadasNoMes(supabase: Supa, ids: string[], agora: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const inicioDoMes = new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), 1, 3, 0, 0)).toISOString();
  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .in("campanha_id", ids)
    .not("wamid", "is", null)
    .gte("enviado_em", inicioDoMes);
  return count ?? 0;
}

/**
 * A mensagem da lista entra na conversa oficial do cliente: é o que a IA lê
 * quando ele responder, e o que o corretor vê na ficha.
 */
async function registrarNaConversaOficial(
  supabase: Supa,
  p: {
    numero: NumeroOficial;
    telefone: string;
    leadId: string | null;
    corretorId: string | null;
    texto: string;
    wamid: string;
    filaId: string;
  },
): Promise<void> {
  const telefone = telefoneCanonico(p.telefone);
  if (!/^[0-9]{8,15}$/.test(telefone)) return;
  const { data: conversa, error } = await supabase
    .from("whatsapp_oficial_conversas")
    .upsert(
      {
        grupo_id: p.numero.grupo_id,
        numero_oficial_id: p.numero.id,
        telefone,
        lead_id: p.leadId,
        corretor_id: p.corretorId,
        ultima_mensagem: p.texto.slice(0, 500),
        ultima_interacao_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "numero_oficial_id,telefone" },
    )
    .select("id")
    .single();
  if (error || !conversa) {
    console.warn("[oficial] conversa da lista não registrada:", error?.message);
    return;
  }
  await supabase.from("whatsapp_oficial_mensagens").insert({
    conversa_id: conversa.id,
    remetente: "bot",
    tipo: "modelo",
    conteudo: p.texto,
    wamid: p.wamid,
    status_entrega: "enviada",
    fila_id: p.filaId,
  });
}
