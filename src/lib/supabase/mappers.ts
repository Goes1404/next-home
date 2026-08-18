import type { Empreendimento, Midia, Tipologia } from "@/lib/types";
import type { Tables } from "./types";

/**
 * Formato de linha retornado pela query com embeds do PostgREST — os nomes
 * dos relacionamentos aninhados (`corretor`, `lazer`) vêm do alias definido
 * em `SELECT_EMPREENDIMENTO` (queries.ts), não do nome da tabela.
 */
export type LinhaEmpreendimento = Tables<"empreendimentos"> & {
  corretor: Tables<"corretores"> | null;
  tipologias: Tables<"tipologias">[];
  midias: Tables<"midias">[];
  lazer: Array<{ lazer_itens: Tables<"lazer_itens"> | null }>;
};

function mapTipologia(t: Tables<"tipologias">): Tipologia {
  return {
    nome: t.nome,
    areaPrivativa: t.area_privativa,
    dormitorios: t.dormitorios,
    suites: t.suites,
    banheiros: t.banheiros,
    vagas: t.vagas,
    preco: t.preco,
    plantaUrl: t.planta_url,
    unidadesDisponiveis: t.unidades_disponiveis,
  };
}

function mapMidia(m: Tables<"midias">): Midia {
  return {
    tipo: m.tipo,
    url: m.url,
    alt: m.alt ?? "",
    largura: m.largura ?? 0,
    altura: m.altura ?? 0,
    blurDataUrl: m.blur_data_url,
  };
}

/** Placeholder até haver um corretor cadastrado — evita a UI quebrar por dado ausente. */
const CORRETOR_INDEFINIDO = {
  nome: "Equipe Next Home",
  creci: "044589-J",
  whatsapp: "5511972207204",
  fotoUrl: null,
  videoUrl: null,
  fundoTipo: "video" as const,
  fundoFotoUrl: null,
};

const CAPA_PADRAO: Midia = {
  tipo: "foto",
  url: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/logo-original.png",
  alt: "",
  largura: 257,
  altura: 107,
  blurDataUrl: null,
};

export function mapEmpreendimento(row: LinhaEmpreendimento): Empreendimento {
  const midias = [...row.midias].sort((a, b) => a.ordem - b.ordem).map(mapMidia);
  // A galeria é só de fotos: plantas têm proporção e leitura próprias, e
  // vídeo/tour360 nem sequer renderizam num <Image>.
  const fotos = midias.filter((m) => m.tipo === "foto");

  return {
    slug: row.slug,
    nome: row.nome,
    tagline: row.tagline ?? "",
    descricao: row.descricao ?? "",
    status: row.status,
    tipo: row.tipo,
    finalidade: row.finalidade,
    cidade: row.cidade,
    bairro: row.bairro,
    endereco: row.endereco ?? "",
    precoAPartir: row.preco_a_partir,
    iptu: row.iptu,
    condominioValor: row.condominio_valor,
    construtora: row.construtora,
    totalUnidades: row.total_unidades,
    totalTorres: row.total_torres,
    totalAndares: row.total_andares,
    entregaPrevista: row.entrega_prevista,
    destaque: row.destaque,
    lat: row.lat,
    lng: row.lng,
    criadoEm: row.created_at,
    capa: fotos[0] ?? { ...CAPA_PADRAO, alt: row.nome },
    galeria: fotos,
    plantas: midias.filter((m) => m.tipo === "planta"),
    tipologias: [...row.tipologias].sort((a, b) => a.ordem - b.ordem).map(mapTipologia),
    lazer: row.lazer.map((l) => l.lazer_itens?.nome).filter((n): n is string => !!n),
    corretor: row.corretor
      ? {
          nome: row.corretor.nome,
          creci: row.corretor.creci,
          whatsapp: row.corretor.whatsapp,
          fotoUrl: row.corretor.foto_url,
          videoUrl: row.corretor.video_url,
          fundoTipo: "video" as const,
          fundoFotoUrl: null,
        }
      : CORRETOR_INDEFINIDO,
  };
}
