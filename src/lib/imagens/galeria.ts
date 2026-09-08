import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  TETO_DIARIO,
  inicioDoDiaEmSaoPaulo,
  type BriefingGravado,
  type EstadoDoTeto,
  type ImagemGerada,
} from "./imagensTipos";

/**
 * A galeria de imagens do corretor — leitura pela sessão, escrita pelo serviço.
 *
 * A assimetria é de propósito e está desenhada na 0090: `authenticated` tem
 * `select` e `delete`, mas NÃO tem `insert`. Quem grava é a rota, com o cliente
 * de serviço, depois de a imagem existir de fato no Storage. Sem isso, alguém
 * poderia forjar uma linha pela API pública dizendo ter gerado o que não gerou
 * — e como o teto diário é contado nesta tabela, forjar linha seria uma forma
 * de zerar a própria conta ou de encher a do vizinho.
 */

const POR_PAGINA = 24;

type Linha = {
  id: string;
  prompt: string;
  url: string;
  largura: number | null;
  altura: number | null;
  referencia_url: string | null;
  arte_url?: string | null;
  briefing?: unknown;
  empreendimento_id?: string | null;
  created_at: string;
};

function paraImagem(l: Linha): ImagemGerada {
  return {
    id: l.id,
    prompt: l.prompt,
    url: l.url,
    largura: l.largura,
    altura: l.altura,
    referenciaUrl: l.referencia_url,
    arteUrl: l.arte_url ?? null,
    briefing: briefingGravado(l.briefing),
    empreendimentoId: l.empreendimento_id ?? null,
    criadaEm: l.created_at,
  };
}

/** As minhas, mais recentes primeiro. O recorte por corretor é da RLS. */
export async function getMinhasImagens(): Promise<ImagemGerada[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .select("id, prompt, url, largura, altura, referencia_url, arte_url, briefing, empreendimento_id, created_at")
    .order("created_at", { ascending: false })
    .limit(POR_PAGINA)
    .returns<Linha[]>();

  // Devolver lista vazia num erro faria "a consulta falhou" parecer "você
  // ainda não criou nada" — a mesma armadilha que a lista de leads evita.
  if (error) throw new Error(`Falha ao carregar as imagens: ${error.message}`);
  return (data ?? []).map(paraImagem);
}

/**
 * As artes de IA de UM imóvel, da mais nova para a mais velha (0101).
 *
 * Recorte por `empreendimento_id`, com a RLS da 0090 ainda por cima: mesmo
 * que dois corretores tenham gerado arte para o mesmo imóvel, cada um vê a
 * sua. É de propósito — a peça é do trabalho de quem a pediu.
 *
 * Isto NÃO é `getMidias`: nada daqui aparece na vitrine pública nem pode ser
 * anexado pela assistente numa conversa. O editor mostra para o corretor
 * saber o que já criou para aquele imóvel.
 */
export async function getArtesDoImovel(empreendimentoId: string): Promise<ImagemGerada[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .select("id, prompt, url, largura, altura, referencia_url, arte_url, briefing, empreendimento_id, created_at")
    .eq("empreendimento_id", empreendimentoId)
    .order("created_at", { ascending: false })
    .limit(POR_PAGINA)
    .returns<Linha[]>();

  // Mesma regra do resto do painel: erro não vira lista vazia, senão "a
  // consulta falhou" se disfarça de "você ainda não criou nada".
  if (error) throw new Error(`Falha ao carregar as artes do imóvel: ${error.message}`);
  return (data ?? []).map(paraImagem);
}

/**
 * A arte mais recente de CADA imóvel de uma lista (0101).
 *
 * Existe para o cartão do catálogo ter o que mostrar enquanto o imóvel não
 * tem foto: imóvel recém-criado nasce sem mídia nenhuma, e um retângulo
 * cinza escrito "sem imagem" numa grade de doze cartões apaga justamente os
 * cadastros que precisam de atenção.
 *
 * Uma consulta só para a página inteira, não uma por cartão — a lista tem
 * dezenas de imóveis, e N+1 numa grade é como uma tela fica lenta sem que
 * nenhuma consulta pareça cara. Sem ids, nem consulta: `in` com lista vazia
 * é um jeito caro de pedir nada.
 */
