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

async function main() {
  const casosAtuais = JSON.parse(readFileSync(ARQUIVO, "utf8")) as { id: string }[];
  const idsExistentes = new Set(casosAtuais.map((c) => c.id));
  const novos: unknown[] = [];

  // 1. Interações marcadas como ruins — prioridade máxima
  const { data: ruins } = await supabase
    .from("ia_interacoes")
    .select("conversa_id, created_at")
    .eq("avaliacao", "ruim")
    .not("conversa_id", "is", null)
    // Teste da equipe não entra no golden — ver migration 0038.
    .eq("e_teste", false)
    .order("created_at", { ascending: false })
    .limit(100);

  // 2. Conversas com participação do bot (amostra geral)
  const { data: conversas } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .eq("e_teste", false)
    .order("ultima_interacao_em", { ascending: false })
    .limit(100);

  const alvos = new Map<string, "ruim" | "amostra">();
  for (const r of ruins ?? []) alvos.set(r.conversa_id as string, "ruim");
  for (const c of conversas ?? []) if (!alvos.has(c.id)) alvos.set(c.id, "amostra");

  for (const [conversaId, origem] of alvos) {
    const { data: msgs } = await supabase
      .from("whatsapp_mensagens")
      .select("remetente, conteudo, created_at")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true })
      .limit(40);

    if (!msgs || msgs.length < 2) continue;
    // O caso termina na última fala do CLIENTE: é ela que o eval responde.
    let corte = msgs.length - 1;
    while (corte >= 0 && msgs[corte].remetente !== "cliente") corte--;
    if (corte < 1) continue;

    const id = `${origem}-${conversaId.slice(0, 8)}`;
    if (idsExistentes.has(id)) continue;

    novos.push({
      id,
      origem,
      historico: msgs.slice(0, corte).map((m) => ({
        remetente: m.remetente,
        texto: anonimizar(m.conteudo).slice(0, 500),
      })),
      mensagem: anonimizar(msgs[corte].conteudo).slice(0, 500),
      expectativas: {},
    });
  }

  if (novos.length === 0) {
    console.log("Nenhum caso novo para exportar.");
    return;
  }

  writeFileSync(ARQUIVO, JSON.stringify([...casosAtuais, ...novos], null, 2));
  console.log(`${novos.length} caso(s) novo(s) adicionados a ${ARQUIVO}. Anote as expectativas à mão.`);
}

main();
