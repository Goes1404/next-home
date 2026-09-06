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

/**
 * Comentário que MENCIONA o parâmetro proibido não é o parâmetro.
 *
 * Esta base documenta bastante o "antes", e a assinatura de
 * `gravarMensagem` cita `interacaoId` justamente para explicar por que ele
 * não existe mais. Sem remover comentários, a guarda acusaria o texto que
 * a defende — foi o que aconteceu ao acrescentar `conversaLiberada`.
 * Mesma solução de `escalaDoPainel.test.ts`.
 */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

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
    const assinatura = semComentarios(
      REPOSITORIO.slice(
        REPOSITORIO.indexOf("export async function gravarMensagem"),
        REPOSITORIO.indexOf("export async function vincularInteracaoNaMensagem"),
      ),
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
    /*
     * As duas guardas abaixo verificam a ordem DENTRO de cada função que
     * envia, nunca por posição global do arquivo.
     *
     * A versão antiga media `lastIndexOf("registrarInteracao({")` contra
     * `indexOf("vincularInteracaoNaMensagem(")` — o ÚLTIMO registro contra o
     * PRIMEIRO vínculo. Com um caminho de envio por arquivo funcionava por
     * sorte; quando o runner de follow-ups ganhou um segundo (a varredura de
     * respostas atrasadas, 03/09/2026), ela passou a parear a telemetria de
     * um caminho com o vínculo do outro e reprovou código correto. Sexta vez
     * que uma guarda de código-fonte deste projeto tropeça no próprio recorte.
     *
     * Recortar por função é o que torna a guarda verdadeira com N caminhos:
     * cada um responde pela própria ordem.
     */
    const funcoesDe = (texto: string): string[] =>
      texto
        .split(/\n(?=(?:export )?(?:async )?function )/)
        .filter((f) => f.includes("registrarInteracao({") || f.includes("vincularInteracaoNaMensagem("));

    it(`no ${nome}, todo vínculo vem DEPOIS da telemetria, na mesma função`, () => {
      // A ordem é a regra inteira: a FK exige que a linha de telemetria
      // exista antes de a mensagem apontar para ela.
      const comVinculo = funcoesDe(arquivo).filter((f) =>
        f.includes("vincularInteracaoNaMensagem("),
      );
      expect(comVinculo.length).toBeGreaterThan(0);
      for (const f of comVinculo) {
        const vinculo = f.indexOf("vincularInteracaoNaMensagem(");
        // Algum registrarInteracao ANTES deste vínculo — não o primeiro da
        // função, que no webhook é o do silêncio.
        expect(f.lastIndexOf("registrarInteracao({", vinculo)).toBeGreaterThan(-1);
      }
    });

    it(`no ${nome}, quem envia grava a mensagem ANTES da telemetria`, () => {
      /*
       * Gravar no fim seria mais simples e é a troca errada: se a função
       * estourar o tempo no dossiê (12s) ou num aviso ao corretor, a
       * conversa precisa já estar salva. Perder o vínculo custa uma
       * avaliação; perder a mensagem custa o contexto de toda a conversa.
       *
       * Só as funções que GRAVAM fala do bot entram: o webhook também
       * registra silêncio (bot pausado, travado) e ali não há mensagem
       * nenhuma para gravar antes.
       */
      const queGravam = funcoesDe(arquivo).filter((f) => f.includes('remetente: "bot"'));
      expect(queGravam.length).toBeGreaterThan(0);
      for (const f of queGravam) {
        // A telemetria DO ENVIO é a última da função: o webhook é uma função
        // só e as primeiras são as de silêncio, onde não há o que gravar.
        expect(f.indexOf('remetente: "bot"')).toBeLessThan(f.lastIndexOf("registrarInteracao({"));
      }
    });
  }
});

/**
 * Guarda da reserva de visita (0074).
 *
 * A confirmação do cliente não pode voltar a ser um `update` direto: sem a
 * função do banco, um horário que a IA inventasse vira compromisso no CRM, e
 * duas conversas confirmando o mesmo horário no mesmo segundo levam as duas
 * — a corrida que a cota anti-ban já ensinou que a aplicação perde.
 */
describe("a visita é reservada no banco, não gravada pela aplicação", () => {
  const REPOSITORIO_FONTE = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");

  const corpoDeAgendarVisita = (): string => {
    const inicio = REPOSITORIO_FONTE.indexOf("export async function agendarVisitaLead");
    return REPOSITORIO_FONTE.slice(inicio, REPOSITORIO_FONTE.indexOf("\n}", inicio));
  };

  it("chama a função de reserva", () => {
    expect(corpoDeAgendarVisita()).toContain('rpc("reservar_horario_visita"');
  });

  it("não escreve a data direto na tabela — isso é o que a função protege", () => {
    expect(corpoDeAgendarVisita()).not.toContain("visita_agendada_em:");
  });

  it("recusa da agenda devolve false, e não é tratada como sucesso", () => {
    expect(corpoDeAgendarVisita()).toContain("data === true");
  });
});
