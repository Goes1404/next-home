/**
 * Leitura dos eventos de contato da Evolution (CONTACTS_UPSERT/UPDATE).
 *
 * O campo é sempre `pushName`, mas ele chega com DOIS sentidos, conferido no
 * código da Evolution v2 (whatsapp.baileys.service.ts) e do Baileys 7 rc.9:
 *
 * 1. Nome da AGENDA: o corretor salva o contato no celular, o WhatsApp
 *    sincroniza com os aparelhos conectados (contactAction), o Baileys emite
 *    `contacts.upsert` com `name = fullName` e a Evolution o manda como
 *    `pushName`.
 * 2. Nome do PERFIL do cliente: a cada mensagem recebida a Evolution também
 *    manda CONTACTS_UPDATE com `pushName` = o nome que o cliente pôs no
 *    WhatsApp dele. É o mesmo que já chega em `senderName`.
 *
 * Só dá para separar os dois comparando com o nome de perfil que já
 * guardamos na conversa. Por isso o diagnóstico conta quantos nomes
 * DIFEREM do perfil: esse é o sinal de que a agenda está chegando.
 */

export type ItemDeContato = { remoteJid?: unknown; pushName?: unknown };

export type LeituraDoContato = {
  tipoJid: "pessoa" | "lid" | "outro";
  digitos: string;
  temNome: boolean;
};

/** Nome com letra e sem ser o número (a Evolution cai no número quando não há nome). */
export function pareceNome(v: unknown): v is string {
  return typeof v === "string" && /\p{L}/u.test(v) && v.replace(/\D/g, "").length < 8;
}

export function lerContato(item: ItemDeContato): LeituraDoContato {
  const jid = typeof item?.remoteJid === "string" ? item.remoteJid : "";
  const tipoJid = /@s\.whatsapp\.net$/i.test(jid) ? "pessoa" : /@lid$/i.test(jid) ? "lid" : "outro";
  return { tipoJid, digitos: jid.split("@")[0].replace(/\D/g, ""), temNome: pareceNome(item?.pushName) };
}

/**
 * Resumo sem dado pessoal: contagens. `nomesDoPerfil` é o `nome_cliente` da
 * conversa de cada número (só de quem já tem conversa).
 */
export function resumirEventoDeContato(
  itens: ItemDeContato[],
  nomesDoPerfil: Map<string, string | null>,
) {
  const r = { itens: itens.length, pessoa: 0, lid: 0, outro: 0, comNome: 0, comConversa: 0, diferenteDoPerfil: 0, igualAoPerfil: 0 };
  for (const item of itens) {
    const l = lerContato(item);
    r[l.tipoJid] += 1;
    if (l.temNome) r.comNome += 1;
    if (!nomesDoPerfil.has(l.digitos)) continue;
    r.comConversa += 1;
    if (!l.temNome) continue;
    const perfil = nomesDoPerfil.get(l.digitos);
    const nome = String(item.pushName).trim().toLowerCase();
    if (perfil && perfil.trim().toLowerCase() === nome) r.igualAoPerfil += 1;
    else r.diferenteDoPerfil += 1;
  }
  return r;
}

export function itensDoEvento(data: unknown): ItemDeContato[] {
  if (Array.isArray(data)) return data as ItemDeContato[];
  return data && typeof data === "object" ? [data as ItemDeContato] : [];
}
