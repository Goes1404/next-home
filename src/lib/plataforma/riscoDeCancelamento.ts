// O risco de cancelamento de cada conta (29/10/2026).
//
// Módulo PURO: recebe os sinais que a leitura (`sinaisDeRisco.ts`, cron e
// telas da plataforma) já contou e devolve pontos, nível e os motivos em
// português. Só contagens e datas: nenhum dado de lead nem conversa.
//
// Os sinais e os pesos (soma até 100; decisão de 29/10/2026, ajustável aqui):
//
// - 30 · ninguém da equipe entrou nos últimos 7 dias (o mesmo "visto por
//   último" do Auth que o painel de números usa). É o sinal mais forte: conta
//   que ninguém abre não percebe o valor e cancela na próxima cobrança;
// - 20 · leads novos caíram mais da metade: as últimas 2 semanas contra as 2
//   anteriores, só com base mínima (4 leads nas anteriores), para conta
//   pequena não oscilar entre "risco" e "normal" por um lead;
// - 20 · WhatsApp fora do ar há mais de 3 dias (nenhum número conectado):
//   sem WhatsApp, a IA e as listas param, e o cliente sente o produto morto;
// - 20 · mensalidade em aberto (vencida, ou suspensa por atraso);
// - 10 · chamado de suporte aberto (15 com três ou mais): sinal de atrito.
//
// Nível: alto a partir de 50 (dois sinais fortes juntos), médio a partir de
// 25 (um sinal forte), baixo abaixo disso.

export const DIAS_SEM_LOGIN = 7;
export const DIAS_DE_WHATSAPP_FORA = 3;
/** A janela de comparação dos leads: últimas 2 semanas contra as 2 anteriores. */
export const DIAS_DA_JANELA_DE_LEADS = 14;
/** Base mínima de leads nas 2 semanas anteriores para a queda contar. */
export const BASE_MINIMA_DE_LEADS = 4;

export const PESOS_DO_RISCO = {
  semLogin: 30,
  quedaDeLeads: 20,
  whatsappFora: 20,
  mensalidadeEmAberto: 20,
  chamadoAberto: 10,
  muitosChamados: 15,
} as const;

export const RISCO_ALTO = 50;
export const RISCO_MEDIO = 25;

export type SinaisDeRisco = {
  /** O login mais recente de alguém da equipe (ISO), ou `null` se ninguém nunca entrou. */
  ultimoLoginDaEquipe: string | null;
  leadsUltimasDuasSemanas: number;
  leadsDuasSemanasAntes: number;
  /** Desde quando NENHUM número está conectado (ISO); `null` = há número no ar. */
  whatsappForaDesde: string | null;
  mensalidadeEmAberto: boolean;
  chamadosAbertos: number;
};

export type ChaveDoMotivo = "semLogin" | "quedaDeLeads" | "whatsappFora" | "mensalidadeEmAberto" | "chamadoAberto";

export type MotivoDoRisco = { chave: ChaveDoMotivo; texto: string; pontos: number };

export type NivelDoRisco = "alto" | "medio" | "baixo";

export type RiscoDaConta = { pontos: number; nivel: NivelDoRisco; motivos: MotivoDoRisco[] };

const DIA = 86_400_000;

function diasDesde(iso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(iso).getTime()) / DIA);
}

export function nivelDoRisco(pontos: number): NivelDoRisco {
  if (pontos >= RISCO_ALTO) return "alto";
  if (pontos >= RISCO_MEDIO) return "medio";
  return "baixo";
}

