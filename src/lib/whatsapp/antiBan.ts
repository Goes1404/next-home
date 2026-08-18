/**
 * Regras anti-ban do WhatsApp.
 *
 * Módulo puro de propósito: nenhuma chamada de rede ou banco aqui dentro.
 * A política é a parte que precisa ser lida, discutida e testada sem subir
 * nada — quem aplica é o chamador.
 *
 * O que de fato derruba um número (por ordem de peso):
 *  1. Destinatário clicar em "Bloquear" / "Denunciar spam". É o sinal mais
 *     forte que existe — por isso disparo frio é tratado como caro e
 *     resposta a quem escreveu, como barata.
 *  2. Volume alto logo depois de conectar (número "novo" agindo como robô).
 *  3. Rajada: muitas mensagens em poucos minutos.
 *  4. Texto idêntico repetido.
 *  5. Atividade em horário que nenhum humano trabalha.
 */

/**
 * Resposta a quem nos escreveu é conversa iniciada pelo cliente: risco
 * quase nulo. Disparo de campanha é contato frio: é o que consome cota.
 */
export type TipoEnvio = "resposta" | "campanha";

export type ConfigAntiBan = {
  /** Primeira hora permitida para campanha (0-23), horário de São Paulo. */
  horaInicio: number;
  /** Última hora permitida — em `20` a última mensagem sai 20h59. */
  horaFim: number;
  /** Domingo costuma render mais denúncia do que venda. */
  permitirDomingo: boolean;
};

export const CONFIG_PADRAO: ConfigAntiBan = {
  horaInicio: 9,
  horaFim: 20,
  permitirDomingo: false,
};

/**
 * Curva de aquecimento: quanto o número pode disparar em campanha, por dia,
 * segundo o tempo desde a conexão.
 *
 * Deliberadamente abaixo do que a internet costuma sugerir. O gargalo aqui
 * não é a cota — é o volume real de leads da imobiliária, que é baixo. Não
 * há nada a ganhar chegando perto do limite, e há um número de trabalho a
 * perder.
 */
export function limiteDiarioCampanha(diasDesdeConexao: number): number {
  if (diasDesdeConexao < 0) return 0;
  if (diasDesdeConexao < 3) return 15;
  if (diasDesdeConexao < 7) return 30;
  if (diasDesdeConexao < 14) return 60;
  if (diasDesdeConexao < 30) return 100;
  return 150;
}

/** Dias inteiros entre a conexão e agora. */
export function diasDesdeConexao(conectadoEm: Date, agora: Date = new Date()): number {
  return Math.floor((agora.getTime() - conectadoEm.getTime()) / 86_400_000);
}

/**
 * Hora e dia da semana em São Paulo.
 *
 * O servidor roda em UTC: ler `getHours()` direto agendaria campanha às 6h
 * da manhã achando que são 9h.
 */
export function momentoEmSaoPaulo(data: Date): { hora: number; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    weekday: "short",
    hour12: false,
  });

  const partes = fmt.formatToParts(data);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");

  const mapaDias: Record<string, number> = {
    dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sáb: 6, sab: 6,
  };
  const rotulo = (partes.find((p) => p.type === "weekday")?.value ?? "")
    .toLowerCase()
    .replace(".", "");

  return { hora, diaSemana: mapaDias[rotulo] ?? 1 };
}

export function dentroDaJanela(data: Date, config: ConfigAntiBan = CONFIG_PADRAO): boolean {
  const { hora, diaSemana } = momentoEmSaoPaulo(data);
  if (!config.permitirDomingo && diaSemana === 0) return false;
  return hora >= config.horaInicio && hora <= config.horaFim;
}

export type ContextoEnvio = {
  tipo: TipoEnvio;
  /** Quando o número foi pareado — base da curva de aquecimento. */
  conectadoEm: Date;
  /** Campanhas já disparadas hoje por este número. */
  enviosCampanhaHoje: number;
  /** Preenchido quando o disjuntor está aberto (ver `deveAbrirDisjuntor`). */
  bloqueadoAte?: Date | null;
  agora?: Date;
};

export type Veredito =
  | { permitido: true }
  | {
      permitido: false;
      motivo: "fora_da_janela" | "cota_diaria_atingida" | "numero_bloqueado" | "aquecimento";
      detalhe: string;
    };

export function podeEnviar(ctx: ContextoEnvio): Veredito {
  const agora = ctx.agora ?? new Date();

  if (ctx.bloqueadoAte && ctx.bloqueadoAte > agora) {
    return {
      permitido: false,
      motivo: "numero_bloqueado",
      detalhe: `Envios pausados automaticamente até ${ctx.bloqueadoAte.toLocaleString("pt-BR")} após falhas seguidas.`,
    };
  }

  // Responder quem nos escreveu não passa por cota nem por janela: é o
  // cliente que puxou conversa, e deixar no vácuo seria pior — inclusive
  // para o número, já que silêncio depois de contato gera bloqueio.
  if (ctx.tipo === "resposta") return { permitido: true };

  if (!dentroDaJanela(agora)) {
    return {
      permitido: false,
      motivo: "fora_da_janela",
      detalhe: `Campanhas só saem entre ${CONFIG_PADRAO.horaInicio}h e ${CONFIG_PADRAO.horaFim}h59, de segunda a sábado.`,
    };
  }

  const dias = diasDesdeConexao(ctx.conectadoEm, agora);
  if (dias < 0) {
    return { permitido: false, motivo: "aquecimento", detalhe: "Número ainda não conectado." };
  }

  const limite = limiteDiarioCampanha(dias);
  if (ctx.enviosCampanhaHoje >= limite) {
    return {
      permitido: false,
      motivo: "cota_diaria_atingida",
      detalhe:
        dias < 30
          ? `Limite de ${limite} disparos hoje (número em aquecimento, ${dias} ${dias === 1 ? "dia" : "dias"} de uso). A cota sobe sozinha conforme o número amadurece.`
          : `Limite de ${limite} disparos por dia atingido.`,
    };
  }

  return { permitido: true };
}

/** Quantos disparos ainda cabem hoje — a UI mostra isso antes de montar a fila. */
export function saldoDiario(ctx: Omit<ContextoEnvio, "tipo">): number {
  const agora = ctx.agora ?? new Date();
  const limite = limiteDiarioCampanha(diasDesdeConexao(ctx.conectadoEm, agora));
  return Math.max(0, limite - ctx.enviosCampanhaHoje);
}

/**
 * Falha seguida costuma significar número já restrito pelo WhatsApp.
 * Insistir a partir daí é o que transforma restrição em banimento.
 */
export const FALHAS_PARA_ABRIR_DISJUNTOR = 3;
export const HORAS_DISJUNTOR = 12;

export function deveAbrirDisjuntor(falhasSeguidas: number): boolean {
  return falhasSeguidas >= FALHAS_PARA_ABRIR_DISJUNTOR;
}

export function bloqueadoAtePor(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + HORAS_DISJUNTOR * 3600_000);
}
