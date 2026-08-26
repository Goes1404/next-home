import type { Empreendimento } from "@/lib/types";
import type { DossieClienteIA } from "./types";
import { ranquearCatalogo } from "./catalogoRelevante";

/**
 * Qual imóvel esta conversa está tratando AGORA.
 *
 * Existe por causa de um comportamento medido em produção: o cliente diz
 * "gostei do Terra Alta" e a resposta seguinte é "que bom, mas temos outras
 * opções, como...". A conversa nunca aprofunda em nada — vira um desfile de
 * empreendimentos, e o cliente some. Na conversa `56cee96e` isso aparece
 * inteiro: ele pede a PLANTA DO TERRA ALTA e recebe uma lista com Vista
 * AlphaGran e outros dois.
 *
 * A causa não é (só) o prompt: é que a IA enxerga DEZ fichas completas em
 * toda mensagem (`catalogoRelevante.ts` escolhe as dez mais relevantes, e
 * `aiAgent.ts` as imprime). O que ela vê, ela oferece — é a mesma lição que
 * `filtrarPorOrcamento` já tinha aprendido com o cliente de 600 mil que
 * recebia imóvel de 1,28 milhão. Então a correção é de construção: quando a
 * conversa TEM um imóvel escolhido, o catálogo do prompt encolhe para ele
 * (mais duas reservas, ver `catalogoComFoco`).
 *
 * Duas decisões que valem registrar:
 *
 * - **Só a fala do CLIENTE define o foco.** O bot cita meio catálogo por
 *   mensagem; se as falas dele contassem, o foco seria sempre o último
 *   imóvel que ela própria empurrou — o defeito se realimentaria.
 * - **Menção mais recente vence.** Cliente que falava do Terra Alta e passa
 *   a perguntar do Vitra mudou de assunto, e a conversa tem de mudar junto.
 *
 * RECONHECER O NOME é o problema difícil, e ele tem duas metades bem
 * diferentes (as duas medidas nas conversas reais de 24/08/2026):
 *
 * 1. GRAFIA — "alfaville", "terraalta", "eterniti", "Vitra alphavile".
 *    Resolvida aqui, com distância de edição de limiar apertado.
 * 2. NOME COMERCIAL ≠ NOME DO CADASTRO — "Dom parque" para um cadastro
 *    chamado "Lançamento ao Lado do Parque"; "manacá Barueri" para "More na
 *    Aldeia de Barueri". Nenhuma correção de grafia alcança isso: são
 *    nomes diferentes, não a mesma palavra escrita errado. Resolvida pelo
 *    campo `nomesAlternativos` do cadastro (migration 0044), que o corretor
 *    preenche na tela do imóvel.
 */

/** Palavras que aparecem em nome de imóvel mas não identificam nenhum. */
const GENERICAS = new Set([
  "apartamento",
  "apartamentos",
  "apto",
  "casa",
  "cobertura",
  "dorm",
  "dorms",
  "dormitorio",
  "dormitorios",
  "edificio",
  "empreendimento",
  "lancamento",
  "lancamentos",
  "lazer",
  "minha",
  "more",
  "parque",
  "residencial",
  "shopping",
  "suite",
  "torre",
  "vaga",
  "vagas",
  "valor",
  "vila",
  // Praças e cidades do nosso mercado: metade do catálogo as carrega.
  "alphaville",
  "aldeia",
  "barueri",
  "osasco",
  "tambore",
  "jardim",
]);

/**
 * Palavras comuns do português que também aparecem em nome de imóvel.
 *
 * Diferentes das genéricas acima: estas não são vocabulário de imobiliária,
 * são fala do dia a dia. Sozinhas, NÃO identificam empreendimento nenhum —
 * "quero algo de alta qualidade" virava foco no Terra Alta, e "prefiro uma
 * vista boa" virava foco no Vista AlphaGran. O imóvel continua sendo
 * reconhecido pelo nome inteiro ("terra alta") e pelo token distintivo
 * ("alphagran").
 */
const COMUNS = new Set([
  "alta",
  "alto",
  "azul",
  "baixa",
  "baixo",
  "bela",
  "belo",
  "clube",
  "campo",
  "centro",
  "grande",
  "lago",
  "melhor",
  "nova",
  "novo",
  "praia",
  "regiao",
  "verde",
  "vista",
  "unica",
  "unico",
]);

