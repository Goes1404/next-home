import type { EntradaSimulacao, Simulacao } from "./financiamento";

/**
 * O contrato do consultor — o que uma mensagem do chat pode carregar.
 *
 * Módulo PURO, sem `server-only`: a tela cliente lê estes tipos para desenhar
 * cartão de imóvel, quadro de simulação e o botão de copiar. Constante
 * compartilhada entre servidor e cliente mora em módulo sem dependência
 * nativa (lição do `limitesPdf.ts` e do `pessoasTipos.ts`).
 *
 * ## Por que validar aqui, e não confiar no jsonb
 *
 * `consultor_mensagens.dados` é só transporte. O que a IA devolve às vezes vem
 * torto (cerca de código, campo faltando, alternativa vazia); linha fora do
 * contrato vira mensagem de texto simples, nunca texto cru na tela.
 */

/** Teto de cartões por resposta. Lista é desfile; três é indicação. */
export const MAX_CARTOES = 3;

export type PerguntaDoConsultor = {
  tipo: "pergunta";
  /** Chave estável para casar a escolha com a pergunta. */
  id: string;
  texto: string;
  alternativas: string[];
};

/**
 * O cartão é um RETRATO do que foi indicado, não a ficha viva.
 *
 * Guardar o retrato é o que faz a conversa antiga continuar legível depois
 * que o preço mudar. O que nunca é retrato é o LINK: ele sai do slug e leva
 * sempre à ficha de hoje. A IA jamais escreve URL — link errado leva o
 * corretor a um 404 (a lição do `linkDaPagina`).
 */
export type CartaoDeImovel = {
  slug: string;
  nome: string;
  bairro: string;
  cidade: string;
  /** Rótulo humano do estágio ("Em construção"), nunca o enum cru. */
  situacao: string;
  precoAPartir: number | null;
  /** Uma linha: tipologias e metragens. */
  resumoFicha: string;
  capaUrl: string | null;
};

export type CartoesNaMensagem = { tipo: "cartoes"; itens: CartaoDeImovel[] };

export type SimulacaoNaMensagem = {
  tipo: "simulacao";
  entrada: EntradaSimulacao;
  resultado: Simulacao;
};

/** A resposta reescrita no tom de WhatsApp, pronta para colar. */
export type TextoParaCliente = { tipo: "texto_cliente"; texto: string };

/** A escolha do corretor numa pergunta — gravada na mensagem dele. */
export type EscolhaDoConsultor = {
  tipo: "escolha";
  perguntaId: string;
  pergunta: string;
  escolha: string;
};

export type DadosDoConsultor =
  | PerguntaDoConsultor
  | CartoesNaMensagem
  | SimulacaoNaMensagem
  | TextoParaCliente
  | EscolhaDoConsultor;

export type MensagemDoConsultor = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: DadosDoConsultor | null;
  createdAt: string;
};

export type ConversaDoConsultor = {
  id: string;
  titulo: string;
  atualizadoEm: string;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function lerCartao(bruto: unknown): CartaoDeImovel | null {
  if (!bruto || typeof bruto !== "object") return null;
  const c = bruto as Record<string, unknown>;
  // Sem slug não há link, e cartão sem link é retrato que não leva a lugar
  // nenhum — o corretor teria de procurar o imóvel à mão.
  if (!texto(c.slug)) return null;
  return {
    slug: texto(c.slug),
    nome: texto(c.nome),
    bairro: texto(c.bairro),
    cidade: texto(c.cidade),
    situacao: texto(c.situacao),
    precoAPartir: numero(c.precoAPartir),
    resumoFicha: texto(c.resumoFicha),
    capaUrl: texto(c.capaUrl) || null,
  };
}

/**
 * Lê `dados` do banco de volta para o tipo — recusando o que não tem forma.
 *
 * `null` para o que não bate: uma linha com jsonb torto não pode derrubar a
 * conversa inteira; ela vira mensagem de texto simples.
 */
export function dadosDoConsultor(bruto: unknown): DadosDoConsultor | null {
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
    case "cartoes": {
      const itens = Array.isArray(d.itens)
        ? d.itens
            .map(lerCartao)
            .filter((c): c is CartaoDeImovel => c !== null)
            .slice(0, MAX_CARTOES)
        : [];
      if (itens.length === 0) return null;
      return { tipo: "cartoes", itens };
    }
    case "simulacao": {
      if (!d.entrada || !d.resultado) return null;
      return {
        tipo: "simulacao",
        entrada: d.entrada as EntradaSimulacao,
        resultado: d.resultado as Simulacao,
      };
    }
    case "texto_cliente":
      if (!texto(d.texto)) return null;
      return { tipo: "texto_cliente", texto: texto(d.texto) };
    case "escolha":
      if (!texto(d.escolha)) return null;
      return {
        tipo: "escolha",
        perguntaId: texto(d.perguntaId),
        pergunta: texto(d.pergunta),
        escolha: texto(d.escolha),
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
