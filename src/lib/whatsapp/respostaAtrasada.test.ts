import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { HORAS_PARA_AVISAR } from "@/lib/crm/quemEstaEsperando";
import {
  DIAS_LIMITE,
  HORAS_PARA_RESPONDER,
  decidirRespostaAtrasada,
  instrucaoDaRespostaAtrasada,
} from "./respostaAtrasada";

const agora = new Date("2026-09-03T20:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

describe("decidirRespostaAtrasada", () => {
  it("não responde dentro do intervalo normal de conversa", () => {
    const d = decidirRespostaAtrasada({ esperandoDesde: horasAtras(1), agora });
    expect(d.responder).toBe(false);
    expect(d).toMatchObject({ motivo: "ainda_no_intervalo_normal" });
  });

  it("responde quem passou do limiar — o caso das 17 conversas", () => {
    for (const h of [4, 22, 52]) {
      const d = decidirRespostaAtrasada({ esperandoDesde: horasAtras(h), agora });
      expect(d.responder, `${h}h deveria ser respondida`).toBe(true);
      expect(d.horas).toBe(h);
    }
  });

  it("não ressuscita conversa velha", () => {
    const d = decidirRespostaAtrasada({ esperandoDesde: horasAtras(DIAS_LIMITE * 24 + 1), agora });
    expect(d.responder).toBe(false);
    expect(d).toMatchObject({ motivo: "antigo_demais" });
  });

  it("data inválida NÃO vira 'responda agora'", () => {
    // Sem saber há quanto tempo a pessoa espera, o lado seguro de errar é
    // não falar — numa trava de comportamento, "deixa passar" é o lado errado.
    expect(decidirRespostaAtrasada({ esperandoDesde: "não é data", agora }).responder).toBe(false);
  });

  it("o limiar é o MESMO do aviso por e-mail", () => {
    // "Atraso" tem uma definição só nesta casa. Se alguém mudar um dos dois,
    // este teste força a decisão em vez de deixar o painel e o bot
    // discordarem em silêncio sobre quem está esperando.
    expect(HORAS_PARA_RESPONDER).toBe(HORAS_PARA_AVISAR);
  });
});

describe("instrucaoDaRespostaAtrasada", () => {
  it("proíbe recomeçar a conversa em qualquer espera", () => {
    for (const horas of [4, 30]) {
      const i = instrucaoDaRespostaAtrasada({ horas });
      expect(i).toMatch(/NÃO recomece a conversa/);
      expect(i).toMatch(/como posso ajudar/);
    }
  });

  it("abaixo de 24h não manda pedir desculpa", () => {
    expect(instrucaoDaRespostaAtrasada({ horas: 5 })).not.toMatch(/demora/i);
  });

  it("acima de 24h reconhece a demora, mas curta", () => {
    const i = instrucaoDaRespostaAtrasada({ horas: 30 });
    expect(i).toMatch(/demora/i);
    expect(i).toMatch(/UMA oração curta/);
    // O erro oposto: a desculpa tomar a mensagem que devia trazer a resposta.
    expect(i).toMatch(/Não se estenda/);
  });
});

describe("o runner da varredura", () => {
  const fonte = readFileSync(
    join(process.cwd(), "src/app/api/cron/followups/route.ts"),
    "utf8",
  );
  const semComentario = fonte.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("usa motivoDoSilencio, e não régua própria", () => {
    // Régua própria aqui significaria o bot falando por cima do humano que
    // está atendendo — o pior desfecho possível desta varredura.
    expect(semComentario).toContain("motivoDoSilencio({");
  });

  it("lê a MESMA view da fila do Início", () => {
    expect(semComentario).toContain("whatsapp_esperando_resposta");
  });

  it("varre ANTES da janela de horário", () => {
    /*
     * Esta é a regressão que falharia calada: movida para depois do
     * `dentroDaJanela`, a varredura passa a calar das 21h às 9h — e quem
     * escreveu às 20h, justamente o caso que ela existe para cobrir,
     * espera a noite inteira. Nada quebra, nenhum teste de unidade acusa,
     * e o sintoma é indistinguível de "não havia ninguém esperando".
     *
     * Responder quem nos escreveu não passa por janela: é a regra que o
     * webhook já aplica.
     */
    const varredura = semComentario.indexOf("await varrerRespostasAtrasadas(supabase)");
    const janela = semComentario.indexOf("if (!dentroDaJanela(");
    expect(varredura).toBeGreaterThan(-1);
    expect(janela).toBeGreaterThan(-1);
    expect(varredura).toBeLessThan(janela);
  });

  it("não passa por cota de campanha — isto é resposta, não disparo", () => {
    // `reservarCotaCampanha` existe para tráfego iniciado por nós. Consumir
    // cota aqui faria uma resposta atrasada roubar a vaga de um follow-up.
    const trecho = semComentario.slice(
      semComentario.indexOf("async function responderAtrasada"),
      semComentario.indexOf("export async function GET"),
    );
    expect(trecho).not.toContain("reservarCotaCampanha");
  });
});
