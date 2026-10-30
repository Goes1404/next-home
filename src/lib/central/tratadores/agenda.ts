import {
  conferirHorarioDaVisita,
  desmarcarVisitaPorMensagem,
  lerVisitaDoLead,
  marcarVisitaPorMensagem,
  mesmoInstante,
  visitaFutura,
  visitasNoIntervalo,
  voltarVisitaPorMensagem,
  type EscopoDaAgenda,
  type EstadoDaVisita,
} from "@/lib/agenda/agendaPorMensagem";
import { cancelarCompromisso, criarBloqueio, criarReuniao } from "@/lib/agenda/compromissos";
import {
  diaInteiro,
  lerQuando,
  rotuloDoDiaDoCalendario,
  rotuloDoInstante,
  rotuloDoIntervalo,
  rotuloDoPeriodo,
} from "@/lib/agenda/quandoEmTexto";
import { apagarAnotacaoPessoal, criarAnotacaoPessoal } from "@/lib/anotacoes/anotacaoPessoal";
import type { Acao, Consulta, ContextoDoCentral, Preparo, ResultadoDaAcao } from "../executar";
import { resolverLead, respostaDeLeadIncerto } from "./resolverLead";

/**
 * Frente C — agenda da onda 1: visita (6), agenda_pessoal (21).
 *
 * Contrato em `../executar.ts`: `preparar` resolve o lead e o "quando" em
 * data e hora de São Paulo, confere o horário e devolve o resumo com ids e
 * instantes prontos (nunca grava); o "sim" roda `executar` só com esses
 * `dados`; `desfazer` volta atrás em até 24 h.
 *
 * Nada aqui escreve em tabela: visita por `agenda/agendaPorMensagem.ts`
 * (que usa `agendarVisitaLead`/`cancelarVisitaLead`), reunião e bloqueio por
 * `agenda/compromissos.ts`, anotação por `anotacoes/anotacaoPessoal.ts`. O
 * escopo (grupo, papel, quem pede) é sempre o da identificação.
 *
 * Data vaga não vira horário inventado: "sexta à tarde" para visita ou
 * reunião volta como pergunta da hora. Para bloqueio, o período é o horário
 * ("bloqueia minha tarde de sexta" = 13h às 18h), e o resumo mostra qual.
 */

/** Ano errado ("2027" no lugar de "2026") não vira compromisso: a régua de `comandos/interpretar.ts`. */
const LIMITE_DO_FUTURO_MS = 366 * 24 * 3600_000;
const UMA_HORA_MS = 3600_000;
const TETO_DO_TEXTO = 300;

const EXEMPLO_DE_QUANDO = "Diga o dia e a hora (ex.: sábado 10h).";

function escopoDe(ctx: ContextoDoCentral): EscopoDaAgenda {
  return { grupoId: ctx.grupoId, corretorId: ctx.corretorId, ehGestor: ctx.papel === "gestor" };
}

function texto(valor: unknown, teto = TETO_DO_TEXTO): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, teto) : null;
}

const resposta = (resultado: unknown): Preparo => ({ tipo: "resposta", resultado });
const pergunta = (p: string): Preparo => resposta({ pergunta: p });
const recusa = (erro: string, extra: Record<string, unknown> = {}): Preparo => resposta({ erro, ...extra });

/** Instante válido para gravar: nem passado, nem a mais de um ano. Senão, o que dizer. */
function instanteAceitavel(inicio: Date, agora: Date): string | null {
  if (inicio <= agora) return `${rotuloDoInstante(inicio)} já passou. Peça outra data.`;
  if (inicio.getTime() > agora.getTime() + LIMITE_DO_FUTURO_MS) return "Essa data está a mais de um ano. Confira o dia.";
  return null;
}

/**
 * O "quando" de visita e reunião: precisa de dia E hora. O que falta vira
 * pergunta; nunca se completa com um horário que a pessoa não disse.
 */
function inicioComHora(valor: unknown, agora: Date): { inicio: Date; fim: Date | null } | Preparo {
  const dito = texto(valor);
  if (!dito) return pergunta(`Para quando? ${EXEMPLO_DE_QUANDO}`);
  const q = lerQuando(dito, agora);
  switch (q.tipo) {
    case "instante": {
      const problema = instanteAceitavel(q.inicio, agora);
      return problema ? recusa(problema) : { inicio: q.inicio, fim: q.fim };
    }
    case "periodo":
      return pergunta(`Que horas, ${rotuloDoPeriodo(q.dia, q.periodo)}?`);
    case "so_dia":
      return pergunta(`Que horas, ${rotuloDoDiaDoCalendario(q.dia)}?`);
    case "hora_ambigua":
      return pergunta(`${q.hora}h da manhã ou ${q.hora + 12}h?`);
    case "sem_dia":
      return pergunta(`Qual dia? ${EXEMPLO_DE_QUANDO}`);
    case "nao_entendi":
      return pergunta(`Não entendi a data "${dito}". ${EXEMPLO_DE_QUANDO}`);
  }
}

