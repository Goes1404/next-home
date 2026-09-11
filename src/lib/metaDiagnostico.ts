/**
 * Diagnóstico de um token do Meta — as partes PURAS.
 *
 * ## Por que isto existe
 *
 * Conectar o Meta Ads exigia acertar duas coisas no escuro: qual dos
 * números da Meta é o ID da conta de anúncios, e se o token que você tem
 * na mão serve. Errar qualquer uma só aparecia DEPOIS de gravar a env var
 * na Vercel e redeployar — e o sintoma era a tabela `meta_ads_metricas`
 * continuar em zero, que é indistinguível de "não configurado".
 *
 * Em 11/09/2026 isso travou a conexão de verdade: um número de 16 dígitos
 * na mão, sem meio de saber se era conta de anúncios, app ou página.
 *
 * Aqui ficam só as funções puras (parsear a resposta da Graph API e julgar
 * o token). A rede mora em `scripts/metaDiagnostico.ts`. A separação não é
 * estética: é o que faz o julgamento do token ser testável sem chamar a
 * Meta, e é onde os casos que enganam — `expires_at: 0`, escopo granular,
 * token de página — ficam registrados.
 */

/** A partir de quantos dias para vencer o aviso passa a ser urgente. */
export const DIAS_DE_AVISO_DE_VENCIMENTO = 7;

/**
 * Quantos dias sem sincronizar ainda contam como "em dia".
 *
 * Dois, não zero: o cron roda 1x/dia (teto do plano Hobby) e a Meta ajusta
 * gasto retroativamente, então um dia de folga é operação normal. Avisar
 * no primeiro dia faria o alerta viver aceso — e alerta sempre aceso vira
 * paisagem (a régua do `evolucaoConversa`).
 */
export const DIAS_DE_TOLERANCIA_DA_SINCRONIZACAO = 2;

const UM_DIA_MS = 86_400_000;

export type TipoDeToken = "usuario" | "sistema" | "pagina" | "desconhecido";

export interface TokenLido {
  valido: boolean;
  tipo: TipoDeToken;
  appNome: string | null;
  /** `null` quando o token NÃO vence (o caso do Usuário do Sistema). */
  expiraEm: Date | null;
  escopos: string[];
  temAdsRead: boolean;
  erro: string | null;
}

export interface ContaDeAnuncio {
  /** Só dígitos, sem o `act_` — é o formato que `META_ADS_ACCOUNT_ID` espera. */
  id: string;
  nome: string;
  ativa: boolean;
  moeda: string | null;
}

type DebugTokenBruto = {
  data?: {
    app_id?: string;
    application?: string;
    type?: string;
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    granular_scopes?: { scope?: string; target_ids?: string[] }[];
    error?: { message?: string };
  };
  error?: { message?: string };
} | null;

function tipoDeToken(bruto: string | undefined): TipoDeToken {
  switch ((bruto ?? "").toUpperCase()) {
    case "USER":
      return "usuario";
    case "SYSTEM_USER":
      return "sistema";
    case "PAGE":
      return "pagina";
    default:
      return "desconhecido";
  }
}

/** Resposta de `/debug_token` virando algo que dá para julgar. */
export function lerDebugToken(bruto: DebugTokenBruto): TokenLido {
  const dados = bruto?.data;

  const escopos = dados?.scopes ?? [];
  /*
   * A Meta migrou para escopo GRANULAR: um token pode ter `ads_read` por
   * conta de anúncios, listado em `granular_scopes`, e não aparecer em
   * `scopes`. Olhar só `scopes` reprovaria token bom — e o custo do erro é
   * mandar alguém gerar outro token que vai dar no mesmo.
   */
  const granulares = (dados?.granular_scopes ?? [])
    .map((g) => g.scope)
    .filter((s): s is string => Boolean(s));

  const todos = [...escopos, ...granulares];

  return {
    valido: dados?.is_valid === true,
    tipo: tipoDeToken(dados?.type),
    appNome: dados?.application ?? null,
    // `expires_at: 0` (ou ausente) significa "não vence". Tratar 0 como
    // epoch faria o diagnóstico condenar justamente o token definitivo.
    expiraEm: dados?.expires_at ? new Date(dados.expires_at * 1000) : null,
    escopos: todos,
    temAdsRead: todos.includes("ads_read") || todos.includes("ads_management"),
    erro: dados?.error?.message ?? bruto?.error?.message ?? null,
  };
}

type ContaBruta = { id?: string; name?: string; account_status?: number; currency?: string };

