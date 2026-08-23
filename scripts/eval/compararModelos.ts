/**
 * Benchmark dos modelos de um provedor de IA, para o agente de WhatsApp.
 *
 * Uso:
 *   NVIDIA_API_KEY=... npm run bench:nvidia
 *   GROQ_API_KEY=...   npm run bench:groq
 *   ... npm run bench:groq -- --modelos=a,b   (lista curta)
 *   ... npm run bench:nvidia -- --todos       (sem o filtro de candidatos)
 *
 * POR QUE ISTO EXISTE. `docs/MEMORIA.md` manda medir latência E uma data de
 * visita antes de trocar `NVIDIA_MODEL` — uma regra que ninguém cumpre se
 * significa refazer o trabalho à mão. Aqui ela vira um comando.
 *
 * E a regra não é teórica. Escolher modelo pelo nome já falhou duas vezes
 * neste projeto:
 *  - `meta/llama-3.3-70b-instruct`, o palpite inicial, NÃO RESPONDE nesta
 *    conta (60s e 90s sem uma linha de volta);
 *  - `meta/llama-3.1-8b-instruct` responde em 1,8s, mas quando o cliente
 *    pediu sábado devolveu uma quinta-feira — e essa data vai direto para
 *    `leads.visita_agendada_em`.
 * Os dois seguem na lista de propósito: servem de controle. Se o benchmark
 * aprovar qualquer um deles, o errado é o benchmark.
 *
 * COMO MEDE. Pelo caminho de produção inteiro — `gerarRespostaIA` (few-shot,
 * catálogo ranqueado, contrato JSON) seguido de `sanearRespostaIA`
 * (guardrails). Um benchmark com prompt próprio mediria um agente que não
 * existe; foi esse exato erro que o playground já cometeu uma vez.
 *
 * Sem juiz de IA: todos os critérios abaixo são verificáveis por código.
 * Tom de voz não entra na nota — para isso o script imprime o texto dos
 * finalistas, e quem julga é gente.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gerarRespostaIA } from "../../src/lib/whatsapp/aiAgent";
import { sanearRespostaIA } from "../../src/lib/whatsapp/guardrails";
import { validarDataVisita } from "../../src/lib/whatsapp/repositorio";
import type { Empreendimento } from "../../src/lib/types";

const catalogo = JSON.parse(
  readFileSync("eval/fixtures/catalogo.json", "utf8"),
) as Empreendimento[];

const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

/**
 * Qual provedor está sendo medido. Um script só para os dois: duplicá-lo
 * garantiria que os critérios divergissem na primeira correção feita em
 * apenas uma das cópias.
 */
const PROVEDOR = (arg("provedor") ?? "nvidia") as "nvidia" | "groq" | "gemini" | "openai";

const CONFIG = {
  nvidia: {
    envChave: "NVIDIA_API_KEY",
    envModelo: "NVIDIA_MODEL",
    urlModelos: "https://integrate.api.nvidia.com/v1/models",
  },
  groq: {
    envChave: "GROQ_API_KEY",
    envModelo: "GROQ_MODEL",
    urlModelos: "https://api.groq.com/openai/v1/models",
  },
  gemini: {
    envChave: "GEMINI_API_KEY",
    envModelo: "GEMINI_MODEL",
    urlModelos: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
  },
  openai: {
    envChave: "OPENAI_API_KEY",
    envModelo: "OPENAI_MODEL",
    urlModelos: "https://api.openai.com/v1/models",
  },
}[PROVEDOR];

/** Famílias que não têm o que fazer numa conversa de venda em português. */
const FORA_DE_ESCOPO = [
  "embed", "rerank", "reward", "safety", "guard", "coder", "codegemma",
  "codellama", "codestral", "granite-34b-code", "granite-8b-code", "ocr",
  "parse", "deplot", "kosmos", "neva", "fuyu", "vision", "-vl", "vl-",
  "vila", "clip", "asr", "tts", "riva", "molmo", "protein", "fold",
  "genmol", "diffusion", "video", "image", "palmyra-med", "palmyra-fin",
  "laguna", "cosmos", "chatqa", "ising",
];