/**
 * Recusa dita na mesma frase do nome.
 *
 * "não gostei do Terra Alta" cita o Terra Alta e é o OPOSTO de foco nele.
 * Sem esta guarda, a resposta seguinte insistiria justamente no imóvel que
 * acabou de ser descartado — que é a regra 22 do prompt ao contrário.
 */
const RECUSA = /\bn(a|ã)o\s+(gostei|curti|gosto|quero|serve|me\s+atende|rolou)\b/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Quantos erros de digitação um termo tolera.
 *
 * A escala é apertada de propósito, e o motivo é assimétrico: NÃO achar o
 * imóvel custa uma resposta genérica; achar o ERRADO faz a IA afirmar
 * metragem, entrega e condição de outro empreendimento. Com um erro livre
 * em palavra curta, "alta" viraria "alto" e "elos" viraria "eles".
 *
 * Palavras de 5 e 6 letras toleravam ZERO erro, e era daí que vinha a
 * queixa de produção "a IA só reconhece o nome escrito certinho": "virta"
 * não achava o Vitra, "canvs" não achava o Canvas. Hoje toleram UM erro,
 * mas sob guarda dupla em `melhorTermo`: além da primeira letra, a ÚLTIMA
 * também tem de bater (quem digita errado erra no meio, não nas pontas —
 * e é a última letra que separa "alta" de "alto"), e pedaço de frase que É
 * uma palavra comum do português nunca entra no fuzzy.
 */
function tolerancia(termo: string): number {
  if (termo.length <= 4) return 0;
  if (termo.length <= 10) return 1;
  return 2;
}

/** Até este tamanho, o fuzzy exige que a última letra também bata. */
const TAMANHO_CURTO = 6;

/**
 * Damerau-Levenshtein com corte: para assim que a linha inteira passa do
 * limite. Sem o corte, comparar cada pedaço da frase com cada termo do
 * catálogo seria trabalho jogado fora na maioria absoluta dos pares.
 *
 * A transposição (o "Damerau") importa porque o erro de quem digita no
 * celular costuma ser trocar duas letras de lugar: "vitra" → "virta".
 */
function distancia(a: string, b: string, limite: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limite) return limite + 1;

  let anterior2: number[] = [];
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  let atual: number[] = [];

  for (let i = 1; i <= a.length; i++) {
    atual = [i];
    let melhorDaLinha = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valor = Math.min(valor, anterior2[j - 2] + 1);
      }
      atual[j] = valor;
      if (valor < melhorDaLinha) melhorDaLinha = valor;
    }
    if (melhorDaLinha > limite) return limite + 1;
    anterior2 = anterior;
    anterior = atual;
  }

  return anterior[b.length];
}

type Indice = {
  /** termo normalizado → slug, ou null quando aponta para imóveis diferentes. */
  termos: Map<string, string | null>;
  /** Termos agrupados por tamanho, para o fuzzy só olhar o que pode casar. */
  porTamanho: Map<number, string[]>;
};

/**
 * Dois cadastros são o MESMO empreendimento anunciado duas vezes?
 *
 * O catálogo real tem TRÊS "Lançamento ao Lado do Parque", mesma
 * construtora, mesmo bairro — o mesmo Dom Parque cadastrado três vezes. Sem
 * esta checagem o termo seria ambíguo, e quem pede "Dom Parque" ficaria sem
 * foco por um problema de cadastro, não dele.
 *
 * O critério é conservador: só funde o que coincide em nome, construtora e
 * bairro. Dois imóveis DIFERENTES que compartilhem um apelido continuam
 * ambíguos, e ambiguidade continua significando "não escolho".
 */
function mesmoEmpreendimento(a: Empreendimento, b: Empreendimento): boolean {
  return (
    normalizar(a.nome) === normalizar(b.nome) &&
    normalizar(a.construtora ?? "") === normalizar(b.construtora ?? "") &&
    normalizar(a.bairro ?? "") === normalizar(b.bairro ?? "")
  );
}

/** Entre cadastros gêmeos, o mais completo — é o que tem mais o que dizer. */
function representante(imoveis: Empreendimento[]): Empreendimento {
  return [...imoveis].sort((a, b) => {
    const peso = (e: Empreendimento) =>
      (e.midias?.length ?? 0) + (e.tipologias?.length ?? 0) * 2 + (e.descricao?.length ?? 0) / 1000;
    return peso(b) - peso(a);
  })[0];
}

