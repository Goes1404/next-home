/*
 * Service worker do painel do corretor: notificações (0203), a tela "sem
 * conexão" do app e, desde 29/10/2026 (segunda leva), o "offline leve".
 *
 * O que ele guarda, e SÓ isto:
 *
 * 1. A CASCA (`astro-casca-*`): `/offline.html`, os ícones e os arquivos de
 *    `/_next/static/` (JS e CSS com hash no nome: o mesmo nome é sempre o
 *    mesmo conteúdo, e não há dado de ninguém neles). Servidos do cache
 *    primeiro: o app abre mais rápido no celular. Fora do ar em `localhost`
 *    (no `next dev` os nomes não mudam com o conteúdo).
 * 2. Os DADOS do app sem internet (`astro-dados-v2:<id do usuário>`): a
 *    resposta de `/api/painel/offline` — agenda de hoje e 20 leads recentes
 *    do próprio usuário. Rede primeiro; sem rede, a última guardada. Uma
 *    caixa por usuário, e a de qualquer OUTRO usuário é apagada antes de
 *    guardar. 401 (sessão acabou) apaga tudo. Sair da conta (`data-sair`) e
 *    abrir a tela de login mandam `limpar-dados`.
 *
 * Páginas do CRM continuam sempre da rede (navigation preload); sem rede,
 * `/offline.html`, que mostra os dados guardados só para leitura. Conversa,
 * mensagem, ficha e qualquer outra rota de API NUNCA são guardadas
 * (`podeGuardar`). As notificações (push e clique) seguem idênticas.
 *
 * As funções puras abaixo são testadas em `src/app/corretor/swPainel.test.ts`,
 * que roda este arquivo de verdade contra um `self` falso.
 */
const CACHE_CASCA = "astro-casca-v2";
const PREFIXO_DOS_DADOS = "astro-dados-v2:";
const PAGINA_OFFLINE = "/offline.html";
const ROTA_DOS_DADOS = "/api/painel/offline";
const CASCA_INICIAL = [PAGINA_OFFLINE, "/icones/astroimob-192.png", "/icones/icone-astroimob.svg"];
/** Teto de arquivos da casca: os de versões velhas saem pelos mais antigos. */
const TETO_DA_CASCA = 150;

// ── Lógica pura ─────────────────────────────────────────────────────────────

/** A caixa dos dados de UM usuário. */
function caixaDoUsuario(usuarioId) {
  return PREFIXO_DOS_DADOS + encodeURIComponent(String(usuarioId));
}

function ehCaixaDeDados(nome) {
  return nome.indexOf("astro-dados-") === 0;
}

/** Na ativação: tudo nosso que não é a casca atual nem a caixa de dados atual. */
function cachesVelhos(nomes) {
  return nomes.filter(
    (n) => (n.indexOf("astro-offline-") === 0 || n.indexOf("astro-casca-") === 0 || ehCaixaDeDados(n)) && n !== CACHE_CASCA && n.indexOf(PREFIXO_DOS_DADOS) !== 0,
  );
}

/** As caixas de dados que NÃO são deste usuário (todas, sem usuário). */
function caixasParaApagar(nomes, usuarioId) {
  const minha = usuarioId ? caixaDoUsuario(usuarioId) : null;
  return nomes.filter((n) => ehCaixaDeDados(n) && n !== minha);
}