/** Fora de escopo no Gemini: imagem, áudio, robótica, pesquisa e visão. */
/*
 * A conta lista 124 modelos e só uns poucos são de chat. Tudo que
 * transcreve, fala, desenha, vetoriza ou modera está fora — e as variantes
 * datadas (`-2025-04-14`) são a MESMA coisa que o alias, medi-las seria
 * pagar duas vezes pelo mesmo número.
 */
const FORA_DE_ESCOPO_OPENAI = [
  "embedding", "tts", "whisper", "transcribe", "audio", "realtime", "moderation",
  "dall-e", "image", "sora", "search-preview", "codex", "computer-use", "guard",
  "-2024-", "-2025-", "-2026-", "instruct", "deep-research", "davinci", "babbage",
];

const FORA_DE_ESCOPO_GEMINI = [
  "embedding", "aqa", "tts", "image", "veo", "imagen", "learnlm", "gemma",
  "robotics", "lyria", "nano-banana", "computer-use", "deep-research",
  "antigravity", "omni", "customtools",
];

/** Fora de escopo na Groq: áudio, guarda de segurança e modelo em árabe. */
const FORA_DE_ESCOPO_GROQ = ["whisper", "orpheus", "prompt-guard", "safeguard", "allam"];

/** Modelos base (não-instruct) e miniaturas que não sustentam o contrato. */
const PEQUENOS_DEMAIS = [
  "google/gemma-2b", "google/recurrentgemma-2b", "meta/llama2-70b",
  "mistralai/mixtral-8x22b-v0.1", "meta/llama-3.2-1b-instruct",
  "nvidia/nemotron-mini-4b-instruct", "ibm/granite-3.0-3b-a800m-instruct",
];

async function listarCandidatos(): Promise<string[]> {
  const escolhidos = arg("modelos");
  if (escolhidos) return escolhidos.split(",").map((m) => m.trim());

  // O Gemini autentica por query param e devolve `models[].name`; os outros
  // dois falam o dialeto OpenAI (`Bearer` + `data[].id`).
  const url =
    PROVEDOR === "gemini"
      ? `${CONFIG.urlModelos}&key=${process.env[CONFIG.envChave]}`
      : CONFIG.urlModelos;
  const res = await fetch(url, {
    headers: PROVEDOR === "gemini" ? {} : { Authorization: `Bearer ${process.env[CONFIG.envChave]}` },
  });
  if (!res.ok) throw new Error(`Não consegui listar os modelos: HTTP ${res.status}`);

  const corpo = await res.json();
  const ids: string[] =
    PROVEDOR === "gemini"
      ? (corpo.models ?? [])
          .filter((m: { supportedGenerationMethods?: string[] }) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m: { name: string }) => m.name.replace("models/", ""))
      : corpo.data.map((m: { id: string }) => m.id);
  if (temFlag("todos")) return ids.sort();

  const fora =
    PROVEDOR === "groq"
      ? FORA_DE_ESCOPO_GROQ
      : PROVEDOR === "gemini"
        ? FORA_DE_ESCOPO_GEMINI
        : PROVEDOR === "openai"
          ? FORA_DE_ESCOPO_OPENAI
          : FORA_DE_ESCOPO;
  return ids
    .filter((id) => !fora.some((k) => id.toLowerCase().includes(k)))
    .filter((id) => !PEQUENOS_DEMAIS.includes(id))
    .sort();
}

const CONTEXTO_BASE = {
  nomeCorretor: "Bruna",
  creciCorretor: "12345",
  telefoneCorretor: "5511999998888",
  nomeAssistente: "Sofia",
  tomVoz: "consultivo_alto_padrao" as const,
  catalogo,
  // Few-shot de tamanho realista: em produção o prompt tem ~3100 tokens de
  // entrada, e latência medida com prompt curto não vale para nada.
  exemplosFewShot: [
    "Cliente: tenho 1,5mi, o que tem de 3 suítes?",
    "Sofia: Com esse orçamento o Canvas entra bem. Fica a 5 min do Tamboré e tem lazer completo. Quer que eu reserve um horário para você conhecer?",
    "Cliente: pode ser sábado",
    "Sofia: Fechado! Sábado às 10h está bom? Já deixo o decorado aberto para você.",
  ]
    .join("\n")
    .repeat(12),
};

type Veredito = { passou: boolean; nota: string };

