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

  it("deixa a marca para a tela explicar, e a pendência quando o logout falhou", () => {
    expect(corpo).toMatch(/const agora = new Date\(\)\.toISOString\(\)/);
    expect(corpo).toMatch(/numero_recusado_em:\s*agora/);
    expect(corpo).toMatch(/logout_pendente_em:\s*saida\.ok \? null : agora/);
  });
});

describe("o pareamento pelo painel", () => {
  const corpo = corpoDe(
    ler("src/app/corretor/(painel)/whatsapp/acoes.ts"),
    "export async function conectarWhatsapp(",
  );

  it("'já conectado' não grava conectado direto: a sincronização confere o número antes", () => {
    // O número no ar pode ser o mesmo que foi recusado (logout que falhou).
    expect(corpo).not.toMatch(/status_conexao:\s*resultado\.jaConectado/);
    expect(corpo).not.toMatch(/status_conexao:\s*"conectado"/);
    const jaConectado = corpo.indexOf("if (resultado.jaConectado)");
    expect(jaConectado).toBeGreaterThan(-1);
    expect(corpo.indexOf("sincronizarConexaoInstancia(", jaConectado)).toBeGreaterThan(jaConectado);
  });

  it("pergunta antes de pedir o código ao provedor e recusa com a frase", () => {
    const pergunta = corpo.indexOf("numeroEmOutroGrupo(");
    const provedor = corpo.indexOf("obterQrCodeInstancia(");
    expect(pergunta).toBeGreaterThan(-1);
    expect(provedor).toBeGreaterThan(pergunta);
    expect(corpo).toContain("FRASE_NUMERO_EM_OUTRO_GRUPO");
  });
});

describe("a sessão recusada que não caiu", () => {
  it("o webhook confere o número antes de deixar a mensagem seguir", () => {
    const rota = ler("src/app/api/webhooks/whatsapp/route.ts");
    const portao = rota.indexOf("mensagemDoNumeroPodeSeguir(instancia)");
    expect(portao, "chama mensagemDoNumeroPodeSeguir").toBeGreaterThan(-1);
    // Antes de marcar a sessão viva e antes de qualquer gravação de conversa.
    expect(rota.indexOf("marcarSessaoViva(instancia.id)")).toBeGreaterThan(portao);
    expect(rota.indexOf("obterOuCriarConversa(")).toBeGreaterThan(portao);
    expect(rota.slice(portao, portao + 200)).toMatch(/return NextResponse\.json/);
  });

  it("o cron de disparo tenta derrubar de novo, antes das saídas antecipadas", () => {
    const disparo = ler("src/lib/whatsapp/campaignDispatcher.ts");
    const varredura = disparo.indexOf("await rederrubarNumerosRecusados()");
    expect(varredura).toBeGreaterThan(-1);
    expect(varredura).toBeLessThan(disparo.indexOf("await protegerNumerosQueCairam()"));
  });

  it("a conexão aceita apaga a pendência junto com a marca (senão o cron derrubaria o número certo)", () => {
    const corpo = corpoDe(repositorio, "async function limparRecusaDeNumero(");
    expect(corpo).toMatch(/logout_pendente_em:\s*null/);
    expect(corpo).toMatch(/numero_recusado_em:\s*null/);
  });
});