/**
 * Nome inteiro, apelidos do cadastro e tokens que identificam UM imóvel.
 *
 * O catálogo real está cheio de nome genérico e de título de anúncio
 * ("Melhor valor de metro da Região"). Esses não viram foco por si: um
 * termo que aponta para dois imóveis DIFERENTES não decide nada, e forçar
 * um desempate acertaria metade das vezes.
 *
 * O token existe porque ninguém digita o nome de cadastro: quem viu o
 * "Eternity Alphaville Tamboré" escreve "o Eternity".
 */
function construirIndice(catalogo: Empreendimento[]): Indice {
  const termos = new Map<string, string | null>();
  const porSlug = new Map(catalogo.map((e) => [e.slug, e]));

  const registrar = (termo: string, slug: string) => {
    if (termo.length < 4) return;
    if (!termos.has(termo)) {
      termos.set(termo, slug);
      return;
    }

    const atual = termos.get(termo);
    if (!atual || atual === slug) return;

    // Colisão: gêmeos de cadastro se fundem; imóveis diferentes viram null.
    const a = porSlug.get(atual);
    const b = porSlug.get(slug);
    if (a && b && mesmoEmpreendimento(a, b)) {
      termos.set(termo, representante([a, b]).slug);
    } else {
      termos.set(termo, null);
    }
  };

  for (const imovel of catalogo) {
    const rotulos = [imovel.nome, ...(imovel.nomesAlternativos ?? [])].filter(Boolean);
    for (const rotulo of rotulos) {
      const inteiro = normalizar(rotulo);
      registrar(inteiro, imovel.slug);
      // Nome sem espaço: "terraalta" é como muita gente digita no celular.
      registrar(inteiro.replace(/[^a-z0-9]/g, ""), imovel.slug);
      for (const palavra of inteiro.split(/[^a-z0-9]+/)) {
        if (!palavra || GENERICAS.has(palavra) || COMUNS.has(palavra) || /^\d+$/.test(palavra)) {
          continue;
        }
        /*
         * A checagem acima é por IGUALDADE — e o cadastro real tem typo.
         * "More Aldeia de BAREURI" escapava da lista (que tem "barueri"),
         * virava token distintivo, e o fuzzy de 1 erro fazia QUALQUER
         * cliente que dissesse "Barueri" — a cidade de metade do catálogo —
         * travar o foco nesse imóvel. Medido em 25/08: o catálogo do prompt
         * encolhia para um 2 dorm e a Sofia negava os 3 dorm que existem.
         * Um token à distância de edição de uma palavra genérica é a
         * palavra genérica escrita errado, e não identifica nada sozinho.
         */
        const pareceGenerica = [...GENERICAS, ...COMUNS].some(
          (g) => distancia(palavra, g, tolerancia(palavra)) <= tolerancia(palavra),
        );
        if (pareceGenerica) continue;
        registrar(palavra, imovel.slug);
      }
    }
  }

  const porTamanho = new Map<number, string[]>();
  for (const [termo, slug] of termos) {
    if (!slug) continue;
    const lista = porTamanho.get(termo.length) ?? [];
    lista.push(termo);
    porTamanho.set(termo.length, lista);
  }

  return { termos, porTamanho };
}

