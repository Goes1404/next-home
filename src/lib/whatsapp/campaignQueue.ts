import { dentroDaJanela } from "./antiBan";
import { nomeUtilDoLead, primeiroNomeUtil } from "@/lib/leads/nomeExibido";
import { algumProvedorConfigurado, chamarLlmJson } from "./llm";
import type { ItemFilaCampanha } from "./types";
import { comecoAleatorio, distribuirVariantes, type Variante } from "./testeAB";
import { aplicarContexto, trocarNome, type ContextoTemplate } from "./listaDeTransmissao";
import { soarHumano } from "./vozHumana";
import {
  emPorcentagem,
  estiloDaVariacao,
  fatosQueOTextoCita,
  LIMITE_DE_SEMELHANCA,
  maiorSemelhanca,
  mascararNomes,
  problemaDaVariacao,
  promptDeVariacao,
  RECENTES_NO_PEDIDO,
  type TextoAnterior,
  versoesDiferentes,
} from "./variacaoDeTexto";

/**
 * Piso e teto do intervalo humanizado entre disparos, em segundos.
 *
 * A definição mora em `antiBan.ts` desde a 0062, junto com o resto da
 * política; reexportados aqui porque este módulo era o endereço deles.
 */
import { INTERVALO_MINIMO_SEGUNDOS, INTERVALO_MAXIMO_SEGUNDOS } from "./antiBan";
export { INTERVALO_MINIMO_SEGUNDOS, INTERVALO_MAXIMO_SEGUNDOS };

/**
 * Empurra o horário até cair dentro da janela permitida.
 *
 * Uma fila longa começa às 19h e naturalmente atravessaria a madrugada;
 * sem isto, o número mandaria mensagem às 3h — um dos padrões mais
 * característicos de robô que existe.
 */
function proximoHorarioPermitido(instante: Date): Date {
  let candidato = new Date(instante);
  // Avança de 30 em 30 min por até uma semana; passou disso, algo está
  // errado na configuração e é melhor devolver o valor original do que
  // girar para sempre.
  for (let i = 0; i < 336; i++) {
    if (dentroDaJanela(candidato)) return candidato;
    candidato = new Date(candidato.getTime() + 30 * 60_000);
  }
  return instante;
}

/*
 * `nomeUtilDoLead` mora em `leads/nomeExibido.ts` — módulo puro, para a
 * fila do Início poder usá-la sem arrastar o `llm.ts` junto. Reexportado
 * aqui porque este arquivo era a casa dela e há chamadores apontando para cá.
 */
export { nomeUtilDoLead };

/**
 * Aplica os marcadores do template ao lead. Barato, sem rede.
 */
export function aplicarTemplate(params: {
  mensagemBase: string;
  nomeLead: string;
  empreendimentoNome?: string;
  /**
   * As variáveis do imóvel e do corretor ({bairro}, {link}...), resolvidas na
   * criação da lista (`contextoDaLista`). `{horarios}` fica para o envio.
   */
  contexto?: ContextoTemplate | null;
}): string {
  const comContexto = params.contexto
    ? aplicarContexto(params.mensagemBase, params.contexto)
    : params.mensagemBase;
  // O primeiro nome, como gente chama gente; sem nome útil, o marcador some
  // junto com a pontuação que só existia por causa dele (`trocarNome`).
  return trocarNome(comContexto, primeiroNomeUtil(params.nomeLead)).replace(
    /{imovel}/gi,
    params.empreendimentoNome || "nossos lançamentos em Alphaville",
  );
}

export type ResultadoDaVariacao =
  | {
      ok: true;
      texto: string;
      /** false = saiu o texto do corretor, que por si já não repetia nada. */
      personalizadoPorIA: boolean;
      /** A maior semelhança do texto escolhido com as mensagens anteriores. */
      semelhanca: number;
    }
  | {
      ok: false;
      /**
       * `ia_indisponivel`: a IA não respondeu, e o texto do corretor repetiria
       * outro. `parecida`: a IA respondeu, mas nenhuma reescrita passou na
       * conferência (fatos, invenção ou semelhança).
       */
      motivo: "ia_indisponivel" | "parecida";
      detalhe: string;
      semelhanca: number;
    };

