/**
 * Regenera `eval/fixtures/catalogo.json` a partir do catálogo PUBLICADO.
 *
 * Rode com `npm run eval:fixture`.
 *
 * ## Por que isto existe
 *
 * O fixture era um catálogo de brinquedo: três imóveis inventados e **zero
 * fotos**. Isso torna intestável metade do que o eval de conversa existe
 * para medir — loop de mídia, anexo repetido, "manda a planta" — porque não
 * há mídia para pedir. E leva a acusações injustas: numa rodada, a persona
 * elogiava um imóvel que o fixture não continha, a IA respondeu certo
 * (regra 23: não é nosso, pergunte o que agradou) e o juiz a reprovou.
 *
 * O eval mede o que o cliente encontra. Se o catálogo do teste não parece
 * com o de produção, o teste não parece com o atendimento.
 *
 * ## O que ele NÃO traz, de propósito
 *
 * Nada de `preco_a_partir` vai para o prompt de qualquer forma (a IA não
 * fala valores), mas o campo fica porque `filtrarPorOrcamento` e o ranking
 * o usam. Não há dado de cliente aqui: só imóvel publicado, que é
 * informação pública do site.
 *
 * Usa a chave PUBLICÁVEL e lê só o que a RLS já expõe ao visitante — o
 * fixture não pode depender de service key, senão ninguém consegue
 * regenerá-lo sem credencial de administrador.
 */

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !chave) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no ambiente.",
  );
  process.exit(1);
}

/** Quantos imóveis o fixture guarda. O prompt mostra no máximo 10. */
const QUANTOS = 10;
/** Fotos por imóvel — o bastante para exercitar o dedupe de mídia. */
const FOTOS = 5;

type LinhaMidia = { url: string; tipo: string; alt: string | null; ordem: number | null };

async function principal() {
  const supabase = createClient(url!, chave!);

  const { data: empreendimentos, error } = await supabase
    .from("empreendimentos")
    .select(
      "id, nome, slug, nomes_alternativos, tagline, descricao, bairro, cidade, status, tipo, finalidade, preco_a_partir, construtora, lat, lng",
    )
    .eq("publicado", true)
    .limit(QUANTOS);

  if (error || !empreendimentos) {
    console.error("Falha ao ler o catálogo:", error?.message);
    process.exit(1);
  }

  const catalogo = [];
  for (const e of empreendimentos) {
    const [{ data: midias }, { data: tipologias }] = await Promise.all([
      supabase.from("midias").select("url, tipo, alt, ordem").eq("empreendimento_id", e.id),
      supabase
        .from("tipologias")
        .select("nome, area_privativa, dormitorios, suites, banheiros, vagas, planta_url, unidades_disponiveis")
        .eq("empreendimento_id", e.id),
    ]);

    const porTipo = (tipo: string) =>
      ((midias ?? []) as LinhaMidia[])
        .filter((m) => m.tipo === tipo)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((m) => ({ url: m.url, tipo: m.tipo, alt: m.alt ?? "" }));

    const fotos = porTipo("foto").slice(0, FOTOS);

    catalogo.push({
      nome: e.nome,
      slug: e.slug,
      nomesAlternativos: e.nomes_alternativos ?? [],
      tagline: e.tagline,
      descricao: (e.descricao ?? "").slice(0, 200),
      bairro: e.bairro,
      cidade: e.cidade,
      status: e.status,
      tipo: e.tipo,
      finalidade: e.finalidade,
      precoAPartir: e.preco_a_partir,
      construtora: e.construtora,
      lat: e.lat,
      lng: e.lng,
      capa: fotos[0] ?? null,
      midias: fotos,
      plantas: porTipo("planta").slice(0, 2),
      videos: [],
      tours360: [],
      lazer: [],
      tipologias: (tipologias ?? []).map((t) => ({
        nome: t.nome,
        areaPrivativa: t.area_privativa,
        dormitorios: t.dormitorios,
        suites: t.suites,
        banheiros: t.banheiros,
        vagas: t.vagas,
        preco: null,
        plantaUrl: t.planta_url,
        unidadesDisponiveis: t.unidades_disponiveis,
      })),
    });
  }

  writeFileSync("eval/fixtures/catalogo.json", JSON.stringify(catalogo, null, 2) + "\n", "utf8");

  const comFoto = catalogo.filter((e) => e.midias.length > 0).length;
  const comPlanta = catalogo.filter((e) => e.plantas.length > 0).length;
  console.log(
    `eval/fixtures/catalogo.json: ${catalogo.length} imóveis · ${comFoto} com foto · ${comPlanta} com planta`,
  );
  console.log(catalogo.map((e) => `  - ${e.nome} (${e.bairro})`).join("\n"));
}

principal();
