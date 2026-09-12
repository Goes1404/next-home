/**
 * Leitura do "Exportar conversa" do WhatsApp.
 *
 * O arquivo é um `.txt` de uma linha por mensagem, e o formato muda com o
 * aparelho e com o idioma. Os dois que chegam aqui:
 *
 *   Android:  12/09/2026 14:32 - Fulano: mensagem
 *   iPhone:   [12/09/2026 14:32:11] Fulano: mensagem
 *
 * Módulo PURO, sem banco e sem rede: quem transforma autor em lead é
 * `importacao.ts`, que é onde mora a forma de um lead. Aqui só se responde
 * "quem falou o quê nesta conversa".
 *
 * A decisão que governa o resto do arquivo: **nada é inventado**. Contato
 * salvo na agenda do corretor aparece no export pelo NOME, e o número dele
 * não está em lugar nenhum do arquivo — nem no texto, nem no nome do `.txt`.
 * Adivinhar a partir de algum número digitado no meio da conversa mandaria a
 * ficha de um cliente para o telefone de outro, que é o erro caro desta base.
 * O autor sem número vira candidato SEM telefone, e quem preenche é o
 * corretor na tela de revisão — ele tem o número, está no celular dele.
 */

/** Um participante da conversa, com o que ele falou. */
export type AutorDaConversa = {
  /** Como o WhatsApp o escreve: o nome salvo, ou o telefone com DDI. */
  rotulo: string;
  /** Só as falas dele, em ordem, já sem os marcadores de anexo. */
  mensagens: string[];
};

export type ConversaExportada = {
  /**
   * O nome que o WhatsApp põe no arquivo ("Conversa do WhatsApp com Ana").
   * É ele que identifica o OUTRO lado numa conversa de duas pessoas — e, por
   * tabela, quem é o dono do aparelho.
   */
  tituloDoArquivo: string | null;
  autores: AutorDaConversa[];
  /** O autor que provavelmente é o dono do aparelho, quando dá para saber. */
  donoProvavel: string | null;
  totalDeMensagens: number;
  ehGrupo: boolean;
};

/*
 * O WhatsApp injeta marcas de direção de texto (U+200E/U+200F) no começo de
 * cada linha do export do iPhone e antes de cada aviso de mídia, e usa
 * espaço estreito sem quebra (U+202F) antes de AM/PM. Nenhum deles é visível
 * e todos quebram regex escrita olhando para o texto na tela.
 */
const INVISIVEIS = /[‎‏‪-‮⁦-⁩]/g;

/**
 * Cabeçalho de mensagem nos dois formatos, numa regex só.
 *
 * O que ela NÃO tenta fazer é interpretar a data: dia/mês, mês/dia e ano de
 * dois dígitos convivem por região, e nada aqui depende de quando a mensagem
 * foi enviada. Basta reconhecer que a linha COMEÇA uma mensagem nova.
 */
const CABECALHO =
  /^(?:\[(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?[Mm]\.?)?\]\s*|(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?[Mm]\.?)?\s+-\s+)(.*)$/;

/**
 * Marcadores de anexo, em português e inglês.
 *
 * Uma fala que é só isto não descreve intenção nenhuma — entra como ruído no
 * campo "mensagem" da ficha e empurra para fora a frase que interessa.
 */
const SO_ANEXO =
  /^(?:<(?:mídia|midia|arquivo de mídia|arquivo de midia|media)[^>]*>|.*\((?:arquivo anexado|file attached)\)|(?:imagem|áudio|audio|vídeo|video|figurinha|sticker|documento|gif)\s+(?:ocultad[ao]|omitted)|image omitted|audio omitted|video omitted|sticker omitted|document omitted|this message was deleted|esta mensagem foi apagada|você apagou esta mensagem)\.?$/i;

/**
 * Linha de sistema que se disfarça de mensagem por ter dois-pontos.
 *
 * A separação normal é o primeiro `: ` depois do horário; um aviso como
 * "Fulano mudou o assunto do grupo para "Casa: 3 dorms"" cairia nela. O que
 * distingue é a forma do que vem antes: nome de pessoa e telefone são
 * curtos, sem aspas e sem pontuação de frase.
 */
