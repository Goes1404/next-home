/**
 * Exporta conversas REAIS de produção para o golden dataset do eval.
 *
 * Uso (manual, nunca no CI — toca o banco de produção em leitura):
 *   SUPABASE_SECRET_KEY=... npx tsx scripts/eval/exportarGolden.ts
 *
 * O que sai: para cada conversa com participação do bot — e para TODA
 * interação marcada `avaliacao='ruim'` no painel — um caso em
 * eval/golden/casos.json com o histórico anonimizado e a última mensagem
 * do cliente. Casos de falha real são o coração do golden: a regra do
 * motor de melhoria é que NENHUMA falha marcada se repita sem ser pega
 * pelo eval seguinte.
 *
 * Os casos novos entram com `expectativas: {}` — anotar à mão o que se
 * espera de cada um (e mover 1 a cada ~10 para calibracao.json com nota
 * humana) é parte do trabalho, não um passo automatizável.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://prhhrqyubjcafvucirri.supabase.co";
const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!chave) {
  console.error("Defina SUPABASE_SECRET_KEY para exportar (leitura de produção).");
  process.exit(1);
}

const supabase = createClient(url, chave);
const ARQUIVO = "eval/golden/casos.json";

/** Nome/telefone nunca entram no dataset — o eval roda fora de produção. */
function anonimizar(texto: string): string {
  return texto
    .replace(/\+?55\s?\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}/g, "[telefone]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
}

type MensagemGolden = {
  remetente: string;
  conteudo: string;
  created_at: string;
  interacao_id: string | null;
};

async function mensagensDa(conversaId: string): Promise<MensagemGolden[] | null> {
  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, conteudo, created_at, interacao_id")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(40);
  return data && data.length >= 2 ? (data as MensagemGolden[]) : null;
}

function montarCaso(id: string, origem: "ruim" | "amostra", msgs: MensagemGolden[], corte: number) {
  return {
    id,
    origem,
    historico: msgs.slice(0, corte).map((m) => ({
      remetente: m.remetente,
      texto: anonimizar(m.conteudo).slice(0, 500),
    })),
    mensagem: anonimizar(msgs[corte].conteudo).slice(0, 500),
    expectativas: {},
  };
}

async function main() {
  const casosAtuais = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { id: string }[];
  const idsExistentes = new Set(casosAtuais.map((c) => c.id));
  const novos: unknown[] = [];

  // 1. Interações marcadas como ruins — prioridade máxima. Um caso POR
  // INTERAÇÃO, cortado no PONTO DA FALHA: a versão anterior cortava na
  // última fala do cliente da conversa inteira, então um `ruim` na 3ª
  // resposta de 5 exportava a conversa cortada no fim — e o eval testava
  // a pergunta errada.
  const { data: ruins } = await supabase
    .from("ia_interacoes")
    .select("id, conversa_id, created_at")
    .eq("avaliacao", "ruim")
    .not("conversa_id", "is", null)
    // Teste da equipe não entra no golden — ver migration 0038.
    .eq("e_teste", false)
    .order("created_at", { ascending: false })
    .limit(100);

  for (const ruim of ruins ?? []) {
    const id = `ruim-${(ruim.id as string).slice(0, 8)}`;
    if (idsExistentes.has(id)) continue;

    const msgs = await mensagensDa(ruim.conversa_id as string);
    if (!msgs) continue;

    // A resposta marcada: pelo vínculo direto (0040) ou, para rótulos sem
    // vínculo, a última mensagem do bot antes da linha de telemetria.
    let alvo = msgs.findIndex((m) => m.interacao_id === ruim.id);
    if (alvo < 0) {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].remetente === "bot" && msgs[i].created_at <= (ruim.created_at as string)) {
          alvo = i;
          break;
        }
      }
    }
    if (alvo < 0) continue;

    // O caso termina na última fala do CLIENTE antes da resposta marcada:
    // é ela que o eval responde.
    let corte = alvo - 1;
    while (corte >= 0 && msgs[corte].remetente !== "cliente") corte--;
    if (corte < 1) continue;

    novos.push(montarCaso(id, "ruim", msgs, corte));
  }

  // 2. Conversas com participação do bot (amostra geral) — aqui o corte na
  // última fala do cliente da conversa é o comportamento CERTO: não há
  // ponto de falha marcado, o caso é a conversa como um todo.
  const { data: conversas } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .eq("e_teste", false)
    .order("ultima_interacao_em", { ascending: false })
    .limit(100);

  for (const c of conversas ?? []) {
    const id = `amostra-${c.id.slice(0, 8)}`;
    if (idsExistentes.has(id)) continue;

    const msgs = await mensagensDa(c.id);
    if (!msgs) continue;

    let corte = msgs.length - 1;
    while (corte >= 0 && msgs[corte].remetente !== "cliente") corte--;
    if (corte < 1) continue;

    novos.push(montarCaso(id, "amostra", msgs, corte));
  }

  if (novos.length === 0) {
    console.log("Nenhum caso novo para exportar.");
    return;
  }

  writeFileSync(ARQUIVO, JSON.stringify([...casosAtuais, ...novos], null, 2));
  console.log(`${novos.length} caso(s) novo(s) adicionados a ${ARQUIVO}. Anote as expectativas à mão.`);
}

main();
