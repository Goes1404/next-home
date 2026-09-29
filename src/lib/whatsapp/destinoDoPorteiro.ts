import { mensagemDeAnuncio, mensagemDoSite, type ChaveIntencao } from "./mensagensDoSite";

/**
 * A decisão do porteiro, isolada da rota para ter teste sem rede.
 *
 * O escape é `/contato`, não a página do imóvel: ela não tem formulário, e
 * depois que os botões dela passaram a apontar para o porteiro, mandar o
 * visitante de volta seria pingue-pongue. `/contato` tem formulário, cria
 * lead por `/api/leads` e passa pela roleta.
 */
/** Teto do texto livre: é conteúdo vindo da URL, não do nosso cadastro. */
export const TETO_COMPLEMENTO = 400;

export type DestinoDoPorteiro =
  | { tipo: "whatsapp"; url: string }
  | { tipo: "escape"; caminho: string };

export function destinoDoPorteiro(params: {
  telefone: string | null | undefined;
  nomeImovel: string | null;
  intencao: ChaveIntencao | null;
  /**
   * Texto livre emendado DEPOIS da frase reconhecida (ex.: a simulação do
   * financiamento). Vir depois é o que mantém o reconhecimento: o porteiro
   * casa pelo começo da mensagem.
   */
  complemento?: string | null;
}): DestinoDoPorteiro {
  const telefone = params.telefone?.replace(/\D/g, "") ?? "";
  if (telefone.length < 10) return { tipo: "escape", caminho: "/contato" };

  const base = params.nomeImovel
    ? mensagemDeAnuncio(params.nomeImovel, params.intencao)
    : mensagemDoSite(params.intencao);
  const complemento = params.complemento?.replace(/\s+/g, " ").trim().slice(0, TETO_COMPLEMENTO);
  const texto = complemento ? `${base} ${complemento}` : base;

  return { tipo: "whatsapp", url: `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}` };
}
