/**
 * A proteção da queda do número está LIGADA (0174, 10/10/2026)?
 *
 * Cada peça tem teste próprio; esta guarda confere que elas são chamadas de
 * onde precisam. A regressão aqui é calada: o módulo existe, os testes dele
 * passam, e o número volta a cair sem ninguém saber por quê.
 *
 * Lê código-fonte, como as outras guardas desta base. Comentário que cita o
 * padrão não conta: é tirado antes.
 */
import { readdirSync, readFileSync } from "node:fs";
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

/** O corpo de uma função exportada, até a próxima declaração de topo. */
function corpoDe(fonte: string, assinatura: string): string {
  const inicio = fonte.indexOf(assinatura);
  expect(inicio, assinatura).toBeGreaterThan(-1);
  const fim = fonte.slice(inicio + assinatura.length).search(/\n(export )?(async )?function /);
  return fim === -1 ? fonte.slice(inicio) : fonte.slice(inicio, inicio + assinatura.length + fim);
}

describe("a reconexão pelo webhook (o caso do Ramos)", () => {
  const corpo = corpoDe(ler("src/lib/whatsapp/repositorio.ts"), "export async function registrarEventoConexao(");

  it("ao voltar, apaga o marco da queda e a marca do aviso", () => {
    expect(corpo).toMatch(/desconectado_em:\s*null/);
    expect(corpo).toMatch(/aviso_queda_enviado_em:\s*null/);
  });

  it("ao cair, carimba o marco uma vez e guarda o motivo", () => {
    expect(corpo).toMatch(/update\(\{\s*desconectado_em:\s*agora\s*\}\)[\s\S]*?\.is\("desconectado_em",\s*null\)/);
    expect(corpo).toMatch(/codigoDaQueda\(params\.motivo\)/);
    expect(corpo).toMatch(/motivo_queda_codigo:\s*codigo/);
  });

  it("o webhook passa o statusReason do evento", () => {
    const webhook = ler("src/app/api/webhooks/whatsapp/route.ts");
    expect(webhook).toMatch(/registrarEventoConexao\(\{[\s\S]*?motivo:\s*payload\.data\?\.statusReason/);
  });
});

describe("o disparador", () => {
  const disparador = ler("src/lib/whatsapp/campaignDispatcher.ts");

  it("protege os números que caíram antes da janela de horário e de qualquer fila", () => {
    const protege = disparador.indexOf("await protegerNumerosQueCairam()");
    const janela = disparador.indexOf("dentroDaJanela(new Date())");
    expect(protege).toBeGreaterThan(-1);
    expect(janela).toBeGreaterThan(protege);
  });

  it("marca a sessão caída quando o envio volta Connection Closed", () => {
    const ramo = disparador.slice(disparador.indexOf("ehFalhaDeSessao(envio.detalhe)"));
    const fim = ramo.indexOf("break;");
    expect(fim).toBeGreaterThan(-1);
    expect(ramo.slice(0, fim)).toContain("marcarSessaoCaida(instancia.id)");
  });
});

describe("o limite do dia", () => {
  it("conta só o que saiu depois da última queda tratada", () => {
    const corpo = corpoDe(ler("src/lib/whatsapp/repositorio.ts"), "export async function calcularLimiteDoDia(");
    expect(corpo).toMatch(/recomecoDepoisDe:\s*instancia\?\.aquecimento_desde/);
  });
});

describe("o sorteio do link", () => {
  function ultimaDefinicao(): string {
    const dir = "supabase/migrations";
    let ultima = "";
    for (const arquivo of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
      const sql = readFileSync(`${dir}/${arquivo}`, "utf8").toLowerCase();
      const corte = sql.lastIndexOf("create or replace function public.sortear_corretor_whatsapp");
      if (corte >= 0) ultima = sql.slice(corte);
    }
    return ultima;
  }

  it("deixa de fora o número com a sessão caída", () => {
    expect(ultimaDefinicao()).toMatch(/sessao_caida_em\s+is\s+null/);
  });

  it("gira o rodízio pelo último clique de pessoa, não do robô", () => {
    expect(ultimaDefinicao()).toMatch(/coalesce\(k\.de_pessoa,\s*true\)/);
  });
});

describe("os links /wa classificam o clique", () => {
  it.each(["src/app/wa/route.ts", "src/app/wa/[campanha]/route.ts"])("%s", (arquivo) => {
    const rota = ler(arquivo);
    expect(rota).toContain("ehCliqueDePessoa(");
    expect(rota).toMatch(/de_pessoa:/);
  });
});
