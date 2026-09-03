import "server-only";

import { after } from "next/server";

/**
 * Acorda o worker de render logo depois de o vídeo entrar na fila.
 *
 * ## O defeito que isto conserta (03/09/2026)
 *
 * Um vídeo foi pedido pelo painel às 14h15 e nunca renderizou. O job estava
 * lá, `status = 'pendente'`, **`tentativas = 0`**, sem trava: ninguém tinha
 * sequer TENTADO. A causa não era o render — era que nada no sistema chamava
 * o worker. `criarVideo` inseria na fila e encerrava; o workflow do GitHub
 * Actions só aceitava acionamento manual, e tinha **zero execuções na vida**.
 *
 * Quinto caso do padrão que a MEMORIA registra: recurso completo, testado, e
 * que nunca produziu uma linha porque faltava quem o ligasse.
 *
 * ## Por que o render não roda na Vercel
 *
 * Medido: 174 s para um vídeo de 17 s, contra o teto de 60 s por função do
 * plano Hobby. Por isso o desenho é "o painel enfileira, o Actions esvazia" —
 * e este módulo é o elo que faltava entre os dois.
 *
 * ## O desenho: mesmo "acender o pavio" da campanha
 *
 * É o irmão de `whatsapp/autoDisparo.ts`. As três propriedades que importam,
 * e que vêm de lá:
 *
 * 1. **Não segura a resposta do painel.** O trabalho vai para `after()`; quem
 *    clicou não espera o GitHub responder. A ação já é lenta o bastante (a
 *    classificação de fotos por visão roda antes).
 * 2. **Falha FECHADA e silenciosa.** Sem token, avisa no log e volta — nunca
 *    lança. Quem chama está no meio de criar um vídeo, e derrubar a criação
 *    porque o acionamento falhou seria trocar um defeito por um pior. (O
 *    oposto de `supabase/service.ts`, que lança de propósito: aquela é a
 *    exceção da casa, não o modelo.)
 * 3. **Perder o acionamento não perde o vídeo.** O `schedule` do workflow
 *    varre a fila de hora em hora. Este módulo compra SEGUNDOS em vez de até
 *    uma hora; ele não é a única linha de defesa, e é por isso que pode se
 *    dar ao luxo de falhar em silêncio.
 *
 * Acionar quando um worker já está rodando é inofensivo: o `concurrency:
 * render-video` do workflow enfileira a execução nova, e a trava por job no
 * banco (`travado_por`/`travado_ate`) impede que dois peguem o mesmo item.
 */

/** O workflow que renderiza. É o nome do arquivo, como a API do GitHub espera. */
const WORKFLOW = "render-video.yml";

/**
 * Quantos jobs o worker processa nesta execução.
 *
 * Três, como o padrão do próprio workflow: lote pequeno e sai, mesmo desenho
 * do disparador de campanhas. Worker que roda para sempre precisa de
 * supervisão, reinício e observabilidade próprios — três coisas que este
 * projeto não tem.
 */
const QUANTOS = "3";

export function acionarRender(): void {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  /*
   * Ausência de configuração NÃO é erro: é o estado normal em
   * desenvolvimento, e continua sendo um estado operável em produção — o
   * vídeo só demora mais, porque o `schedule` o pega. Avisar no log é o
   * suficiente, e é o que permite descobrir depois por que um render demorou.
   */
  if (!token || !repo) {
    console.warn(
      "[video] render não acionado: GITHUB_TOKEN/GITHUB_REPO ausentes. A fila sai no schedule.",
    );
    return;
  }

  // A `ref` decide QUAL CÓDIGO do worker roda, não só onde o workflow existe.
  // Padrão em `main` para acompanhar o que está publicado.
  const ref = process.env.GITHUB_RENDER_REF || "main";
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`;

  after(async () => {
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ref, inputs: { quantos: QUANTOS } }),
        // Fire-and-forget: basta a execução COMEÇAR do outro lado, onde ela
        // tem os próprios 30 minutos.
        signal: AbortSignal.timeout(5000),
      });

      /*
       * O corpo do erro é registrado porque as três causas prováveis são
       * indistinguíveis pelo status sozinho: token sem escopo `actions:write`,
       * `GITHUB_REPO` errado, e a `ref` não existir no repositório. Sem o
       * texto, o diagnóstico vira tentativa e erro.
       */
      if (!resposta.ok) {
        console.warn(
          `[video] render não acionado: GitHub respondeu ${resposta.status} — ${await resposta
            .text()
            .catch(() => "(sem corpo)")}`,
        );
      }
    } catch {
      // Rede fora ou tempo estourado. O schedule cobre.
    }
  });
}
