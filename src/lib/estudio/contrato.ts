import type { ChaveCanal, ChaveObjetivo } from "@/lib/imagens/marketing";

/**
 * O contrato do Estúdio — o que uma mensagem do chat pode carregar.
 *
 * Módulo PURO, sem I/O e sem `server-only`: a tela cliente lê estes tipos para
 * desenhar chips, propostas e o botão "Gerar assim". Constante compartilhada
 * entre servidor e cliente mora em módulo sem dependência nativa (lição do
 * `limitesPdf.ts` e do `pessoasTipos.ts`).
 *
 * ## Por que validar aqui, e não confiar no jsonb
 *
 * `estudio_mensagens.dados` é só transporte. O que a IA devolve passa por um
 * contrato JSON que às vezes vem torto (modelo que embrulha em cerca de
 * código, campo faltando, alternativa vazia). Resposta fora do contrato vira
 * DEGRADAÇÃO — a IA diz que não conseguiu e oferece seguir com o texto do
 * corretor —, nunca texto cru na tela.
 */

export type TipoEstudio = "arte" | "video";

/** Uma pergunta de refinamento, com alternativas tocáveis. */
export type PerguntaDoEstudio = {
  tipo: "pergunta";
  /** Chave estável para casar a escolha com a pergunta. */
  id: string;
  texto: string;
  /** De 2 a 4. Alternativa é o que faz alguém responder num toque. */
  alternativas: string[];
};

/** O que a IA propõe gerar. Legível — o corretor lê ISTO, não o inglês. */
export type PropostaDeArte = {
  tipo: "proposta";
  modo: "arte";
  /** O pedido em inglês que vai para o provedor (antes da espinha e da cláusula). */
  promptEn: string;
  /** Por que cada escolha está ali — o que ensina a pedir melhor. */
  explicacaoPt: string;
  receita: string;
  tamanho: string;
  qualidade: "low" | "medium";
  /** `false` quando o motor caiu e o prompt é o texto do próprio corretor. */
  daIa: boolean;
};

export type PropostaDeVideo = {
  tipo: "proposta";
  modo: "video";
  slug: string;
  imovelNome: string;
  objetivo: ChaveObjetivo;
  canal: ChaveCanal;
  /** Resumo legível do roteiro: "6 planos · 17s · Story 1080×1920". */
  resumo: string;
  /** Um por plano, já em português: "Fachada — sobe revelando a altura, 3s". */
  planos: string[];
  copy: { titulo: string; apoio: string; cta: string };
  /** O que a régua de lei barrou, se barrou. Vazio = pode gerar. */
  problemas: string[];
};

export type PropostaDoEstudio = PropostaDeArte | PropostaDeVideo;

/** A escolha do corretor numa pergunta — gravada na mensagem dele. */
export type EscolhaDoEstudio = {
  tipo: "escolha";
  perguntaId: string;
  pergunta: string;
  escolha: string;
};

/** O resultado de uma geração, na mensagem da IA que o anuncia. */
export type ResultadoDoEstudio = {
  tipo: "resultado";
  modo: TipoEstudio;
  /** Arte: url da peça composta (ou crua). Vídeo: vazio até o render acabar. */
  url: string | null;
};

export type DadosDaMensagem =
  | PerguntaDoEstudio
  | PropostaDoEstudio
  | EscolhaDoEstudio
  | ResultadoDoEstudio;

export type MensagemDoEstudio = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: DadosDaMensagem | null;
  imagemId: string | null;
  videoJobId: string | null;
  createdAt: string;
};

export type ConversaDoEstudio = {
  id: string;
  tipo: TipoEstudio;
  titulo: string;
  atualizadoEm: string;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Lê `dados` do banco de volta para o tipo — recusando o que não tem forma.
 *
 * `null` para o que não bate: uma linha com jsonb torto não pode derrubar a
 * conversa inteira; ela vira mensagem de texto simples.
 */
export function dadosDaMensagem(bruto: unknown): DadosDaMensagem | null {
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;

  switch (d.tipo) {
    case "pergunta": {
      const alternativas = Array.isArray(d.alternativas)
        ? d.alternativas.map(texto).filter(Boolean).slice(0, 4)
        : [];
      if (!texto(d.texto) || alternativas.length < 2) return null;
      return { tipo: "pergunta", id: texto(d.id) || "p0", texto: texto(d.texto), alternativas };
    }
    case "proposta": {
      if (d.modo === "arte") {
        if (!texto(d.promptEn)) return null;
        return {
          tipo: "proposta",
          modo: "arte",
          promptEn: texto(d.promptEn),
          explicacaoPt: texto(d.explicacaoPt),
          receita: texto(d.receita) || "livre",
          tamanho: texto(d.tamanho) || "1024x1024",
          qualidade: d.qualidade === "medium" ? "medium" : "low",
          daIa: d.daIa === true,
        };
      }
      if (d.modo === "video") {
        if (!texto(d.slug)) return null;
        const copy = (d.copy ?? {}) as Record<string, unknown>;
        return {
          tipo: "proposta",
          modo: "video",
          slug: texto(d.slug),
          imovelNome: texto(d.imovelNome),
          objetivo: texto(d.objetivo) as ChaveObjetivo,
          canal: texto(d.canal) as ChaveCanal,
          resumo: texto(d.resumo),
          planos: Array.isArray(d.planos) ? d.planos.map(texto).filter(Boolean) : [],
          copy: { titulo: texto(copy.titulo), apoio: texto(copy.apoio), cta: texto(copy.cta) },
          problemas: Array.isArray(d.problemas) ? d.problemas.map(texto).filter(Boolean) : [],
        };
      }
      return null;
    }
    case "escolha":
      if (!texto(d.escolha)) return null;
      return {
        tipo: "escolha",
        perguntaId: texto(d.perguntaId),
        pergunta: texto(d.pergunta),
        escolha: texto(d.escolha),
      };
    case "resultado":
      return {
        tipo: "resultado",
        modo: d.modo === "video" ? "video" : "arte",
        url: texto(d.url) || null,
      };
    default:
      return null;
  }
}

/** Título curto para a lista lateral, a partir do primeiro pedido. */
export function tituloDaConversa(primeiroPedido: string): string {
  const limpo = primeiroPedido.trim().replace(/\s+/g, " ");
  if (!limpo) return "Nova conversa";
  return limpo.length > 48 ? `${limpo.slice(0, 47).trimEnd()}…` : limpo;
}

/** O corretor disse "pode ir"? Curto e sem acento, para casar com "ok", "Ok!", "pode gerar". */
export function ehConfirmacao(textoDoCorretor: string): boolean {
  const t = textoDoCorretor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return /^(ok|okay|sim|pode|pode gerar|gera|gerar|manda|vai|segue|isso|perfeito|show|fechado|bora|pode ir|assim mesmo|ta bom|tá bom|beleza)[!. ]*$/.test(
    t,
  );
}