/**
 * Reescreve UMA mensagem da lista e só devolve texto que não repete o número
 * (08/10/2026).
 *
 * A versão anterior pedia à IA "uma mensagem 100% única" e aceitava o que
 * viesse. Medido na semana da restrição da conta da Bruna: as reescritas
 * tinham mediana de 0,95 de semelhança com uma mensagem anterior do mesmo
 * número, e um texto saiu 8 vezes. Agora cada reescrita é CONFERIDA:
 * - fatos do original continuam escritos igual, e nada foi inventado
 *   (`problemaDaVariacao`);
 * - fica abaixo de `LIMITE_DE_SEMELHANCA` contra as mensagens dos últimos 30
 *   dias do número (`anteriores`, da mais recente para a mais antiga).
 * Recusada, a próxima tentativa recebe o motivo e a mensagem com que ela se
 * pareceu. Sem reescrita aproveitável, o texto do corretor só sai se ele
 * mesmo não repetir nada (a primeira mensagem de uma lista nova, por exemplo).
 * Fora isso, devolve `ok: false` e quem chama decide esperar: mandar igual é
 * justamente o que o WhatsApp restringe.
 *
 * Uma chamada por mensagem, no momento do ENVIO (fazer as N na criação da
 * lista estourava o tempo da função). Cada uma sorteia um estilo de abertura
 * e de organização; sozinha, a IA voltava sempre ao mesmo molde.
 */
export async function variarSemRepetir(params: {
  /** O texto da fila, com o nome e as variáveis do imóvel já aplicados. */
  texto: string;
  /** Os nomes da pessoa (primeiro e completo), para a conferência e a conta. */
  nomes: readonly string[];
  /** O nome que a mensagem usa para chamar a pessoa (`primeiroNomeUtil`). */
  nome: string | null;
  /** Trechos que precisam continuar escritos igual (`fatosDaLista`). */
  fatos: readonly string[];
  /** Mensagens do número, da mais recente para a mais antiga. */
  anteriores: readonly TextoAnterior[];
  /** No teste A/B a abertura é o que se mede: a IA troca só as palavras. */
  manterAbertura?: boolean;
  tentativas?: number;
  orcamentoMs?: number;
  /** Fixa o estilo sorteado. Só o teste passa isto; produção sorteia. */
  semente?: number;
}): Promise<ResultadoDaVariacao> {
  const tentativas = Math.max(0, params.tentativas ?? 2);
  const semente = params.semente ?? Math.floor(Math.random() * 1_000_000);
  const fatosDoOriginal = fatosQueOTextoCita(params.texto, params.fatos);
  const recentes = params.anteriores
    .slice(0, RECENTES_NO_PEDIDO)
    .map((a) => mascararNomes(a.texto, a.nomes ?? []));

  let iaRespondeu = false;
  let recusa: { problema: string; parecidaCom?: string | null } | null = null;
  let menorSemelhanca = 1;

  if (algumProvedorConfigurado()) {
    for (let i = 0; i < tentativas; i++) {
      const prompt = promptDeVariacao({
        original: params.texto,
        nome: params.nome,
        fatos: fatosDoOriginal,
        recentes,
        estilo: estiloDaVariacao(semente + i * 7, {
          temNome: Boolean(params.nome),
          manterAbertura: Boolean(params.manterAbertura),
        }),
        manterAbertura: Boolean(params.manterAbertura),
        tentativaAnterior: recusa,
      });
      const resultado = await chamarLlmJson(prompt, {
        temperature: i === 0 ? 0.9 : 1,
        orcamentoMs: params.orcamentoMs ?? 9_000,
      });
      if (!resultado.ok) {
        // A camada do LLM já retenta o que falha rápido; um timeout ou cota
        // aqui não melhora na segunda chamada e gastaria o tempo do envio.
        console.warn(`[campanha] reescrita indisponível (${resultado.erro}).`);
        break;
      }
      iaRespondeu = true;

      const bruto = (resultado.json as { mensagem?: unknown })?.mensagem;
      if (typeof bruto !== "string") {
        recusa = { problema: "não veio o texto no campo mensagem" };
        continue;
      }
      const candidato = soarHumano(bruto);
      const problema = problemaDaVariacao({
        original: params.texto,
        variacao: candidato,
        fatos: params.fatos,
        nome: params.nome,
      });
      if (problema) {
        recusa = { problema };
        continue;
      }

      const comparacao = maiorSemelhanca(candidato, params.nomes, params.anteriores, params.fatos);
      if (comparacao.semelhanca < LIMITE_DE_SEMELHANCA) {
        return { ok: true, texto: candidato, personalizadoPorIA: true, semelhanca: comparacao.semelhanca };
      }
      menorSemelhanca = Math.min(menorSemelhanca, comparacao.semelhanca);
      const parecida = params.anteriores[comparacao.indice];
      recusa = {
        problema: `ficou ${emPorcentagem(comparacao.semelhanca)} parecida com uma mensagem que o número já mandou`,
        parecidaCom: parecida ? mascararNomes(parecida.texto, parecida.nomes ?? []) : null,
      };
    }
  }

  const doOriginal = maiorSemelhanca(params.texto, params.nomes, params.anteriores, params.fatos);
  if (doOriginal.semelhanca < LIMITE_DE_SEMELHANCA) {
    return { ok: true, texto: params.texto, personalizadoPorIA: false, semelhanca: doOriginal.semelhanca };
  }
  return {
    ok: false,
    motivo: iaRespondeu ? "parecida" : "ia_indisponivel",
    detalhe: recusa?.problema ?? "sem reescrita, e o texto original repete uma mensagem anterior",
    semelhanca: Math.min(menorSemelhanca, doOriginal.semelhanca),
  };
}

