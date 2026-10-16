/**
 * ZIP montado no NAVEGADOR (item 6 da documentação, 16/10/2026).
 *
 * Por que não no servidor: a resposta de uma função da Vercel tem teto de
 * 4,5 MB, e sete fotos de documento passam disso fácil. O servidor só assina
 * os links (privados, 30 min); o navegador baixa cada arquivo do Storage e
 * junta aqui.
 *
 * Método `store` (0), sem compressão: JPEG e PDF já vêm comprimidos, e
 * comprimir de novo gasta CPU do celular para ganhar quase nada. Sem ZIP64:
 * os documentos de um lead não chegam perto de 4 GB. Sem Buffer, sem zlib:
 * só `Uint8Array`, que existe nos dois lados (o teste roda no Node).
 */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function montarZipSemCompressao(arquivos: { nome: string; conteudo: Uint8Array }[]): Uint8Array {
  const codificador = new TextEncoder();
  const partes: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome);
    const crc = crc32(arquivo.conteudo);
    const tamanho = arquivo.conteudo.length;

    const local = new Uint8Array(30);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // nome em UTF-8
    l.setUint16(8, 0, true); // store
    l.setUint16(10, 0, true);
    l.setUint16(12, 0x21, true); // 01/01/1980
    l.setUint32(14, crc, true);
    l.setUint32(18, tamanho, true);
    l.setUint32(22, tamanho, true);
    l.setUint16(26, nome.length, true);
    l.setUint16(28, 0, true);
    partes.push(local, nome, arquivo.conteudo);

    const central = new Uint8Array(46);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, 0, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, tamanho, true);
    c.setUint32(24, tamanho, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    centrais.push(central, nome);

    deslocamento += local.length + nome.length + tamanho;
  }

  const tamanhoDoDiretorio = centrais.reduce((s, p) => s + p.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoDoDiretorio, true);
  f.setUint32(16, deslocamento, true);

  const todas = [...partes, ...centrais, fim];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}
