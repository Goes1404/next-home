import "server-only";

/**
 * Cliente mínimo da API do Asaas (v3), para a cobrança automática
 * (29/10/2026, 0241): Pix, boleto e cartão numa assinatura mensal.
 *
 * Sem SDK nem dependência nova: `fetch` com o cabeçalho `access_token` (é o
 * nome exato que a documentação do Asaas pede) e um `User-Agent` que
 * identifica a aplicação (recomendado por eles para rastrear o tráfego).
 *
 * Ambiente por `ASAAS_AMBIENTE`:
 *   - `sandbox`  → https://api-sandbox.asaas.com/v3
 *   - `producao` → https://api.asaas.com/v3
 * Sem `ASAAS_AMBIENTE` (ou com outro valor), a cobrança automática fica
 * DESLIGADA: errar o ambiente cobraria cliente de verdade num teste, ou
 * deixaria de cobrar em produção.
 *
 * A chave (`ASAAS_API_KEY`) nunca vai a log, resposta nem erro. Os erros
 * devolvidos aqui levam só o status e a descrição do Asaas.
 */

export const URL_DO_ASAAS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
} as const;

export type AmbienteDoAsaas = keyof typeof URL_DO_ASAAS;

/** As variáveis de ambiente que a cobrança automática exige. */
export const VARIAVEIS_DO_ASAAS = ["ASAAS_AMBIENTE", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"] as const;

/** As variáveis que faltam (ou estão com valor inválido); vazio = configurado. */
export function variaveisDoAsaasFaltando(env: Record<string, string | undefined> = process.env): string[] {
  const faltando: string[] = [];
  const ambiente = env.ASAAS_AMBIENTE?.trim();
  if (ambiente !== "sandbox" && ambiente !== "producao") faltando.push("ASAAS_AMBIENTE");
  if (!env.ASAAS_API_KEY?.trim()) faltando.push("ASAAS_API_KEY");
  if (!env.ASAAS_WEBHOOK_TOKEN?.trim()) faltando.push("ASAAS_WEBHOOK_TOKEN");
  return faltando;
}

export function asaasConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return variaveisDoAsaasFaltando(env).length === 0;
}

export class ErroDoAsaas extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErroDoAsaas";
  }
}

function configuracao(): { base: string; chave: string } {
  const ambiente = process.env.ASAAS_AMBIENTE?.trim();
  const chave = process.env.ASAAS_API_KEY?.trim();
  if ((ambiente !== "sandbox" && ambiente !== "producao") || !chave) {
    throw new ErroDoAsaas("Cobrança automática não configurada (ASAAS_AMBIENTE e ASAAS_API_KEY).", 0);
  }
  return { base: URL_DO_ASAAS[ambiente], chave };
}

/** A descrição de erro que o Asaas manda (`{ errors: [{ description }] }`), sem eco do pedido. */
function descricaoDoErro(corpo: unknown): string {
  const erros = (corpo as { errors?: { description?: unknown }[] } | null)?.errors;
  const descricoes = Array.isArray(erros)
    ? erros.map((e) => (typeof e?.description === "string" ? e.description : "")).filter(Boolean)
    : [];
  return descricoes.join("; ").slice(0, 300) || "erro sem descrição";
}

const TEMPO_LIMITE_MS = 15_000;

async function chamar<T>(
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
  tempoLimiteMs: number = TEMPO_LIMITE_MS,
): Promise<T> {
  const { base, chave } = configuracao();
  let resposta: Response;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: {
        access_token: chave,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "astro-solucoes-crm/1.0 (cobranca-automatica)",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(tempoLimiteMs),
      cache: "no-store",
    });
  } catch (e) {
    throw new ErroDoAsaas(`Asaas fora do ar ou sem resposta: ${e instanceof Error ? e.message : "falha de rede"}`, 0);
  }
  const texto = await resposta.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!resposta.ok) {
    throw new ErroDoAsaas(`Asaas recusou ${metodo} ${caminho.split("?")[0]} (${resposta.status}): ${descricaoDoErro(json)}`, resposta.status);
  }
  return json as T;
}

// ── Tipos (só os campos que usamos) ─────────────────────────────────────────

export type ClienteDoAsaas = { id: string; name: string; cpfCnpj?: string | null; externalReference?: string | null };

export type AssinaturaDoAsaas = {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  cycle: string;
  billingType: string;
  status: string;
  deleted?: boolean;
};

export type StatusDoPagamento =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "RECEIVED_IN_CASH"
  | (string & {});

export type PagamentoDoAsaas = {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  netValue?: number;
  status: StatusDoPagamento;
  /** `AAAA-MM-DD`. */
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  billingType?: string;
  externalReference?: string | null;
};

type Lista<T> = { data: T[]; hasMore?: boolean; totalCount?: number };

// ── Clientes ────────────────────────────────────────────────────────────────

