import { inflateRawSync } from "node:zlib";

/**
 * Leitor de ZIP caseiro, do tamanho exato do que este projeto precisa.
 *
 * Existe pelo mesmo motivo de `pdfTexto.ts`: o único formato compactado que
 * chega aqui é o "Exportar conversa" do WhatsApp, que é um ZIP comum com um
 * `.txt` dentro (mais as mídias, quando o corretor não escolhe "Sem mídia").
 * Trazer uma dependência de terceiro para ler um diretório central e chamar
 * `inflateRaw` — que o Node já traz — custaria mais em superfície do que
 * resolve.
 *
 * O que ele NÃO faz, de propósito:
 *
 *   - ZIP64 (arquivo acima de 4 GB ou com mais de 65.535 entradas): o limite
 *     de upload do painel é 10 MB, então isso nunca chega aqui — e responder
 *     "não sei ler" é melhor do que ler pela metade;
 *   - arquivo protegido por senha;
 *   - métodos de compressão fora de `store` (0) e `deflate` (8), que é o que
 *     todo ZIP do mundo real usa.
 *
 * Nos três casos devolve o MOTIVO, nunca lança: quem chama transforma isso
 * numa frase para o corretor, e "não foi possível ler o arquivo" sem dizer
 * por quê é o tipo de erro que manda alguém tentar de novo à toa.
 */

export type ArquivoDoZip = {
  /** Caminho dentro do ZIP, como gravado no diretório central. */
  nome: string;
  conteudo: Buffer;
};

export type MotivoZipIlegivel =
  | "nao_e_zip"
  | "vazio"
  | "protegido_por_senha"
  | "zip64"
  | "compressao_desconhecida"
  | "corrompido";

export type LeituraDeZip =
  | { ok: true; arquivos: ArquivoDoZip[] }
  | { ok: false; motivo: MotivoZipIlegivel };

const ASSINATURA_FIM_DO_DIRETORIO = 0x06054b50;
const ASSINATURA_ENTRADA_CENTRAL = 0x02014b50;
const ASSINATURA_CABECALHO_LOCAL = 0x04034b50;

/** Comentário final do ZIP cabe em 65.535 bytes; o registro em si tem 22. */
const MAIOR_RABEIRA = 65_535 + 22;

/** Quatro bytes 0xFF são o sinal de "este número está no bloco ZIP64". */
const MARCA_ZIP64_32 = 0xffffffff;
const MARCA_ZIP64_16 = 0xffff;

function acharFimDoDiretorio(zip: Buffer): number {
  const minimo = Math.max(0, zip.length - MAIOR_RABEIRA);
  // De trás para frente: o comentário pode conter a própria assinatura, e a
  // ocorrência VÁLIDA é a última.
  for (let i = zip.length - 22; i >= minimo; i -= 1) {
    if (zip.readUInt32LE(i) === ASSINATURA_FIM_DO_DIRETORIO) return i;
  }
  return -1;
}

/**
 * O nome do arquivo vem em UTF-8 quando o bit 11 das flags está ligado, e em
 * CP437 quando não. O WhatsApp sempre liga o bit; `latin1` cobre o resto bem
 * o bastante para um nome de arquivo — e nome ilegível não impede a leitura
 * do conteúdo, que é o que importa aqui.
 */
function decodificarNome(bytes: Buffer, flags: number): string {
  return bytes.toString(flags & 0x800 ? "utf8" : "latin1");
}