export async function getArtePorImovel(
  empreendimentoIds: string[],
): Promise<Map<string, string>> {
  if (empreendimentoIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .select("url, arte_url, empreendimento_id, created_at")
    .in("empreendimento_id", empreendimentoIds)
    .order("created_at", { ascending: false })
    .returns<{ url: string; arte_url: string | null; empreendimento_id: string }[]>();

  // Aqui, sim, erro vira mapa vazio: isto é ILUSTRAÇÃO de cartão. Derrubar a
  // lista de imóveis inteira porque a miniatura não carregou trocaria o
  // essencial pelo enfeite — o oposto de `getMinhasImagens`, que é a tela.
  if (error) {
    console.error("[imagens] falha ao buscar arte por imóvel:", error.message);
    return new Map();
  }

  // Já vem da mais nova para a mais velha: a primeira de cada imóvel ganha.
  const porImovel = new Map<string, string>();
  for (const linha of data ?? []) {
    if (!porImovel.has(linha.empreendimento_id)) {
      porImovel.set(linha.empreendimento_id, linha.arte_url ?? linha.url);
    }
  }
  return porImovel;
}

/**
 * Quantas o corretor já gerou HOJE.
 *
 * Conta na própria tabela, no mesmo lugar onde a linha nasce — sem coluna de
 * contador para divergir do fato. O dia é o de São Paulo, não o do servidor:
 * em UTC, às 21h de Brasília o contador viraria e daria um dia de crédito
 * extra toda noite. É a mesma armadilha que já quebrou o calendário do bot.
 */
export async function getTetoDeHoje(corretorId: string): Promise<EstadoDoTeto> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("imagens_geradas")
    .select("id", { count: "exact", head: true })
    .eq("corretor_id", corretorId)
    .gte("created_at", inicioDoDiaEmSaoPaulo());

  if (error) throw new Error(`Falha ao contar as imagens de hoje: ${error.message}`);
  return { usadasHoje: count ?? 0, teto: TETO_DIARIO };
}

export async function registrarImagem(dados: {
  corretorId: string;
  prompt: string;
  modelo: string;
  url: string;
  largura: number | null;
  altura: number | null;
  referenciaUrl: string | null;
  latenciaMs: number;
  arteUrl?: string | null;
  briefing?: BriefingGravado | null;
  /** O imóvel dono da arte (0101). Nulo = peça avulsa da galeria. */
  empreendimentoId?: string | null;
}): Promise<ImagemGerada | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .insert({
      corretor_id: dados.corretorId,
      prompt: dados.prompt,
      modelo: dados.modelo,
      url: dados.url,
      largura: dados.largura,
      altura: dados.altura,
      referencia_url: dados.referenciaUrl,
      arte_url: dados.arteUrl ?? null,
      briefing: dados.briefing ?? null,
      empreendimento_id: dados.empreendimentoId ?? null,
      latencia_ms: dados.latenciaMs,
    })
    .select("id, prompt, url, largura, altura, referencia_url, arte_url, briefing, empreendimento_id, created_at")
    .single<Linha>();

  if (error) {
    // A imagem já está no Storage e já foi paga: perder a linha custa o
    // histórico, não o trabalho. Não derrubar a resposta por causa disso.
    console.error("[imagens] falha ao gravar a linha:", error.message);
    return null;
  }
  return paraImagem(data);
}

/** O dia corrente em São Paulo, como instante ISO para comparar no banco. */

/**
 * O jsonb volta como `unknown` e o que a tela lê precisa ter forma. Linha
 * antiga (sem briefing) e lixo qualquer viram `null`, nunca um objeto meio
 * preenchido.
 */
function briefingGravado(v: unknown): BriefingGravado | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const t = (x: unknown) => (typeof x === "string" ? x : "");
  if (!t(o.objetivo) || !t(o.canal)) return null;
  return {
    objetivo: t(o.objetivo),
    canal: t(o.canal),
    publico: t(o.publico),
    imovelSlug: typeof o.imovelSlug === "string" ? o.imovelSlug : null,
    imovelNome: typeof o.imovelNome === "string" ? o.imovelNome : null,
    titulo: t(o.titulo),
    apoio: t(o.apoio),
    cta: t(o.cta),
  };
}