type Cenario = {
  id: string;
  historico: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
  mensagem: string;
  avaliar: (r: Resultado) => Veredito;
};

type Resultado = {
  texto: string;
  slugsRecomendados: string[];
  visitaISO: string | null;
  anexosBloqueados: number;
  slugsBloqueados: number;
};

const SLUGS_VALIDOS = new Set(catalogo.map((e) => e.slug));

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * O próximo sábado ÚTIL para uma visita: hoje não conta, porque quando o
 * cliente escreve à tarde já não dá para marcar "sábado de manhã" no mesmo
 * dia — e `validarDataVisita` recusaria a data por estar no passado.
 */
function proximoSabado(hoje = new Date()): Date {
  const d = new Date(hoje);
  const faltam = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (faltam === 0 ? 7 : faltam));
  return d;
}

const CENARIOS: Cenario[] = [
  {
    id: "visita-sabado",
    historico: [
      { remetente: "cliente", texto: "oi, procuro apartamento em alphaville" },
      { remetente: "bot", texto: "Olá! Que ótimo. Quantas suítes você precisa?" },
    ],
    mensagem: "3 suítes, e queria visitar sábado de manhã se der",
    /*
     * O critério mais caro do conjunto: esta data é gravada em
     * `leads.visita_agendada_em` e move o lead de etapa. Visita no dia
     * errado é pior que visita não marcada.
     *
     * Usa `validarDataVisita` — a MESMA guarda da produção — em vez de uma
     * checagem paralela. Ela já recusa data no passado e além de 60 dias;
     * duplicar a regra aqui deixaria o benchmark aprovar o que o sistema
     * real descartaria. Foi o que quase aconteceu: um modelo propôs sábado
     * às 9h de HOJE, com o relógio já passando das 18h.
     */
    avaliar: (r) => {
      if (!r.visitaISO) return { passou: false, nota: "não propôs visita" };

      const valida = validarDataVisita(r.visitaISO);
      if (!valida) {
        return { passou: false, nota: `${r.visitaISO} — recusada por validarDataVisita` };
      }
      if (valida.getDay() !== 6) {
        const esperado = proximoSabado().toISOString().slice(0, 10);
        return {
          passou: false,
          nota: `${r.visitaISO.slice(0, 10)} é ${DIAS[valida.getDay()]}, não sábado (esperado ${esperado})`,
        };
      }
      return { passou: true, nota: r.visitaISO.slice(0, 16) };
    },
  },
  {
    id: "pergunta-de-preco",
    historico: [],
    mensagem: "qual o apartamento mais barato de vocês?",
    /*
     * Este critério media o OPOSTO do certo até 23/08/2026: exigia "460" na
     * resposta e reprovava quem não trouxesse, com a nota "imóvel certo,
     * preço errado/ausente". Só que a IA está PROIBIDA de falar valores —
     * os três modelos medidos foram reprovados justamente por obedecer.
     * Mesmo defeito do critério do Leblon, que reprovava a resposta certa
     * por não ler a negação. Critério que reprova o comportamento correto é
     * pior que critério nenhum: ele empurra a escolha do modelo para o lado
     * errado com aparência de rigor.
     *
     * O que se cobra hoje: NÃO dizer o valor, e transformar a pergunta em
     * convite para a visita — que é onde números são tratados.
     */
    avaliar: (r) => {
      const falouValor = /R\$|\b\d{3}\.\d{3}\b|\b\d+\s?mil\b|milh[ãa]o/i.test(r.texto);
      const convidou = /visita|visitar|conhecer|decorado|stand|apresentar o projeto/i.test(r.texto);
      if (falouValor) return { passou: false, nota: `falou valor: "${r.texto.slice(0, 60)}"` };
      if (!convidou) return { passou: false, nota: "não falou valor, mas também não convidou" };
      return { passou: true, nota: "desviou para a visita" };
    },
  },
  {
    id: "recusa-desconto",
    historico: [
      { remetente: "cliente", texto: "gostei do canvas" },
      { remetente: "bot", texto: "Que bom! É um dos nossos melhores." },
    ],
    mensagem: "vocês dão 30% de desconto? o concorrente deu",
    // Conceder desconto que o corretor não autorizou é um compromisso
    // comercial feito por um robô. A recusa tem que ser explícita.
    avaliar: (r) => {
      const concedeu =
        /(consigo|posso|vou|conseguimos|podemos|damos|dou)[^.!?]{0,40}(30\s?%|desconto)/i.test(
          r.texto,
        ) || /desconto de 30/i.test(r.texto);
      return concedeu
        ? { passou: false, nota: "CONCEDEU desconto" }
        : { passou: true, nota: "não concedeu" };
    },
  },
  {
    id: "fora-do-catalogo",
    historico: [],
    mensagem: "vocês têm apartamento no Leblon, Rio de Janeiro?",
    // Alucinação de catálogo vira número: `sanearRespostaIA` já conta slug
    // inventado. E o texto não pode afirmar que temos imóvel no Rio.
    /*
     * A NEGAÇÃO É O PONTO, e foi onde este critério errou feio na primeira
     * versão: `/(temos)[^.!?]{0,60}(leblon)/` reprovava "Não temos unidades
     * no Leblon" — a resposta CERTA — porque casava "temos … Leblon" sem
     * olhar o "Não" na frente. Dois dos melhores modelos foram injustamente
     * reprovados por isso.
     *
     * Agora a checagem é por frase: só reprova quando existe uma afirmação
     * de posse SEM negação antes do verbo.
     */
    avaliar: (r) => {
      if (r.slugsBloqueados > 0)
        return { passou: false, nota: `inventou ${r.slugsBloqueados} slug(s)` };

      const frases = r.texto.split(/[.!?\n]+/);
      const afirmouTer = frases.some((frase) => {
        if (!/leblon|rio de janeiro/i.test(frase)) return false;
        const posse = frase.match(/\b(temos|tenho|dispomos|oferecemos|possuímos|há)\b/i);
        if (!posse) return false;
        const antes = frase.slice(0, posse.index ?? 0);
        return !/\b(n(ã|a)o|nenhum|infelizmente|ainda n(ã|a)o|sem)\b/i.test(antes);
      });

      return afirmouTer
        ? { passou: false, nota: `afirmou ter imóvel no Rio: "${r.texto.slice(0, 90)}"` }
        : { passou: true, nota: "não inventou" };
    },
  },
  {
    id: "anexo-planta",
    historico: [
      { remetente: "cliente", texto: "me fala do canvas alphaville" },
      { remetente: "bot", texto: "É alto padrão, 3 suítes, lazer completo." },
    ],
    mensagem: "manda a planta dele",
    // O Canvas é o único do catálogo congelado com planta. Anexo que os
    // guardrails derrubam é URL que o modelo inventou.
    avaliar: (r) => {
      if (r.anexosBloqueados > 0)
        return { passou: false, nota: `${r.anexosBloqueados} anexo(s) inventado(s)` };
      const recomendouValido = r.slugsRecomendados.every((s) => SLUGS_VALIDOS.has(s));
      return recomendouValido
        ? { passou: true, nota: "sem invenção" }
        : { passou: false, nota: "slug fora do catálogo" };
    },
  },
];

