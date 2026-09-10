/**
 * O observatório do consultor — zero chamada de LLM.
 *
 * ## Por que ele existe antes da análise de erro
 *
 * A etapa de qualidade (error analysis → juiz → calibração) precisa de
 * TRANSCRIÇÕES reais. Este script responde a pergunta que vem antes dela:
 * **existe material?** Quantos turnos rodaram, de quem, quanto custaram,
 * quantas vezes o guardrail cortou, quantas caíram em contingência.
 *
 * Segue a régua desta casa: mede sobre conversa REAL, não simulada
 * (`npm run observatorio` faz o mesmo para o atendimento), e a unidade que
 * importa é a CONVERSA, não a mensagem — oito ocorrências numa conversa é um
 * caso; quatro em quatro conversas é padrão.
 *
 * Roda com: npx tsx scripts/observatorioConsultor.ts
 * Precisa de SUPABASE_SECRET_KEY no ambiente (as tabelas são fechadas).
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;

/** Preço da OpenAI para o gpt-4.1-mini, em dólar por milhão de tokens. */
const USD_ENTRADA_POR_MI = 0.4;
const USD_SAIDA_POR_MI = 1.6;
const REAIS_POR_DOLAR = 5.139;

type Interacao = {
  created_at: string;
  corretor_id: string | null;
  acao: string;
  latencia_ms: number | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  modelo: string | null;
  prompt_versao: string;
};

type Mensagem = {
  conversa_id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: { tipo?: string } | null;
  created_at: string;
};

async function ler<T>(caminho: string): Promise<T[]> {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: { apikey: CHAVE!, Authorization: `Bearer ${CHAVE!}` },
  });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T[]>;
}

const mediana = (ns: number[]): number => {
  if (ns.length === 0) return 0;
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 });

const pct = (parte: number, todo: number) => (todo === 0 ? "—" : `${((parte / todo) * 100).toFixed(0)}%`);

