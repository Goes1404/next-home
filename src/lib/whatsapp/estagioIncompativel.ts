import { STATUS_LABEL, type Empreendimento } from "@/lib/types";
import { normalizar } from "./normalizarFala";

/**
 * O cliente quer PRONTO PARA MORAR e o imóvel da conversa não é.
 *
 * Medido no anúncio do Dom Parque (02/10/2026): a cliente respondeu "Pronto
 * pra morar" a um anúncio de lançamento com entrega em 2030, e a IA seguiu
 * com "imóvel pronto para morar já te dá a vantagem de entrar rapidinho" —
 * falando do Dom Parque, que não é pronto. A cliente marcou visita para um
 * imóvel que não serve para ela e desmarcou no dia.
 *
 * O planner não enxerga isso: para ele, "pronto" é só a resposta da
 * pergunta de estágio. Quem sabe que a resposta CONTRADIZ o imóvel em foco é
 * o catálogo, e por isso a decisão mora aqui, em código, e não numa regra de
 * prompt.
 *
 * Só "quer pronto e o foco não é" vira bloco. O contrário (quer na planta, o
 * foco é pronto) não engana ninguém: pronto serve para quem pode esperar.
 *
 * Módulo puro.
 */

export type EstagioPedido = "pronto" | "planta";

const INDIFERENTE = /\b(tanto faz|qualquer um|indiferente|os dois|ambos)\b/;
const NEGA_PRONTO = /\bnao\b[^.!?]{0,15}\bpronto/;
/*
 * "pronto" sozinho também é interjeição ("pronto, pode ser"). Por isso a
 * palavra solta só vale como resposta logo depois de a IA perguntar o
 * estágio; fora disso, só as formas que não deixam dúvida.
 */
const PEDE_PRONTO_CLARO =
  /\b(prontos? (pra|para) (morar|mudar)|(imovel|apartamento|ap|casa|unidade) pronto|ja pronto|entrega imediata|pra (ja|agora) (morar|mudar)|mudar (logo|ja|agora)|ja (construido|entregue))\b/;
const PRONTO_SOLTO = /\bprontos?\b/;
const PEDE_PLANTA = /\b(na planta|lancamento|em obra|construcao)\b/;

/** O estágio que a fala pede, ou nada quando ela não decide. */
export function estagioPedidoNaFala(texto: string, perguntouEstagio = false): EstagioPedido | null {
  const t = normalizar(texto);
  if (INDIFERENTE.test(t)) return null;
  const pronto =
    (PEDE_PRONTO_CLARO.test(t) || (perguntouEstagio && PRONTO_SOLTO.test(t))) && !NEGA_PRONTO.test(t);
  const planta = PEDE_PLANTA.test(t);
  if (pronto && !planta) return "pronto";
  if (planta && !pronto) return "planta";
  return null;
}

function anoDaEntrega(entrega: string | null): string | null {
  const m = entrega?.match(/^(\d{4})/);
  return m ? m[1] : null;
}

/**
 * O imóvel pronto para oferecer no lugar: mesma cidade primeiro, depois o
 * que cabe no teto (quando se sabe), depois o preço mais perto do foco. Um
 * só — lista é o desfile que a v18 matou.
 */
export function prontoMaisParecido(
  foco: Empreendimento,
  catalogo: readonly Empreendimento[],
  teto: number | null,
): Empreendimento | null {
  const prontos = catalogo.filter(
    (e) => e.slug !== foco.slug && e.status === "pronto_para_morar" && e.publicado !== false,
  );
  if (prontos.length === 0) return null;
  const nota = (e: Empreendimento) =>
    (e.cidade === foco.cidade ? 0 : 1000) +
    (teto && e.precoAPartir && e.precoAPartir > teto ? 100 : 0) +
    (foco.precoAPartir && e.precoAPartir ? Math.abs(e.precoAPartir - foco.precoAPartir) / 1_000_000 : 50);
  return [...prontos].sort((a, b) => nota(a) - nota(b))[0];
}

export function estagioIncompativel(params: {
  falaDaVez: string;
  foco: Empreendimento | null;
  catalogo: readonly Empreendimento[];
  teto?: number | null;
  /** A última fala da IA perguntou "pronto ou na planta?". */
  perguntouEstagio?: boolean;
}): { bloco: string; alternativa: Empreendimento | null } | null {
  const { foco } = params;
  if (!foco || foco.status === "pronto_para_morar") return null;
  if (estagioPedidoNaFala(params.falaDaVez, params.perguntouEstagio) !== "pronto") return null;

  const alternativa = prontoMaisParecido(foco, params.catalogo, params.teto ?? null);
  const ano = anoDaEntrega(foco.entregaPrevista);
  const estagio = STATUS_LABEL[foco.status].toLowerCase();

  const linhas = [
    `ESTÁGIO DO IMÓVEL (isto vem antes da tarefa acima): o cliente quer imóvel PRONTO PARA MORAR, e o ${foco.nome} é ${estagio}${ano ? `, com entrega prevista para ${ano}` : ""}.`,
    `Diga isso com clareza, numa frase curta. NÃO fale da vantagem de imóvel pronto como se fosse o ${foco.nome}: ele não é pronto, e o cliente descobriria na visita.`,
    alternativa
      ? `Em seguida ofereça UM imóvel pronto: o ${alternativa.nome} (${alternativa.bairro}, ${alternativa.cidade}), e pergunte se ele quer conhecer.`
      : "Não há outro imóvel pronto no catálogo agora: pergunte se ele consideraria esperar a obra, ou diga que o corretor busca uma opção pronta para ele.",
  ];
  return { bloco: linhas.join("\n"), alternativa };
}