/**
 * Calcula os horários humanizados de uma fila de disparo, sem tocar em rede.
 *
 * A proteção que vive aqui é o espaçamento: 35-75s entre disparos, sempre
 * dentro do horário comercial. É este cálculo que o disparador obedece —
 * ele nunca manda um item antes de `agendadoPara`.
 */
export function montarFilaCampanha(params: {
  campanhaId: string;
  leads: { id: string; nome: string; telefone: string }[];
  mensagemBase: string;
  empreendimentoNome?: string;
  intervaloSegundosMinimo?: number;
  /** Primeiro instante desejado. A fila nunca começa no passado. */
  iniciarEm?: Date | string;
  /**
   * Agenda em qualquer horário, sem empurrar para o comercial.
   *
   * O espaçamento de 35-75s continua valendo — é ele que evita a rajada.
   * O que sai é só o adiamento para a próxima janela.
   */
  ignorarJanela?: boolean;
  /**
   * Segunda versão da mensagem (teste A/B, 0084). Ausente = campanha de uma
   * versão só, e a fila sai exatamente como antes.
   */
  mensagemBaseB?: string | null;
  /** Fixa o começo do rodízio. Só o teste passa isto; produção sorteia. */
  comecarVarianteEm?: Variante;
  /** Variáveis do imóvel e do corretor (`contextoDaLista`). */
  contexto?: ContextoTemplate | null;
}): ItemFilaCampanha[] {
  const { campanhaId, leads, mensagemBase, empreendimentoNome } = params;
  const ignorarJanela = params.ignorarJanela ?? false;
  const intervaloSegundosMinimo =
    params.intervaloSegundosMinimo ?? INTERVALO_MINIMO_SEGUNDOS;
  const inicioSolicitado = params.iniciarEm
    ? new Date(params.iniciarEm).getTime()
    : Date.now();
  const agora = Math.max(
    Date.now(),
    Number.isFinite(inicioSolicitado) ? inicioSolicitado : 0,
  );

  const itens: ItemFilaCampanha[] = [];

  // Acumulador, não `i * delay`: como cada volta sorteia o próprio atraso,
  // multiplicar pelo índice faz o instante de um item ficar ANTES do
  // anterior quando o sorteio cai baixo (ex.: 2º sorteia 75s e 3º sorteia
  // 35s → 150s e 105s). Isso agruparia disparos no mesmo segundo, que é
  // exatamente o padrão que a proteção deveria evitar.
  let deslocamentoSegundos = 0;
  // Último instante agendado: o guarda de monotonicidade. Empurrar dois
  // itens para a próxima janela pode INVERTER a ordem — quem cruza uma
  // fronteira de hora ganha um degrau de 30 min a menos no
  // `proximoHorarioPermitido` e cai ANTES do item anterior (flagrado pelo
  // teste rodando de madrugada). Nenhum item pode agendar antes do
  // anterior + intervalo humanizado.
  let anteriorMs = 0;

  /*
   * As letras do A/B, alternadas a partir de um começo sorteado (0084).
   * Alternar importa: a ordem da fila é a ordem do disparo e o horário
   * também influencia a resposta — dar a primeira metade para a versão A
   * misturaria os dois efeitos e a comparação mediria o relógio.
   */
  // Versão B igual à A não testa nada (`versoesDiferentes`): a fila sai
  // como versão única, sem letra.
  const mensagemB = versoesDiferentes(params.mensagemBase, params.mensagemBaseB)
    ? params.mensagemBaseB!.trim()
    : null;
  const variantes = mensagemB
    ? distribuirVariantes(leads.length, params.comecarVarianteEm ?? comecoAleatorio())
    : [];

  for (const [indice, lead] of leads.entries()) {
    const janela = Math.max(1, INTERVALO_MAXIMO_SEGUNDOS - intervaloSegundosMinimo);
    const atrasoSegundos = intervaloSegundosMinimo + Math.floor(Math.random() * janela);

    // Empurra para dentro do horário comercial antes de gravar: uma fila
    // longa iniciada no fim da tarde escorregaria para a madrugada.
    const bruto = new Date(agora + deslocamentoSegundos * 1000);
    // Com `ignorarJanela` o horário permitido é o próprio instante: a
    // função de empurrar sai do caminho, e só ela. A monotonicidade abaixo
    // continua rodando igual — sem ela, dois itens podem cair no mesmo
    // segundo, que é a rajada que o espaçamento existe para evitar.
    const permitido = ignorarJanela ? (d: Date) => d : proximoHorarioPermitido;
    let agendado = permitido(bruto);
    if (anteriorMs > 0 && agendado.getTime() < anteriorMs + atrasoSegundos * 1000) {
      agendado = permitido(new Date(anteriorMs + atrasoSegundos * 1000));
    }
    anteriorMs = agendado.getTime();
    const agendadoPara = agendado.toISOString();
    deslocamentoSegundos += atrasoSegundos;

    itens.push({
      id: `fila-${campanhaId}-${lead.id}`,
      campanhaId,
      leadId: lead.id,
      telefone: lead.telefone,
      variante: mensagemB ? variantes[indice] : null,
      mensagemPersonalizada: aplicarTemplate({
        mensagemBase: mensagemB && variantes[indice] === "B" ? mensagemB : mensagemBase,
        nomeLead: lead.nome,
        empreendimentoNome,
        contexto: params.contexto,
      }),
      // A variação por IA acontece no envio (ver `variarMensagemComIA`).
      // Nasce false porque, neste instante, ela de fato ainda não ocorreu.
      personalizadoPorIA: false,
      status: "pendente",
      agendadoPara,
      enviadoEm: null,
      respostaEm: null,
      erroMotivo: null,
      createdAt: new Date().toISOString(),
    });
  }

  return itens;
}

