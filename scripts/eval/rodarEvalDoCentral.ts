/**
 * Eval do número central: frase → ferramenta (plano da onda 0, Task 9).
 *
 * Uso:
 *   OPENAI_API_KEY=... npm run eval:central
 *   ... npm run eval:central -- --modelos=gpt-4.1,gpt-4.1-mini
 *   ... npm run eval:central -- --so=visita-marcar,venda
 *
 * Roda `pensar` com o prompt e as declarações de produção (`montarSistema`,
 * `declaracoesPara`) e NÃO executa nada: toda ferramenta pedida devolve um
 * resultado de mentira. A nota é da primeira chamada (qual ferramenta e os
 * argumentos principais), conferida por código em `conferirEval.ts`.
 *
 * Critério de escolha do `CENTRAL_MODELO` (spec 2): acerto da ferramenta
 * ≥ 90%, depois latência ≤ 10 s, depois custo. A tabela vai para
 * `eval/resultados/`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pensar, modeloDoCentral, type ChamadaFeita } from "../../src/lib/central/cerebro";
import { montarSistema } from "../../src/lib/central/conversa";
import { declaracoesPara } from "../../src/lib/central/ferramentas";
import { conferirCaso, type CasoDoCentral } from "../../src/lib/central/conferirEval";

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];

const casos = (JSON.parse(readFileSync("eval/golden/central.json", "utf8")) as CasoDoCentral[]).filter(
  (c) => !arg("so") || arg("so")!.split(",").includes(c.id),
);
const modelos = (arg("modelos") ?? `${modeloDoCentral()},gpt-4.1-mini`).split(",").filter(Boolean);
const AGORA = new Date();

type Linha = {
  modelo: string;
  acertoFerramenta: number;
  acertoArgumentos: number;
  latenciaP50: number;
  latenciaP95: number;
  custoUsd: number;
  indisponiveis: number;
};

const percentil = (valores: number[], p: number) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))] ?? 0;
};

async function rodarModelo(modelo: string): Promise<{ linha: Linha; erros: string[] }> {
  let ferramentaOk = 0;
  let comArgumentos = 0;
  let argumentosOk = 0;
  let custo = 0;
  let indisponiveis = 0;
  const latencias: number[] = [];
  const erros: string[] = [];

  for (const caso of casos) {
    const ctx = { corretorId: "eval", grupoId: "eval", papel: caso.papel, nome: "Paula", imobiliaria: "Imobiliária Teste" };
    const inicio = Date.now();
    const r = await pensar({
      sistema: montarSistema(ctx, AGORA, null),
      historico: (caso.historico ?? []).map((h) => ({ ...h, em: AGORA.toISOString() })),
      mensagem: caso.mensagem,
      ferramentas: declaracoesPara(caso.papel),
      // Nada é executado: a nota é só da primeira chamada.
      executar: async () => ({ eval: true, observacao: "Resultado simulado. Responda em uma frase." }),
      quemPaga: { semGrupo: "eval" },
      modelo,
    });
    latencias.push(Date.now() - inicio);
    custo += r.custoUsd;
    if (!r.ok) indisponiveis++;

    const chamadas: ChamadaFeita[] = r.chamadas;
    // Indisponível nunca é acerto, nem no caso que espera "nenhuma ferramenta".
    const conf = r.ok
      ? conferirCaso(caso, chamadas)
      : { ferramentaOk: false, argumentosOk: null, pedida: null, argumentosErrados: [] as string[] };
    if (conf.ferramentaOk) ferramentaOk++;
    if (conf.argumentosOk !== null) {
      comArgumentos++;
      if (conf.argumentosOk) argumentosOk++;
    }
    if (!conf.ferramentaOk || conf.argumentosOk === false) {
      const esperada = caso.ferramentaEsperada === null ? "nenhuma" : [caso.ferramentaEsperada].flat().join("|");
      erros.push(
        `${caso.id}: esperava ${esperada}, veio ${conf.pedida ?? "nenhuma"}` +
          (conf.argumentosErrados.length ? ` (argumentos: ${conf.argumentosErrados.join(", ")})` : "") +
          (r.ok ? "" : ` [indisponível: ${r.motivo}]`),
      );
    }
    process.stdout.write(conf.ferramentaOk ? "." : "x");
  }
  process.stdout.write("\n");

  return {
    linha: {
      modelo,
      acertoFerramenta: ferramentaOk / casos.length,
      acertoArgumentos: comArgumentos ? argumentosOk / comArgumentos : 1,
      latenciaP50: percentil(latencias, 50),
      latenciaP95: percentil(latencias, 95),
      custoUsd: custo,
      indisponiveis,
    },
    erros,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Falta OPENAI_API_KEY no ambiente.");
    process.exit(1);
  }
  console.log(`${casos.length} casos × ${modelos.length} modelo(s): ${modelos.join(", ")}`);
  const resultados: { linha: Linha; erros: string[] }[] = [];
  for (const modelo of modelos) {
    console.log(`\n${modelo}`);
    const r = await rodarModelo(modelo);
    resultados.push(r);
    for (const e of r.erros) console.log(`  ${e}`);
  }

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const tabela = [
    "| Modelo | Ferramenta | Argumentos | Latência p50 | p95 | Custo (US$/100) | Indisponível |",
    "|---|---|---|---|---|---|---|",
    ...resultados.map(
      ({ linha: l }) =>
        `| ${l.modelo} | ${pct(l.acertoFerramenta)} | ${pct(l.acertoArgumentos)} | ${(l.latenciaP50 / 1000).toFixed(1)} s | ${(l.latenciaP95 / 1000).toFixed(1)} s | ${l.custoUsd.toFixed(3)} | ${l.indisponiveis} |`,
    ),
  ].join("\n");
  console.log(`\n${tabela}`);

  const dia = AGORA.toISOString().slice(0, 10);
  mkdirSync("eval/resultados", { recursive: true });
  writeFileSync(
    `eval/resultados/central-${dia}.md`,
    `# Eval do central, ${dia}\n\n${casos.length} casos de \`eval/golden/central.json\`.\n\n${tabela}\n\n` +
      resultados.map((r) => `## ${r.linha.modelo}\n\n${r.erros.map((e) => `- ${e}`).join("\n") || "Sem erros."}\n`).join("\n"),
  );
  console.log(`\nGravado em eval/resultados/central-${dia}.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
