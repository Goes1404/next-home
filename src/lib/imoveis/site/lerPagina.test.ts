import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerPaginaDaConstrutora } from "./lerPagina";

/**
 * Páginas REAIS de construtoras, baixadas em 25/09/2026 e guardadas
 * compactadas. Página sintética testaria o formato que eu imagino; estas
 * testam o formato que existe — foi assim que apareceram o `data-src` da
 * Cyrela, o vídeo escondido em script da EZTEC e a planta que a Plano&Plano
 * não descreve no alt.
 */
function pagina(nome: string): string {
  return gunzipSync(readFileSync(path.join(__dirname, "__fixtures__", `${nome}.html.gz`))).toString("utf8");
}

const CYRELA = "https://www.cyrela.com.br/empreendimentos/escape-brooklin";
const EZTEC = "https://www.eztec.com.br/imoveis/gran-resort-reserva-sao-caetano";
const PLANO = "https://www.planoeplano.com.br/imoveis/sp/sao-paulo/apartamentos/barra-funda/planomais-barra-funda";
const EVEN = "https://www.even.com.br/sp/sao-paulo/itaim-bibi/residencial/renato-410";

describe("página da Cyrela (Drupal, fotos em data-src)", () => {
  const p = lerPaginaDaConstrutora(pagina("cyrela"), CYRELA);

  it("acha as fotos que estão em data-src, e não só a do src", () => {
    expect(p.imagens.length).toBeGreaterThanOrEqual(40);
  });

  it("troca a cópia reduzida do Drupal pela original", () => {
    expect(p.imagens.some((i) => i.url.includes("/styles/"))).toBe(false);
    expect(p.imagens.some((i) => i.url.endsWith("FLD_25_Fachada_B_EF4_v5.jpg"))).toBe(true);
  });

  it("reconhece as plantas pelo alt", () => {
    const plantas = p.imagens.filter((i) => i.parecePlanta);
    expect(plantas.length).toBeGreaterThanOrEqual(5);
    expect(plantas.every((i) => !/implanta/i.test(i.legenda))).toBe(true);
  });

  it("acha o tour do Matterport", () => {
    expect(p.midias).toContainEqual(
      expect.objectContaining({ tipo: "tour360", url: "https://my.matterport.com/show/?m=2XErcqUr3Yk" }),
    );
  });

  it("lê o nome e a localização publicados para o Google", () => {
    expect(p.dicas.nome).toBe("Escape Brooklin");
    expect(p.dicas.cidade).toBe("São Paulo");
    expect(p.dicas.lat).toBeCloseTo(-23.613, 2);
  });

  it("não traz o selo nem o logotipo", () => {
    expect(p.imagens.some((i) => /^selo|^logo/i.test(i.legenda))).toBe(false);
  });

  it("tem texto de sobra para a IA ler", () => {
    expect(p.texto.length).toBeGreaterThan(1500);
    expect(p.montadaPorJs).toBe(false);
  });
});

describe("página da EZTEC (vídeo e fotos dentro de script)", () => {
  const p = lerPaginaDaConstrutora(pagina("eztec"), EZTEC);

  it("acha os vídeos do YouTube mesmo com a barra escapada no JSON", () => {
    const videos = p.midias.filter((m) => m.tipo === "video");
    expect(videos.length).toBeGreaterThanOrEqual(3);
    expect(videos.every((v) => /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(v.url))).toBe(true);
  });

  it("pré-marca as fotos cujo nome repete o endereço da página", () => {
    const sugeridas = p.imagens.filter((i) => i.sugerida);
    expect(sugeridas.length).toBeGreaterThanOrEqual(10);
    expect(sugeridas.some((i) => i.url.includes("gran_resort_scs_fachada"))).toBe(true);
  });

  it("não pré-marca os outros empreendimentos da construtora", () => {
    // O cartão do PRÓPRIO empreendimento na vitrine de recomendados é dele.
    const recomendados = p.imagens.filter((i) => /recomendado/.test(i.url) && !/gran_resort_scs/.test(i.url));
    expect(recomendados.length).toBeGreaterThan(0);
    expect(recomendados.every((i) => !i.sugerida)).toBe(true);
  });

  it("deixa de fora fundo de rodapé e miniatura do YouTube", () => {
    expect(p.imagens.some((i) => /bg-footer|maxresdefault|arcs\.png/.test(i.url))).toBe(false);
  });

  it("acha o endereço", () => {
    expect(p.dicas.endereco).toBe("Rua 28 de Julho, 94");
  });
});

