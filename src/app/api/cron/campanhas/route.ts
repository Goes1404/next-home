import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { processarFilaCampanhas } from "@/lib/whatsapp/campaignDispatcher";

export const runtime = "nodejs";
// Envia mensagens reais de verdade (I/O de rede sequencial) e chega a
// esperar o horário do próximo item da fila; o teto padrão de 10s de uma
// função Hobby estouraria no meio de um lote pequeno.
export const maxDuration = 60;

/**
 * Até onde uma corrente de auto-disparo pode ir a partir de um único
 * gatilho. Cada elo trabalha ~45s, então 60 elos ≈ 45 minutos de fila
 * andando sozinha depois de um clique, de um tique do cron ou da criação de
 * uma campanha.
 *
 * O teto existe por dinheiro e por segurança: sem ele, um bug de contagem
 * viraria uma corrente infinita de invocações mandando WhatsApp. Com ele, o
 * pior caso é 60 invocações e a corrente morre — e o próximo gatilho
 * (pg_cron, cron diário ou o botão) recomeça de onde parou.
 */
const MAX_ELOS = 60;

/** Comparação em tempo constante — evita descobrir o segredo por medição. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function segredoConfigurado(): string | null {
  return process.env.CRON_SECRET || null;
}

/**
 * Chamado pelo cron do Vercel (ver `vercel.json`), que assina a requisição
 * com `Authorization: Bearer $CRON_SECRET` sozinho quando essa variável de
 * ambiente existe no projeto — não precisa configurar nada além dela. O
 * pg_cron do Supabase (migration 0025) e os elos da própria corrente usam a
 * mesma assinatura.
 *
 * Falha fechada, mesmo padrão do webhook de mensagens: sem segredo
 * configurado, recusa em produção; em desenvolvimento local deixa passar
 * para dar para testar o disparo sem precisar simular o cron.
 */
function requisicaoAutenticada(req: NextRequest): boolean {
  const segredo = segredoConfigurado();

  if (!segredo) {
    if (process.env.NODE_ENV === "production") {
      console.error("Cron de campanhas recusado: CRON_SECRET não configurado em produção.");
      return false;
    }
    return true;
  }

  // Só pelo cabeçalho: segredo em query string vaza para log de acesso,
  // histórico de proxy e qualquer lugar que registre a URL inteira.
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  return Boolean(recebido) && segredoConfere(recebido, segredo);
}

/**
 * Agenda o próximo elo da corrente.
 *
 * Roda em `after()`: a resposta já foi devolvida e o `waitUntil` da Vercel
 * mantém a função viva só o suficiente para o disparo do próximo elo sair.
 * Deliberadamente não esperamos a resposta do elo seguinte — ele tem os
 * próprios 60 segundos, e ficar segurando esta invocação até ele terminar
 * empilharia funções abertas até estourar.
 *
 * `elo` é o contador que a corrente carrega adiante; quem começa (cron,
 * botão, criação de campanha) manda 0.
 */
function encadearProximoElo(origem: URL, elo: number, dono: string): void {
  const segredo = segredoConfigurado();
  const proxima = new URL("/api/cron/campanhas", origem.origin);
  proxima.searchParams.set("elo", String(elo));
  proxima.searchParams.set("dono", dono);

  after(async () => {
    try {
      await fetch(proxima.toString(), {
        method: "GET",
        headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
        // A corrente é fire-and-forget: só precisamos que a próxima
        // invocação COMECE. Um timeout curto aqui derruba esta chamada, não
        // a próxima, que já está de pé do outro lado.
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Elo perdido não é o fim da fila: o pg_cron (migration 0025), o cron
      // diário e o botão do painel recomeçam a corrente. Barulho no log
      // aqui seria ruído, já que o timeout curto acima é o caso normal.
    }
  });
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const elo = Math.max(0, Number(url.searchParams.get("elo") ?? "0") || 0);
  // A corrente inteira compartilha um dono, para que cada elo consiga
  // renovar a trava que o elo anterior deixou — e não fique brigando com a
  // própria corrente a cada 45 segundos.
  const dono = url.searchParams.get("dono") || `corrente-${crypto.randomUUID()}`;

  try {
    const resultado = await processarFilaCampanhas({ dono });

    const continua = resultado.deveContinuar && elo + 1 < MAX_ELOS;
    if (continua) encadearProximoElo(url, elo + 1, dono);

    return NextResponse.json({ ok: true, elo, encadeou: continua, ...resultado });
  } catch (error) {
    console.error("Erro ao processar a fila de campanhas:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/** Mesma coisa por POST — o `net.http_post` do pg_cron é mais simples de assinar. */
export const POST = GET;