/**
 * Os exemplos que a tela mostra antes de criar a lista, pelo MESMO caminho do
 * envio: cada um reescrito e conferido contra as mensagens do número e contra
 * os exemplos anteriores, em sequência. Em paralelo, os exemplos nasciam sem
 * se ver e saíam parecidos entre si, e a prévia prometia uma variação que o
 * envio não entregava.
 *
 * Uma tentativa por exemplo (o envio faz até duas): a tela está esperando.
 */
export async function exemplosDaLista(params: {
  textos: ReadonlyArray<{ texto: string; nomeLead: string }>;
  fatos: readonly string[];
  anteriores: readonly TextoAnterior[];
  manterAbertura?: boolean;
}): Promise<{ textos: string[]; reescritos: number; repetidos: number }> {
  const anteriores = [...params.anteriores];
  const textos: string[] = [];
  let reescritos = 0;
  let repetidos = 0;
  for (const exemplo of params.textos) {
    const nome = primeiroNomeUtil(exemplo.nomeLead);
    const nomes = nomesDaPessoa(exemplo.nomeLead);
    const v = await variarSemRepetir({
      texto: exemplo.texto,
      nome,
      nomes,
      fatos: params.fatos,
      anteriores,
      manterAbertura: params.manterAbertura,
      tentativas: 1,
      orcamentoMs: 7_000,
    });
    const texto = v.ok ? v.texto : exemplo.texto;
    if (v.ok && v.personalizadoPorIA) reescritos++;
    if (!v.ok) repetidos++;
    textos.push(texto);
    anteriores.unshift({ texto, nomes });
  }
  return { textos, reescritos, repetidos };
}

/** O nome completo e o primeiro nome, para saírem da conta da semelhança. */
export function nomesDaPessoa(nomeLead: string | null | undefined): string[] {
  return [nomeUtilDoLead(nomeLead), primeiroNomeUtil(nomeLead)].filter((n): n is string => Boolean(n));
}
