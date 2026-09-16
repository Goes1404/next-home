/**
 * Tipos e constantes do gerador de imagem — em módulo PURO, sem `server-only`.
 *
 * A tela é `"use client"` e precisa do teto diário e dos tamanhos. Tipo é
 * apagado na compilação e viaja de graça, mas CONSTANTE é valor: importá-la de
 * `gerarImagem.ts` arrastaria o módulo de servidor inteiro para o grafo do
 * cliente e o build reprovaria. É a mesma pedra de `limitesPdf.ts` e
 * `pessoasTipos.ts` — constante que os dois lados usam mora sozinha.
 */

/**
 * Quantas imagens um corretor pode gerar por dia.
 *
 * Geração é a única coisa do painel que custa dinheiro POR CLIQUE, e um laço
 * de tentativas ("agora sem o sofá", "agora mais claro") vira fatura sem que
 * ninguém perceba. O projeto já tem esse vocabulário: cota de campanha, teto
 * de fila, teto do quadro. Um número baixo o bastante para doer no bolso só
 * se alguém estiver claramente exagerando.
 */
export const TETO_DIARIO = 20;

/** Formatos que fazem sentido no ramo, com o nome de quem usa. */
export const TAMANHOS = [
  { chave: "quadrado", rotulo: "Quadrado — post", largura: 1024, altura: 1024 },
  { chave: "retrato", rotulo: "Retrato — story", largura: 1024, altura: 1536 },
  { chave: "paisagem", rotulo: "Paisagem — capa", largura: 1536, altura: 1024 },
] as const;

export type ChaveTamanho = (typeof TAMANHOS)[number]["chave"];

/**
 * `low` é o padrão de propósito: é a diferença entre alguns centavos e alguns
 * décimos de dólar por imagem, e o corretor está iterando — a maioria das
 * gerações é descartada no caminho até a que presta.
 *
 * NÃO EXISTE "caprichada" (`high`), e isso foi MEDIDO em 03/09/2026, não
 * suposto. Contra o mesmo pedido, em retrato 1024x1536:
 *
 *   | qualidade | latência | arquivo | tokens de saída |
 *   |-----------|----------|---------|-----------------|
 *   | low       |   14,5 s |  1,2 MB |             196 |
 *   | medium    |   37,4 s |  2,5 MB |           1.372 |
 *   | high      |   95,0 s |  2,4 MB |           5.488 |
 *
 * O teto de função do plano Hobby é de 60 SEGUNDOS e não se estica. `high`
 * passa dele com folga — o botão falharia SEMPRE, e botão que sempre falha é
 * pior que botão que não existe (a régua desta casa). Caberia como trabalho
 * assíncrono (linha nascendo `pendente`, worker, tela buscando depois), e não
 * se constrói isso antes de alguém pedir: `medium` já entrega arte publicável.
 *
 * Repare também que `high` gasta 4x os tokens de `medium` para produzir um
 * arquivo MENOR — mais detalhe fino comprime melhor. Tamanho de arquivo não
 * mede custo aqui; token de saída mede.
 */
export const QUALIDADES = [
  { chave: "low", rotulo: "Rápida" },
  { chave: "medium", rotulo: "Boa" },
] as const;

export type ChaveQualidade = (typeof QUALIDADES)[number]["chave"];

/** O que a galeria guarda de uma peça de marketing — o suficiente para a
 * tela dizer o que é e para o corretor repetir a receita. */
export type BriefingGravado = {
  objetivo: string;
  canal: string;
  publico: string;
  imovelSlug: string | null;
  imovelNome: string | null;
  titulo: string;
  apoio: string;
  cta: string;
};

export type ImagemGerada = {
  id: string;
  prompt: string;
  /** A imagem CRUA do modelo, sem texto. */
  url: string;
  /** A arte composta (marca + copy). Nula na imagem livre. */
  arteUrl: string | null;
  briefing: BriefingGravado | null;
  largura: number | null;
  altura: number | null;
  referenciaUrl: string | null;
  /**
   * O imóvel a que a arte pertence (0101), ou nulo quando é avulsa.
   *
   * NÃO é mídia do catálogo: não entra na vitrine e a assistente não pode
   * enviá-la. O vínculo existe para o editor e o cartão do catálogo saberem
   * de que imóvel é cada peça — antes disso a única pista era um slug solto
   * dentro do `briefing`, que some quando o imóvel é renomeado.
   */
  empreendimentoId: string | null;
  criadaEm: string;
  /**
   * Quando esta arte some (0109): 48h depois de criada, e o cron diario a
   * remove entre 48 e 72h.
   *
   * Viaja ate a TELA de proposito. O prazo existia so no banco, entao a peca
   * desaparecia sem aviso nenhum — e "baixar antes que suma" e exatamente o
   * que o corretor precisa fazer. Prazo que so o servidor conhece nao muda o
   * comportamento de ninguem.
   *
   * Nulo em linha antiga, anterior a coluna existir.
   */
  expiraEm: string | null;
};