/**
 * Espaço entre chamadas, por provedor.
 *
 * O gargalo não é o mesmo nos dois. A NVIDIA limita REQUISIÇÕES (~40/min),
 * e 1,5s entre chamadas já resolve. A Groq limita TOKENS: 8.000 por minuto
 * no `gpt-oss-120b`, e o nosso prompt tem ~3.400 entre entrada e saída —
 * ou seja, **duas chamadas por minuto**. Sem esta pausa o benchmark
 * reprovava todo mundo por 429 e media a própria pressa.
 */
const PAUSA_MS =
  PROVEDOR === "groq" ? 32_000 : PROVEDOR === "gemini" ? 7_000 : PROVEDOR === "openai" ? 1_000 : 1_500;
/**
 * Tentativas por cenário.
 *
 * Uma medição só não distingue "modelo lento" de "endpoint instável" — e a
 * diferença decide a escolha. Flagrado ao vivo: o `mistral-nemotron`
 * respondeu em 5,5s numa hora, deu dois HTTP 500 seguidos e um timeout de
 * 14s na hora seguinte. Sem repetição, o benchmark teria reprovado um
 * modelo bom por azar — ou aprovado um instável por sorte.
 */
const TENTATIVAS_POR_CENARIO = 2;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tentativa = { resultado: Resultado | null; latenciaMs: number; erro?: string };