function ehDesenvolvimento(origem) {
  const host = new URL(origem).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * O que este worker pode guardar: a rota dos dados e a casca. Tudo o mais —
 * conversas, mensagens, fichas, outras APIs, páginas — passa direto.
 */
function podeGuardar(url, origem) {
  const u = new URL(url, origem);
  if (u.origin !== new URL(origem).origin) return null;
  if (u.pathname === ROTA_DOS_DADOS && !u.search) return "dados";
  if (/conversa|mensage/i.test(u.pathname)) return null;
  if (u.pathname.indexOf("/api/") === 0) return null;
  if (CASCA_INICIAL.indexOf(u.pathname) >= 0 || u.pathname.indexOf("/icones/") === 0) return "casca";
  if (u.pathname.indexOf("/_next/static/") === 0 && !ehDesenvolvimento(origem)) return "casca";
  return null;
}

/** A navegação é do painel (`/corretor` ou `/corretor/...`)? */
function ehNavegacaoDoPainel(url, origem) {
  const u = new URL(url, origem);
  return u.pathname === "/corretor" || u.pathname.indexOf("/corretor/") === 0;
}

/** O corpo da rota de dados é dele mesmo? Só então ele vai para uma caixa. */
function usuarioDosDados(corpo) {
  return corpo && corpo.versao === 1 && typeof corpo.usuarioId === "string" && corpo.usuarioId ? corpo.usuarioId : null;
}

// ── Caches ─────────────────────────────────────────────────────────────────

async function apagarCaixas(usuarioQueFica) {
  const nomes = await caches.keys();
  await Promise.all(caixasParaApagar(nomes, usuarioQueFica).map((n) => caches.delete(n)));
}

async function guardarNaCasca(pedido, resposta) {
  const caixa = await caches.open(CACHE_CASCA);
  await caixa.put(pedido, resposta);
  const chaves = await caixa.keys();
  if (chaves.length > TETO_DA_CASCA) {
    await Promise.all(chaves.slice(0, chaves.length - TETO_DA_CASCA).map((k) => caixa.delete(k)));
  }
}

async function dadosGuardados() {
  const nomes = (await caches.keys()).filter((n) => n.indexOf(PREFIXO_DOS_DADOS) === 0);
  // Só existe uma (a do usuário atual): as outras são apagadas antes de guardar.
  for (const nome of nomes) {
    const caixa = await caches.open(nome);
    const r = await caixa.match(ROTA_DOS_DADOS);
    if (r) return r;
  }
  return null;
}

async function tratarDados(pedido) {
  let resposta;
  try {
    resposta = await fetch(pedido);
  } catch {
    const guardada = await dadosGuardados();
    return guardada || new Response(JSON.stringify({ semDados: true }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  if (resposta.status === 401) {
    await apagarCaixas(null);
    return resposta;
  }
  if (resposta.ok) {
    try {
      const usuarioId = usuarioDosDados(await resposta.clone().json());
      if (usuarioId) {
        await apagarCaixas(usuarioId);
        const caixa = await caches.open(caixaDoUsuario(usuarioId));
        await caixa.put(ROTA_DOS_DADOS, resposta.clone());
      }
    } catch {
      /* corpo estranho: não guarda, mas entrega */
    }
  }
  return resposta;
}

async function tratarCasca(event) {
  const guardada = await caches.match(event.request);
  if (guardada) return guardada;
  const resposta = await fetch(event.request);
  if (resposta.ok && resposta.type === "basic") event.waitUntil(guardarNaCasca(event.request, resposta.clone()).catch(() => {}));
  return resposta;
}

// ── Ciclo de vida ──────────────────────────────────────────────────────────

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_CASCA)
      .then((c) => c.addAll(CASCA_INICIAL.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(cachesVelhos(nomes).map((n) => caches.delete(n)));
      // Navigation preload: a página chega em paralelo com o worker acordando,
      // então tratar a navegação aqui não atrasa o painel.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const dados = event.data || {};
  if (dados.tipo === "limpar-dados") event.waitUntil(apagarCaixas(null));
  // A página sem controlador (fora do escopo) pede a renovação por aqui: o
  // worker faz o pedido e guarda como se a página o tivesse feito (30/10/2026).
  else if (dados.tipo === "renovar-dados")
    event.waitUntil(tratarDados(new Request(self.location.origin + ROTA_DOS_DADOS, { cache: "no-store", credentials: "same-origin" })).catch(() => {}));
  else if (dados.tipo === "sessao" && typeof dados.usuarioId === "string") event.waitUntil(apagarCaixas(dados.usuarioId));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode !== "navigate") {
    const tipo = podeGuardar(event.request.url, self.location.origin);
    if (tipo === "dados") event.respondWith(tratarDados(event.request));
    else if (tipo === "casca") event.respondWith(tratarCasca(event));
    return;
  }
  // Escopo `/corretor` (30/10/2026) casa por prefixo também com
  // `/corretores/...` (o site público): navegação fora do painel não é nossa.
  if (!ehNavegacaoDoPainel(event.request.url, self.location.origin)) return;
  event.respondWith(
    (async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(event.request);
      } catch {
        const guardada = await caches.match(PAGINA_OFFLINE);
        return guardada || new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { corpo: event.data ? event.data.text() : "" };
  }
  const titulo = dados.titulo || "Astro Soluções";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: dados.url || "/corretor" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/corretor", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin + "/corretor") && "focus" in j) {
          j.navigate(destino);
          return j.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
