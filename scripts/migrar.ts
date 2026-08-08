/**
 * Migração de conteúdo do site legado (Fase 3 do plano).
 *
 * Lê o sitemap.xml da Next Home, extrai cada página de `detalhes-imovel`
 * (decodificando ISO-8859-1 → UTF-8, como o CMS legado serve), converte
 * pro nosso schema, baixa as fotos e sobe no Supabase Storage, geocodifica
 * o endereço e grava tudo no Postgres via Management API.
 *
 * Uso:
 *   npx tsx scripts/migrar.ts --dry-run   # só mostra o que seria gravado
 *   npx tsx scripts/migrar.ts             # migra de verdade
 *
 * Idempotente por `codigo_legado` (upsert) — rodar de novo atualiza em vez
 * de duplicar. Os dois empreendimentos já curados à mão (Eternity Alphaville
 * e Viva RSF) são pulados pelo mesmo motivo: já têm vídeo, textos revisados
 * e tratamento visual que este script não reproduziria.
 */
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

const BASE = "https://www.nexthomeimobiliaria.com.br";
const SUPABASE_URL = "https://prhhrqyubjcafvucirri.supabase.co";
const SUPABASE_REF = "prhhrqyubjcafvucirri";
const BUCKET = "empreendimentos";

const PAT = process.env.SUPABASE_PAT;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!PAT || !SERVICE_ROLE) {
  console.error("Faltam SUPABASE_PAT e/ou SUPABASE_SERVICE_ROLE no ambiente.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

/** SKUs já cadastrados à mão — nunca sobrescrever. */
const PULAR_CODIGOS = new Set(["NE41168", "VCOD-117"]);

// ---------------------------------------------------------------- utils --

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function buscarHtml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ao buscar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, "iso-8859-1");
}

