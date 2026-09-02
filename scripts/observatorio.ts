/**
 * O observatório: as métricas de conversa medidas em CLIENTE DE VERDADE.
 *
 * Custa ZERO. Nenhuma chamada de LLM — nem agente, nem cliente simulado,
 * nem juiz. Só lê o que já aconteceu e roda `medirConversa`, que é função
 * pura (o arquivo não tem um único import).
 *
 * ## Por que ele substitui o eval de conversa
 *
 * O eval de conversa paga um modelo para FINGIR de cliente. Isso fazia
 * sentido enquanto a Sofia não atendia ninguém. Agora ela está em produção,
 * e cliente real é de graça, não tem viés de família de modelo, e não
 * precisa de crédito na OpenAI para existir.
 *
 * O histórico desta base diz o resto: as duas correções que de fato
 * importaram (a amnésia do planner e o acabamento inventado) saíram de LER
 * TRANSCRIÇÃO, não do eval — que, caro, deu principalmente ruído: três
 * rodadas do MESMO código variando 2 a 3 pontos nas métricas do juiz.
 *
 * ## O que ele NÃO faz
 *
 * Não julga com LLM e não dá nota. As métricas são as determinísticas, que
 * são justamente as menos ruidosas — e a mais forte delas não é uma
 * rubrica, é o comportamento do cliente: se ele REFEZ a pergunta, ela não
 * respondeu.
 *
 * Uso:
 *   SUPABASE_SECRET_KEY=... npm run observatorio
 *   SUPABASE_SECRET_KEY=... npm run observatorio -- --desde=2026-09-02T14:54
 *   SUPABASE_SECRET_KEY=... npm run observatorio -- --antes-e-depois=2026-09-02T14:54
 *
 * O corte `--antes-e-depois` existe para responder "a mudança que subiu
 * naquele instante melhorou?" com conversa real dos dois lados. Foi assim
 * que a v34 (planner) entrou em produção em 02/09 14:54 UTC.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { medirConversa, type TurnoRegistrado } from "../src/lib/whatsapp/metricasConversa";

const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");

/** Mensagem crua do banco, só o que a medida usa. */
type Linha = {
  conversa_id: string;
  remetente: string;
  conteudo: string | null;
  midia_url: string | null;
  created_at: string;
};

/**
 * Dobra a conversa em TURNOS: a rajada do cliente e a resposta que veio
 * depois dela.
 *
 * Mensagem do CORRETOR encerra o turno sem virar resposta da IA — quem
 * respondeu foi gente, e cobrar da Sofia o que o humano escreveu mediria
 * a pessoa errada. Anexo do bot vira `anexos`, que é como a medida
 * enxerga mídia repetida.
 */
function emTurnos(linhas: Linha[]): TurnoRegistrado[] {
  const turnos: TurnoRegistrado[] = [];
  let cliente: string[] = [];
  let bot: string[] = [];
  let anexos: string[] = [];

  const fecha = () => {
    if (bot.length > 0) {
      turnos.push({ cliente, bot: bot.join("\n"), anexos: anexos.length ? anexos : undefined });
    }
    cliente = [];
    bot = [];
    anexos = [];
  };

  for (const l of linhas) {
    const texto = (l.conteudo ?? "").trim();
    if (l.remetente === "cliente") {
      // Chegou fala nova do cliente depois de a IA ter respondido: turno novo.
      if (bot.length > 0) fecha();
      if (texto) cliente.push(texto);
    } else if (l.remetente === "bot") {
      if (texto) bot.push(texto);
      if (l.midia_url) anexos.push(l.midia_url);
    } else {
      // Corretor (ou qualquer outro): o turno em aberto não é da IA.
      cliente = [];
      bot = [];
      anexos = [];
    }
  }
  fecha();
  return turnos;
}

type Agregado = {
  conversas: number;
  clienteRepetiu: number;
  iaRepetiu: number;
  respostaIdentica: number;
  midiaRepetida: number;
  semNovidade: number[];
  ofereceuVisita: number;
  turnoDaOferta: number[];
  vozTrocou: number;
  reprovacoes: Map<string, number>;
};

function vazio(): Agregado {
  return {
    conversas: 0, clienteRepetiu: 0, iaRepetiu: 0, respostaIdentica: 0, midiaRepetida: 0,
    semNovidade: [], ofereceuVisita: 0, turnoDaOferta: [], vozTrocou: 0, reprovacoes: new Map(),
  };
}

/**
 * Conta CONVERSAS afetadas, não ocorrências.
 *
 * Medido na linha de base de 16 personas: somando ocorrências, duas rodadas
 * do mesmo código deram 50 e 14; contando conversas, 10 e 6. A distribuição
 * tem cauda pesada e a soma deixa a cauda mandar.
 */
function somar(a: Agregado, m: ReturnType<typeof medirConversa>): void {
  a.conversas += 1;
  if (m.perguntasReaparecidas.length > 0) a.clienteRepetiu += 1;
  if (m.perguntasRepetidasPelaIa.length > 0) a.iaRepetiu += 1;
  if (m.respostasRepetidas > 0) a.respostaIdentica += 1;
  if (m.midiasRepetidas.length > 0) a.midiaRepetida += 1;
  a.semNovidade.push(m.maiorSequenciaSemNovidade);
  if (m.turnoDaOfertaDeVisita !== null) {
    a.ofereceuVisita += 1;
    a.turnoDaOferta.push(m.turnoDaOfertaDeVisita);
  }
  if (m.modelos.length > 1) a.vozTrocou += 1;
  for (const r of m.reprovacoes) a.reprovacoes.set(r, (a.reprovacoes.get(r) ?? 0) + 1);
}

