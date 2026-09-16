import { deflateRawSync } from "node:zlib";

/**
 * Monta um ZIP de verdade, byte a byte.
 *
 * Sem isto o teste dependeria de uma dependência de compactação que o
 * projeto não tem — e o que se quer exercitar é justamente a leitura do
 * diretório central, que é onde este leitor pode errar.
 */
export function montarZip(
  entradas: { nome: string; conteudo: Buffer | string; comprimir?: boolean; extraLocal?: number }[],
): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nome = Buffer.from(entrada.nome, "utf8");
    const original = Buffer.isBuffer(entrada.conteudo)
      ? entrada.conteudo
      : Buffer.from(entrada.conteudo, "utf8");
    const comprimir = entrada.comprimir ?? true;
    const dados = comprimir ? deflateRawSync(original) : original;
    const extra = Buffer.alloc(entrada.extraLocal ?? 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // nome em UTF-8
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(original.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(extra.length, 28);

    locais.push(local, nome, extra, dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(comprimir ? 8 : 0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(original.length, 24);
    central.writeUInt16LE(nome.length, 28);
    // O extra do diretório central de propósito NÃO acompanha o local: é
    // assim no mundo real, e é o erro que este leitor precisa não cometer.
    central.writeUInt16LE(0, 30);
    central.writeUInt32LE(deslocamento, 42);

    centrais.push(central, nome);
    deslocamento += 30 + nome.length + extra.length + dados.length;
  }

  const corpo = Buffer.concat(locais);
  const diretorio = Buffer.concat(centrais);

  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(corpo.length, 16);

  return Buffer.concat([corpo, diretorio, fim]);
}