/**
 * O intervalo do bloqueio: o período dito vale ("à tarde" = 13h às 18h, só
 * o dia = o dia todo), hora sem fim = 1 hora. Bloqueio que já começou vale
 * de agora em diante.
 */
function intervaloDoBloqueio(valor: unknown, agora: Date): { inicio: Date; fim: Date } | Preparo {
  const dito = texto(valor);
  if (!dito) return pergunta("Qual horário bloquear? (ex.: sexta das 14h às 18h)");
  const q = lerQuando(dito, agora);
  let inicio: Date;
  let fim: Date;
  switch (q.tipo) {
    case "instante":
      inicio = q.inicio;
      fim = q.fim ?? new Date(q.inicio.getTime() + UMA_HORA_MS);
      break;
    case "periodo":
      ({ inicio, fim } = q);
      break;
    case "so_dia":
      ({ inicio, fim } = diaInteiro(q.dia));
      break;
    case "hora_ambigua":
      return pergunta(`${q.hora}h da manhã ou ${q.hora + 12}h?`);
    case "sem_dia":
      return pergunta("Qual dia? (ex.: sexta das 14h às 18h)");
    case "nao_entendi":
      return pergunta(`Não entendi o horário "${dito}". Diga, por exemplo: sexta das 14h às 18h.`);
  }
  if (fim <= agora) return recusa(`${rotuloDoIntervalo(inicio, fim)} já passou. Peça outro horário.`);
  if (inicio.getTime() > agora.getTime() + LIMITE_DO_FUTURO_MS) return recusa("Essa data está a mais de um ano. Confira o dia.");
  if (inicio < agora) inicio = new Date(Math.floor(agora.getTime() / 60_000) * 60_000);
  return { inicio, fim };
}

function ehPreparo(x: object): x is Preparo {
  return "tipo" in x;
}

function lerEstado(valor: unknown): EstadoDaVisita | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.etapa !== "string" || (v.visitaEm !== null && typeof v.visitaEm !== "string")) return null;
  return { visitaEm: v.visitaEm as string | null, etapa: v.etapa };
}

