"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { slugLivre } from "@/lib/imoveis/slugDeImovel";
import type { StatusObra, TipoImovel } from "@/lib/types";

export interface NovoImovelInput {
  nome: string;
  bairro: string;
  cidade: string;
  construtora: string;
  status: StatusObra;
  tipo: TipoImovel;
  /** Quando veio da fila de cadastro — fecha o ciclo do candidato. */
  candidatoId?: string;
}

export type ResultadoNovoImovel = { ok: true; slug: string } | { ok?: false; erro: string };

/**
 * Cria o cadastro mínimo de um imóvel e devolve o slug para a tela abrir o
 * editor.
 *
 * ## Por que "mínimo"
 *
 * Tudo o que faz um imóvel vender — foto, planta, tipologia, descrição,
 * lazer, mapa — já tem editor pronto em `/corretor/imoveis/[slug]`. Um
 * formulário grande aqui seria uma segunda tela para as mesmas coisas, e
 * duas telas para o mesmo dado divergem. Este formulário só pede o que a
 * tabela EXIGE (nome, bairro, cidade) mais o que decide como o imóvel é
 * lido pela assistente (status e tipo), e entrega o resto ao editor.
 *
 * ## Nasce despublicado, e isso é decisão
 *
 * `publicado` fica em `false` (o default da coluna). Imóvel sem foto e sem
 * ficha na vitrine é pior que imóvel nenhum — e a assistente inventaria
 * metragem em cima de uma ficha vazia, que é o defeito que a MEMORIA
 * registra desde agosto. Quem publica é o corretor, no editor, quando o
 * cadastro estiver de pé. A policy da 0081 é o que permite ele enxergar o
 * rascunho até lá.
 */
export async function criarImovel(entrada: NovoImovelInput): Promise<ResultadoNovoImovel> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const nome = entrada.nome.trim();
  const bairro = entrada.bairro.trim();
  const cidade = entrada.cidade.trim();

  if (!nome) return { erro: "O nome do imóvel é obrigatório." };
  if (!bairro) return { erro: "O bairro é obrigatório — é por ele que o cliente procura." };
  if (!cidade) return { erro: "A cidade é obrigatória." };

  const supabase = await createClient();

  /*
   * Os slugs ocupados vêm numa consulta só, de uma coluna. O `slugLivre`
   * decide a forma; a unicidade de verdade é do índice do banco — se duas
   * abas criarem o mesmo nome no mesmo instante, a segunda leva erro em vez
   * de sobrescrever a primeira.
   */
  const { data: existentes } = await supabase.from("empreendimentos").select("slug");
  const slug = slugLivre(nome, new Set((existentes ?? []).map((e) => e.slug)));

  const { data: criado, error } = await supabase
    .from("empreendimentos")
    .insert({
      nome,
      slug,
      bairro,
      cidade,
      construtora: entrada.construtora.trim() || null,
      status: entrada.status,
      tipo: entrada.tipo,
      publicado: false,
    })
    .select("id, slug")
    .single();

  if (error || !criado) {
    console.error("[novo imóvel] falha ao inserir:", error?.message);
    if (error?.code === "23505") {
      return { erro: "Já existe um imóvel com esse endereço. Ajuste o nome e tente de novo." };
    }
    return { erro: "Não foi possível criar o imóvel. Tente de novo." };
  }

  /*
   * Fecha o ciclo do candidato: é o que permite responder, depois, "o que
   * desta fila já virou imóvel?". Falhar aqui não desfaz o cadastro — o
   * imóvel existe, e o vínculo é conveniência de auditoria; devolver erro
   * faria o corretor tentar criar de novo e duplicar o que deu certo.
   */
  if (entrada.candidatoId) {
    const { error: erroVinculo } = await supabase
      .from("catalogo_candidatos")
      .update({
        decisao: "cadastrar",
        empreendimento_id: criado.id,
        decidido_em: new Date().toISOString(),
        motivo: "cadastrado pelo painel",
      })
      .eq("id", entrada.candidatoId);

    if (erroVinculo) console.error("[novo imóvel] falha ao vincular candidato:", erroVinculo.message);
  }

  revalidatePath("/corretor/imoveis");
  revalidatePath("/corretor/imoveis/candidatos");
  return { ok: true, slug: criado.slug };
}