function numero(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  // "Consulte", "Consulte o valor" etc viram string vazia depois da limpeza —
  // e `Number("")` é 0 em JS, não NaN, então precisa do check explícito.
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * O CMS legado grava a Previsão de Entrega em dois formatos diferentes
 * dependendo do imóvel: "04/29" (mês/ano curto) ou "31/06/2026"
 * (dia/mês/ano completo) — não há como saber qual sem contar as partes.
 */
function dataEntrega(texto: string | undefined): string | null {
  if (!texto) return null;
  const partes = texto.trim().split("/");

  if (partes.length === 2) {
    const [mes, anoCurto] = partes;
    const ano = anoCurto.length === 2 ? `20${anoCurto}` : anoCurto;
    return `${ano}-${mes.padStart(2, "0")}-01`;
  }

  if (partes.length === 3) {
    const [, mes, ano] = partes;
    return `${ano}-${mes.padStart(2, "0")}-01`;
  }

  return null;
}

const MAPA_STATUS: Record<string, string> = {
  "lançamento": "lancamento",
  "pré-lançamento": "pre_lancamento",
  "breve lançamento": "breve_lancamento",
  "em construção": "em_construcao",
  "últimas unidades": "ultimas_unidades",
  "pronto para morar": "pronto_para_morar",
  "entrega imediata": "pronto_para_morar",
};

const MAPA_TIPO: Record<string, string> = {
  "apartamento": "apartamento",
  "apartamento alto padrão": "alto_padrao",
  "casa": "casa",
  "terreno": "terreno",
};

type Imovel = {
  url: string;
  codigoLegado: string;
  nome: string;
  tagline: string;
  descricao: string;
  status: string;
  tipo: string;
  finalidade: "lancamento" | "venda";
  cidade: string;
  bairro: string;
  endereco: string;
  precoAPartir: number | null;
  iptu: number | null;
  condominioValor: number | null;
  construtora: string | null;
  totalUnidades: number | null;
  totalAndares: number | null;
  entregaPrevista: string | null;
  areaPrivativa: number | null;
  dormitorios: number;
  suites: number;
  banheiros: number;
  vagas: number;
  lazer: string[];
  fotos: string[];
  plantas: string[];
  corretorNome: string;
  corretorCreci: string;
  corretorWhatsapp: string | null;
  corretorFotoUrl: string | null;
};

// ------------------------------------------------------------- parsing --

function textoLimpo($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

function extrairImovel(html: string, url: string): Imovel | null {
  const $ = cheerio.load(html);

  // Breadcrumb JSON-LD é o sinal mais confiável de tipo/finalidade — é a
  // própria categorização que o site usa no menu.
  let finalidade: "lancamento" | "venda" | null = null;
  let tipoTexto: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw || !raw.includes("BreadcrumbList")) return;
    try {
      const data = JSON.parse(raw);
      const itens: Array<{ name: string }> = data.itemListElement ?? [];
      const secao = itens[1]?.name?.toLowerCase();
      if (secao === "venda") finalidade = "venda";
      else if (secao === "lançamentos") finalidade = "lancamento";
      tipoTexto = itens[2]?.name ?? null;
    } catch {
      /* ignora JSON-LD malformado */
    }
  });
  if (!finalidade || !tipoTexto) return null;

  const tipo = MAPA_TIPO[tipoTexto.toLowerCase()];
  if (!tipo) return null;

  const codigoLegado = $("#cod_referencia_imovelInfo").attr("value")?.trim() ?? "";
  if (!codigoLegado) return null;

  const nome = $("#titulo_imovelInfo").attr("value")?.trim() || textoLimpo($("h1").first());

  const enderecoH2 = $("h2.notranslate").first();
  const endereco = textoLimpo(enderecoH2.find("strong[itemprop=streetAddress]"));
  const locais = enderecoH2.find("b[itemprop=addressLocality]");
  const bairro = textoLimpo(locais.eq(0));
  const cidade = textoLimpo(locais.eq(1)) || bairro;

  const paragrafos = $(".descrEditor p")
    .map((_, p) => textoLimpo($(p)))
    .get()
    .filter(Boolean);
  const descricao = paragrafos.join("\n\n");
  const tagline = (paragrafos[0] ?? "").slice(0, 160);

  // "Perfil: X", "Incorporação: X", "Total de Unidades: X" etc — quase
  // sempre `<li>Rótulo: <b>Valor</b></li>`, mas a seção "Medidas" embrulha
  // em `<mark>`, tornando o `<b>` neto em vez de filho direto do `<li>` —
  // por isso `.find("b")` (qualquer profundidade), não `.children("b")`.
  const infoPorRotulo: Record<string, string> = {};
  $(".list-info li").each((_, li) => {
    const $li = $(li);
    const rotulo = $li.clone().find("b").remove().end().text().replace(":", "").trim();
    const valor = textoLimpo($li.find("b").first());
    if (rotulo) infoPorRotulo[rotulo] = valor;
  });

  const tarja = textoLimpo($(".tarja-personalizada").first())
    .replace(/^\s*/, "")
    .toLowerCase();
  const status =
    MAPA_STATUS[tarja] ?? (finalidade === "lancamento" ? "lancamento" : "pronto_para_morar");

  const precoTexto = textoLimpo($(".box-info-menu .valor .vn"));
  const precoAPartir = numero(precoTexto);

  // IPTU/Condomínio vivem soltos no mesmo <div class="valores">, sem
  // wrapper próprio — regex sobre o texto puro é mais robusto que tentar
  // navegar essa estrutura solta pelo DOM.
  const valoresTexto = textoLimpo($(".box-info-menu .valores"));
  const iptu = numero(valoresTexto.match(/IPTU:\s*R\$\s*([\d.,]+)/i)?.[1]);
  const condominioValor = numero(
    valoresTexto.match(/Condom[ií]nio:\s*R\$\s*([\d.,]+)/i)?.[1],
  );

  const comodo = (classe: string) => numero(textoLimpo($(`.box-comodos .${classe} b`).first()));

  const lazer = $("#alvo-caracteristicas .list-check li")
    .map((_, li) => textoLimpo($(li)))
    .get()
    .filter(Boolean);

  const grande = (src: string) => {
    const hash = src.match(/([a-f0-9]{32})\.(jpe?g|png|webp)/i);
    return hash ? `${BASE}/uploads/imovel/galeria/big-${hash[1]}.${hash[2]}` : new URL(src, BASE).href;
  };
  const fotos = $(".content-midia-fotos img")
    .map((_, img) => grande($(img).attr("src") ?? ""))
    .get()
    .filter((u) => u.includes("/uploads/"));
  const plantas = $(".content-midia-plantas img")
    .map((_, img) => grande($(img).attr("src") ?? ""))
    .get()
    .filter((u) => u.includes("/uploads/"));

  const corretorNome = textoLimpo($(".box-dados-corretor b[itemprop=name]"));
  const corretorCreci =
    $(".box-dados-corretor").text().match(/Creci:\s*(\d+)/)?.[1] ?? "";
  const corretorFone = $(".box-dados-corretor .broker-phone").text().match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/)?.[0];
  const corretorWhatsapp = corretorFone ? `55${corretorFone.replace(/\D/g, "")}` : null;
  const corretorFotoSrc = $(".box-dados-corretor .foto img").attr("src");
  const corretorFotoUrl = corretorFotoSrc ? new URL(corretorFotoSrc, BASE).href : null;

  return {
    url,
    codigoLegado,
    nome,
    tagline,
    descricao,
    status,
    tipo,
    finalidade,
    cidade,
    bairro,
    endereco,
    precoAPartir,
    iptu,
    condominioValor,
    construtora: infoPorRotulo["Incorporação"] ?? null,
    totalUnidades: numero(infoPorRotulo["Total de Unidades"]),
    totalAndares: numero(infoPorRotulo["Nº de Andares"]),
    entregaPrevista: dataEntrega(infoPorRotulo["Previsão de Entrega"]),
    areaPrivativa: numero(infoPorRotulo["Área Privativa"] ?? infoPorRotulo["Área Total"]),
    dormitorios: comodo("sc-dormitorios") ?? 0,
    suites: comodo("sc-suites") ?? 0,
    banheiros: comodo("sc-banheiros") ?? 0,
    vagas: comodo("sc-garagens") ?? 0,
    lazer,
    fotos,
    plantas,
    corretorNome: corretorNome || "Equipe Next Home",
    corretorCreci: corretorCreci || "044589-J",
    corretorWhatsapp,
    corretorFotoUrl,
  };
}

