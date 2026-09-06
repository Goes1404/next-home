/**
 * Error analysis: transforma transcrições em uma TAXONOMIA DE FALHAS contada.
 *
 * `npm run eval:erros -- --versao=2026.09-v28`
 *
 * ## Por que existe
 *
 * Da v25 à v28 o conserto foi por anedota: eu lia uma transcrição, formava
 * uma hipótese e mudava uma regra. Quatro versões, nenhum avanço demonstrado.
 * O caminho conhecido é outro — amostrar, anotar em aberto (open coding),
 * agrupar (axial coding) e CONTAR. A ordem de conserto sai da contagem.
 *
 * ## As três passadas, e por que são três
 *
 * 1. **Open coding, uma conversa por chamada.** Sem lista de categorias:
 *    dar a lista pronta faria o modelo confirmar as minhas hipóteses, que é
 *    exatamente o viés que a análise existe para quebrar.
 * 2. **Axial coding.** As categorias saem DAS ANOTAÇÕES, não da minha
 *    cabeça. Uma chamada só, com todas as notas na frente — categoria só
 *    faz sentido contra o conjunto.
 * 3. **Atribuição.** Cada nota recebe uma categoria; o que não couber fica
 *    de fora e aparece no relatório. Sobra grande é sinal de taxonomia
 *    ruim, não de nota ruim.
 *
 * Contar, ordenar e formatar é `src/lib/eval/taxonomiaDeFalhas.ts`, puro e
 * testado. Aqui fica só o que precisa de leitura.
 *
 * ## O que ele NÃO faz
 *
 * Não decide o que consertar. Ele diz o que acontece mais — a decisão
 * continua sendo de gente, e agora com denominador.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chamarOpenaiJson } from "../../src/lib/whatsapp/openai";
import {
  montarTaxonomia,
  naoCategorizadas,
  relatorio,
  type Anotacao,
  type Categoria,
} from "../../src/lib/eval/taxonomiaDeFalhas";

const argv = process.argv.slice(2);
const arg = (nome: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];

const DIR = "eval/resultados/transcricoes";
const TIMEOUT_MS = 90_000;

/** Modelo de ANÁLISE, não de atendimento — pode ser mais caro e mais lento. */
const MODELO = process.env.EVAL_MODELO_ANALISE || "gpt-4.1";

async function json<T>(prompt: string, oQueE: string): Promise<T | null> {
  const r = await chamarOpenaiJson(prompt, { timeoutMs: TIMEOUT_MS, modelo: MODELO });
  if (!r.ok) {
    console.error(`  ✗ ${oQueE}: ${r.erro}`);
    return null;
  }
  return r.json as T;
}

const REGRAS_DA_CASA = `
Contexto do negócio (para você saber o que É falha aqui):
- A assistente se chama Sofia e atende no WhatsApp de uma imobiliária de lançamentos.
- Ela PODE dizer o preço "a partir de" que está no catálogo. NÃO pode dizer valor de
  unidade, entrada, parcela, desconto ou simulação.
- O objetivo da conversa é qualificar (região, tipologia, renda) e agendar VISITA.
- Mensagem curta é o padrão da casa: a corretora real escreve ~47 caracteres.
- Ela não deve dizer que "o corretor vai responder" — isso mata a conversa.
- Ela não nega ser IA se perguntarem diretamente.
`;

async function openCoding(origem: string, transcricao: string): Promise<Anotacao[]> {
  const prompt = `Você faz ANÁLISE DE ERROS de uma conversa de atendimento.
${REGRAS_DA_CASA}
Leia a conversa abaixo e anote, EM TEXTO LIVRE, tudo o que a assistente fez mal.

Regras da anotação:
- Uma anotação por problema, no turno em que ele aparece.
- Descreva o que ELA fez, concretamente ("repetiu a oferta de sábado 10h pela terceira vez"),
  nunca um rótulo genérico ("resposta ruim", "faltou empatia").
- NÃO use categorias prontas. Não agrupe. Só descreva.
- Se um turno estiver bom, não anote nada sobre ele.
- Se a conversa inteira estiver boa, devolva lista vazia.

CONVERSA (${origem}):
${transcricao}

Responda SÓ com JSON: {"anotacoes":[{"turno":<número>,"nota":"<o que ela fez de errado>"}]}`;

  const r = await json<{ anotacoes?: { turno?: number; nota?: string }[] }>(
    prompt,
    `open coding de ${origem}`,
  );

  return (r?.anotacoes ?? [])
    .filter((a) => typeof a.nota === "string" && a.nota.trim().length > 0)
    .map((a) => ({ origem, turno: Number(a.turno) || 0, nota: a.nota!.trim() }));
}