export type DadosDoCliente = {
  nome: string;
  /** Só dígitos: CPF (11) ou CNPJ (14). */
  cpfCnpj: string;
  email?: string | null;
  /** Celular com DDD, só dígitos (sem o 55: o Asaas quer o número nacional). */
  celular?: string | null;
  /** O id do grupo: acha o cliente de volta e aparece no painel do Asaas. */
  referencia: string;
};

/** O celular nacional (DDD + número) a partir do que o sistema guarda (`55` + DDD + número). */
export function celularNacional(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  const local = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  return local.length === 10 || local.length === 11 ? local : null;
}

export async function buscarClientePorReferencia(referencia: string): Promise<ClienteDoAsaas | null> {
  const lista = await chamar<Lista<ClienteDoAsaas>>(
    "GET",
    `/customers?externalReference=${encodeURIComponent(referencia)}&limit=1`,
  );
  return lista?.data?.[0] ?? null;
}

export async function criarCliente(d: DadosDoCliente): Promise<ClienteDoAsaas> {
  return chamar<ClienteDoAsaas>("POST", "/customers", {
    name: d.nome,
    cpfCnpj: d.cpfCnpj,
    ...(d.email ? { email: d.email } : {}),
    ...(d.celular ? { mobilePhone: d.celular } : {}),
    externalReference: d.referencia,
  });
}

/**
 * O cliente do grupo no Asaas: o que já existe com a mesma referência (o
 * id do grupo) ou um novo. Evita cliente duplicado quando a primeira
 * tentativa criou no Asaas e falhou antes de gravar o id aqui.
 */
export async function buscarOuCriarCliente(d: DadosDoCliente): Promise<ClienteDoAsaas> {
  return (await buscarClientePorReferencia(d.referencia)) ?? criarCliente(d);
}

// ── Assinaturas ─────────────────────────────────────────────────────────────

export type DadosDaAssinatura = {
  clienteId: string;
  /** Em reais. */
  valor: number;
  /** `AAAA-MM-DD`: o vencimento da primeira cobrança. */
  proximoVencimento: string;
  /** "Astro Soluções — <plano>". */
  descricao: string;
  /** O id do grupo. */
  referencia: string;
};

/**
 * Assinatura mensal com `billingType: UNDEFINED`: a fatura deixa o cliente
 * escolher Pix, boleto ou cartão.
 */
export async function criarAssinatura(d: DadosDaAssinatura): Promise<AssinaturaDoAsaas> {
  if (!Number.isFinite(d.valor) || d.valor <= 0) throw new ErroDoAsaas("Mensalidade inválida para a assinatura.", 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.proximoVencimento)) throw new ErroDoAsaas("Vencimento inválido para a assinatura.", 0);
  return chamar<AssinaturaDoAsaas>("POST", "/subscriptions", {
    customer: d.clienteId,
    billingType: "UNDEFINED",
    cycle: "MONTHLY",
    value: Math.round(d.valor * 100) / 100,
    nextDueDate: d.proximoVencimento,
    description: d.descricao.slice(0, 500),
    externalReference: d.referencia,
  });
}

export async function cancelarAssinatura(assinaturaId: string): Promise<void> {
  await chamar<unknown>("DELETE", `/subscriptions/${encodeURIComponent(assinaturaId)}`);
}

export async function listarCobrancasDaAssinatura(
  assinaturaId: string,
  tempoLimiteMs: number = TEMPO_LIMITE_MS,
): Promise<PagamentoDoAsaas[]> {
  const lista = await chamar<Lista<PagamentoDoAsaas>>(
    "GET",
    `/subscriptions/${encodeURIComponent(assinaturaId)}/payments?limit=20`,
    undefined,
    tempoLimiteMs,
  );
  return lista?.data ?? [];
}

const EM_ABERTO = new Set(["PENDING", "OVERDUE"]);

/**
 * A fatura em aberto mais antiga (vencida primeiro) da assinatura, para o
 * botão "Pagar agora". `null` quando não há nada a pagar.
 */
export function faturaEmAberto(pagamentos: PagamentoDoAsaas[]): { url: string; vencimento: string; valor: number } | null {
  const abertos = pagamentos
    .filter((p) => EM_ABERTO.has(p.status) && typeof p.invoiceUrl === "string" && p.invoiceUrl.startsWith("https://"))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const p = abertos[0];
  return p ? { url: p.invoiceUrl!, vencimento: p.dueDate, valor: Number(p.value) } : null;
}

/**
 * Busca e escolhe a fatura em aberto; erro do Asaas vira `null` (com log).
 * O painel passa um tempo limite curto: a faixa não segura a tela.
 */
export async function lerFaturaEmAberto(
  assinaturaId: string,
  tempoLimiteMs: number = TEMPO_LIMITE_MS,
): Promise<{ url: string; vencimento: string; valor: number } | null> {
  try {
    return faturaEmAberto(await listarCobrancasDaAssinatura(assinaturaId, tempoLimiteMs));
  } catch (e) {
    console.error(`[asaas] faturas da assinatura não lidas: ${e instanceof Error ? e.message : "erro"}`);
    return null;
  }
}