// -------------------------------------------------------- geocodificação --

const cacheGeocode = new Map<string, [number, number] | null>();

async function geocodificar(endereco: string, bairro: string, cidade: string) {
  const chave = `${endereco}|${bairro}|${cidade}`;
  if (cacheGeocode.has(chave)) return cacheGeocode.get(chave)!;

  const q = [endereco, bairro, cidade, "São Paulo", "Brasil"].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: "json",
    limit: "1",
  })}`;

  try {
    const res = await fetch(url, { headers: { "User-Agent": "next-home-migracao/1.0" } });
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const resultado: [number, number] | null = data[0]
      ? [Number(data[0].lat), Number(data[0].lon)]
      : null;
    cacheGeocode.set(chave, resultado);
    // Nominatim pede no máximo 1 req/s.
    await new Promise((r) => setTimeout(r, 1100));
    return resultado;
  } catch {
    cacheGeocode.set(chave, null);
    return null;
  }
}

// -------------------------------------------------------------- storage --

async function subirImagem(
  url: string,
  caminho: string,
): Promise<{ largura: number; altura: number; blurDataUrl: string | null } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    const sharp = (await import("sharp")).default;
    const img = sharp(buf);
    const meta = await img.metadata();

    const blurBuf = await img.clone().resize(12).webp({ quality: 45 }).toBuffer();
    const blurDataUrl = `data:image/webp;base64,${blurBuf.toString("base64")}`;

    const contentType = url.endsWith(".png") ? "image/png" : "image/jpeg";
    const up = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE!,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: buf,
      },
    );
    if (!up.ok) {
      console.warn(`  ! upload falhou (${up.status}): ${caminho}`);
      return null;
    }
    return { largura: meta.width ?? 0, altura: meta.height ?? 0, blurDataUrl };
  } catch (e) {
    console.warn(`  ! erro ao processar imagem ${url}:`, (e as Error).message);
    return null;
  }
}

// ------------------------------------------------------------------- sql --

function sqlString(v: string | null | undefined): string {
  if (v == null) return "null";
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlNum(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "null" : String(v);
}

async function executarSql(query: string): Promise<any> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`SQL falhou: ${JSON.stringify(data)}`);
  return data;
}

// ------------------------------------------------------------------ main --

async function listarUrls(): Promise<string[]> {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("loc")
    .map((_, el) => $(el).text())
    .get()
    .filter((u) => u.includes("/detalhes-imovel/"));
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN — nada será gravado ===\n" : "=== Migração real ===\n");

  const urls = await listarUrls();
  console.log(`${urls.length} imóveis encontrados no sitemap.\n`);

  const imoveis: Imovel[] = [];
  for (const url of urls) {
    try {
      const html = await buscarHtml(url);
      const imovel = extrairImovel(html, url);
      if (!imovel) {
        console.warn(`! não consegui extrair dados de ${url}`);
        continue;
      }
      if (PULAR_CODIGOS.has(imovel.codigoLegado)) {
        console.log(`- ${imovel.codigoLegado} já cadastrado à mão, pulando.`);
        continue;
      }
      imoveis.push(imovel);
      console.log(`✓ ${imovel.codigoLegado} — ${imovel.nome}`);
    } catch (e) {
      console.warn(`! falha em ${url}:`, (e as Error).message);
    }
  }

  console.log(`\n${imoveis.length} imóveis a migrar.\n`);

  if (DRY_RUN) {
    console.log(JSON.stringify(imoveis, null, 2));
    return;
  }

  // Corretores: um cadastro por CRECI, reaproveitado entre imóveis do mesmo
  // corretor em vez de duplicar a cada imóvel.
  const corretoresVistos = new Map<string, string>(); // creci -> id

  let ok = 0;
  let falhas = 0;

  for (const imv of imoveis) {
    try {
      const slugBase = slugify(imv.nome) || slugify(imv.codigoLegado);
      const slug = `${slugBase}-${imv.codigoLegado.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

      let corretorId = corretoresVistos.get(imv.corretorCreci);
      if (!corretorId) {
        let fotoUrl: string | null = null;
        if (imv.corretorFotoUrl) {
          const nomeArquivo = imv.corretorFotoUrl.split("/").pop() ?? "foto.jpg";
          const r = await subirImagem(imv.corretorFotoUrl, `corretores/${nomeArquivo}`);
          if (r) fotoUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/corretores/${nomeArquivo}`;
        }
        const res = await executarSql(`
          insert into corretores (nome, creci, whatsapp, foto_url)
          values (${sqlString(imv.corretorNome)}, ${sqlString(imv.corretorCreci)}, ${sqlString(imv.corretorWhatsapp ?? "5511972207204")}, ${sqlString(fotoUrl)})
          on conflict (creci) do update set nome = excluded.nome
          returning id;
        `);
        corretorId = res[0].id;
        corretoresVistos.set(imv.corretorCreci, corretorId);
      }

      const coords = await geocodificar(imv.endereco, imv.bairro, imv.cidade);

      const empRes = await executarSql(`
        insert into empreendimentos (
          slug, nome, tagline, descricao, status, tipo, finalidade,
          cidade, bairro, endereco, lat, lng, preco_a_partir, iptu, condominio_valor,
          construtora, total_unidades, total_andares, entrega_prevista,
          destaque, ordem, corretor_id, codigo_legado, publicado
        ) values (
          ${sqlString(slug)}, ${sqlString(imv.nome)}, ${sqlString(imv.tagline)}, ${sqlString(imv.descricao)},
          ${sqlString(imv.status)}::status_obra, ${sqlString(imv.tipo)}::tipo_imovel, ${sqlString(imv.finalidade)}::finalidade_imovel,
          ${sqlString(imv.cidade)}, ${sqlString(imv.bairro)}, ${sqlString(imv.endereco)},
          ${sqlNum(coords?.[0] ?? null)}, ${sqlNum(coords?.[1] ?? null)},
          ${sqlNum(imv.precoAPartir)}, ${sqlNum(imv.iptu)}, ${sqlNum(imv.condominioValor)},
          ${sqlString(imv.construtora)}, ${sqlNum(imv.totalUnidades)}, ${sqlNum(imv.totalAndares)},
          ${sqlString(imv.entregaPrevista)}, false, 100, ${sqlString(corretorId)}, ${sqlString(imv.codigoLegado)}, true
        )
        on conflict (codigo_legado) do update set
          nome = excluded.nome, tagline = excluded.tagline, descricao = excluded.descricao,
          status = excluded.status, preco_a_partir = excluded.preco_a_partir,
          iptu = excluded.iptu, condominio_valor = excluded.condominio_valor,
          lat = excluded.lat, lng = excluded.lng, updated_at = now()
        returning id;
      `);
      const empId = empRes[0].id;

      // Limpa mídias/tipologias/lazer antigos deste empreendimento antes de
      // reinserir — mais simples que fazer diff, e o upsert acima já
      // garante que o `id` se mantém estável entre reruns.
      await executarSql(`
        delete from midias where empreendimento_id = ${sqlString(empId)};
        delete from tipologias where empreendimento_id = ${sqlString(empId)};
        delete from empreendimento_lazer where empreendimento_id = ${sqlString(empId)};
      `);

      let ordem = 1;
      for (const fotoUrl of imv.fotos.slice(0, 16)) {
        const hash = fotoUrl.split("/").pop()!;
        const caminho = `${slug}/foto-${ordem}-${hash}`;
        const r = await subirImagem(fotoUrl, caminho);
        if (!r) continue;
        await executarSql(`
          insert into midias (empreendimento_id, tipo, url, alt, largura, altura, blur_data_url, ordem)
          values (${sqlString(empId)}, 'foto'::tipo_midia,
            ${sqlString(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminho}`)},
            ${sqlString(imv.nome)}, ${sqlNum(r.largura)}, ${sqlNum(r.altura)}, ${sqlString(r.blurDataUrl)}, ${ordem});
        `);
        ordem++;
      }

      let plantaUrl: string | null = null;
      for (const url of imv.plantas.slice(0, 4)) {
        const hash = url.split("/").pop()!;
        const caminho = `${slug}/planta-${hash}`;
        const r = await subirImagem(url, caminho);
        if (!r) continue;
        plantaUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminho}`;
        await executarSql(`
          insert into midias (empreendimento_id, tipo, url, alt, largura, altura, blur_data_url, ordem)
          values (${sqlString(empId)}, 'planta'::tipo_midia,
            ${sqlString(plantaUrl)}, ${sqlString(`Planta — ${imv.nome}`)}, ${sqlNum(r.largura)}, ${sqlNum(r.altura)}, ${sqlString(r.blurDataUrl)}, 1);
        `);
      }

      if (imv.dormitorios > 0 || imv.areaPrivativa) {
        await executarSql(`
          insert into tipologias (empreendimento_id, nome, area_privativa, dormitorios, suites, banheiros, vagas, preco, planta_url, ordem)
          values (${sqlString(empId)}, ${sqlString(`${imv.dormitorios || ""} dormitório${imv.dormitorios === 1 ? "" : "s"}`.trim())},
            ${sqlNum(imv.areaPrivativa)}, ${imv.dormitorios}, ${imv.suites}, ${imv.banheiros}, ${imv.vagas},
            ${sqlNum(imv.precoAPartir)}, ${sqlString(plantaUrl)}, 1);
        `);
      }

      for (const nomeLazer of imv.lazer) {
        await executarSql(`
          with item as (
            insert into lazer_itens (nome) values (${sqlString(nomeLazer)})
            on conflict (nome) do update set nome = excluded.nome
            returning id
          )
          insert into empreendimento_lazer (empreendimento_id, lazer_item_id)
          select ${sqlString(empId)}, id from item
          on conflict do nothing;
        `);
      }

      console.log(`✓ gravado: ${imv.nome} (${imv.fotos.length} fotos, ${imv.lazer.length} itens de lazer)`);
      ok++;
    } catch (e) {
      console.error(`✗ falhou: ${imv.codigoLegado} — ${(e as Error).message}`);
      falhas++;
    }
  }

  console.log(`\n${ok} migrados, ${falhas} falharam.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
