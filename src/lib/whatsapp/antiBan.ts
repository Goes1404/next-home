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

/**
 * Piso e teto do intervalo humanizado entre dois disparos do MESMO número.
 *
 * Moram aqui, e não em `campaignQueue.ts`, porque são política anti-ban —
 * a mesma classe do limite diário e da janela — e porque `repositorio.ts`
 * precisa deles para carimbar a trava de tempo no banco. Importá-los do
 * `campaignQueue` arrastaria o `llm.ts` (variação por IA) para o grafo de
 * quem só quer um número.
 */
/*
 * 1min30 a 2min desde 09/10/2026, a pedido do dono da conta ("não tem
 * problema demorar mais"): eram 35–75s. Continua sorteado a cada envio
 * (no banco, `consumir_cota_campanha_espacada`), porque intervalo exato e
 * sempre igual também é padrão de robô. O limite diário não mudou.
 */
export const INTERVALO_MINIMO_SEGUNDOS = 90;
export const INTERVALO_MAXIMO_SEGUNDOS = 120;
/** O mesmo intervalo, para as telas. Um teste confere que bate com os números. */
export const INTERVALO_EM_PALAVRAS = "1min30 a 2 minutos";

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

/**
 * A janela de ENVIO de um corretor (0148): o expediente dele dentro da
 * janela segura. O expediente pode encurtar a janela, nunca alargá-la —
 * propaganda fora das 9h às 20h59 é o que faz o destinatário denunciar.
 * `fimHora` do expediente é exclusivo.
 */
export function dentroDaJanelaDoCorretor(
  data: Date,
  expediente: { inicioHora: number; fimHora: number } | null,
): boolean {
  if (!dentroDaJanela(data)) return false;
  if (!expediente) return true;
  const { hora } = momentoEmSaoPaulo(data);
  return hora >= expediente.inicioHora && hora < expediente.fimHora;
}

export type ContextoEnvio = {
  tipo: TipoEnvio;
  /** Quando o número foi pareado — base da curva de aquecimento. */
  conectadoEm: Date;
  /** Campanhas já disparadas hoje por este número. */
  enviosCampanhaHoje: number;
  /** Preenchido quando o disjuntor está aberto (ver `deveAbrirDisjuntor`). */
  bloqueadoAte?: Date | null;
  /**
   * Exceção explícita: esta campanha dispara em qualquer horário.
   *
   * Afrouxa SÓ a janela. Cota diária, curva de aquecimento e disjuntor
   * continuam valendo — são eles que protegem o número; a janela protege
   * a reputação junto a quem recebe, que é outra coisa e outro risco.
   */
  ignorarJanela?: boolean;
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
      // O servidor roda em UTC: sem o fuso, o bloqueio das 21h de Brasília
      // aparecia como "até 09/10, 00:00" (08/10/2026, número da Márcia).
      detalhe: `Envios pausados automaticamente até ${ctx.bloqueadoAte.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} após falhas seguidas.`,
    };
  }

  // Responder quem nos escreveu não passa por cota nem por janela: é o
  // cliente que puxou conversa, e deixar no vácuo seria pior — inclusive
  // para o número, já que silêncio depois de contato gera bloqueio.
  if (ctx.tipo === "resposta") return { permitido: true };

  if (!ctx.ignorarJanela && !dentroDaJanela(agora)) {
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

/**
 * O destinatário simplesmente não tem WhatsApp?
 *
 * Isso NÃO é falha do nosso número e não pode alimentar o disjuntor. A
 * Evolution responde `HTTP 400` com `"exists": false` para um telefone que
 * não está no WhatsApp — é dado ruim do lead, não sinal de que a nossa
 * conexão está doente.
 *
 * Confundir os dois custou caro em produção: três leads seguidos com
 * número inválido abriam o disjuntor por 12 horas e **travavam a fila
 * inteira** — 57 itens parados por causa de telefones digitados errado no
 * cadastro. O disjuntor existe para proteger o número quando o PROVEDOR
 * está falhando; um destinatário inexistente não diz nada sobre isso.
 */
export function ehDestinatarioInexistente(detalhe: string | undefined): boolean {
  if (!detalhe) return false;
  return /"exists"\s*:\s*false/i.test(detalhe);
}

export function bloqueadoAtePor(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + HORAS_DISJUNTOR * 3600_000);
}

// ------------------------------------------------- aquecimento pelo USO (0158)

