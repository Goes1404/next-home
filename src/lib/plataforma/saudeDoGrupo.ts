// O semáforo de saúde de um grupo (plataforma, 21/10/2026).
//
// Módulo PURO: recebe os sinais já lidos e devolve o nível e os motivos em
// português. A leitura dos sinais mora em `saude.ts`. A lista e o detalhe da
// plataforma mostram a MESMA conta.

import type { SituacaoDaCobranca } from "@/lib/planos/cobranca";
import type { SituacaoDaCota } from "@/lib/planos/cotaDaIa";

export type NivelDeSaude = "verde" | "amarelo" | "vermelho";

export type MotivoDeSaude = { nivel: "amarelo" | "vermelho"; texto: string };

export type SinaisDeSaude = {
  situacao: "ativo" | "suspenso" | "encerrado";
  corretoresAtivos: number;
  /** WhatsApps (dos corretores ativos) conectados agora. */
  whatsappsConectados: number;
  /** WhatsApps cadastrados dos corretores ativos. */
  whatsappsCadastrados: number;
  /** Nas últimas 24h: o webhook tentou responder um cliente. */
  tentativasNas24h: number;
  /** Nas últimas 24h: a IA respondeu (ou transferiu). */
  respondidasNas24h: number;
  errosDeEnvioNas24h: number;
  fallbacksNas24h: number;
  cota: SituacaoDaCota;
  cobranca: SituacaoDaCobranca;
  /** O custo da IA passou de 30% da mensalidade; `null` = grupo sem mensalidade. */
  custo: { alerta: boolean; percentual: number } | null;
};

/** Fallback só acende com volume: um ou dois no dia é ruído do provedor. */
export const FALLBACKS_MINIMOS = 3;
/** E com esta fração das tentativas das 24h. */
export const FRACAO_DE_FALLBACK = 0.2;

export function saudeDoGrupo(s: SinaisDeSaude): { nivel: NivelDeSaude; motivos: MotivoDeSaude[] } {
  // Grupo encerrado não se monitora: o que aparece aqui é só o estado dele.
  if (s.situacao === "encerrado") return { nivel: "verde", motivos: [] };

  const motivos: MotivoDeSaude[] = [];
  const amarelo = (texto: string) => motivos.push({ nivel: "amarelo", texto });
  const vermelho = (texto: string) => motivos.push({ nivel: "vermelho", texto });

  // Cobrança: o manual (`situacao = suspenso`) e o por atraso dão o mesmo estado.
  if (s.cobranca.estado === "suspenso") vermelho("Suspenso por cobrança");
  else if (s.cobranca.estado === "pendente") {
    const d = s.cobranca.diasDeAtraso;
    amarelo(d > 0 ? `Mensalidade vencida há ${d} ${d === 1 ? "dia" : "dias"}` : "Mensalidade vence hoje");
  }

  // WhatsApp.
  if (s.corretoresAtivos > 0 && s.whatsappsCadastrados === 0) {
    amarelo("Nenhum WhatsApp cadastrado");
  } else if (s.whatsappsConectados < s.whatsappsCadastrados) {
    const fora = s.whatsappsCadastrados - s.whatsappsConectados;
    amarelo(
      fora === s.whatsappsCadastrados && fora > 1
        ? `Nenhum dos ${fora} WhatsApps está conectado`
        : `${s.whatsappsConectados} de ${s.whatsappsCadastrados} WhatsApps conectados`,
    );
  }

  // A IA parou? Cliente falou e nada saiu em 24h.
  if (s.tentativasNas24h > 0 && s.respondidasNas24h === 0) {
    vermelho("IA sem responder há mais de 24h, com clientes escrevendo");
  }
  if (s.errosDeEnvioNas24h > 0) {
    amarelo(`${s.errosDeEnvioNas24h} ${s.errosDeEnvioNas24h === 1 ? "erro" : "erros"} de envio nas últimas 24h`);
  }
  if (
    s.fallbacksNas24h >= FALLBACKS_MINIMOS &&
    s.tentativasNas24h > 0 &&
    s.fallbacksNas24h / s.tentativasNas24h >= FRACAO_DE_FALLBACK
  ) {
    amarelo(`IA caiu no plano B ${s.fallbacksNas24h} vezes nas últimas 24h`);
  }

  // Cota.
  if (s.cota.nivel === "esgotada") vermelho("Cota de respostas da IA esgotada");
  else if (s.cota.nivel === "aviso") amarelo(`Cota da IA em ${s.cota.percentual}%`);

  // Custo da IA contra a mensalidade.
  if (s.custo?.alerta) amarelo(`IA custa ${Math.round(s.custo.percentual)}% da mensalidade`);

  motivos.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "vermelho" ? -1 : 1));
  const nivel: NivelDeSaude = motivos.some((m) => m.nivel === "vermelho")
    ? "vermelho"
    : motivos.length > 0
      ? "amarelo"
      : "verde";
  return { nivel, motivos };
}