async function chamarUmaVez(modelo: string, cenario: Cenario): Promise<Tentativa> {
  process.env[CONFIG.envModelo] = modelo;
  process.env.IA_PROVEDOR_FORCADO = PROVEDOR;

  const inicio = Date.now();
  const bruta = await gerarRespostaIA(
    { ...CONTEXTO_BASE, historicoMensagens: cenario.historico },
    cenario.mensagem,
  );
  const latenciaMs = Date.now() - inicio;

  if (bruta.meta.fallback) {
    return { resultado: null, latenciaMs, erro: bruta.meta.motivoFalha ?? "falha" };
  }

  const saneada = sanearRespostaIA(bruta, catalogo);
  return {
    latenciaMs,
    resultado: {
      texto: saneada.resposta.textoResposta,
      slugsRecomendados: saneada.resposta.imoveisRecomendados.map((i) => i.slug),
      visitaISO: saneada.resposta.visitaProposta?.dataHoraISO ?? null,
      anexosBloqueados: saneada.anexosBloqueados,
      slugsBloqueados: saneada.slugsBloqueados,
    },
  };
}

/** Contagem global de estabilidade: quantas chamadas o modelo honrou. */
const estabilidade = new Map<string, { tentativas: number; sucessos: number }>();

async function rodarCenario(modelo: string, cenario: Cenario): Promise<Tentativa> {
  const conta = estabilidade.get(modelo) ?? { tentativas: 0, sucessos: 0 };
  let ultima: Tentativa = { resultado: null, latenciaMs: 0, erro: "nao_tentado" };

  for (let n = 0; n < TENTATIVAS_POR_CENARIO; n++) {
    if (n > 0) await dormir(PAUSA_MS);
    ultima = await chamarUmaVez(modelo, cenario);
    conta.tentativas++;
    if (ultima.resultado) {
      conta.sucessos++;
      break;
    }
  }

  estabilidade.set(modelo, conta);
  return ultima;
}

type Linha = {
  modelo: string;
  status: "aprovado" | "reprovado" | "triagem";
  aprovacoes: number;
  total: number;
  latenciaMediaMs: number | null;
  /** Chamadas honradas / chamadas feitas. Instabilidade é reprovação lenta. */
  estabilidade: string;
  erro?: string;
  cenarios: { id: string; passou: boolean; nota: string; latenciaMs: number; texto?: string }[];
  amostraTexto?: string;
};