/** Frase a frase, para que a recusa só anule o nome que está junto dela. */
function frases(texto: string): string[] {
  return normalizar(texto)
    .split(/[.!?;\n]+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Preposições e artigos: nunca ABREM um nome de empreendimento.
 *
 * Sem esta guarda, "moro perto do parque" casava com o apelido "Dom
 * Parque" — "do parque" está a uma letra de "dom parque", e uma letra é o
 * que a tolerância permite nesse tamanho. O n-grama que começa por
 * preposição é sempre um pedaço de frase, nunca um nome.
 */
const ABRE_FRASE = new Set([
  "a", "as", "ao", "aos", "com", "da", "das", "de", "do", "dos", "e", "em", "meu", "minha",
  "na", "nas", "no", "nos", "o", "os", "para", "pra", "pro", "por", "que", "seu", "sua", "um", "uma",
]);

/**
 * Os pedaços da frase que podem ser um nome: a frase inteira, cada palavra,
 * e as duplas e trios vizinhos — separados e colados. É o que permite
 * reconhecer o nome mesmo quando o cliente escreve tudo junto, separa com
 * hífen ou digita o nome completo do cadastro.
 */
function candidatos(frase: string): string[] {
  const palavras = frase.split(/[^a-z0-9]+/).filter(Boolean);
  const saida: string[] = [palavras.join(" ")];

  for (let i = 0; i < palavras.length; i++) {
    if (ABRE_FRASE.has(palavras[i])) continue;
    saida.push(palavras[i]);
    if (i + 1 < palavras.length) {
      saida.push(`${palavras[i]} ${palavras[i + 1]}`);
      saida.push(`${palavras[i]}${palavras[i + 1]}`);
    }
    if (i + 2 < palavras.length) {
      saida.push(`${palavras[i]} ${palavras[i + 1]} ${palavras[i + 2]}`);
      saida.push(`${palavras[i]}${palavras[i + 1]}${palavras[i + 2]}`);
    }
  }

  return saida;
}

/**
 * O termo do catálogo mais parecido com este pedaço de frase.
 *
 * Duas guardas contra o falso positivo, que é o erro caro:
 * - a primeira letra tem de bater. Quem erra digitação erra no meio da
 *   palavra, não na inicial — e exigir isso derruba quase toda colisão
 *   entre nomes parecidos;
 * - empate entre imóveis DIFERENTES é descartado. Se dois termos estão à
 *   mesma distância do que a pessoa escreveu, não dá para saber qual ela
 *   quis, e chutar faz a IA falar do imóvel errado.
 */
function melhorTermo(candidato: string, indice: Indice): string | null {
  const exato = indice.termos.get(candidato);
  if (exato !== undefined) return exato ? candidato : null;

  // Palavra comum do português não entra no fuzzy: "vista" a um erro de um
  // nome curto do catálogo seria a IA travando foco porque o cliente disse
  // "vista boa". O casamento exato acima já cobriu o caso legítimo.
  if (GENERICAS.has(candidato) || COMUNS.has(candidato)) return null;

  const limite = tolerancia(candidato);
  if (limite === 0) return null;

  let melhor: { termo: string; slug: string; distancia: number } | null = null;
  let empatadoComOutro = false;

  for (let tamanho = candidato.length - limite; tamanho <= candidato.length + limite; tamanho++) {
    for (const termo of indice.porTamanho.get(tamanho) ?? []) {
      if (termo[0] !== candidato[0]) continue;
      // Nome curto: a ÚLTIMA letra também tem de bater. O erro de digitação
      // mora no meio da palavra; a ponta diferente é palavra diferente
      // ("alta"/"alto").
      if (
        (candidato.length <= TAMANHO_CURTO || termo.length <= TAMANHO_CURTO) &&
        termo[termo.length - 1] !== candidato[candidato.length - 1]
      ) {
        continue;
      }
      // Termo curto demais não tolera erro: casar "elos" com "eles" seria
      // pior que não casar nada.
      if (tolerancia(termo) === 0) continue;

      const d = distancia(candidato, termo, limite);
      if (d > limite) continue;

      const slug = indice.termos.get(termo);
      if (!slug) continue;

      if (!melhor || d < melhor.distancia) {
        melhor = { termo, slug, distancia: d };
        empatadoComOutro = false;
      } else if (d === melhor.distancia && slug !== melhor.slug) {
        empatadoComOutro = true;
      }
    }
  }

  return melhor && !empatadoComOutro ? melhor.termo : null;
}

function citadosNoTexto(
  texto: string,
  indice: Indice,
  opcoes: { ignorarRecusa?: boolean } = {},
): string[] {
  const achados: string[] = [];

  for (const frase of frases(texto)) {
    if (!opcoes.ignorarRecusa && RECUSA.test(frase)) continue;
    for (const candidato of candidatos(frase)) {
      const termo = melhorTermo(candidato, indice);
      if (!termo) continue;
      const slug = indice.termos.get(termo);
      if (slug && !achados.includes(slug)) achados.push(slug);
    }
  }

  return achados;
}

/**
 * Todos os imóveis do catálogo citados num texto.
 *
 * Serve para MEDIR o defeito, não para produzi-lo: é com isto que o eval
 * reprova a resposta que, tendo um foco, sai citando outros dois
 * empreendimentos. Aqui a recusa não anula nada — "não gostei do Terra
 * Alta" continua sendo uma citação do Terra Alta, e é a citação que se quer
 * contar.
 */
export function imoveisCitados(texto: string, catalogo: Empreendimento[]): string[] {
  if (!texto?.trim() || catalogo.length === 0) return [];
  return citadosNoTexto(texto, construirIndice(catalogo), { ignorarRecusa: true });
}

export type FocoDaConversa = {
  imovel: Empreendimento;
  /** De onde veio: a mensagem de agora ou uma fala anterior do cliente. */
  origem: "mensagem" | "historico";
};

export function detectarFoco(params: {
  catalogo: Empreendimento[];
  mensagemAtual: string;
  historico?: { remetente: string; texto: string }[];
}): FocoDaConversa | null {
  const { catalogo, mensagemAtual } = params;
  if (catalogo.length === 0) return null;

  const indice = construirIndice(catalogo);
  const acharImovel = (slug: string) => catalogo.find((e) => e.slug === slug) ?? null;
  const primeiroCitado = (texto: string) => citadosNoTexto(texto, indice)[0] ?? null;

  const daMensagem = primeiroCitado(mensagemAtual ?? "");
  if (daMensagem) {
    const imovel = acharImovel(daMensagem);
    if (imovel) return { imovel, origem: "mensagem" };
  }

  // Do mais recente para o mais antigo: o assunto de agora manda.
  const falasCliente = (params.historico ?? []).filter((m) => m.remetente === "cliente");
  for (let i = falasCliente.length - 1; i >= 0; i--) {
    const slug = primeiroCitado(falasCliente[i].texto);
    if (!slug) continue;
    const imovel = acharImovel(slug);
    if (imovel) return { imovel, origem: "historico" };
  }

  return null;
}

/**
 * Quantas alternativas ficam à vista quando a conversa já tem um foco.
 *
 * Zero seria a leitura literal de "foco total", e é errado: a regra 22 do
 * prompt manda oferecer outra coisa quando o imóvel não atende à restrição
 * que o cliente acabou de dar — sem nenhuma reserva no prompt, a IA
 * responderia "não temos", ou inventaria. Duas bastam para uma alternativa
 * honesta e são poucas demais para virar vitrine.
 */
export const RESERVAS_COM_FOCO = 2;

/**
 * O catálogo que vai para o prompt, já com o foco na frente.
 *
 * Com foco: o imóvel escolhido e no máximo duas reservas. Sem foco: o
 * ranking inteiro, como sempre — no começo da conversa a IA PRECISA ter
 * opções, é ali que ela apresenta a região.
 *
 * As reservas nunca incluem um cadastro GÊMEO do foco: oferecer "outra
 * opção" que é o mesmo empreendimento, com nome igual e slug diferente, é
 * pior que não oferecer nada.
 */
export function catalogoComFoco(
  catalogoRanqueado: Empreendimento[],
  foco: FocoDaConversa | null,
): Empreendimento[] {
  if (!foco) return catalogoRanqueado;

  const reservas = catalogoRanqueado
    .filter((e) => e.slug !== foco.imovel.slug && !mesmoEmpreendimento(e, foco.imovel))
    .slice(0, RESERVAS_COM_FOCO);

  return [foco.imovel, ...reservas];
}

/**
 * O par (catálogo do prompt, foco) que o agente precisa — um lugar só.
 *
 * Os caminhos que falam com a IA (webhook, follow-up, playground do painel
 * e o eval) chamavam `ranquearCatalogo` cada um por sua conta. Playground
 * que diverge do webhook transforma o teste do corretor em mentira — já
 * aconteceu neste sistema —, então o foco entra aqui, onde todos passam.
 *
 * A detecção roda sobre o catálogo COMPLETO, não sobre o ranqueado: o
 * ranking corta por orçamento e por urgência, e o imóvel que o cliente
 * escolheu não pode sumir do prompt por isso. Se ele estiver acima da faixa,
 * quem diz isso é a regra 13 ("esse fica acima do que você falou") — calar
 * sobre o imóvel que ele acabou de citar é pior.
 */
export function catalogoParaAtendimento(params: {
  catalogo: Empreendimento[];
  mensagemAtual: string;
  historico?: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
  dossie?: DossieClienteIA | null;
}): { catalogo: Empreendimento[]; foco: { slug: string; nome: string } | null } {
  const foco = detectarFoco({
    catalogo: params.catalogo,
    mensagemAtual: params.mensagemAtual,
    historico: params.historico,
  });

  const ranqueado = ranquearCatalogo({
    catalogo: params.catalogo,
    mensagemAtual: params.mensagemAtual,
    historico: params.historico,
    dossie: params.dossie,
  });

  return {
    catalogo: catalogoComFoco(ranqueado, foco),
    foco: foco ? { slug: foco.imovel.slug, nome: foco.imovel.nome } : null,
  };
}
