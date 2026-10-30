import "server-only";

import { canalComOCliente, leadDoDono, type Canal, type LeadDoDono } from "@/lib/crm/documentoPeloCentral";
import { registrarInteracao } from "@/lib/crm/interacoes";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp, enviarMidiaWhatsapp } from "@/lib/whatsapp/provider";
import { gravarMensagem, registrarResultadoEnvio, reservarCotaCampanha, type VezDeDisparar } from "@/lib/whatsapp/repositorio";

/**
 * O que vai AO CLIENTE pelo número central (onda 3: material do imóvel,
 * seleção e proposta, mensagem pronta), num lugar só. A spec 3.0 manda que
 * saia do número do CORRETOR, com as regras anti-bloqueio de hoje; aqui elas
 * são conferidas no "sim", em toda chamada:
 *
 * - só o DONO do lead manda, e pelo número dele (o gestor não fala com o
 *   cliente de outro corretor pelo número alheio);
 * - "pediu para não ser procurado" e conversa que o número não fala mais
 *   (lead que passou a outro número) barram, como no toque do corretor de
 *   `pedirConfirmacaoDaVisita`; o número desconectado ou em pausa de
 *   proteção recusa com a frase clara (`canalComOCliente`, o mesmo do link de
 *   documentos);
 * - PRIMEIRO CONTATO NÃO SAI DAQUI: é o envio que o WhatsApp restringe
 *   (`primeiroContato.ts`, o número do Ramos). Quem nunca escreveu ao
 *   corretor recebe pelo painel ou pela lista, com o teto de 10/30 e o
 *   aquecimento. Basta uma fala do cliente na conversa com este número;
 * - cliente esperando resposta (a última fala é dele) é RESPOSTA, sem cota,
 *   como no botão ✨ (`gerarEEnviarPelaIA`); sem pendência é iniciativa
 *   nossa e passa por `reservarCotaCampanha` (cota do dia + espaçamento), a
 *   regra de todo caminho que fala com o cliente por iniciativa nossa. O
 *   horário não barra: o pedido é do corretor, a mesma classe de decisão de
 *   uma mensagem manual (é o que o ✨ também decidiu).
 *
 * Nada de texto livre: quem chama monta o conteúdo por código (link, mensagem
 * pronta do painel, mídia do catálogo). O recado ditado ao cliente ficou fora
 * do projeto (spec 6.1).
 *
 * Mora no domínio pela razão de `documentoPeloCentral.ts`: o central não
 * escreve em tabela do CRM. Roda pela chave de serviço; toda leitura filtra o
 * grupo da identificação.
 */

type Supa = ReturnType<typeof createServiceClient>;

const ORIGEM = "central_whatsapp";

export type MidiaAoCliente = { tipo: "foto" | "planta"; url: string; titulo: string };

/** O texto (link, mensagem pronta) sai antes das mídias, como na lista de transmissão. */
export type ConteudoAoCliente = { texto?: string; midias?: MidiaAoCliente[] };

export const PRIMEIRO_CONTATO_FICA_NO_PAINEL =
  "ainda não respondeu a você pelo WhatsApp. O primeiro contato não sai pelo central: mande pela ficha ou por uma lista no painel, que seguem o limite de primeiro contato do seu número.";

export type PodeFalar =
  | { ok: true; lead: LeadDoDono; canal: Canal; aguardandoResposta: boolean }
  | { ok: false; erro: string };

/**
 * Dá para falar com o cliente agora? Só leitura: o `preparar` chama para a
 * recusa vir antes do "sim", e o envio chama de novo (entre um e outro, o
 * número pode cair ou o cliente pedir para sair).
 */