describe("página da Plano&Plano (mesma foto em dois formatos)", () => {
  const p = lerPaginaDaConstrutora(pagina("planoeplano"), PLANO);

  it("junta o .webp e o .png do mesmo arquivo numa foto só", () => {
    const hash = "2cddd1df7f080b7695d113a624690c282cfd7296";
    expect(p.imagens.filter((i) => i.url.includes(hash))).toHaveLength(1);
  });

  it("desfaz o &amp; da legenda", () => {
    expect(p.imagens.some((i) => i.legenda.includes("&amp;"))).toBe(false);
  });
});

describe("página da Even (Next.js, centenas de URLs)", () => {
  const p = lerPaginaDaConstrutora(pagina("even"), EVEN);

  it("para no teto da grade", () => {
    expect(p.imagens.length).toBeLessThanOrEqual(60);
  });

  it("lê o texto do empreendimento", () => {
    expect(p.texto).toContain("Renato 410");
  });
});

describe("regras de leitura com HTML mínimo", () => {
  const base = "https://construtora.com.br/imovel/solar";

  it("do srcset fica a maior versão", () => {
    const html = `<img alt="Sala" srcset="/a-400.jpg 400w, /a-1600.jpg 1600w, /a-800.jpg 800w">`;
    expect(lerPaginaDaConstrutora(html, base).imagens[0].url).toBe("https://construtora.com.br/a-1600.jpg");
  });

  it("desembrulha o otimizador de imagem do Next", () => {
    const html = `<img alt="Sala" src="/_next/image?url=https%3A%2F%2Fcdn.x.com%2Fsala.jpg&w=640&q=75">`;
    expect(lerPaginaDaConstrutora(html, base).imagens[0].url).toBe("https://cdn.x.com/sala.jpg");
  });

  it("a foto em data-src é a de verdade, não o marcador do src", () => {
    // Na página real da Cyrela a mesma foto também aparece por outro caminho,
    // e o teste de fixture não pegaria a perda do data-src. Este pega.
    const html = `<img alt="Sala" src="/carregando.gif" data-src="/sala-de-estar.jpg">`;
    expect(lerPaginaDaConstrutora(html, base).imagens.map((i) => i.url)).toEqual([
      "https://construtora.com.br/sala-de-estar.jpg",
    ]);
  });

  it("implantação não é planta de apartamento", () => {
    const html = `<img alt="Planta de implantação do condomínio" src="/i.jpg"><img alt="Planta 2 dorms" src="/p2.jpg">`;
    const [implantacao, planta] = lerPaginaDaConstrutora(html, base).imagens;
    expect(implantacao.parecePlanta).toBe(false);
    expect(planta.parecePlanta).toBe(true);
  });

  it("ícone declarado pequeno fica de fora", () => {
    const html = `<img alt="Seta" src="/seta-grande.png" width="24" height="24"><img alt="Fachada" src="/fachada.jpg">`;
    expect(lerPaginaDaConstrutora(html, base).imagens.map((i) => i.legenda)).toEqual(["Fachada"]);
  });

  it("página quase vazia é reconhecida como montada por JavaScript", () => {
    const html = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(lerPaginaDaConstrutora(html, base).montadaPorJs).toBe(true);
  });

  it("youtu.be, vimeo e kuula viram mídia", () => {
    const html = `<a href="https://youtu.be/abcdefghijk">v</a><iframe src="https://player.vimeo.com/video/123456789"></iframe><a href="https://kuula.co/share/collection/7XyZ">t</a>`;
    const tipos = lerPaginaDaConstrutora(html, base).midias.map((m) => `${m.tipo} ${m.url}`);
    expect(tipos).toContain("video https://www.youtube.com/watch?v=abcdefghijk");
    expect(tipos).toContain("video https://vimeo.com/123456789");
    expect(tipos).toContain("tour360 https://kuula.co/share/collection/7XyZ");
  });

  it("tour da 3D Explora vira tour 360, uma vez só, mesmo com o endereço colado duas vezes (RSF)", () => {
    const tour = "https://www.3dexplora.com.br/seutour.aspx?codigo=D783XV15XT4&amp;play=1&amp;hl=0";
    const html = `<iframe src="${tour}${tour}" allowfullscreen></iframe>`;
    const tours = lerPaginaDaConstrutora(html, base).midias.filter((m) => m.tipo === "tour360");
    expect(tours.map((m) => m.url)).toEqual(["https://www.3dexplora.com.br/seutour.aspx?codigo=D783XV15XT4"]);
  });

  it("3D Explora com o código depois de outro parâmetro também é reconhecido", () => {
    const html = `<a href="https://3dexplora.com.br/seutour.aspx?play=1&codigo=AB12CD34">tour</a>`;
    const urls = lerPaginaDaConstrutora(html, base).midias.map((m) => m.url);
    expect(urls).toEqual(["https://www.3dexplora.com.br/seutour.aspx?codigo=AB12CD34"]);
  });
});
