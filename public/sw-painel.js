/*
 * Service worker do painel do corretor: notificações (0203) e, desde
 * 29/10/2026, a tela "sem conexão" do app.
 *
 * Não guarda cache de página nenhuma, de propósito: o painel segue sempre da
 * rede, como antes. A ÚNICA coisa guardada é `/offline.html` (uma página
 * estática, sem dado de ninguém), mostrada quando a navegação falha por falta
 * de rede — no lugar da página do dinossauro do Chrome.
 */
const CACHE_OFFLINE = "astro-offline-v1";
const PAGINA_OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_OFFLINE)
      .then((c) => c.add(new Request(PAGINA_OFFLINE, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("astro-offline-") && n !== CACHE_OFFLINE).map((n) => caches.delete(n)));
      // Navigation preload: a página chega em paralelo com o worker acordando,
      // então tratar a navegação aqui não atrasa o painel.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
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