export function lerZip(
  zip: Buffer,
  opcoes?: {
    /** Filtro por nome — o que ele recusar nem é descomprimido. */
    aceitar?: (nome: string) => boolean;
    /** Teto de bytes DESCOMPRIMIDOS, somando os aceitos. Protege de zip bomb. */
    limiteDescomprimido?: number;
  },
): LeituraDeZip {
  if (zip.length < 22) return { ok: false, motivo: "nao_e_zip" };

  const fim = acharFimDoDiretorio(zip);
  if (fim === -1) return { ok: false, motivo: "nao_e_zip" };

  const totalDeEntradas = zip.readUInt16LE(fim + 10);
  const inicioDoDiretorio = zip.readUInt32LE(fim + 16);

  if (totalDeEntradas === MARCA_ZIP64_16 || inicioDoDiretorio === MARCA_ZIP64_32) {
    return { ok: false, motivo: "zip64" };
  }
  if (totalDeEntradas === 0) return { ok: false, motivo: "vazio" };
  if (inicioDoDiretorio >= zip.length) return { ok: false, motivo: "corrompido" };

  const limite = opcoes?.limiteDescomprimido ?? Number.POSITIVE_INFINITY;
  const arquivos: ArquivoDoZip[] = [];
  let bytesLidos = 0;
  let ponteiro = inicioDoDiretorio;

  for (let entrada = 0; entrada < totalDeEntradas; entrada += 1) {
    if (ponteiro + 46 > zip.length) return { ok: false, motivo: "corrompido" };
    if (zip.readUInt32LE(ponteiro) !== ASSINATURA_ENTRADA_CENTRAL) {
      return { ok: false, motivo: "corrompido" };
    }

    const flags = zip.readUInt16LE(ponteiro + 8);
    const metodo = zip.readUInt16LE(ponteiro + 10);
    const tamanhoComprimido = zip.readUInt32LE(ponteiro + 20);
    const tamanhoOriginal = zip.readUInt32LE(ponteiro + 24);
    const tamanhoDoNome = zip.readUInt16LE(ponteiro + 28);
    const tamanhoDoExtra = zip.readUInt16LE(ponteiro + 30);
    const tamanhoDoComentario = zip.readUInt16LE(ponteiro + 32);
    const inicioLocal = zip.readUInt32LE(ponteiro + 42);

    const nome = decodificarNome(
      zip.subarray(ponteiro + 46, ponteiro + 46 + tamanhoDoNome),
      flags,
    );

    ponteiro += 46 + tamanhoDoNome + tamanhoDoExtra + tamanhoDoComentario;

    // Pasta: entrada de tamanho zero terminada em barra. Não é erro, é nada.
    if (nome.endsWith("/")) continue;
    if (opcoes?.aceitar && !opcoes.aceitar(nome)) continue;

    if (flags & 0x1) return { ok: false, motivo: "protegido_por_senha" };
    if (metodo !== 0 && metodo !== 8) return { ok: false, motivo: "compressao_desconhecida" };
    if (tamanhoComprimido === MARCA_ZIP64_32 || tamanhoOriginal === MARCA_ZIP64_32) {
      return { ok: false, motivo: "zip64" };
    }

    bytesLidos += tamanhoOriginal;
    if (bytesLidos > limite) return { ok: false, motivo: "corrompido" };

    /*
     * O tamanho do campo "extra" do cabeçalho LOCAL é, com frequência,
     * diferente do que o diretório central declara — é onde alinhamento e
     * carimbo de hora de alguns compactadores moram. Calcular o início dos
     * dados com o número do diretório central entrega bytes deslocados, e o
     * `inflate` falha com uma mensagem que não diz nada sobre a causa.
     */
    if (inicioLocal + 30 > zip.length) return { ok: false, motivo: "corrompido" };
    if (zip.readUInt32LE(inicioLocal) !== ASSINATURA_CABECALHO_LOCAL) {
      return { ok: false, motivo: "corrompido" };
    }
    const nomeLocal = zip.readUInt16LE(inicioLocal + 26);
    const extraLocal = zip.readUInt16LE(inicioLocal + 28);
    const inicioDosDados = inicioLocal + 30 + nomeLocal + extraLocal;
    const fimDosDados = inicioDosDados + tamanhoComprimido;
    if (fimDosDados > zip.length) return { ok: false, motivo: "corrompido" };

    const bruto = zip.subarray(inicioDosDados, fimDosDados);

    try {
      arquivos.push({ nome, conteudo: metodo === 0 ? Buffer.from(bruto) : inflateRawSync(bruto) });
    } catch {
      return { ok: false, motivo: "corrompido" };
    }
  }

  return { ok: true, arquivos };
}