async function axialCoding(anotacoes: Anotacao[]): Promise<Categoria[]> {
  const lista = anotacoes.map((a, i) => `${i}. ${a.nota}`).join("\n");

  const prompt = `Você agrupa anotações de erro em uma TAXONOMIA DE FALHAS.

Abaixo estão anotações livres sobre erros de uma assistente de vendas no WhatsApp.
Agrupe-as em categorias que descrevam a CAUSA do comportamento, não o sintoma.

Regras:
- Entre 4 e 8 categorias. Menos que isso não orienta conserto; mais vira lista.
- O nome é curto e em kebab-case, em português (ex.: "nao-respondeu-a-pergunta").
- A definição diz quando aplicar E quando NÃO aplicar, em pelo menos 20 caracteres.
- As categorias saem DESTAS anotações. Não invente categoria sem exemplo aqui.

ANOTAÇÕES:
${lista}

Responda SÓ com JSON: {"categorias":[{"nome":"...","definicao":"..."}]}`;

  const r = await json<{ categorias?: Categoria[] }>(prompt, "axial coding");
  return (r?.categorias ?? []).filter((c) => c?.nome && c?.definicao);
}

async function atribuir(anotacoes: Anotacao[], categorias: Categoria[]): Promise<Anotacao[]> {
  const nomes = categorias.map((c) => `- ${c.nome}: ${c.definicao}`).join("\n");
  const lista = anotacoes.map((a, i) => `${i}. ${a.nota}`).join("\n");

  const prompt = `Atribua uma categoria a cada anotação.

CATEGORIAS:
${nomes}

Se uma anotação não couber em NENHUMA, devolva null para ela. Não force —
sobra é informação: significa que a taxonomia não descreve os dados.

ANOTAÇÕES:
${lista}

Responda SÓ com JSON: {"atribuicoes":[{"i":<índice>,"categoria":"<nome ou null>"}]}`;

  const r = await json<{ atribuicoes?: { i?: number; categoria?: string | null }[] }>(
    prompt,
    "atribuição",
  );

  const porIndice = new Map<number, string>();
  for (const a of r?.atribuicoes ?? []) {
    if (typeof a.i === "number" && a.categoria) porIndice.set(a.i, a.categoria);
  }

  return anotacoes.map((a, i) => ({ ...a, categoria: porIndice.get(i) }));
}

async function principal() {
  const filtro = arg("versao");
  const arquivos = readdirSync(DIR)
    .filter((n) => n.endsWith(".txt"))
    .filter((n) => !filtro || n.startsWith(filtro));

  if (arquivos.length === 0) {
    console.error(`Nenhuma transcrição em ${DIR}${filtro ? ` para ${filtro}` : ""}.`);
    process.exit(1);
  }

  console.log(`Análise de erros · ${arquivos.length} conversa(s) · modelo ${MODELO}\n`);

  const anotacoes: Anotacao[] = [];
  for (const nome of arquivos) {
    const origem = nome.replace(/\.txt$/, "");
    const notas = await openCoding(origem, readFileSync(join(DIR, nome), "utf8"));
    console.log(`  ${origem}: ${notas.length} anotação(ões)`);
    anotacoes.push(...notas);
  }

  if (anotacoes.length === 0) {
    console.log("\nNenhuma falha anotada. Ou está tudo bem, ou o open coding falhou.");
    return;
  }

  console.log(`\n${anotacoes.length} anotações. Agrupando…`);
  const categorias = await axialCoding(anotacoes);
  if (categorias.length === 0) {
    console.error("Axial coding não devolveu categoria. Abortando sem relatório falso.");
    process.exit(1);
  }

  const categorizadas = await atribuir(anotacoes, categorias);
  const linhas = montarTaxonomia(categorizadas, categorias);
  const sobra = naoCategorizadas(categorizadas);
  const texto = relatorio(linhas, sobra);

  const hoje = new Date().toISOString().slice(0, 10);
  const base = `eval/resultados/taxonomia-${filtro ?? "tudo"}-${hoje}`;
  mkdirSync("eval/resultados", { recursive: true });
  writeFileSync(`${base}.json`, JSON.stringify({ categorias, anotacoes: categorizadas, linhas }, null, 2), "utf8");
  writeFileSync(`${base}.md`, texto, "utf8");

  console.log(`\n${texto}\n`);
  console.log(`Relatório em ${base}.md · dados em ${base}.json`);
}

principal();