/** O mínimo por dia: um número parado recomeça daqui. */
export const PISO_POR_USO = 15;
/** Quanto o limite pode crescer sobre o maior dia recente. */
export const CRESCIMENTO_POR_USO = 1.5;
/** Quantos dias para trás contam como "uso recente". */
export const DIAS_DE_USO_RECENTE = 7;
/** Recusas na semana a partir das quais o crescimento trava. */
export const RECUSAS_PARA_FREAR = 3;

export type LimiteDoDia = {
  limite: number;
  /** O que decidiu o número, para a tela explicar em português. */
  motivo: "uso" | "idade" | "freio" | "piso";
  /** O maior dia de envio dos últimos 7 dias (sem contar hoje). */
  maiorDiaRecente: number;
};

/**
 * O limite de hoje, pelo USO REAL do número (0158, 03/10/2026).
 *
 * A curva antiga contava só a IDADE do número desde a conexão: um número
 * conectado há 30 dias que nunca mandou nada ganhava 150 por dia de uma vez,
 * e um número que parou uma semana voltava no volume máximo. É o padrão que
 * o WhatsApp lê como conta comprometida — volume que não foi construído.
 *
 * Agora o limite acompanha o que o número de fato mandou:
 * - parte do maior dia dos últimos 7 (sem contar hoje) e pode crescer 50%
 *   sobre ele; sem uso recente, volta ao piso de 15;
 * - a idade continua sendo TETO (número novo não passa de 15 por dia nos 3
 *   primeiros dias, nem de 30 até o sétimo, e assim por diante);
 * - se a semana teve 3 ou mais recusas ("não quero mais") e elas são 5% ou
 *   mais do que saiu, o limite NÃO cresce: o público está reclamando, e
 *   aumentar o volume é o caminho mais curto para a denúncia.
 *
 * `historico` = envios por dia (YYYY-MM-DD em São Paulo). `hoje` no mesmo
 * formato. Pura: a tela e o disparador usam a mesma conta.
 */
export function limiteDoDia(params: {
  diasDesdeConexao: number;
  historico: ReadonlyArray<{ dia: string; enviados: number }>;
  hoje: string;
  recusasNaSemana: number;
}): LimiteDoDia {
  const tetoPorIdade = limiteDiarioCampanha(params.diasDesdeConexao);
  if (tetoPorIdade <= 0) return { limite: 0, motivo: "idade", maiorDiaRecente: 0 };

  const corte = new Date(`${params.hoje}T12:00:00Z`);
  corte.setUTCDate(corte.getUTCDate() - DIAS_DE_USO_RECENTE);
  const desde = corte.toISOString().slice(0, 10);

  const recentes = params.historico.filter((h) => h.dia < params.hoje && h.dia >= desde);
  const maiorDiaRecente = recentes.reduce((m, h) => Math.max(m, h.enviados), 0);
  const enviadosNaSemana = recentes.reduce((s, h) => s + h.enviados, 0);

  const freio =
    params.recusasNaSemana >= RECUSAS_PARA_FREAR &&
    enviadosNaSemana > 0 &&
    params.recusasNaSemana / enviadosNaSemana >= 0.05;

  const porUso = Math.max(
    PISO_POR_USO,
    Math.round(maiorDiaRecente * (freio ? 1 : CRESCIMENTO_POR_USO)),
  );
  const limite = Math.min(tetoPorIdade, porUso);

  const motivo: LimiteDoDia["motivo"] =
    limite === tetoPorIdade && porUso > tetoPorIdade
      ? "idade"
      : freio
        ? "freio"
        : maiorDiaRecente === 0 || porUso === PISO_POR_USO
          ? "piso"
          : "uso";
  return { limite, motivo, maiorDiaRecente };
}

/** A frase que a tela mostra sobre o limite de hoje. */
export function fraseDoLimite(l: LimiteDoDia): string {
  switch (l.motivo) {
    case "piso":
      return `Hoje seu número pode mandar até ${l.limite} mensagens de lista. O limite cresce conforme ele é usado; parado por uma semana, volta a ${PISO_POR_USO}.`;
    case "uso":
      return `Hoje seu número pode mandar até ${l.limite} mensagens de lista (o maior dia da última semana foi ${l.maiorDiaRecente}). Usando todo dia, o limite sobe.`;
    case "idade":
      return `Hoje seu número pode mandar até ${l.limite} mensagens de lista. Ele ainda é novo no sistema: o teto sobe sozinho com os dias.`;
    case "freio":
      return `Hoje seu número pode mandar até ${l.limite} mensagens de lista. O limite parou de subir porque várias pessoas pediram para sair esta semana — vale rever a mensagem ou o público.`;
  }
}
