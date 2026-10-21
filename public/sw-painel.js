/*
 * Service worker do painel do corretor: só notificações (0203).
 * Não guarda cache de página nenhuma, de propósito: o site e o painel seguem
 * sempre da rede, como antes.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { corpo: event.data ? event.data.text() : "" };
  }
  const titulo = dados.titulo || "Next Home";
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
