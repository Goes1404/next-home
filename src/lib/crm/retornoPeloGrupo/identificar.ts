// Quem falou no grupo do corretor e de qual lead é o relato (spec 6.3 a 6.5).
//
// Puro: sem banco, sem rede. Quem chama (o webhook e a rotina do retorno) lê
// do banco o que está aguardando, as confirmações e as perguntas já feitas, e
// passa aqui. Em dúvida, nunca se adivinha o lead: pergunta (ou ignora).

import { mesmoNumero, numeroDoJid } from "@/lib/whatsapp/participantesDoGrupo";

type Obj = Record<string, unknown>;

function ehObjeto(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoNaoVazio(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// Leitura do payload da Evolution
// ---------------------------------------------------------------------------

export type MensagemDoGrupo = {
  grupoJid: string;
  mensagemId: string;
  /** Todo identificador de quem falou que o payload trouxe (com o sufixo). */
  autorIds: string[];
  texto: string;
  ehAudio: boolean;
  /** Id da mensagem que o corretor citou ao responder, se citou. */
  citadaId: string | null;
  enviadaEm: Date;
};

/**
 * Onde a Evolution/Baileys pode pôr quem falou num grupo. Varia por versão e
 * conforme o WhatsApp entrega o número ou só o `@lid`; por isso lemos todos.
 */
function idsDeAutor(data: Obj, key: Obj): string[] {
  const candidatos = [
    key.participant,
    key.participantAlt,
    key.participantPn,
    data.participant,
    data.senderPn,
    key.senderPn,
  ];
  const vistos = new Set<string>();
  for (const c of candidatos) {
    const t = textoNaoVazio(c);
    if (t) vistos.add(t);
  }
  return [...vistos];
}

/**
 * A Evolution v2 copia o `contextInfo` para `data.contextInfo`, mas nem toda
 * versão faz isso; o original mora dentro do tipo da mensagem.
 */
function citacaoDaMensagem(data: Obj, mensagem: Obj): string | null {
  const contextos: unknown[] = [data.contextInfo, mensagem.contextInfo];
  for (const valor of Object.values(mensagem)) {
    if (ehObjeto(valor)) contextos.push(valor.contextInfo);
  }
  for (const ctx of contextos) {
    if (ehObjeto(ctx)) {
      const id = textoNaoVazio(ctx.stanzaId);
      if (id) return id;
    }
  }
  return null;
}

function dataDoPayload(valor: unknown): Date {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  if (!Number.isFinite(n) || n <= 0) return new Date();
  // Baileys manda segundos; aceita milissegundos por segurança.
  return new Date(n > 1e12 ? n : n * 1000);
}

/**
 * Mensagem de texto ou áudio de um grupo, recebida de outra pessoa. `null`
 * para o que não interessa: conversa individual, mensagem da própria central
 * (`fromMe`: as confirmações que ela mesma manda), sem id ou sem texto/áudio.
 */
export function lerMensagemDoGrupo(payload: unknown): MensagemDoGrupo | null {
  if (!ehObjeto(payload) || !ehObjeto(payload.data)) return null;
  const data = payload.data;
  const key = ehObjeto(data.key) ? data.key : null;
  if (!key) return null;

  const grupoJid = textoNaoVazio(key.remoteJid);
  if (!grupoJid || !/@g\.us$/i.test(grupoJid)) return null;
  if (key.fromMe === true) return null;

  const mensagemId = textoNaoVazio(key.id);
  if (!mensagemId) return null;

  const mensagem = ehObjeto(data.message) ? data.message : null;
  if (!mensagem) return null;

  const extendida = ehObjeto(mensagem.extendedTextMessage) ? mensagem.extendedTextMessage : null;
  const texto = textoNaoVazio(mensagem.conversation) ?? textoNaoVazio(extendida?.text) ?? "";
  const ehAudio = ehObjeto(mensagem.audioMessage);
  if (!texto && !ehAudio) return null;

  return {
    grupoJid,
    mensagemId,
    autorIds: idsDeAutor(data, key),
    texto,
    ehAudio,
    citadaId: citacaoDaMensagem(data, mensagem),
    enviadaEm: dataDoPayload(data.messageTimestamp),
  };
}

// ---------------------------------------------------------------------------
// Quem falou (spec 6.4)
// ---------------------------------------------------------------------------

/**
 * O autor é o corretor dono do grupo? Gestores também estão no grupo, então
 * só o número do corretor (com e sem 55 e 9) ou o `@lid` guardado dele valem.
 * Sem nenhum id, ou com ids de outras pessoas, é `false`.
 */
export function reconhecerAutorNoGrupo(
  autorIds: string[],
  corretor: { whatsapp: string; whatsapp_lid: string | null },
): boolean {
  const lid = corretor.whatsapp_lid?.trim().toLowerCase() || null;
  return autorIds.some((id) => {
    if (lid && id.trim().toLowerCase() === lid) return true;
    const numero = numeroDoJid(id);
    return numero !== null && mesmoNumero(numero, corretor.whatsapp);
  });
}

// ---------------------------------------------------------------------------
// De qual lead é o relato (spec 6.3 e 6.5)
// ---------------------------------------------------------------------------

export type Aguardando = {
  envioId: string;
  leadId: string;
  nome: string | null;
  /** Id da mensagem do aviso no grupo (o que o corretor cita ao responder). */
  avisoMensagemId: string | null;
  corretorAtualId: string;
};

export type DecisaoDoRetorno =
  | { tipo: "lead"; leadId: string; envioId: string | null }
  | { tipo: "correcao"; retornoId: string; leadId: string }
  | { tipo: "escolha"; retornoId: string; indice: number }
  | { tipo: "perguntar"; opcoes: Aguardando[] }
  | { tipo: "nao_e_mais_seu"; leadId: string }
  | { tipo: "nenhum" };

/** Minúsculas, sem acento, espaços colapsados; pontuação vira espaço. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "1", "1)", "opção 1", " 2 " → índice 0-based; `null` se não for uma escolha. */
function indiceEscolhido(texto: string): number | null {
  const achou = /^(?:opcao\s+)?(\d{1,2})$/.exec(normalizar(texto));
  return achou ? Number(achou[1]) - 1 : null;
}

/** O primeiro nome (ou o nome inteiro) do lead aparece como palavra inteira no texto? */
function citaONome(textoNormalizado: string, nome: string | null): boolean {
  if (!nome) return false;
  const completo = normalizar(nome);
  const primeiro = completo.split(" ")[0];
  const noTexto = ` ${textoNormalizado} `;
  const alvos = new Set([completo, primeiro].filter((n) => n.length >= 2));
  return [...alvos].some((alvo) => noTexto.includes(` ${alvo} `));
}

export function escolherLeadDoRetorno(p: {
  corretorId: string;
  citadaId: string | null;
  texto: string;
  aguardando: Aguardando[];
  confirmacoes: Array<{ retornoId: string; mensagemId: string; leadId: string }>;
  perguntas: Array<{ retornoId: string; mensagemId: string; opcoes: string[] }>;
}): DecisaoDoRetorno {
  if (p.citadaId) {
    // 1. Em cima de um aviso: o lead daquele aviso, se ainda for do autor.
    const aviso = p.aguardando.find((a) => a.avisoMensagemId === p.citadaId);
    if (aviso) {
      return aviso.corretorAtualId === p.corretorId
        ? { tipo: "lead", leadId: aviso.leadId, envioId: aviso.envioId }
        : { tipo: "nao_e_mais_seu", leadId: aviso.leadId };
    }

    // 2. Em cima de uma confirmação: correção do mesmo lead.
    const confirmacao = p.confirmacoes.find((c) => c.mensagemId === p.citadaId);
    if (confirmacao) {
      return { tipo: "correcao", retornoId: confirmacao.retornoId, leadId: confirmacao.leadId };
    }

    // 5. Em cima da pergunta "Esse retorno é sobre: 1) 2)": a resposta escolhe.
    const pergunta = p.perguntas.find((q) => q.mensagemId === p.citadaId);
    if (pergunta) {
      const indice = indiceEscolhido(p.texto);
      if (indice !== null) {
        if (indice >= 0 && indice < pergunta.opcoes.length) {
          return { tipo: "escolha", retornoId: pergunta.retornoId, indice };
        }
        // Número que não está na lista: pergunta de novo, mesmas opções.
        const opcoes = pergunta.opcoes
          .map((id) => p.aguardando.find((a) => a.leadId === id))
          .filter((a): a is Aguardando => a !== undefined);
        return opcoes.length > 0 ? { tipo: "perguntar", opcoes } : { tipo: "nenhum" };
      }
      // Citou a pergunta mas escreveu outra coisa: segue pelas regras comuns.
    }
  }

  // Sem citação útil: só contam os leads que ainda são do autor.
  const dele = p.aguardando.filter((a) => a.corretorAtualId === p.corretorId);
  if (dele.length === 0) return { tipo: "nenhum" };

  // 3. Um só aguardando.
  if (dele.length === 1) return { tipo: "lead", leadId: dele[0].leadId, envioId: dele[0].envioId };

  // 4. Vários: o nome do cliente no relato, se aparecer um só.
  const texto = normalizar(p.texto);
  const citados = dele.filter((a) => citaONome(texto, a.nome));
  if (citados.length === 1) return { tipo: "lead", leadId: citados[0].leadId, envioId: citados[0].envioId };

  // 5. Ambíguo: pergunta, nunca adivinha.
  return { tipo: "perguntar", opcoes: dele };
}
