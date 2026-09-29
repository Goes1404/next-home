/**
 * Cartão de contato (.vcf) — o formato em que o WhatsApp compartilha um
 * contato ("Enviar contato") e em que o celular exporta a agenda inteira.
 *
 * O arquivo é texto, mas não é tabela: cada contato é um bloco
 * `BEGIN:VCARD … END:VCARD`, com versões 2.1, 3.0 e 4.0 convivendo. As três
 * diferenças que quebram leitura ingênua estão tratadas aqui:
 *
 *   - linha DOBRADA (3.0/4.0): uma linha longa continua na seguinte, que
 *     começa com espaço;
 *   - QUOTED-PRINTABLE (2.1, o que o Android exporta): nome com acento vem
 *     como `=C3=A1`, e a linha continua na seguinte quando termina em `=`;
 *   - `waid=` no TEL: é o número do WhatsApp, só dígitos com DDI — o dado
 *     mais confiável do cartão, porque o valor visível é formatado à mão.
 */

export type ContatoDoCartao = {
  nome: string;
  telefone: string;
  email: string | null;
  nota: string | null;
};

type Propriedade = { nome: string; parametros: string[]; valor: string };

function desdobrar(texto: string): string[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const saida: string[] = [];

  for (const linha of linhas) {
    const anterior = saida.length - 1;
    if (/^[ \t]/.test(linha) && anterior >= 0) {
      saida[anterior] += linha.slice(1);
      continue;
    }
    // Continuação de quoted-printable: a linha anterior terminou em "=".
    if (anterior >= 0 && /ENCODING=QUOTED-PRINTABLE/i.test(saida[anterior]) && saida[anterior].endsWith("=")) {
      saida[anterior] = saida[anterior].slice(0, -1) + linha;
      continue;
    }
    saida.push(linha);
  }

  return saida;
}

function decodificarQuotedPrintable(valor: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < valor.length; i += 1) {
    if (valor[i] === "=" && /^[0-9A-F]{2}$/i.test(valor.slice(i + 1, i + 3))) {
      bytes.push(parseInt(valor.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(valor.charCodeAt(i) & 0xff);
    }
  }
  const codificacao = /^(iso-8859-1|latin1|windows-1252)$/i.test(charset) ? "latin1" : "utf8";
  return Buffer.from(bytes).toString(codificacao);
}

function tirarEscapes(valor: string): string {
  return valor.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? " " : c));
}

function lerPropriedade(linha: string): Propriedade | null {
  const doisPontos = linha.indexOf(":");
  if (doisPontos <= 0) return null;

  const [cabeca, ...parametros] = linha.slice(0, doisPontos).split(";");
  // `item1.TEL` — o grupo não muda o significado da propriedade.
  const nome = cabeca.replace(/^[^.]*\./, "").toUpperCase();
  let valor = linha.slice(doisPontos + 1);

  const qp = parametros.some((p) => /^ENCODING=QUOTED-PRINTABLE$/i.test(p) || /^QUOTED-PRINTABLE$/i.test(p));
  if (qp) {
    const charset = parametros.find((p) => /^CHARSET=/i.test(p))?.split("=")[1] ?? "utf-8";
    valor = decodificarQuotedPrintable(valor, charset);
  }

  return { nome, parametros, valor: tirarEscapes(valor).trim() };
}

/** Celular primeiro: é ele que tem WhatsApp. Fixo só quando é o único. */
function escolherTelefone(tels: Propriedade[]): string | null {
  const comWaid = tels.find((t) => t.parametros.some((p) => /^waid=\d+$/i.test(p)));
  if (comWaid) {
    const waid = comWaid.parametros.find((p) => /^waid=/i.test(p))!.split("=")[1];
    return `+${waid}`;
  }

  const celular = tels.find((t) =>
    t.parametros.some((p) => /CELL|MOBILE|IPHONE|WHATSAPP/i.test(p)),
  );
  const escolhido = celular ?? tels[0];
  return escolhido ? escolhido.valor.replace(/^tel:/i, "").trim() || null : null;
}

function montarContato(propriedades: Propriedade[]): ContatoDoCartao | null {
  const telefone = escolherTelefone(propriedades.filter((p) => p.nome === "TEL"));
  if (!telefone) return null;

  const fn = propriedades.find((p) => p.nome === "FN")?.valor;
  // N é "Sobrenome;Nome;Meio;Prefixo;Sufixo" — a ordem natural é o contrário.
  const n = propriedades.find((p) => p.nome === "N")?.valor;
  const doN = n
    ? n
        .split(";")
        .slice(0, 3)
        .filter(Boolean)
        .reverse()
        .join(" ")
        .trim()
    : "";

  return {
    nome: (fn || doN).trim(),
    telefone,
    email: propriedades.find((p) => p.nome === "EMAIL")?.valor || null,
    nota: propriedades.find((p) => p.nome === "NOTE")?.valor || null,
  };
}

export function ehArquivoVcard(texto: string): boolean {
  return /^\s*BEGIN:VCARD/im.test(texto.slice(0, 2000));
}

export function parsearVcards(texto: string): ContatoDoCartao[] {
  const contatos: ContatoDoCartao[] = [];
  let atual: Propriedade[] | null = null;

  for (const linha of desdobrar(texto)) {
    const limpa = linha.trim();
    if (/^BEGIN:VCARD$/i.test(limpa)) {
      atual = [];
      continue;
    }
    if (/^END:VCARD$/i.test(limpa)) {
      if (atual) {
        const contato = montarContato(atual);
        if (contato) contatos.push(contato);
      }
      atual = null;
      continue;
    }
    if (atual) {
      const propriedade = lerPropriedade(linha);
      if (propriedade) atual.push(propriedade);
    }
  }

  return contatos;
}