const mediana = (v: number[]) => {
  if (v.length === 0) return null;
  const o = [...v].sort((x, y) => x - y);
  const i = Math.floor(o.length / 2);
  return o.length % 2 ? o[i] : (o[i - 1] + o[i]) / 2;
};

function imprimir(rotulo: string, a: Agregado): void {
  const pct = (n: number) => (a.conversas ? `${Math.round((n / a.conversas) * 100)}%` : "—");
  console.log(`\n${rotulo} — ${a.conversas} conversa(s)`);
  if (a.conversas === 0) {
    console.log("  (nenhuma conversa mensurável nesta janela)");
    return;
  }
  console.log(`  o cliente teve de repetir      ${a.clienteRepetiu} (${pct(a.clienteRepetiu)})`);
  console.log(`  a IA repetiu pergunta          ${a.iaRepetiu} (${pct(a.iaRepetiu)})`);
  console.log(`  resposta quase idêntica        ${a.respostaIdentica} (${pct(a.respostaIdentica)})`);
  console.log(`  mídia reenviada                ${a.midiaRepetida} (${pct(a.midiaRepetida)})`);
  console.log(`  ofereceu visita                ${a.ofereceuVisita} (${pct(a.ofereceuVisita)}), mediana no turno ${mediana(a.turnoDaOferta) ?? "—"}`);
  console.log(`  turnos sem assunto novo        mediana ${mediana(a.semNovidade)}`);
  if (a.vozTrocou > 0) console.log(`  ⚠ a voz trocou em              ${a.vozTrocou}`);
  if (a.reprovacoes.size > 0) {
    console.log("  reprovações determinísticas:");
    for (const [r, n] of [...a.reprovacoes].sort((x, y) => y[1] - x[1])) {
      console.log(`    ${n}x ${r}`);
    }
  }
}

async function principal() {
  const desde = arg("desde");
  const corte = arg("antes-e-depois");

  /*
   * Duas origens, porque nem toda máquina tem a chave de serviço: o banco
   * direto, ou um export das mesmas colunas (`--arquivo=`). O caminho do
   * arquivo é o que permite medir sem credencial de produção na mão.
   */
  const arquivo = arg("arquivo");
  let linhas: Linha[];
  if (arquivo) {
    linhas = JSON.parse(readFileSync(arquivo, "utf8")) as Linha[];
  } else {
    const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!chave) {
      console.error(
        "Sem SUPABASE_SECRET_KEY. Use --arquivo=<export.json> com as colunas\n" +
          "conversa_id, remetente, conteudo, midia_url, created_at.",
      );
      process.exit(1);
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://prhhrqyubjcafvucirri.supabase.co",
      chave,
    );
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("conversa_id, remetente, conteudo, midia_url, created_at")
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);
    linhas = (data ?? []) as Linha[];
  }
  linhas.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const porConversa = new Map<string, Linha[]>();
  for (const l of linhas) {
    if (desde && l.created_at < desde) continue;
    const atual = porConversa.get(l.conversa_id) ?? [];
    atual.push(l);
    porConversa.set(l.conversa_id, atual);
  }

  const antes = vazio();
  const depois = vazio();
  const tudo = vazio();
  const problemas: { id: string; quando: string; o_que: string[] }[] = [];

  for (const [id, linhas] of porConversa) {
    const turnos = emTurnos(linhas);
    /*
     * O mínimo de 2 turnos com fala do cliente existe pelo mesmo motivo do
     * few-shot: conversa em que só o bot falou (disparo sem resposta) não
     * mede atendimento nenhum — mediria a campanha.
     */
    const comFala = turnos.filter((t) => t.cliente.length > 0).length;
    if (comFala < 2) continue;

    const m = medirConversa(turnos);
    somar(tudo, m);
    const quando = linhas[linhas.length - 1].created_at;
    if (corte) somar(quando < corte ? antes : depois, m);

    const oQue = [
      ...m.perguntasReaparecidas.map((p) => `cliente repetiu: ${p}`),
      ...m.perguntasRepetidasPelaIa.map((p) => `IA repetiu: ${p}`),
      ...m.reprovacoes,
    ];
    if (oQue.length > 0) problemas.push({ id, quando, o_que: oQue });
  }

  console.log("OBSERVATÓRIO — métricas de conversa em cliente REAL (zero chamada de LLM)");
  if (corte) {
    imprimir(`ANTES de ${corte}`, antes);
    imprimir(`DEPOIS de ${corte}`, depois);
    console.log(
      "\nAs duas janelas são conversas diferentes com pessoas diferentes: isto\n" +
        "descreve, não prova. Com poucas conversas de um lado, não é comparação.",
    );
  } else {
    imprimir(desde ? `Desde ${desde}` : "Tudo", tudo);
  }

  if (problemas.length > 0) {
    console.log(`\nConversas com algo a olhar (${problemas.length}), mais recentes primeiro:\n`);
    for (const p of problemas.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 12)) {
      console.log(`  ${p.quando.slice(0, 16)} · ${p.id}`);
      for (const o of p.o_que.slice(0, 4)) console.log(`      ${o}`);
    }
    console.log(
      "\nLer a transcrição destas é o que achou os dois últimos defeitos reais.\n" +
        "No painel: Conversas → a conversa pelo id.",
    );
  }
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
