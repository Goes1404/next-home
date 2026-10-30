/*
 * O número central da plataforma (0249) e o webhook do WhatsApp.
 *
 * 1. A instância do central desvia para `tratarWebhookDoCentral` antes de
 *    qualquer lógica de corretor (senão `resolverInstancia` dá 404).
 * 2. Para as instâncias dos corretores, o central é invisível: o filtro
 *    `ehNumeroDoCentral` vem antes de todo caminho que cria lead, conversa
 *    ou aciona a IA. Sem ele, a IA do corretor e a do central se respondem
 *    em laço (spec 4.1).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rota = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const post = rota.slice(rota.indexOf("export async function POST("));
const posicao = (trecho: string) => {
  const i = post.indexOf(trecho);
  expect(i, `não achei "${trecho}" no POST do webhook`).toBeGreaterThan(0);
  return i;
};

describe("webhook e o número central", () => {
  it("a instância do central desvia antes de grupo, conexão e resolverInstancia", () => {
    const desvio = posicao("if (await ehInstanciaDoCentral(instanceName))");
    expect(desvio).toBeLessThan(posicao("resolverInstancia("));
    expect(desvio).toBeLessThan(posicao("const jidBruto"));
    expect(desvio).toBeLessThan(posicao("registrarEventoConexao("));
  });

  it("instância de corretor ignora o central antes de qualquer caminho que crie lead, conversa ou IA", () => {
    const filtro = posicao("if (await ehNumeroDoCentral(sender))");
    for (const depois of [
      "tratarConversaComOSistema(",
      "reconhecerConviteDeEntrada(",
      "cadastrarPelaPalavraChave(",
      "obterOuCriarConversa(",
      "registrarMensagemBarrada(",
    ]) {
      expect(filtro, `o filtro do central tem de vir antes de ${depois}`).toBeLessThan(posicao(depois));
    }
  });
});
