/**
 * A regra "um número, um grupo" (0198) está LIGADA nos três caminhos que
 * conectam um número: o pareamento pelo painel, a sincronização ativa e o
 * evento de conexão do webhook.
 *
 * O gatilho do banco recusa de qualquer jeito; a guarda aqui é sobre o
 * caminho que o corretor vê. Sem a pergunta antes, o gatilho recusa a
 * gravação e o webhook segue com a instância conectada na Evolution, mas
 * "conectando" no banco — o número de outra conta recebendo mensagem aqui.
 *
 * Lê código-fonte, sem comentários, como `quedaDoNumeroLigada.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

const ler = (caminho: string) => semComentarios(readFileSync(join(process.cwd(), caminho), "utf8"));

function corpoDe(fonte: string, assinatura: string): string {
  const inicio = fonte.indexOf(assinatura);
  expect(inicio, assinatura).toBeGreaterThan(-1);
  const fim = fonte.slice(inicio + assinatura.length).search(/\n(export )?(async )?function /);
  return fim === -1 ? fonte.slice(inicio) : fonte.slice(inicio, inicio + assinatura.length + fim);
}

const repositorio = ler("src/lib/whatsapp/repositorio.ts");

describe.each([
  ["a sincronização ativa", "export async function sincronizarConexaoInstancia("],
  ["o evento de conexão do webhook", "export async function registrarEventoConexao("],
])("%s", (_nome, assinatura) => {
  const corpo = corpoDe(repositorio, assinatura);

  it("pergunta se o número é de outro grupo ANTES de marcar conectado", () => {
    const pergunta = corpo.indexOf("numeroEmOutroGrupo(");
    const conecta = corpo.search(/status_conexao:\s*(conectado \? )?"conectado"/);
    expect(pergunta, "chama numeroEmOutroGrupo").toBeGreaterThan(-1);
    expect(conecta).toBeGreaterThan(pergunta);
  });

  it("recusa derrubando a conexão, também quando quem recusa é o gatilho", () => {
    expect(corpo.match(/recusarNumeroDeOutroGrupo\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(corpo).toContain("ehRecusaDeNumero(");
  });
});

describe("a recusa", () => {
  const corpo = corpoDe(repositorio, "export async function recusarNumeroDeOutroGrupo(");

  it("derruba a sessão na Evolution e solta o número desta instância", () => {
    expect(corpo).toContain("desconectarInstancia(");
    expect(corpo).toMatch(/status_conexao:\s*"desconectado"/);
    expect(corpo).toMatch(/telefone_conectado:\s*null/);
    // Sem `conectado_em` o logout não vira "queda" (registrarEventoConexao
    // para cedo em número que não conectou).
    expect(corpo).toMatch(/conectado_em:\s*null/);
  });

  it("deixa a marca para a tela explicar", () => {
    expect(corpo).toMatch(/numero_recusado_em:\s*new Date\(\)\.toISOString\(\)/);
  });
});

describe("o pareamento pelo painel", () => {
  const corpo = corpoDe(
    ler("src/app/corretor/(painel)/whatsapp/acoes.ts"),
    "export async function conectarWhatsapp(",
  );

  it("pergunta antes de pedir o código ao provedor e recusa com a frase", () => {
    const pergunta = corpo.indexOf("numeroEmOutroGrupo(");
    const provedor = corpo.indexOf("obterQrCodeInstancia(");
    expect(pergunta).toBeGreaterThan(-1);
    expect(provedor).toBeGreaterThan(pergunta);
    expect(corpo).toContain("FRASE_NUMERO_EM_OUTRO_GRUPO");
  });
});
