"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { slugLivre } from "@/lib/imoveis/slugDeImovel";
import type { StatusObra, TipoImovel } from "@/lib/types";
import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";
import { lerPaginaDaConstrutora } from "@/lib/imoveis/site/lerPagina";
import { montarRascunhoDeTexto } from "@/lib/imoveis/rascunhoDePdf";

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

export type LeituraParaNovoImovel =
  | {
      ok: true;
      nome: string;
      cidade: string;
      construtora: string;
      status?: StatusObra;
      /** Mais de um quando o site junta região e bairro; o corretor escolhe UM. */
      bairros: string[];
      urlFinal: string;
      /** A IA não respondeu: só o que a página publica para o Google veio. */
      semIa: boolean;
    }
  | { ok: false; erro: string };

/** "Escape Brooklin | Apartamentos Brooklin, SP | Cyrela" → "Escape Brooklin". */
function nomeDoTitulo(titulo: string): string {
  return titulo.split(/\s[|–—-]\s/)[0]?.trim() ?? "";
}

function bairrosDe(...fontes: (string | undefined)[]): string[] {
  const todos = fontes
    .flatMap((f) => (f ?? "").split(/[,/;]| e /))
    .map((b) => b.trim())
    .filter((b) => b.length > 1 && b.length < 60);
  return todos.filter((b, i) => todos.findIndex((o) => o.toLowerCase() === b.toLowerCase()) === i);
}

/**
 * Lê o site da construtora para PRÉ-PREENCHER o formulário de imóvel novo.
 *
 * Não cria nada: devolve nome, cidade, construtora, estágio e os bairros
 * encontrados, e o corretor confere antes de criar. Fotos, plantas e vídeos
 * vêm depois, no importador, com o mesmo link já colado — é lá que existe a
 * curadoria.
 */
export async function lerSiteParaNovoImovel(url: string): Promise<LeituraParaNovoImovel> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const busca = await buscarSeguro(url, {
    tetoBytes: 5 * 1024 * 1024,
    prazoMs: 15_000,
    aceitar: (tipo) => tipo.includes("text/html") || tipo.includes("application/xhtml"),
  });
  if (!busca.ok) {
    return {
      ok: false,
      erro: busca.motivo === "bloqueado" ? `${busca.mensagem} Preencha à mão.` : busca.mensagem,
    };
  }

  const pagina = lerPaginaDaConstrutora(busca.bytes.toString("utf8"), busca.urlFinal);
  if (pagina.montadaPorJs) {
    return {
      ok: false,
      erro: "Esta página é montada pelo navegador depois que abre e chegou quase vazia para mim. Preencha à mão.",
    };
  }

  const dicas = [
    pagina.dicas.nome ? `Nome: ${pagina.dicas.nome}` : "",
    pagina.dicas.endereco ? `Endereço: ${pagina.dicas.endereco}` : "",
    pagina.dicas.bairro ? `Bairro ou região: ${pagina.dicas.bairro}` : "",
    pagina.dicas.cidade ? `Cidade: ${pagina.dicas.cidade}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const leitura = await montarRascunhoDeTexto(pagina.texto.slice(0, 20_000), dicas);
  const r = leitura.ok ? leitura.rascunho : {};

  return {
    ok: true,
    nome: r.nome ?? pagina.dicas.nome ?? nomeDoTitulo(pagina.titulo),
    cidade: r.cidade ?? pagina.dicas.cidade ?? "",
    construtora: r.construtora ?? "",
    status: r.status,
    bairros: bairrosDe(r.bairro, pagina.dicas.bairro),
    urlFinal: busca.urlFinal,
    semIa: !leitura.ok,
  };
}

