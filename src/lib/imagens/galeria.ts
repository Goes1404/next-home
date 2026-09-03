import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  TETO_DIARIO,
  inicioDoDiaEmSaoPaulo,
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
    criadaEm: l.created_at,
  };
}

/** As minhas, mais recentes primeiro. O recorte por corretor é da RLS. */
export async function getMinhasImagens(): Promise<ImagemGerada[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .select("id, prompt, url, largura, altura, referencia_url, created_at")
    .order("created_at", { ascending: false })
    .limit(POR_PAGINA)
    .returns<Linha[]>();

  // Devolver lista vazia num erro faria "a consulta falhou" parecer "você
  // ainda não criou nada" — a mesma armadilha que a lista de leads evita.
  if (error) throw new Error(`Falha ao carregar as imagens: ${error.message}`);
  return (data ?? []).map(paraImagem);
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
      latencia_ms: dados.latenciaMs,
    })
    .select("id, prompt, url, largura, altura, referencia_url, created_at")
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