export async function podeFalarComOCliente(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadId: string },
  agora: Date = new Date(),
): Promise<PodeFalar> {
  const lead = await leadDoDono(supabase, p);
  if (!lead) return { ok: false, erro: "Só o corretor do cliente manda coisas a ele, e pelo número dele." };
  if (lead.naoContatar) return { ok: false, erro: `${lead.nome} pediu para não receber mensagens.` };
  const canal = await canalComOCliente(supabase, p, agora, `${lead.nome} ${PRIMEIRO_CONTATO_FICA_NO_PAINEL}`);
  if ("erro" in canal) return { ok: false, erro: canal.erro };

  // Conversa aberta por lista (que o cliente nunca respondeu) ainda é
  // primeiro contato: a régua é a fala do cliente, não a linha da conversa.
  const { data: doCliente } = await supabase
    .from("whatsapp_mensagens")
    .select("id")
    .eq("grupo_id", p.grupoId)
    .eq("conversa_id", canal.conversa.id)
    .eq("remetente", "cliente")
    .limit(1);
  if (!doCliente || doCliente.length === 0) return { ok: false, erro: `${lead.nome} ${PRIMEIRO_CONTATO_FICA_NO_PAINEL}` };

  const { data: ultima } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente")
    .eq("grupo_id", p.grupoId)
    .eq("conversa_id", canal.conversa.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ok: true, lead, canal, aguardandoResposta: ultima?.remetente === "cliente" };
}

/** A recusa da cota, em português de quem pediu (nada saiu). */
function textoDaCota(vez: Exclude<VezDeDisparar, { permitido: true }>): string {
  if (vez.motivo === "aguardando_intervalo") {
    const s = Math.max(1, Math.ceil((vez.esperaMs || 40_000) / 1000));
    return `Seu número mandou outra mensagem há pouco (espaçamento anti-bloqueio). Nada saiu: peça de novo em uns ${s} segundos.`;
  }
  if (vez.motivo === "cota_diaria") return "A cota de envios de hoje do seu número acabou (proteção anti-bloqueio). Nada saiu: peça de novo amanhã.";
  if (vez.motivo === "numero_bloqueado") return "Seu número está em pausa de proteção agora. Nada saiu: tente mais tarde.";
  return "Não consegui conferir a cota do seu número agora. Nada saiu: tente de novo em instantes.";
}

export type DependenciasDoEnvio = {
  enviarTexto: typeof enviarMensagemWhatsapp;
  enviarMidia: typeof enviarMidiaWhatsapp;
  reservarCota: typeof reservarCotaCampanha;
  registrarResultado: typeof registrarResultadoEnvio;
  gravar: typeof gravarMensagem;
  /** A pausa curta e humana entre as mídias (a mesma da lista: 1,5 a 3 s). */
  esperar: () => Promise<void>;
};

/*
 * Embrulhados, e não as funções em si: o índice dos tratadores carrega este
 * arquivo em todo teste do central, e um teste que finge o repositório sem a
 * cota quebraria só por o objeto LER a exportação na carga do módulo.
 */
const PADRAO: DependenciasDoEnvio = {
  enviarTexto: (p) => enviarMensagemWhatsapp(p),
  enviarMidia: (p) => enviarMidiaWhatsapp(p),
  reservarCota: (instanciaId, conectadoEm) => reservarCotaCampanha(instanciaId, conectadoEm),
  registrarResultado: (instanciaId, sucesso) => registrarResultadoEnvio(instanciaId, sucesso),
  gravar: (p) => gravarMensagem(p),
  esperar: () => new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1500))),
};

export type EnvioAoCliente =
  | { ok: true; lead: LeadDoDono; enviados: number; total: number }
  | { ok: false; erro: string; /** O conteúdo chegou a ser montado (ex.: a seleção foi gravada) e nada saiu. */ montado?: boolean };

/**
 * Manda ao cliente, pelo número do corretor, o que `montar` devolver. `montar`
 * roda DEPOIS das travas (a seleção só é gravada se puder sair) e recebe o
 * lead já conferido. Cada mensagem é gravada na conversa como fala do
 * corretor (é ele pedindo, pelo central), só depois de sair; a mídia leva a
 * nota `📎 título: url`, que `midiasJaEnviadas` lê para a IA não reenviar.
 */
