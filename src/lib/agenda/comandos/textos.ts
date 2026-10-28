import type { Dia } from "@/lib/agenda/calendario";
import { lerInstante, meioDiaEmSaoPaulo, partesEmSaoPaulo, type PartesEmSaoPaulo } from "./instante";
import { normalizar } from "./normalizar";
import type { PedidoAConfirmar } from "./tipos";

/*
 * O que o sistema responde ao corretor no WhatsApp. Curto, em português de
 * gente: quem lê está na rua, no celular, entre uma visita e outra.
 */

const SEMANA: Record<string, string> = {
  Sun: "dom",
  Mon: "seg",
  Tue: "ter",
  Wed: "qua",
  Thu: "qui",
  Fri: "sex",
  Sat: "sáb",
};

const CONFIRMA = "Confirma? (sim/não)";

function rotuloDoDia(p: PartesEmSaoPaulo): string {
  return `${SEMANA[p.semana] ?? ""} ${p.dia}/${p.mes}`;
}

/** "10h", "10h30". */
function hora(p: PartesEmSaoPaulo): string {
  return p.minuto === "00" ? `${p.hora}h` : `${p.hora}h${p.minuto}`;
}

/** "sáb 31/10" a partir de `"2026-10-31"`. */
export function formatarDia(dia: Dia): string {
  return rotuloDoDia(partesEmSaoPaulo(meioDiaEmSaoPaulo(dia)));
}

/** "sáb 31/10 às 10h" no fuso de São Paulo; texto que não é instante → "". */
export function formatarQuando(iso: string): string {
  const instante = lerInstante(iso);
  if (!instante) return "";
  const p = partesEmSaoPaulo(instante);
  return `${rotuloDoDia(p)} às ${hora(p)}`;
}

/** "sex 30/10 das 14h às 16h"; se vira o dia, "de sex 30/10 às 14h até sáb 31/10 às 12h". */
function intervalo(inicio: string, fim: string): string {
  const i = lerInstante(inicio);
  const f = lerInstante(fim);
  if (!i || !f) return formatarQuando(inicio);
  const pi = partesEmSaoPaulo(i);
  const pf = partesEmSaoPaulo(f);
  const mesmoDia = pi.ano === pf.ano && pi.mes === pf.mes && pi.dia === pf.dia;
  return mesmoDia
    ? `${rotuloDoDia(pi)} das ${hora(pi)} às ${hora(pf)}`
    : `de ${formatarQuando(inicio)} até ${formatarQuando(fim)}`;
}

/** "Bruno", "Bruno e Carla", "Bruno, Carla e Davi". */
function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** "reunião", "reunião sobre metas", "reunião de alinhamento". */
function nomeDaReuniao(titulo: string): string {
  const n = normalizar(titulo);
  if (!n || n === "reuniao") return "reunião";
  if (n.startsWith("reuniao ")) return titulo.charAt(0).toLowerCase() + titulo.slice(1);
  return `reunião sobre ${titulo}`;
}

/**
 * Repete o que foi entendido antes de gravar. `extra` traz o que quem integra
 * achou no banco (nome completo do lead, do imóvel, dos corretores); sem ele,
 * vale o que a pessoa escreveu.
 */
export function textoDeConfirmacao(
  pedido: PedidoAConfirmar,
  extra: { nomeDoLead?: string; nomeDoImovel?: string; nomesDosParticipantes?: string[] },
): string {
  switch (pedido.tipo) {
    case "marcar_visita": {
      const imovel = extra.nomeDoImovel ?? pedido.imovel;
      const partes = [`visita com ${extra.nomeDoLead ?? pedido.cliente}`, formatarQuando(pedido.quando)];
      if (imovel) partes.push(imovel);
      return `Entendi: ${partes.join(", ")}. ${CONFIRMA}`;
    }
    case "bloquear": {
      const motivo = pedido.motivo ? ` (${pedido.motivo})` : "";
      return `Entendi: horário bloqueado ${intervalo(pedido.inicio, pedido.fim)}${motivo}. ${CONFIRMA}`;
    }
    case "lembrete": {
      const cliente = extra.nomeDoLead ? ` (${extra.nomeDoLead})` : "";
      return `Entendi: lembrete ${formatarQuando(pedido.quando)}: ${pedido.texto}${cliente}. ${CONFIRMA}`;
    }
    case "reuniao": {
      const com =
        pedido.participantes === "equipe"
          ? "a equipe toda"
          : juntarNomes(extra.nomesDosParticipantes ?? pedido.participantes);
      return `Entendi: ${nomeDaReuniao(pedido.titulo)} com ${com}, ${intervalo(pedido.inicio, pedido.fim)}. ${CONFIRMA}`;
    }
  }
}

export function textoNaoEntendi(ehGestor: boolean): string {
  const exemplos = [
    "visita com a Ana sábado 10h no Alpha",
    "amanhã das 14h às 16h estou no médico",
    "me lembra de ligar pro João quinta 9h",
  ];
  if (ehGestor) exemplos.push("reunião com a equipe toda segunda 9h");
  return `Não entendi o pedido. Você pode escrever assim:\n${exemplos.map((e) => `• ${e}`).join("\n")}`;
}

export function textoDeEscolha(nome: string, opcoes: { nome: string }[]): string {
  const lista = opcoes.map((o, i) => `${i + 1}) ${o.nome}`).join(" ");
  return `Achei mais de um cliente com "${nome}": ${lista}. Responda com o número.`;
}

/** "10h00": na lista do dia a hora leva sempre os minutos, para as linhas alinharem. */
function horaDaLista(iso: string): string {
  const instante = lerInstante(iso);
  if (!instante) return "";
  const p = partesEmSaoPaulo(instante);
  return `${p.hora}h${p.minuto}`;
}

export function textoDaAgendaDoDia(dia: Dia, itens: { inicio: string; descricao: string }[]): string {
  const rotulo = formatarDia(dia);
  if (!itens.length) return `Nada marcado em ${rotulo}.`;
  const momento = (iso: string) => lerInstante(iso)?.getTime() ?? Number.POSITIVE_INFINITY;
  const linhas = [...itens]
    .sort((a, b) => momento(a.inicio) - momento(b.inicio))
    .map((item) => {
      const h = horaDaLista(item.inicio);
      return h ? `${h} · ${item.descricao}` : item.descricao;
    });
  return `Sua agenda de ${rotulo}:\n${linhas.join("\n")}`;
}
