/** Mede o tamanho do prompt de sistema por seção, sem chamar API nenhuma. */
import { readFileSync } from "node:fs";
import { construirPromptSistema } from "../../src/lib/whatsapp/aiAgent";
import type { Empreendimento } from "../../src/lib/types";

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const base = {
  nomeCorretor: "Cristal - Bruna", slugCorretor: "cristal-bruna", creciCorretor: "254161",
  telefoneCorretor: "5511999999999", nomeAssistente: "Lia", tomVoz: "consultivo_alto_padrao",
  historicoMensagens: [] as { remetente: "cliente" | "bot" | "corretor"; texto: string }[],
};
const prompt = construirPromptSistema({ ...base, catalogo: [] });
const tok = (n: number) => Math.round(n / 3.6);

// Corta por marcadores que existem no texto do prompt.
const marcas = [
  "REGRAS DE OURO", "TÉCNICAS DE VENDA CONSULTIVA", "FUNIL DE QUALIFICAÇÃO",
  "AGENDAMENTO", "CATÁLOGO", "COMO SE FALA NESTA CASA", "FORMATO DE SAÍDA", "JSON",
];
const pos = marcas
  .map((m) => ({ m, i: prompt.indexOf(m) }))
  .filter((x) => x.i >= 0)
  .sort((a, b) => a.i - b.i);

console.log(`TOTAL sem catálogo: ${prompt.length} chars ≈ ${tok(prompt.length)} tokens\n`);
console.log("SEÇÃO                              chars   ~tokens    %");
let anterior = { m: "(abertura)", i: 0 };
for (const p of [...pos, { m: "(fim)", i: prompt.length }]) {
  const len = p.i - anterior.i;
  if (len > 0) {
    console.log(
      anterior.m.slice(0, 32).padEnd(34) +
        String(len).padStart(6) + String(tok(len)).padStart(10) +
        String(Math.round((len / prompt.length) * 100)).padStart(5) + "%",
    );
  }
  anterior = p;
}