export async function enviarAoClientePeloCentral(
  supabase: Supa,
  p: {
    grupoId: string;
    corretorId: string;
    leadId: string;
    montar: (lead: LeadDoDono) => Promise<ConteudoAoCliente | { erro: string }>;
    /** A linha da ficha (Interações): o que saiu, sem o texto ao cliente. */
    registro: string;
  },
  agora: Date = new Date(),
  dependencias: Partial<DependenciasDoEnvio> = {},
): Promise<EnvioAoCliente> {
  const deps: DependenciasDoEnvio = { ...PADRAO, ...dependencias };
  const pode = await podeFalarComOCliente(supabase, p, agora);
  if (!pode.ok) return pode;
  const { canal } = pode;

  const conteudo = await p.montar(pode.lead);
  if ("erro" in conteudo) return { ok: false, erro: conteudo.erro };
  const texto = conteudo.texto?.trim() || null;
  const midias = (conteudo.midias ?? []).filter((m) => /^https:\/\//.test(m.url));
  if (!texto && midias.length === 0) return { ok: false, erro: "Não havia nada para mandar.", montado: true };

  if (!pode.aguardandoResposta) {
    const vez = await deps.reservarCota(canal.instancia.id, new Date(canal.instancia.conectado_em));
    if (!vez.permitido) return { ok: false, erro: textoDaCota(vez), montado: true };
  }

  const destino = { instanceName: canal.instancia.instance_name, telefone: canal.conversa.telefoneCliente };
  const total = (texto ? 1 : 0) + midias.length;
  let enviados = 0;

  if (texto) {
    const envio = await deps.enviarTexto({ ...destino, texto });
    await deps.registrarResultado(canal.instancia.id, envio.enviado);
    if (!envio.enviado) {
      console.warn("[central] mensagem ao cliente não saiu:", envio.motivo);
      return { ok: false, erro: "Não consegui mandar pelo seu WhatsApp agora. Tente de novo em instantes.", montado: true };
    }
    enviados++;
    await deps.gravar({
      conversaId: canal.conversa.id,
      remetente: "corretor",
      conteudo: texto,
      conversaLiberada: true,
      providerMessageId: envio.messageId ?? null,
      statusEntrega: envio.messageId ? "enviada" : null,
    });
  }

  for (const [i, midia] of midias.entries()) {
    if (i > 0 || texto) await deps.esperar();
    const envio = await deps.enviarMidia({ ...destino, tipo: midia.tipo, url: midia.url });
    await deps.registrarResultado(canal.instancia.id, envio.enviado);
    // Falha numa foto não desfaz o que já saiu; as seguintes também não vão
    // (o número pode estar caindo, e insistir é o que o disjuntor evita).
    if (!envio.enviado) {
      console.warn("[central] mídia ao cliente não saiu:", envio.motivo);
      break;
    }
    enviados++;
    await deps.gravar({
      conversaId: canal.conversa.id,
      remetente: "corretor",
      conteudo: `📎 ${midia.titulo}: ${midia.url}`,
      tipo: "imagem",
      midiaUrl: midia.url,
      conversaLiberada: true,
      providerMessageId: envio.messageId ?? null,
      statusEntrega: envio.messageId ? "enviada" : null,
    });
  }

  if (enviados === 0) return { ok: false, erro: "Não consegui mandar pelo seu WhatsApp agora. Tente de novo em instantes.", montado: true };
  await registrarInteracao(supabase, {
    leadId: p.leadId,
    corretorId: p.corretorId,
    tipo: "sistema",
    conteudo: `${p.registro} pelo número central (WhatsApp do corretor).`,
    detalhes: { origem: ORIGEM, enviados, total },
  });
  return { ok: true, lead: pode.lead, enviados, total };
}

/**
 * O "desfaz" de uma seleção ou proposta criada pelo central (spec 4.6): a
 * página para de abrir, se o cliente ainda não a abriu. Vista, ela já fez o
 * efeito, e tirá-la da mão dele seria pior. A mensagem que saiu não volta.
 */
export async function desativarLinkNaoAberto(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; token: string },
  agora: Date = new Date(),
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data } = await supabase
    .from("links_do_cliente")
    .update({ expira_em: agora.toISOString() })
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("token", p.token)
    .is("aberto_em", null)
    .select("token");
  if (data && data.length > 0) return { ok: true };
  const { data: link } = await supabase
    .from("links_do_cliente")
    .select("aberto_em")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("token", p.token)
    .maybeSingle();
  if (link?.aberto_em) return { ok: false, erro: "O cliente já abriu a página: ela fica como está." };
  return { ok: false, erro: "Não achei mais essa página." };
}
