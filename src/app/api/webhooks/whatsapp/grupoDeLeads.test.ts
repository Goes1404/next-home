import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Teste de fonte: a exceção ao descarte de `@g.us` precisa ser estreita. O
 * webhook inteiro não sobe num teste; o que se trava aqui é a forma do bloco
 * que decide o que fazer com mensagem de grupo, que é onde a IA nunca pode
 * chegar (spec 6.2, passo 1).
 */
const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "webhooks", "whatsapp", "route.ts"), "utf8");

const inicio = fonte.indexOf("if (/@(g\\.us|broadcast)$/i.test(jidBruto)");
const fim = fonte.indexOf("const sender = ");
const blocoDoGrupo = fonte.slice(inicio, fim);

describe("webhook: retorno da ligação pelo grupo do corretor", () => {
  it("chama só o tratamento do grupo de leads, dentro do descarte de grupo", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    expect(fonte).toMatch(/import \{ tratarMensagemDoGrupoDeLeads \} from "@\/lib\/crm\/retornoPeloGrupo"/);
    expect(blocoDoGrupo).toMatch(/await tratarMensagemDoGrupoDeLeads\(\{\s*payload,\s*instanceName,\s*jidBruto,/);
    expect(fonte.match(/tratarMensagemDoGrupoDeLeads\(/g)).toHaveLength(1);
  });

  it("autentica o webhook antes de tratar o grupo (o tratamento grava e gasta IA)", () => {
    const chamada = blocoDoGrupo.indexOf("tratarMensagemDoGrupoDeLeads(");
    const antes = blocoDoGrupo.slice(0, chamada);
    expect(antes).toContain("resolverInstancia(instanceName)");
    expect(antes).toContain("requisicaoAutenticada(req, instanciaDoGrupo)");
    expect(antes).toContain("mensagemDoNumeroPodeSeguir(instanciaDoGrupo)");
  });

  it("só mensagem nova entra, e o processamento roda depois da resposta", () => {
    expect(blocoDoGrupo).toMatch(/\(!eventoDoGrupo \|\| eventoDoGrupo === "messages\.upsert"\)/);
    expect(blocoDoGrupo).toContain("agendar: (tarefa) => after(tarefa)");
  });

  it("o que não é do grupo de leads continua descartado como sempre", () => {
    expect(blocoDoGrupo).toContain('return NextResponse.json({ ok: true, ignored: "Mensagem de grupo ou transmissão" })');
    expect(blocoDoGrupo).toMatch(/if \(tratada\) return NextResponse\.json\(\{ ok: true, action: "retorno_do_grupo" \}\)/);
  });

  it("a confirmação do próprio número central (fromMe) e a transmissão não chegam ao tratamento", () => {
    const chamada = blocoDoGrupo.indexOf("tratarMensagemDoGrupoDeLeads(");
    const guarda = blocoDoGrupo.indexOf("const eventoDoGrupo");
    expect(guarda).toBeGreaterThan(-1);
    expect(blocoDoGrupo.slice(guarda, chamada)).toMatch(/@g\\\.us\$\/i\.test\(jidBruto\)/);
    expect(blocoDoGrupo.slice(guarda, chamada)).toMatch(/!\(payload\.data\?\.key\?\.fromMe \|\| payload\.fromMe\)/);
  });

  it("nada da IA roda antes do return do bloco de grupo", () => {
    expect(blocoDoGrupo).not.toMatch(/decidirSeAIaResponde|gerarResposta|processarMensagem|enviarMensagemWhatsapp\(/);
  });
});