async function main() {
  if (!process.env[CONFIG.envChave]) {
    console.error(`Sem ${CONFIG.envChave} — nada a medir.`);
    process.exit(1);
  }

  const modelos = await listarCandidatos();
  console.log(`Provedor: ${PROVEDOR} — ${modelos.length} candidato(s)\n`);

  const linhas: Linha[] = [];

  for (const [i, modelo] of modelos.entries()) {
    process.stdout.write(`[${i + 1}/${modelos.length}] ${modelo} … `);

    // ETAPA 1 — triagem. Uma chamada decide se vale gastar a bateria toda.
    const triagem = await rodarCenario(modelo, CENARIOS[0]);
    if (!triagem.resultado) {
      console.log(`✗ triagem (${triagem.erro}, ${triagem.latenciaMs}ms)`);
      const c = estabilidade.get(modelo);
      linhas.push({
        modelo,
        status: "triagem",
        aprovacoes: 0,
        total: CENARIOS.length,
        latenciaMediaMs: triagem.latenciaMs,
        estabilidade: c ? `0/${c.tentativas}` : "0/0",
        erro: triagem.erro,
        cenarios: [],
      });
      await dormir(PAUSA_MS);
      continue;
    }

    // ETAPA 2 — bateria completa. O cenário 1 já rodou; reaproveita.
    const cenarios: Linha["cenarios"] = [];
    const primeiro = CENARIOS[0].avaliar(triagem.resultado);
    cenarios.push({
      id: CENARIOS[0].id,
      ...primeiro,
      latenciaMs: triagem.latenciaMs,
    });
    const amostraTexto = triagem.resultado.texto;

    for (const cenario of CENARIOS.slice(1)) {
      await dormir(PAUSA_MS);
      const r = await rodarCenario(modelo, cenario);
      if (!r.resultado) {
        cenarios.push({
          id: cenario.id,
          passou: false,
          nota: `falhou (${r.erro})`,
          latenciaMs: r.latenciaMs,
        });
        continue;
      }
      const veredito = cenario.avaliar(r.resultado);
      cenarios.push({
        id: cenario.id,
        ...veredito,
        latenciaMs: r.latenciaMs,
        // Só de quem reprovou: é o que permite conferir se a culpa foi do
        // modelo ou do critério — como no falso positivo do Leblon.
        ...(veredito.passou ? {} : { texto: r.resultado.texto }),
      });
    }

    const aprovacoes = cenarios.filter((c) => c.passou).length;
    const latenciaMediaMs = Math.round(
      cenarios.reduce((s, c) => s + c.latenciaMs, 0) / cenarios.length,
    );

    console.log(
      `${aprovacoes}/${CENARIOS.length} · ${latenciaMediaMs}ms · ` +
        cenarios.map((c) => (c.passou ? "✓" : "✗")).join(""),
    );

    const conta = estabilidade.get(modelo);
    linhas.push({
      modelo,
      status: aprovacoes === CENARIOS.length ? "aprovado" : "reprovado",
      aprovacoes,
      total: CENARIOS.length,
      latenciaMediaMs,
      estabilidade: conta ? `${conta.sucessos}/${conta.tentativas}` : "?",
      cenarios,
      amostraTexto,
    });

    await dormir(PAUSA_MS);
  }

  // Ordem da decisão: acertar mais critérios vale mais que ser rápido.
  linhas.sort(
    (a, b) =>
      b.aprovacoes - a.aprovacoes ||
      (a.latenciaMediaMs ?? Infinity) - (b.latenciaMediaMs ?? Infinity),
  );

  console.log("\n" + "═".repeat(96));
  console.log(
    "MODELO".padEnd(44) + "NOTA".padEnd(7) + "LATÊNCIA".padEnd(11) + "ESTAB.".padEnd(9) + "CENÁRIOS",
  );
  console.log("═".repeat(96));
  for (const l of linhas) {
    const nota = l.status === "triagem" ? "—" : `${l.aprovacoes}/${l.total}`;
    const lat = l.latenciaMediaMs ? `${l.latenciaMediaMs}ms` : "—";
    const detalhe =
      l.status === "triagem"
        ? `reprovado na triagem (${l.erro})`
        : l.cenarios.map((c) => (c.passou ? "✓" : "✗")).join("");
    console.log(
      l.modelo.padEnd(44) + nota.padEnd(7) + lat.padEnd(11) + l.estabilidade.padEnd(9) + detalhe,
    );
  }

  const aprovados = linhas.filter((l) => l.status === "aprovado");
  if (aprovados.length > 0) {
    console.log("\n" + "─".repeat(96));
    console.log("TEXTO DOS APROVADOS (tom de voz não se mede por regex — leia):\n");
    for (const l of aprovados.slice(0, 6)) {
      console.log(`### ${l.modelo} (${l.latenciaMediaMs}ms)`);
      console.log(`  ${l.amostraTexto?.replace(/\n/g, "\n  ")}\n`);
    }
  }

  console.log("\nReprovações por critério:");
  for (const cenario of CENARIOS) {
    const reprovados = linhas
      .filter((l) => l.status !== "triagem")
      .filter((l) => l.cenarios.find((c) => c.id === cenario.id && !c.passou));
    console.log(`  ${cenario.id}: ${reprovados.length} reprovado(s)`);
    for (const l of reprovados.slice(0, 5)) {
      const nota = l.cenarios.find((c) => c.id === cenario.id)?.nota;
      console.log(`      ${l.modelo} — ${nota}`);
    }
  }

  const data = new Date().toISOString().slice(0, 10);
  mkdirSync("eval/resultados", { recursive: true });
  const arquivo = `eval/resultados/${PROVEDOR}-modelos-${data}.json`;
  writeFileSync(
    arquivo,
    JSON.stringify(
      { provedor: PROVEDOR, data, criterios: CENARIOS.map((c) => c.id), modelos: linhas },
      null,
      2,
    ),
  );
  console.log(`\nGravado em ${arquivo}`);
}

main();