function dataDos(dados: Record<string, unknown>, campo: string): Date | null {
  const valor = dados[campo];
  if (typeof valor !== "string") return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const FALHOU: ResultadoDaAcao = { ok: false, texto: "Não consegui fazer isso agora. Peça de novo." };

export function criarTratadoresDaAgenda(relogio: () => Date = () => new Date()): {
  consultas: Record<string, Consulta>;
  acoes: Record<string, Acao>;
} {
  const visita: Acao = {
    async preparar(ctx, argumentos) {
      const agora = relogio();
      const oQue = argumentos.o_que;
      if (oQue !== "marcar" && oQue !== "remarcar" && oQue !== "cancelar") {
        return pergunta("Marcar, remarcar ou cancelar a visita?");
      }
      const pedido = texto(argumentos.lead);
      if (!pedido) return pergunta("A visita é com qual cliente?");
      const achado = await resolverLead(ctx, pedido);
      if (achado.tipo !== "um") return resposta(respostaDeLeadIncerto(achado, pedido));

      const escopo = escopoDe(ctx);
      const atual = await lerVisitaDoLead(escopo, achado.lead.id);
      if (!atual) return resposta(respostaDeLeadIncerto({ tipo: "nenhum" }, pedido));
      const marcada = visitaFutura(atual, agora) ? new Date(atual.visitaEm!) : null;
      const imovel = texto(argumentos.imovel, 80);
      const noImovel = imovel ? ` no ${imovel}` : "";

      if (oQue === "cancelar") {
        if (!marcada) return recusa(`${atual.nome} não tem visita marcada.`);
        return {
          tipo: "proposta",
          resumo: `Cancelar a visita de ${atual.nome}, ${rotuloDoInstante(marcada)}`,
          dados: { o_que: "cancelar", leadId: atual.leadId, nome: atual.nome, esperada: atual.visitaEm },
        };
      }
      if (oQue === "remarcar" && !marcada) {
        return recusa(`${atual.nome} não tem visita marcada para remarcar. Pergunte se quer marcar uma.`);
      }

      const quando = inicioComHora(argumentos.quando, agora);
      if (ehPreparo(quando)) return quando;
      const nova = quando.inicio;
      if (marcada && mesmoInstante(atual.visitaEm, nova.toISOString())) {
        return recusa(`A visita de ${atual.nome} já está marcada para ${rotuloDoInstante(nova)}.`);
      }
      const horario = await conferirHorarioDaVisita(escopo, { leadId: atual.leadId, quando: nova, agora });
      if (!horario.livre) {
        return recusa(horario.motivo, {
          livres: horario.livres,
          dica: "Ofereça um dos livres e, com o escolhido, monte a proposta de novo.",
        });
      }

      // "Marcar" com visita já marcada é remarcar: o resumo diz de onde para onde antes do "sim".
      return {
        tipo: "proposta",
        resumo: marcada
          ? `Remarcar a visita de ${atual.nome}${noImovel} de ${rotuloDoInstante(marcada)} para ${rotuloDoInstante(nova)}`
          : `Marcar visita com ${atual.nome}${noImovel}, ${rotuloDoInstante(nova)}`,
        dados: {
          o_que: marcada ? "remarcar" : "marcar",
          leadId: atual.leadId,
          nome: atual.nome,
          quando: nova.toISOString(),
          esperada: atual.visitaEm,
        },
      };
    },

    async executar(ctx, dados) {
      const agora = relogio();
      const escopo = escopoDe(ctx);
      const leadId = typeof dados.leadId === "string" ? dados.leadId : null;
      const nome = String(dados.nome ?? "o cliente");
      const esperada = typeof dados.esperada === "string" ? dados.esperada : null;
      if (!leadId) return FALHOU;

      if (dados.o_que === "cancelar") {
        const r = await desmarcarVisitaPorMensagem(escopo, { leadId, esperada, agora });
        if (!r.ok) return { ok: false, texto: r.erro };
        return { ok: true, texto: `Visita de ${nome} cancelada.`, desfazer: { leadId, nome, antes: r.antes, depois: r.depois } };
      }
      const quando = dataDos(dados, "quando");
      if (!quando) return FALHOU;
      const r = await marcarVisitaPorMensagem(escopo, { leadId, quando, esperada, agora });
      if (!r.ok) return { ok: false, texto: r.erro };
      const feito = dados.o_que === "remarcar" ? "remarcada" : "marcada";
      return {
        ok: true,
        texto: `Visita com ${nome} ${feito} para ${rotuloDoInstante(quando)}. Já está na Agenda.`,
        desfazer: { leadId, nome, antes: r.antes, depois: r.depois },
      };
    },

    async desfazer(ctx, d) {
      const antes = lerEstado(d.antes);
      const depois = lerEstado(d.depois);
      if (typeof d.leadId !== "string" || !antes || !depois) return { ok: false, texto: "Não consegui desfazer essa visita." };
      return voltarVisitaPorMensagem(escopoDe(ctx), { leadId: d.leadId, antes, depois, agora: relogio() });
    },
  };

  const agendaPessoal: Acao = {
    async preparar(ctx, argumentos) {
      const agora = relogio();
      switch (argumentos.o_que) {
        case "anotacao": {
          const nota = texto(argumentos.texto, 4000);
          if (!nota) return pergunta("O que é para anotar?");
          // Lembrete com hora é a capacidade 8 (outra onda): a data dita fica no texto da nota.
          const quando = texto(argumentos.quando, 80);
          const final = quando ? `${nota} (${quando})` : nota;
          return { tipo: "proposta", resumo: `Anotar: ${final}`, dados: { o_que: "anotacao", texto: final } };
        }
        case "reuniao": {
          // Não é `soGestor` no catálogo porque bloqueio e anotação são de todos.
          if (ctx.papel !== "gestor") {
            return recusa("Reunião de equipe só o gestor marca. Para segurar um horário seu, peça um bloqueio.");
          }
          const quando = inicioComHora(argumentos.quando, agora);
          if (ehPreparo(quando)) return quando;
          const fim = quando.fim ?? new Date(quando.inicio.getTime() + UMA_HORA_MS);
          const titulo = texto(argumentos.texto, 120);
          return {
            tipo: "proposta",
            resumo: `Marcar reunião de equipe ${rotuloDoIntervalo(quando.inicio, fim)}${titulo ? ` (${titulo})` : ""} e avisar a equipe`,
            dados: { o_que: "reuniao", inicio: quando.inicio.toISOString(), fim: fim.toISOString(), titulo: titulo ?? "" },
          };
        }
        case "bloqueio": {
          const intervalo = intervaloDoBloqueio(argumentos.quando, agora);
          if (ehPreparo(intervalo)) return intervalo;
          // O banco recusa bloqueio sobre visita marcada (0226): melhor saber antes do "sim".
          const visitas = await visitasNoIntervalo(escopoDe(ctx), intervalo);
          if (visitas.length) {
            return recusa(
              `Há visita marcada nesse horário (${visitas.map(rotuloDoInstante).join("; ")}). Remarque a visita antes de bloquear.`,
            );
          }
          const motivo = texto(argumentos.texto, 120);
          return {
            tipo: "proposta",
            resumo: `Bloquear sua agenda ${rotuloDoIntervalo(intervalo.inicio, intervalo.fim)}${motivo ? ` (${motivo})` : ""}`,
            dados: { o_que: "bloqueio", inicio: intervalo.inicio.toISOString(), fim: intervalo.fim.toISOString(), motivo },
          };
        }
        default:
          return pergunta("Bloquear um horário, marcar reunião de equipe ou fazer uma anotação?");
      }
    },

    async executar(ctx, dados) {
      const agora = relogio();
      if (dados.o_que === "anotacao") {
        const r = await criarAnotacaoPessoal({ grupoId: ctx.grupoId, corretorId: ctx.corretorId, texto: String(dados.texto ?? "") });
        if (!r.id) return { ok: false, texto: r.erro ?? FALHOU.texto };
        return { ok: true, texto: "Anotado. Está nas suas Anotações do painel.", desfazer: { o_que: "anotacao", anotacaoId: r.id } };
      }
      const inicio = dataDos(dados, "inicio");
      const fim = dataDos(dados, "fim");
      if (!inicio || !fim) return FALHOU;

      if (dados.o_que === "bloqueio") {
        const motivo = typeof dados.motivo === "string" ? dados.motivo : null;
        const r = await criarBloqueio({ grupoId: ctx.grupoId, corretorId: ctx.corretorId, inicio, fim, motivo }, undefined, agora);
        if (!r.id) return { ok: false, texto: r.erro ?? FALHOU.texto };
        return {
          ok: true,
          texto: "Horário bloqueado. A assistente não vai oferecer esse horário aos clientes.",
          desfazer: { o_que: "bloqueio", compromissoId: r.id },
        };
      }
      if (dados.o_que === "reuniao") {
        // O papel é conferido de novo no "sim": a proposta não vale como permissão.
        if (ctx.papel !== "gestor") return { ok: false, texto: "Reunião de equipe só o gestor marca." };
        const titulo = typeof dados.titulo === "string" ? dados.titulo : "";
        const r = await criarReuniao(
          { grupoId: ctx.grupoId, gestorId: ctx.corretorId, titulo, inicio, fim, participantes: "equipe" },
          undefined,
          agora,
        );
        if (!r.id) return { ok: false, texto: r.erro ?? FALHOU.texto };
        const aviso = r.comVisita?.length ? ` Atenção: ${r.comVisita.join(", ")} tem visita nesse horário.` : "";
        return {
          ok: true,
          texto: `Reunião marcada e avisada à equipe.${aviso}`,
          desfazer: { o_que: "reuniao", compromissoId: r.id },
        };
      }
      return FALHOU;
    },

    async desfazer(ctx, d) {
      if (d.o_que === "anotacao" && typeof d.anotacaoId === "string") {
        const r = await apagarAnotacaoPessoal({ grupoId: ctx.grupoId, corretorId: ctx.corretorId, anotacaoId: d.anotacaoId });
        return r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: "Anotação apagada." };
      }
      if ((d.o_que === "bloqueio" || d.o_que === "reuniao") && typeof d.compromissoId === "string") {
        // Cancelar é o "remover" da agenda: o gatilho da 0226 libera o horário e a reunião avisa quem ia.
        const r = await cancelarCompromisso({
          grupoId: ctx.grupoId,
          corretorId: ctx.corretorId,
          ehGestor: ctx.papel === "gestor",
          compromissoId: d.compromissoId,
        });
        if (r.erro) return { ok: false, texto: r.erro };
        return {
          ok: true,
          texto: d.o_que === "bloqueio" ? "Bloqueio desfeito: o horário voltou a ficar livre." : "Reunião desmarcada; a equipe foi avisada.",
        };
      }
      return { ok: false, texto: "Não consegui desfazer isso." };
    },
  };

  return { consultas: {}, acoes: { visita, agenda_pessoal: agendaPessoal } };
}

const TRATADORES_DA_AGENDA = criarTratadoresDaAgenda();
export const CONSULTAS_AGENDA: Record<string, Consulta> = TRATADORES_DA_AGENDA.consultas;
export const ACOES_AGENDA: Record<string, Acao> = TRATADORES_DA_AGENDA.acoes;