/** O que a tela precisa saber para decidir se deixa gerar. */
export type EstadoDoTeto = { usadasHoje: number; teto: number };

/**
 * O instante em que o dia começou em São Paulo, em ISO — a fronteira do teto
 * diário.
 *
 * O dia NUNCA sai de `getDate()` nem de `toISOString()`. Em produção o
 * servidor roda em UTC, e das 21h à meia-noite de Brasília lá já é o dia
 * seguinte: a contagem viraria três horas cedo, devolvendo o teto zerado para
 * quem acabou de gerar vinte imagens. É a mesma armadilha que quebrou
 * `calendarioProximosDias` (três horas por noite, ensinando ao modelo a data
 * errada) e que `agendaDeVisitas.ts` já evita do mesmo jeito.
 *
 * `-03:00` fixo: o Brasil não tem horário de verão desde 2019.
 *
 * Mora aqui, e não em `galeria.ts`, porque função pura enterrada em módulo
 * `server-only` não tem teste — e esta é justamente a que precisa de um.
 */
export function inicioDoDiaEmSaoPaulo(agora: Date = new Date()): string {
  const emSp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return `${emSp}T00:00:00-03:00`;
}

/**
 * O endereco que BAIXA a arte, em vez de abri-la.
 *
 * O atributo `download` do HTML e IGNORADO quando o arquivo vem de outra
 * origem — e a arte mora no dominio do Storage, nunca no nosso. Sem isto o
 * botao "Baixar" navegaria para a imagem e a pessoa continuaria sem arquivo,
 * que e o defeito com outra roupa.
 *
 * Quem resolve e o proprio Storage: `?download=<nome>` faz ele responder com
 * `content-disposition: attachment`. Medido antes de escrever — o cabecalho
 * volta com o nome que mandamos. Servidor decidindo vale em todo navegador e
 * no celular, sem uma linha de JavaScript; a alternativa (fetch + blob) faria
 * o telefone segurar 2 MB na memoria para chegar ao mesmo lugar.
 *
 * `URL` cuida de escapar o nome e de preservar query que ja exista.
 */
export function linkDeDownload(url: string, nomeDoArquivo: string): string {
  try {
    const endereco = new URL(url);
    endereco.searchParams.set("download", nomeDoArquivo);
    return endereco.toString();
  } catch {
    // URL torta nao vira erro na tela: o botao ainda abre a imagem, e abrir e
    // melhor que um card que nao faz nada.
    return url;
  }
}

/**
 * Um nome de arquivo que a pessoa reconhece depois, na pasta de downloads.
 *
 * `a6b20eaac07f1c3c.png` — o nome que o Storage usa — nao diz nada a ninguem
 * uma semana depois. Sai do pedido que ela escreveu, cortado, com a data na
 * frente para ordenar sozinho.
 */
export function nomeDaArte(prompt: string, criadaEm: string, extensao = "png"): string {
  const dia = criadaEm.slice(0, 10);
  const miolo = prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${dia}-${miolo || "arte"}.${extensao}`;
}

/**
 * Quando a arte some, escrito para uma pessoa ler: "18/09 às 23h56".
 *
 * Nao devolve "faltam 8 horas", e a razao e tecnica: este texto e renderizado
 * no servidor E no cliente, e qualquer conta com o relogio dentro do render
 * produz valores diferentes nos dois lados — a divergencia de hidratacao que
 * esta base ja pagou ao ler `localStorage` durante a renderizacao. Data
 * formatada e o MESMO texto nos dois lugares, sempre.
 *
 * Fuso de Sao Paulo cravado, nunca o do servidor: em UTC, as 21h de Brasilia
 * ja e o dia seguinte, e a arte pareceria durar um dia a mais. E a mesma
 * armadilha de `inicioDoDiaEmSaoPaulo`, logo acima.
 */
export function quandoExpira(expiraEm: string | null): string | null {
  if (!expiraEm) return null;
  const fim = new Date(expiraEm);
  if (Number.isNaN(fim.getTime())) return null;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(fim);
  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pega("day")}/${pega("month")} às ${pega("hour")}h${pega("minute")}`;
}
