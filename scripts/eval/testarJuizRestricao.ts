/**
 * Fumaça do juiz de restrição: ele consegue dizer FAIL?
 *
 * Na primeira rodada o juiz deu Pass em 17 de 17 casos. Isso não é prova de
 * que o agente acertou — é a ausência de prova de que o juiz discrimina. Um
 * juiz que sempre aprova tem TPR zero e passa despercebido justamente
 * quando mais importa.
 *
 * Os casos abaixo são as FALHAS REAIS de produção (conversa …8216) e
 * variações delas, e nenhum aparece nos few-shot do prompt do juiz — usar
 * os exemplos do prompt como gabarito infla o resultado.
 */
import { chamarOpenaiJson } from "../../src/lib/whatsapp/openai";
import {
  montarEntradaJuizRestricao,
  PROMPT_JUIZ_RESTRICAO,
} from "./juizes/restricaoRespeitada";

type Caso = {
  id: string;
  historico: { remetente: string; texto: string }[];
  mensagem: string;
  resposta: string;
  esperado: "Pass" | "Fail";
};

const CASOS: Caso[] = [
  {
    id: "regiao-ignorada",
    historico: [{ remetente: "bot", texto: "Tenho o Canvas, em Alphaville. Quer conhecer?" }],
    mensagem: "só quero em Barueri mesmo, alphaville não",
    resposta: "O Canvas Alphaville tem 3 e 4 suítes, 110 e 145m². --- Quer ver as fotos?",
    esperado: "Fail",
  },
  {
    id: "dormitorios-ignorado",
    historico: [{ remetente: "bot", texto: "O Bosque AlphaGran é casa em condomínio." }],
    mensagem: "tem de 5 dormitórios?",
    resposta: "O Bosque AlphaGran tem 3 dormitórios, 1 suíte e 140m². --- Quer conhecer no sábado?",
    esperado: "Fail",
  },
  {
    id: "tamanho-ignorado",
    historico: [{ remetente: "bot", texto: "O Viva Vila do Conde tem 2 dormitórios com 49m²." }],
    mensagem: "tem alguma coisa de uns 30m²? é só pra mim",
    resposta: "O Viva Vila do Conde tem 2 dormitórios, 49m² e 1 vaga. --- Quer ver as fotos?",
    esperado: "Fail",
  },
  {
    id: "prazo-ignorado",
    historico: [{ remetente: "bot", texto: "O Canvas Alphaville está em construção." }],
    mensagem: "preciso das chaves em 15 dias, dá?",
    resposta: "O Canvas é um lançamento incrível em Alphaville. --- Quer conhecer o decorado terça às 10h?",
    esperado: "Fail",
  },
  {
    id: "muda-de-assunto",
    historico: [{ remetente: "bot", texto: "O Canvas tem 4 suítes e 145m²." }],
    mensagem: "quero algo menor",
    resposta: "Posso te mandar a apresentação digital do Canvas? --- Prefere manhã ou tarde para visitar?",
    esperado: "Fail",
  },
  {
    id: "recusa-honesta",
    historico: [{ remetente: "bot", texto: "O Bosque AlphaGran é casa em condomínio." }],
    mensagem: "tem de 5 dormitórios?",
    resposta: "De 5 não tenho, o maior é o Canvas com 4 suítes. --- Quatro te atenderia ou precisa mesmo de cinco?",
    esperado: "Pass",
  },
  {
    id: "atende-de-fato",
    historico: [{ remetente: "bot", texto: "Quantos dormitórios você precisa?" }],
    mensagem: "3 dormitórios com suíte",
    resposta: "O Viva Vila do Conde tem 3 dormitórios com suíte, 63m² e 2 vagas. --- Quer conhecer?",
    esperado: "Pass",
  },
];

async function main() {
  let acertos = 0;
  let vp = 0, fn = 0, vn = 0, fp = 0;

  for (const c of CASOS) {
    const r = await chamarOpenaiJson(
      `${PROMPT_JUIZ_RESTRICAO}\n\n${montarEntradaJuizRestricao({
        historico: c.historico,
        mensagemCliente: c.mensagem,
        resposta: c.resposta,
      })}`,
      { temperature: 0, timeoutMs: 30_000, modelo: process.env.OPENAI_MODELO_JUIZ || "gpt-4.1" },
    );
    const veredito = r.ok ? String((r.json as Record<string, unknown>).result ?? "?") : "SEM RESPOSTA";
    const critica = r.ok ? String((r.json as Record<string, unknown>).critique ?? "") : "";
    const bateu = veredito === c.esperado;
    if (bateu) acertos++;
    if (c.esperado === "Fail") bateu ? vp++ : fn++;
    else bateu ? vn++ : fp++;
    console.log(`${bateu ? "✓" : "✗"} ${c.id.padEnd(22)} esperado=${c.esperado.padEnd(4)} juiz=${veredito}`);
    if (!bateu) console.log(`    ↳ ${critica.slice(0, 200)}`);
  }

  const tpr = vp + fn > 0 ? vp / (vp + fn) : NaN;
  const tnr = vn + fp > 0 ? vn / (vn + fp) : NaN;
  console.log(`\nAcertos: ${acertos}/${CASOS.length}`);
  console.log(`TPR (pega a falha):    ${(tpr * 100).toFixed(0)}%  — ${vp} de ${vp + fn} falhas reais`);
  console.log(`TNR (não acusa à toa): ${(tnr * 100).toFixed(0)}%  — ${vn} de ${vn + fp} acertos reais`);
}

main();
