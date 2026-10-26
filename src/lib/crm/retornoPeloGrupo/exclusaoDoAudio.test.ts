import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LGPD: o áudio do retorno da ligação (bucket `retornos-de-ligacao`) sai junto
 * com o lead e com o grupo. Teste de fonte, no padrão do projeto: o que
 * importa é a ORDEM — os caminhos são lidos antes da exclusão (o `cascade`
 * leva as linhas que apontam para os arquivos) e os arquivos saem depois dela.
 */

const raiz = process.cwd();
const ler = (...partes: string[]) => readFileSync(join(raiz, ...partes), "utf8");
const em = (fonte: string, trecho: string) => {
  const i = fonte.indexOf(trecho);
  expect(i, `faltou "${trecho}"`).toBeGreaterThan(-1);
  return i;
};

describe("exclusão de um lead (ficha)", () => {
  const fonte = ler("src/app/corretor/(painel)/leads/[id]/acoes.ts");
  const corpo = fonte.slice(em(fonte, "export async function excluirLeadDefinitivo"));

  it("lê os caminhos do áudio ANTES de excluir e apaga os arquivos DEPOIS de confirmar", () => {
    const leitura = em(corpo, "caminhosDeAudioDosLeads(");
    const exclusao = em(corpo, '.from("leads").delete()');
    const confirmacao = em(corpo, "!data?.length");
    const limpeza = em(corpo, "apagarAudiosGuardados(");
    expect(leitura).toBeLessThan(exclusao);
    expect(limpeza).toBeGreaterThan(confirmacao);
  });
});

describe("exclusão de leads em lote (lista)", () => {
  const fonte = ler("src/app/corretor/(painel)/leads/acoes.ts");
  const corpo = fonte.slice(em(fonte, "export async function excluirLeadsEmLote"), em(fonte, "O envio em massa que morava aqui"));

  it("lê os caminhos antes e só apaga os arquivos dos leads que o banco de fato excluiu", () => {
    const leitura = em(corpo, "caminhosDeAudioPorLead(");
    const exclusao = em(corpo, ".delete()");
    const limpeza = em(corpo, "apagarAudiosGuardados(");
    expect(leitura).toBeLessThan(exclusao);
    expect(limpeza).toBeGreaterThan(exclusao);
    expect(corpo).toMatch(/excluidos|data\.map|data\?\.map/);
  });
});

describe("pedido do titular", () => {
  const fonte = ler("src/app/corretor/(painel)/leads/[id]/titularAcoes.ts");

  it("lê os caminhos das fichas da pessoa antes do banco apagá-las e apaga os arquivos depois", () => {
    const leitura = em(fonte, "caminhosDeAudioDaPessoa(");
    const rpc = em(fonte, 'rpc("apagar_dados_do_titular"');
    const limpeza = em(fonte, "apagarAudiosGuardados(");
    expect(leitura).toBeLessThan(rpc);
    expect(limpeza).toBeGreaterThan(rpc);
  });
});

describe("rotina dos 90 dias do grupo cancelado", () => {
  const fonte = ler("src/lib/grupos/encerramento.ts");

  it("apaga a pasta do grupo no bucket do retorno junto dos outros arquivos privados, antes das linhas", () => {
    const pasta = em(fonte, "BUCKET_DO_AUDIO");
    const uso = em(fonte, "apagarPasta(servico.storage.from(BUCKET_DO_AUDIO)");
    const rpc = em(fonte, 'servico.rpc("apagar_dados_do_grupo"');
    expect(pasta).toBeLessThan(uso);
    expect(uso).toBeLessThan(rpc);
  });
});