/** Os pontos e os motivos de uma conta, do motivo mais pesado ao mais leve. */
export function calcularRisco(s: SinaisDeRisco, agora: Date = new Date()): RiscoDaConta {
  const motivos: MotivoDoRisco[] = [];

  if (s.ultimoLoginDaEquipe === null) {
    motivos.push({ chave: "semLogin", texto: "Ninguém da equipe entrou ainda", pontos: PESOS_DO_RISCO.semLogin });
  } else {
    const dias = diasDesde(s.ultimoLoginDaEquipe, agora);
    if (dias >= DIAS_SEM_LOGIN) {
      motivos.push({ chave: "semLogin", texto: `Ninguém da equipe entra há ${dias} dias`, pontos: PESOS_DO_RISCO.semLogin });
    }
  }

  if (
    s.leadsDuasSemanasAntes >= BASE_MINIMA_DE_LEADS &&
    s.leadsUltimasDuasSemanas * 2 < s.leadsDuasSemanasAntes
  ) {
    const queda = Math.round((1 - s.leadsUltimasDuasSemanas / s.leadsDuasSemanasAntes) * 100);
    motivos.push({
      chave: "quedaDeLeads",
      texto: `Leads novos caíram ${queda}% (${s.leadsUltimasDuasSemanas} nas últimas 2 semanas, ${s.leadsDuasSemanasAntes} nas 2 anteriores)`,
      pontos: PESOS_DO_RISCO.quedaDeLeads,
    });
  }

  if (s.whatsappForaDesde !== null) {
    const dias = diasDesde(s.whatsappForaDesde, agora);
    if (dias >= DIAS_DE_WHATSAPP_FORA) {
      motivos.push({ chave: "whatsappFora", texto: `WhatsApp fora do ar há ${dias} dias`, pontos: PESOS_DO_RISCO.whatsappFora });
    }
  }

  if (s.mensalidadeEmAberto) {
    motivos.push({ chave: "mensalidadeEmAberto", texto: "Mensalidade em aberto", pontos: PESOS_DO_RISCO.mensalidadeEmAberto });
  }

  if (s.chamadosAbertos > 0) {
    const muitos = s.chamadosAbertos >= 3;
    motivos.push({
      chave: "chamadoAberto",
      texto: s.chamadosAbertos === 1 ? "1 chamado de suporte aberto" : `${s.chamadosAbertos} chamados de suporte abertos`,
      pontos: muitos ? PESOS_DO_RISCO.muitosChamados : PESOS_DO_RISCO.chamadoAberto,
    });
  }

  motivos.sort((a, b) => b.pontos - a.pontos);
  const pontos = motivos.reduce((t, m) => t + m.pontos, 0);
  return { pontos, nivel: nivelDoRisco(pontos), motivos };
}

/**
 * Desde quando a conta está sem nenhum número no ar, pelas instâncias dela:
 * `null` quando alguma está conectada. Sem instância nenhuma, conta desde a
 * criação da conta (nunca conectou). Com instâncias todas fora, a data mais
 * recente em que alguma ainda dava sinal (queda, desconexão, conexão,
 * criação): é o "fora desde" mais generoso, para não acusar à toa.
 */
export function whatsappForaDesde(
  instancias: readonly {
    status_conexao: string;
    desconectado_em: string | null;
    sessao_caida_em: string | null;
    conectado_em: string | null;
    created_at: string;
  }[],
  contaCriadaEm: string,
): string | null {
  if (instancias.some((i) => i.status_conexao === "conectado")) return null;
  if (instancias.length === 0) return contaCriadaEm;
  let maisRecente = contaCriadaEm;
  for (const i of instancias) {
    for (const d of [i.desconectado_em, i.sessao_caida_em, i.conectado_em, i.created_at]) {
      if (d && new Date(d).getTime() > new Date(maisRecente).getTime()) maisRecente = d;
    }
  }
  return maisRecente;
}

export type ContaEmRisco = { grupoId: string; nome: string; risco: RiscoDaConta };

/** As contas em risco (médio ou alto), da mais à menos arriscada. */
export function contasEmRisco(lista: readonly ContaEmRisco[]): ContaEmRisco[] {
  return lista
    .filter((c) => c.risco.nivel !== "baixo")
    .sort((a, b) => b.risco.pontos - a.risco.pontos || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * O aviso diário aos administradores: até três contas, com o motivo principal
 * de cada uma; o resto vira "e mais N". Sem conta em risco, sem aviso.
 */
export function resumoDosRiscos(lista: readonly ContaEmRisco[]): { titulo: string; corpo: string } | null {
  const emRisco = contasEmRisco(lista);
  if (emRisco.length === 0) return null;
  const altas = emRisco.filter((c) => c.risco.nivel === "alto").length;
  const itens = emRisco.slice(0, 3).map((c) => `${c.nome} (${c.risco.motivos[0]?.texto.toLowerCase() ?? "vários sinais"})`);
  const resto = emRisco.length - itens.length;
  const n = emRisco.length;
  return {
    titulo:
      (n === 1 ? "1 conta em risco de cancelamento" : `${n} contas em risco de cancelamento`) +
      (altas > 0 ? ` (${altas} alto)` : ""),
    corpo: itens.join("; ") + (resto > 0 ? `; e mais ${resto}` : "") + ".",
  };
}