async function main() {
  if (!URL_BASE || !CHAVE) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.");
    console.error("As tabelas do consultor são fechadas: a chave publicável leva 401.");
    process.exit(1);
  }

  const interacoes = await ler<Interacao>(
    "ia_interacoes?select=created_at,corretor_id,acao,latencia_ms,tokens_entrada,tokens_saida,modelo,prompt_versao&origem=eq.consultor&order=created_at.desc&limit=2000",
  );
  const mensagens = await ler<Mensagem>(
    "consultor_mensagens?select=conversa_id,papel,conteudo,dados,created_at&order=created_at.asc&limit=5000",
  );

  console.log("\n═══ OBSERVATÓRIO DO CONSULTOR ═══\n");

  if (interacoes.length === 0) {
    /*
     * Zero honesto não é zero quebrado, e a diferença precisa estar escrita:
     * a tela pode estar perfeita e ninguém ter aberto. É o padrão desta base
     * — sete recursos completos que nunca produziram uma linha.
     */
    console.log("Nenhum turno registrado ainda.");
    console.log("A tela pode estar perfeita e ninguém ter aberto — são coisas diferentes.");
    console.log("Sem turno, a análise de erro não tem o que analisar: o próximo passo é USO,");
    console.log("não instrumento. Ver o botão do Live Chat (o consultor a um toque da pergunta).\n");
    return;
  }

  // ── uso ──────────────────────────────────────────────────────────────────
  const porCorretor = new Map<string, number>();
  for (const i of interacoes) porCorretor.set(i.corretor_id ?? "?", (porCorretor.get(i.corretor_id ?? "?") ?? 0) + 1);
  const conversas = new Set(mensagens.map((m) => m.conversa_id));
  const dias = new Set(interacoes.map((i) => i.created_at.slice(0, 10)));

  console.log(`USO`);
  console.log(`  ${interacoes.length} turnos · ${conversas.size} conversas · ${porCorretor.size} corretor(es) · ${dias.size} dia(s) com uso`);
  console.log(`  versões de prompt: ${[...new Set(interacoes.map((i) => i.prompt_versao))].join(", ")}`);

  // ── desfecho ─────────────────────────────────────────────────────────────
  const conta = (a: string) => interacoes.filter((i) => i.acao === a).length;
  const respondidas = conta("respondida") + conta("respondida_com_corte");
  console.log(`\nDESFECHO`);
  console.log(`  respondida              ${conta("respondida")}`);
  console.log(`  respondida_com_corte    ${conta("respondida_com_corte")}  (${pct(conta("respondida_com_corte"), respondidas)} das respostas)`);
  console.log(`  contingência            ${conta("contingencia")}`);
  console.log(`  fora do contrato        ${conta("fora_do_contrato")}`);

  // ── custo ────────────────────────────────────────────────────────────────
  const entrada = interacoes.reduce((s, i) => s + (i.tokens_entrada ?? 0), 0);
  const saida = interacoes.reduce((s, i) => s + (i.tokens_saida ?? 0), 0);
  const usd = (entrada / 1e6) * USD_ENTRADA_POR_MI + (saida / 1e6) * USD_SAIDA_POR_MI;
  const comTokens = interacoes.filter((i) => i.tokens_entrada !== null).length;
  console.log(`\nCUSTO  (divide o mesmo saldo da OpenAI do atendimento)`);
  console.log(`  ${entrada.toLocaleString("pt-BR")} tokens de entrada · ${saida.toLocaleString("pt-BR")} de saída`);
  console.log(`  total ${reais(usd * REAIS_POR_DOLAR)} · por turno ${comTokens ? reais((usd * REAIS_POR_DOLAR) / comTokens) : "—"}`);

  // ── latência ─────────────────────────────────────────────────────────────
  const lat = interacoes.map((i) => i.latencia_ms ?? 0).filter(Boolean);
  console.log(`\nLATÊNCIA`);
  console.log(`  mediana ${(mediana(lat) / 1000).toFixed(1)}s · pior ${(Math.max(...lat, 0) / 1000).toFixed(1)}s`);

  // ── o que a resposta ENTREGOU (derivado das mensagens, sem contador novo) ─
  const daIa = mensagens.filter((m) => m.papel === "ia");
  const comTipo = (t: string) => daIa.filter((m) => m.dados?.tipo === t).length;
  const conversasCom = (t: string) =>
    new Set(daIa.filter((m) => m.dados?.tipo === t).map((m) => m.conversa_id)).size;
  console.log(`\nO QUE ELE ENTREGOU  (mensagens · conversas)`);
  for (const t of ["cartoes", "simulacao", "texto_cliente", "pergunta"]) {
    console.log(`  ${t.padEnd(14)} ${String(comTipo(t)).padStart(4)} · ${conversasCom(t)}`);
  }
  console.log(`  só texto       ${String(daIa.filter((m) => !m.dados).length).padStart(4)}`);

  // ── material para a análise de erro ──────────────────────────────────────
  const doCorretor = mensagens.filter((m) => m.papel === "corretor");
  const conversasComDuasFalas = [...conversas].filter(
    (c) => doCorretor.filter((m) => m.conversa_id === c).length >= 2,
  ).length;
  console.log(`\nMATERIAL PARA A ANÁLISE DE ERRO`);
  console.log(`  ${doCorretor.length} perguntas de corretor · ${conversasComDuasFalas} conversas com 2+ falas dele`);
  console.log(
    conversas.size >= 20
      ? `  ✓ dá para rodar open coding (o corte prático desta casa é ~20 conversas).`
      : `  ainda não: faltam ${20 - conversas.size} conversas para o open coding valer.`,
  );
  console.log(
    `  Lembrete: ordenar achado por CONVERSAS afetadas, não por ocorrências — e rodar\n  o open coding SEM lista de categorias pronta, senão o modelo confirma as suas.\n`,
  );
}

main().catch((e) => {
  console.error("Observatório falhou:", e);
  process.exit(1);
});