function pareceAutor(rotulo: string): boolean {
  if (rotulo.length === 0 || rotulo.length > 60) return false;
  if (/["“”]/.test(rotulo)) return false;
  if (/[.!?]$/.test(rotulo)) return false;
  return rotulo.split(/\s+/).length <= 6;
}

function limparTitulo(nomeDoArquivo: string): string | null {
  const semPasta = nomeDoArquivo.split("/").pop() ?? nomeDoArquivo;
  const semExtensao = semPasta.replace(/\.txt$/i, "").trim();
  const casou = semExtensao.match(
    /^(?:Conversa do WhatsApp com|Conversa no WhatsApp com|WhatsApp Chat with|Chat do WhatsApp com|Chat de WhatsApp con)\s+(.+)$/i,
  );
  const titulo = (casou ? casou[1] : "").trim();
  return titulo.length > 0 ? titulo : null;
}

/** Duas linhas com cabeçalho já bastam: nenhum outro formato desta tela tem isso. */
export function ehExportDeConversa(texto: string): boolean {
  const linhas = texto.replace(INVISIVEIS, "").split(/\r?\n/).slice(0, 60);
  let casadas = 0;
  for (const linha of linhas) {
    if (CABECALHO.test(linha)) casadas += 1;
    if (casadas >= 2) return true;
  }
  return false;
}

export function parsearConversaWhatsapp(
  texto: string,
  nomeDoArquivo?: string,
): ConversaExportada {
  const linhas = texto.replace(INVISIVEIS, "").split(/\r?\n/);

  const porRotulo = new Map<string, AutorDaConversa>();
  const ordem: string[] = [];
  let totalDeMensagens = 0;
  let ultimo: { autor: AutorDaConversa; indice: number } | null = null;

  for (const linha of linhas) {
    const casou = linha.match(CABECALHO);

    if (!casou) {
      /*
       * Mensagem de várias linhas: o resto dela não traz horário nenhum e
       * pertence a quem falou por último. Sem isto, um cliente que escreve
       * um parágrafo com quebras perde tudo menos a primeira linha.
       */
      const continuacao = linha.trim();
      if (ultimo && continuacao) {
        const atual = ultimo.autor.mensagens[ultimo.indice];
        ultimo.autor.mensagens[ultimo.indice] = atual ? `${atual} ${continuacao}` : continuacao;
      }
      continue;
    }

    ultimo = null;
    const resto = casou[3] ?? "";
    const corte = resto.indexOf(": ");
    // Sem autor é aviso do sistema (criptografia, entrou no grupo, chamada).
    if (corte === -1) continue;

    const rotulo = resto.slice(0, corte).trim();
    if (!pareceAutor(rotulo)) continue;

    const conteudo = resto.slice(corte + 2).trim();
    totalDeMensagens += 1;

    let autor = porRotulo.get(rotulo);
    if (!autor) {
      autor = { rotulo, mensagens: [] };
      porRotulo.set(rotulo, autor);
      ordem.push(rotulo);
    }

    if (!conteudo || SO_ANEXO.test(conteudo)) continue;

    autor.mensagens.push(conteudo);
    ultimo = { autor, indice: autor.mensagens.length - 1 };
  }

  const autores = ordem.map((rotulo) => porRotulo.get(rotulo)!);
  const tituloDoArquivo = nomeDoArquivo ? limparTitulo(nomeDoArquivo) : null;

  return {
    tituloDoArquivo,
    autores,
    donoProvavel: descobrirDono(autores, tituloDoArquivo),
    totalDeMensagens,
    ehGrupo: autores.length > 2,
  };
}

/**
 * Quem é o dono do aparelho — o corretor, cuja fala não vira lead.
 *
 * Numa conversa de DUAS pessoas o nome do arquivo resolve sozinho: ele traz
 * o outro lado, então o dono é o que sobra. Isso vale mesmo quando o
 * corretor exportou do celular de outra pessoa, e não depende de o cadastro
 * dele no CRM estar com o nome escrito igual ao do WhatsApp.
 *
 * Em GRUPO não há resposta no arquivo, e devolver um palpite (o que mais
 * falou, por exemplo) tiraria do funil justamente o participante mais
 * engajado. Aqui é `null`, e quem completa é `importacao.ts` com o telefone
 * e o nome do corretor da sessão.
 */
function descobrirDono(autores: AutorDaConversa[], titulo: string | null): string | null {
  if (autores.length !== 2 || !titulo) return null;
  const alvo = normalizar(titulo);
  const outroLado = autores.find((a) => normalizar(a.rotulo) === alvo);
  if (!outroLado) return null;
  return autores.find((a) => a !== outroLado)!.rotulo;
}

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