/** Resposta de `/me/adaccounts` virando a lista que o gestor escolhe. */
export function contasDeAnuncio(bruto: { data?: ContaBruta[] } | null): ContaDeAnuncio[] {
  const contas: ContaDeAnuncio[] = [];
  for (const c of bruto?.data ?? []) {
    const id = (c.id ?? "").replace(/\D/g, "");
    if (!id) continue;
    contas.push({
      id,
      // Conta sem nome vira o próprio id: linha em branco não dá para
      // escolher (mesma razão de `nomeUtilDoLead` existir).
      nome: c.name?.trim() || id,
      // 1 é ACTIVE na Meta. Todo o resto (desabilitada, pendente, fechada)
      // é conta que existe e não entrega gasto novo.
      ativa: c.account_status === 1,
      moeda: c.currency ?? null,
    });
  }
  return contas;
}

export interface VereditoDoToken {
  serve: boolean;
  /** O que impede de usar, em português, ou `null` quando serve. */
  problema: string | null;
  /** Texto do vencimento quando o token vence; `null` quando não vence. */
  avisoDeVencimento: string | null;
  vencePerto: boolean;
}

export function vereditoDoToken(
  token: TokenLido,
  contas: ContaDeAnuncio[],
  agora: Date = new Date(),
): VereditoDoToken {
  const diasParaVencer = token.expiraEm
    ? Math.floor((token.expiraEm.getTime() - agora.getTime()) / UM_DIA_MS)
    : null;

  const vencido = diasParaVencer !== null && diasParaVencer < 0;

  const avisoDeVencimento =
    diasParaVencer !== null && !vencido
      ? `Este token vence em ${diasParaVencer} ${diasParaVencer === 1 ? "dia" : "dias"} — quando vencer, a sincronização para sem avisar. Token de Usuário do Sistema não vence.`
      : null;

  const problema = (() => {
    if (!token.valido) {
      return `A Meta recusou este token${token.erro ? `: ${token.erro}` : "."}`;
    }
    if (vencido) {
      return "Este token já venceu. Gere outro.";
    }
    if (token.tipo === "pagina") {
      return "Este é um token de PÁGINA. Ele serve para o webhook de leads, mas não lê investimento — o gasto exige token de usuário ou de Usuário do Sistema.";
    }
    if (!token.temAdsRead) {
      return "Falta a permissão ads_read neste token. Gere outro marcando ads_read.";
    }
    if (contas.length === 0) {
      return "O token é válido, mas não vê nenhuma conta de anúncios. Se for de Usuário do Sistema, falta atribuir a conta a ele em Adicionar ativos.";
    }
    return null;
  })();

  return {
    serve: problema === null,
    problema,
    avisoDeVencimento,
    vencePerto: diasParaVencer !== null && !vencido && diasParaVencer <= DIAS_DE_AVISO_DE_VENCIMENTO,
  };
}

/** As duas linhas exatas para colar na Vercel. */
export function linhasParaColar(contaId: string, token: string): string {
  return `META_ADS_ACCOUNT_ID=${contaId}\nMETA_ADS_TOKEN=${token}`;
}

export type EstadoDaSincronizacao = "nunca" | "em_dia" | "atrasado";

export interface IdadeDaSincronizacao {
  estado: EstadoDaSincronizacao;
  dias: number;
  /** O que mostrar na tela, ou `null` quando não há o que dizer. */
  texto: string | null;
}

/**
 * Há quanto tempo o gasto do Meta não é atualizado.
 *
 * Existe porque a tela de Anúncios não tinha como distinguir "o gráfico
 * está assim porque a campanha gastou assim" de "o gráfico congelou". Com
 * token de usuário (60 dias) o segundo caso é questão de tempo.
 */
export function idadeDaSincronizacao(
  atualizadoEm: string | null,
  agora: Date = new Date(),
): IdadeDaSincronizacao {
  if (!atualizadoEm) return { estado: "nunca", dias: 0, texto: null };

  const quando = new Date(atualizadoEm);
  if (Number.isNaN(quando.getTime())) {
    // Data ilegível não pode virar "há NaN dias" na tela do gestor.
    return { estado: "nunca", dias: 0, texto: null };
  }

  // Piso em zero: relógio do banco à frente do nosso não vira "há -3 dias".
  const dias = Math.max(0, Math.floor((agora.getTime() - quando.getTime()) / UM_DIA_MS));

  if (dias <= DIAS_DE_TOLERANCIA_DA_SINCRONIZACAO) {
    // Número bom não vira linha.
    return { estado: "em_dia", dias, texto: null };
  }

  return {
    estado: "atrasado",
    dias,
    texto: `O gasto do Meta não é atualizado há ${dias} ${dias === 1 ? "dia" : "dias"}.`,
  };
}
