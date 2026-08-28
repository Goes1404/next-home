/**
 * O espaçamento anti-ban vale no ENVIO, não só no papel.
 *
 * Defeito medido em produção (28/08/2026): o intervalo de 35-75s existia só
 * em `agendado_para`, calculado na criação da campanha. O disparador
 * esperava quando o item estava no futuro e mandava na hora quando estava
 * vencido — então bastava a fila atrasar para tudo sair junto. Campanha
 * e59c871a: 15 mensagens agendadas ao longo de 14 minutos saíram em 57
 * segundos, com 2 a 5 segundos entre elas.
 *
 * Estes testes leem o CÓDIGO-FONTE, como `gravacaoDeMensagem.test.ts` e
 * `escalaDoPainel.test.ts`. É feio e é o único jeito de travar esta classe
 * de regressão sem banco de teste: o defeito não estava no RESULTADO de uma
 * função pura — estava em qual garantia o disparador escolhia confiar.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "../../..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

const dispatcher = ler("src/lib/whatsapp/campaignDispatcher.ts");
const repositorio = ler("src/lib/whatsapp/repositorio.ts");
const followups = ler("src/app/api/cron/followups/route.ts");
const migration = ler("supabase/migrations/0062_espacamento_no_envio.sql");

describe("a trava de tempo mora no banco", () => {
  it("reservarCotaCampanha chama a função COM espaçamento", () => {
    expect(repositorio).toContain("consumir_cota_campanha_espacada");
  });

  it("manda o piso e o teto do intervalo para o banco decidir", () => {
    expect(repositorio).toContain("p_intervalo_min: INTERVALO_MINIMO_SEGUNDOS");
    expect(repositorio).toContain("p_intervalo_max: INTERVALO_MAXIMO_SEGUNDOS");
  });

  it("erro ao consultar o banco NUNCA vira permissão de envio", () => {
    // Sem resposta do banco não há como saber se o intervalo foi cumprido.
    // Falhar aberto aqui devolveria exatamente a rajada que a trava remove.
    const trecho = repositorio.slice(
      repositorio.indexOf("export async function reservarCotaCampanha"),
      repositorio.indexOf("export async function reservarCotaCampanha") + 4000,
    );
    const posErro = trecho.indexOf("if (error)");
    expect(posErro).toBeGreaterThan(-1);
    expect(trecho.slice(posErro, posErro + 900)).toContain("permitido: false");
  });

  it("a condição de intervalo está no MESMO update que consome a cota", () => {
    // Conferir antes e gravar depois seria uma corrida: dois disparadores
    // leriam "pode" no mesmo instante. Só o update atômico garante a vez.
    const corpo = migration.slice(
      migration.indexOf("update public.corretor_whatsapp_instancias"),
      migration.indexOf("returning envios_campanha_contador"),
    );
    expect(corpo).toContain("proximo_envio_permitido_em is null or proximo_envio_permitido_em <= now()");
    expect(corpo).toContain("envios_campanha_contador");
  });

  it("o intervalo é sorteado, não fixo", () => {
    // Cadência exata de 35s é tão reconhecível quanto rajada.
    expect(migration).toContain("random()");
  });
});

describe("o disparador espera em vez de mandar em rajada", () => {
  it("trata 'aguardando_intervalo' separado de cota esgotada", () => {
    expect(dispatcher).toContain('cota.motivo === "aguardando_intervalo"');
  });

  it("dorme o intervalo e tenta de novo, sem gastar a vaga do item", () => {
    const bloco = dispatcher.slice(
      dispatcher.indexOf('cota.motivo === "aguardando_intervalo"'),
      dispatcher.indexOf("parcial.processados++"),
    );
    expect(bloco).toContain("await dormir(cota.esperaMs)");
    expect(bloco).toContain("continue");
    // `processados++` não pode acontecer antes do `continue`: aguardar não
    // é processar, e contá-lo encerraria a chamada sem mandar nada.
    expect(bloco).not.toContain("parcial.processados++");
  });

  it("quando a espera não cabe no orçamento, encadeia em vez de forçar", () => {
    const bloco = dispatcher.slice(
      dispatcher.indexOf('cota.motivo === "aguardando_intervalo"'),
      dispatcher.indexOf("parcial.processados++"),
    );
    expect(bloco).toContain("deveContinuar = true");
  });
});

describe("follow-up não é descartado por espaçamento", () => {
  it("pula o tique em vez de apagar o follow-up", () => {
    const pos = followups.indexOf("const cota = await reservarCotaCampanha");
    const bloco = followups.slice(pos, pos + 700);
    expect(bloco).toContain('cota.motivo === "aguardando_intervalo"');
    // A linha do 'pulado' precisa vir ANTES do descarte por cota.
    expect(bloco.indexOf('return "pulado"')).toBeLessThan(bloco.indexOf("cota_esgotada"));
  });
});
