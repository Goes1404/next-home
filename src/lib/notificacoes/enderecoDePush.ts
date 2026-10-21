/**
 * O endereço de inscrição (endpoint) que o navegador devolve é para onde o
 * SERVIDOR faz o POST da notificação. Aceitar qualquer https deixaria um
 * corretor logado apontar o servidor para um endereço interno (SSRF). Só
 * passam os serviços de push dos navegadores, sem porta nem usuário na URL.
 * Conferido na inscrição e de novo antes de cada envio.
 */
const SERVICOS_DE_PUSH = ["fcm.googleapis.com", "web.push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

export function ehEnderecoDePush(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return SERVICOS_DE_PUSH.some((s) => host === s || host.endsWith(`.${s}`));
}
