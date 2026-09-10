/**
 * A conversa REAL de 10/09/2026 (2cff42f6), turno a turno, pelo planner.
 *
 * Relatada assim: "quando eu falo que consigo tal horário ele marca em
 * outro, e quando falo que consigo segunda, ela pergunta de novo se não
 * consigo outro dia". Este trace mostra a jogada escolhida em cada fala —
 * sem chamar modelo nenhum.
 */
import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import { proximosHorarios } from "../../src/lib/crm/agendaDeVisitas";
import { horariosJaOferecidos, semOsJaOferecidos } from "../../src/lib/whatsapp/ofertasDeVisita";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const grade = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: 9, horaFim: 22 }));
const agora = new Date("2026-09-10T01:21:00-03:00");

/** A transcrição real, na ordem. */
const turnos: { de: "cliente" | "bot"; texto: string }[] = [
  { de: "bot", texto: "Oi Eduardo, tudo bem? Me conta, em qual região de Barueri você procura o imóvel?" },
  { de: "cliente", texto: "Quero marcar uma visita no amanhã" },
  { de: "bot", texto: "Que ótimo! Quer conhecer o decorado para já sentir o espaço e o estilo?" },
  { de: "cliente", texto: "Sim" },
  { de: "bot", texto: "Prefere sábado às 9h ou às 11h para a visita?" },
  { de: "cliente", texto: "Sábado eu não consigo, pode ser segunda?" },
  { de: "bot", texto: "Tranquilo, segunda é ótimo! Me conta só uma coisa antes: você prefere imóvel pronto para morar ou na planta?" },
  { de: "cliente", texto: "Quero na planta" },
  { de: "bot", texto: "Beleza, Eduardo! Me conta, quantos dormitórios você precisa no imóvel?" },
  { de: "cliente", texto: "1" },
  { de: "bot", texto: "Eduardo! E qual faixa de valor você tem em mente para a compra?" },
  { de: "cliente", texto: "2 reais" },
  { de: "bot", texto: "Eduardo, sábado não rola, mas posso te mostrar na sexta às 9h ou às 10h." },
  { de: "cliente", texto: "Mas não era segunda feira?" },
  { de: "bot", texto: "Posso deixar a visita para segunda mesmo, Eduardo, mas qual horário você prefere: 9h ou 10h?" },
  { de: "cliente", texto: "9h" },
  { de: "bot", texto: "Eduardo, qual dia da semana fica melhor pra você para a visita?" },
  { de: "cliente", texto: "Segunda feira" },
  { de: "bot", texto: "Combinado, Eduardo! Segunda às 9h então? Ou prefere outro horário na segunda?" },
  { de: "cliente", texto: "Pode ser esse horário mesmo" },
];

const historico: Fala[] = [];
for (const t of turnos) {
  if (t.de === "bot") {
    historico.push({ remetente: "bot", texto: t.texto });
    continue;
  }

  const jogada = planejarJogada(
    estadoDaConversa({ historico, mensagemAtual: t.texto, imovelEmFoco: null, catalogo }),
  );
  const oferecidos = horariosJaOferecidos(historico);
  const disponiveis = semOsJaOferecidos(
    proximosHorarios({ grade, ocupados: [], agora }),
    oferecidos.assinaturas,
  );

  const chave = jogada.tipo === "perguntar" ? `perguntar:${jogada.assunto}` : jogada.tipo;
  console.log(`CLIENTE: "${t.texto}"`);
  console.log(`   jogada ....: ${chave}`);
  console.log(`   horários no prompt: ${disponiveis.map((h) => h.rotulo).join(" | ") || "(nenhum)"}`);
  console.log("");

  historico.push({ remetente: "cliente", texto: t.texto });
}
