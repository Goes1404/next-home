/**
 * O service worker do painel visto do navegador (30/10/2026, revisão).
 *
 * Defeito: o `sw-painel.js` era registrado com escopo `"/corretor/"`, mas o
 * app abre em `/corretor` (o `start_url` do manifesto) — fora do escopo. O
 * Início ficava SEM controlador, e como o Next navega sem recarregar, a
 * sessão inteira aberta pelo app também: a renovação dos dados sem internet
 * nunca rodava, e o `limpar-dados` do "Sair" ia para um `controller` nulo —
 * os leads guardados de quem saiu sobreviviam num celular compartilhado.
 *
 * O que mudou, sem derrubar nenhum aviso ligado:
 *
 * - todo registro NOVO é com escopo `"/corretor"` (sem barra). O worker é
 *   servido da raiz, então o escopo é permitido, e ele cobre `/corretor` e
 *   tudo abaixo;
 * - o registro antigo (`"/corretor/"`) NÃO é desfeito: a inscrição de push
 *   pertence ao registro, e desregistrar mataria em silêncio os avisos de
 *   quem já ligou (do painel e da plataforma, que gravam em tabelas
 *   diferentes — não dá para reinscrever com segurança daqui). Os dois
 *   rodam o MESMO arquivo e dividem `caches` (que é da origem), então
 *   conviver é inofensivo; o worker ignora navegação fora do painel
 *   (`/corretores/...`, o site público);
 * - as mensagens (`limpar-dados`, `renovar-dados`) vão para o worker ATIVO
 *   de cada registro do painel, não só para o `controller` — chegam mesmo
 *   numa página sem controlador;
 * - "os avisos estão ligados?" olha a inscrição de TODOS os registros do
 *   painel, e ligar reaproveita a que já existir.
 */
export const SCRIPT_DO_SW = "/sw-painel.js";
/** O escopo de hoje: cobre o `start_url` (`/corretor`) e o resto do painel. */
export const ESCOPO_DO_SW = "/corretor";
/** O escopo de antes do conserto. Fica vivo por causa das inscrições de push. */
export const ESCOPO_ANTIGO_DO_SW = "/corretor/";

export type MensagemAoSw = { tipo: "limpar-dados" } | { tipo: "renovar-dados" };

type Registro = Pick<ServiceWorkerRegistration, "scope" | "active" | "installing" | "waiting" | "pushManager">;
type ContainerDoSw = {
  controller: Pick<ServiceWorker, "postMessage"> | null;
  getRegistrations?: () => Promise<readonly Registro[]>;
};

/** O registro é do painel (escopo `/corretor` ou `/corretor/`, em qualquer origem)? */
export function ehRegistroDoPainel(escopo: string): boolean {
  try {
    const caminho = new URL(escopo).pathname;
    return caminho === ESCOPO_DO_SW || caminho === ESCOPO_ANTIGO_DO_SW;
  } catch {
    return false;
  }
}

/** Os registros do painel neste aparelho (o novo e, se houver, o antigo). */
export async function registrosDoPainel(container: ContainerDoSw | undefined = lerContainer()): Promise<Registro[]> {
  if (!container?.getRegistrations) return [];
  try {
    return (await container.getRegistrations()).filter((r) => ehRegistroDoPainel(r.scope));
  } catch {
    return [];
  }
}

/**
 * Manda a mensagem ao worker ativo de cada registro do painel e ao
 * `controller` da página (se for outro). Devolve quantos receberam.
 */
export async function avisarServiceWorkers(mensagem: MensagemAoSw, container: ContainerDoSw | undefined = lerContainer()): Promise<number> {
  if (!container) return 0;
  const destinos = new Set<Pick<ServiceWorker, "postMessage">>();
  if (container.controller) destinos.add(container.controller);
  for (const r of await registrosDoPainel(container)) if (r.active) destinos.add(r.active);
  let enviados = 0;
  for (const d of destinos) {
    try {
      d.postMessage(mensagem);
      enviados++;
    } catch {
      /* worker sumindo: o próximo recebe */
    }
  }
  return enviados;
}

/** A inscrição de push que já existir em algum registro do painel. */
export async function inscricaoDoPainel(container: ContainerDoSw | undefined = lerContainer()): Promise<PushSubscription | null> {
  for (const r of await registrosDoPainel(container)) {
    try {
      const inscricao = await r.pushManager?.getSubscription();
      if (inscricao) return inscricao;
    } catch {
      /* registro quebrado: olha o próximo */
    }
  }
  return null;
}

/**
 * Espera o worker DESTE registro ficar ativo. `navigator.serviceWorker.ready`
 * não serve: ele espera o registro que controla a página atual, e numa
 * página fora do escopo ele nunca resolve (o botão "Ligar avisos" no Início
 * ficava "Ligando…" para sempre com o escopo antigo).
 */
export function esperarAtivo(reg: Registro, tetoMs = 15_000): Promise<void> {
  if (reg.active) return Promise.resolve();
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("service worker não ativou")), tetoMs);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        clearTimeout(t);
        resolve();
      } else if (worker.state === "redundant") {
        clearTimeout(t);
        reject(new Error("service worker descartado"));
      }
    });
  });
}

/** Registra (idempotente) o worker do painel no escopo de hoje e espera ele ativar. */
export async function registrarSwDoPainel(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SCRIPT_DO_SW, { scope: ESCOPO_DO_SW });
  await esperarAtivo(reg);
  return reg;
}

function lerContainer(): ContainerDoSw | undefined {
  try {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
  } catch {
    return undefined;
  }
}
