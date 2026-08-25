import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas de LEITURA DE CÓDIGO para a gravação da mensagem do bot.
 *
 * Teste feio, e existe porque a regressão que ele pega já aconteceu e
 * falhou CALADA por dois dias.
 *
 * `whatsapp_mensagens.interacao_id` tem chave estrangeira para
 * `ia_interacoes` (0040). O webhook gerava o uuid antes do envio e mandava
 * no insert da mensagem — só que a linha de telemetria só é escrita no fim
 * da requisição. O insert violava a FK, `gravarMensagem` logava o erro e
 * devolvia `{ inedita: true }` como se tivesse gravado.
 *
 * Resultado: entre 23 e 25/08/2026, NENHUMA resposta do bot foi salva. E
 * como `historicoRecente` é o que monta o prompt, a IA nunca via as
 * próprias falas — cumprimentava do zero em toda mensagem e repetia a
 * mesma oferta depois de o cliente aceitar. Da tela, parecia perda de
 * contexto; era ausência de contexto.
 *
 * Nada disso aparece em teste de unidade: tipos passavam, build passava,
 * a resposta CHEGAVA no WhatsApp do cliente. Só o banco sabia.
 */

const leia = (caminho: string) => readFileSync(caminho, "utf8");

const REPOSITORIO = leia("src/lib/whatsapp/repositorio.ts");
const WEBHOOK = leia("src/app/api/webhooks/whatsapp/route.ts");
const FOLLOWUPS = leia("src/app/api/cron/followups/route.ts");

describe("a mensagem do bot precisa sobreviver à telemetria", () => {
  it("gravarMensagem NÃO aceita interacaoId", () => {
    /*
     * Quando um parâmetro só pode ser usado errado, ele não deve existir —
     * mesma decisão que tirou `legenda` de `enviarMidiaWhatsapp`. O vínculo
     * vive em `vincularInteracaoNaMensagem`, que roda depois.
     */
    const assinatura = REPOSITORIO.slice(
      REPOSITORIO.indexOf("export async function gravarMensagem"),
      REPOSITORIO.indexOf("export async function vincularInteracaoNaMensagem"),
    );
    expect(assinatura).not.toContain("interacaoId");
    expect(assinatura).not.toContain("interacao_id");
  });

  it("existe uma função separada para o vínculo", () => {
    expect(REPOSITORIO).toContain("export async function vincularInteracaoNaMensagem");
  });

  for (const [nome, arquivo] of [
    ["webhook", WEBHOOK],
    ["follow-up", FOLLOWUPS],
  ] as const) {
    it(`no ${nome}, o vínculo vem DEPOIS de registrarInteracao`, () => {
      // A ordem é a regra inteira: a FK exige que a linha de telemetria
      // exista antes de a mensagem apontar para ela.
      const telemetria = arquivo.lastIndexOf("registrarInteracao({");
      const vinculo = arquivo.indexOf("vincularInteracaoNaMensagem(");
      expect(telemetria).toBeGreaterThan(-1);
      expect(vinculo).toBeGreaterThan(telemetria);
    });

    it(`no ${nome}, a mensagem é gravada ANTES da telemetria`, () => {
      /*
       * Gravar no fim seria mais simples e é a troca errada: se a função
       * estourar o tempo no dossiê (12s) ou num aviso ao corretor, a
       * conversa precisa já estar salva. Perder o vínculo custa uma
       * avaliação; perder a mensagem custa o contexto de toda a conversa.
       */
      const gravacao = arquivo.indexOf('remetente: "bot"');
      const telemetria = arquivo.lastIndexOf("registrarInteracao({");
      expect(gravacao).toBeGreaterThan(-1);
      expect(gravacao).toBeLessThan(telemetria);
    });
  }
});
