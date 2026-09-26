/**
 * A marca da instalação (26/09/2026). A Next Home é o espelho da versão
 * geral: cada cliente ganha um projeto Vercel e um banco próprios, e o que
 * o identifica — nome, CRECI, endereço, WhatsApp, redes — vem de UMA
 * variável de ambiente, `NEXT_PUBLIC_MARCA` (JSON). Sem ela, valem os dados
 * da Next Home.
 *
 * Por que variável e não tabela: `site` é lido em 50 arquivos, em
 * metadados, JSON-LD e componentes de cliente, de forma síncrona. Uma
 * tabela obrigaria cada um a ficar assíncrono; a variável é inlinada no
 * build e vale igual no servidor e no navegador. Trocar a marca é trocar a
 * variável e fazer o redeploy — o mesmo gesto de instalar.
 *
 * Campo inválido é ignorado e o padrão fica: marca pela metade é melhor que
 * site quebrado.
 */

export type Endereco = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  lat: number;
  lng: number;
};

export type Marca = {
  nome?: string;
  nomeCompleto?: string;
  /** O logotipo em texto: primeira parte e a parte destacada ("Next", "Home"). */
  wordmark?: [string, string];
  creci?: string;
  descricao?: string;
  endereco?: Endereco;
  whatsapp?: { numero: string; label: string }[];
  social?: Partial<Record<"instagram" | "facebook" | "youtube" | "linkedin", string>>;
  regioes?: string[];
  keywords?: string[];
  /** Nome padrão da assistente de IA de um corretor novo. */
  assistente?: string;
};

const texto = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const listaDeTextos = (v: unknown, max: number) =>
  Array.isArray(v) ? v.map((x) => texto(x, 120)).filter((x): x is string => Boolean(x)).slice(0, max) : undefined;

export function lerMarca(bruto: string | undefined): Marca {
  if (!bruto) return {};
  let j: Record<string, unknown>;
  try {
    const v = JSON.parse(bruto) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    j = v as Record<string, unknown>;
  } catch {
    return {};
  }
  const m: Marca = {};
  m.nome = texto(j.nome, 60);
  m.nomeCompleto = texto(j.nomeCompleto, 120);
  m.creci = texto(j.creci, 30);
  m.descricao = texto(j.descricao, 400);
  m.assistente = texto(j.assistente, 40);
  if (Array.isArray(j.wordmark) && j.wordmark.length === 2) {
    const [a, b] = j.wordmark.map((x) => texto(x, 30));
    if (a && b) m.wordmark = [a, b];
  }
  const e = j.endereco as Record<string, unknown> | undefined;
  if (e && typeof e === "object") {
    const lat = Number(e.lat);
    const lng = Number(e.lng);
    const campos = ["logradouro", "bairro", "cidade", "uf", "cep"].map((k) => texto(e[k], 120));
    if (campos.every(Boolean) && Number.isFinite(lat) && Number.isFinite(lng)) {
      const [logradouro, bairro, cidade, uf, cep] = campos as string[];
      m.endereco = { logradouro, bairro, cidade, uf, cep, lat, lng };
    }
  }
  if (Array.isArray(j.whatsapp)) {
    const ws = j.whatsapp
      .map((w) => {
        const o = w as Record<string, unknown>;
        const numero = typeof o?.numero === "string" ? o.numero.replace(/\D/g, "") : "";
        const label = texto(o?.label, 40);
        return numero.length >= 12 && numero.length <= 13 && label ? { numero, label } : null;
      })
      .filter((w): w is { numero: string; label: string } => Boolean(w));
    if (ws.length) m.whatsapp = ws;
  }
  const s = j.social as Record<string, unknown> | undefined;
  if (s && typeof s === "object") {
    const social: Marca["social"] = {};
    for (const k of ["instagram", "facebook", "youtube", "linkedin"] as const) {
      const url = texto(s[k], 200);
      if (url && /^https:\/\//.test(url)) social[k] = url;
    }
    if (Object.keys(social).length) m.social = social;
  }
  m.regioes = listaDeTextos(j.regioes, 12);
  m.keywords = listaDeTextos(j.keywords, 30);
  for (const k of Object.keys(m) as (keyof Marca)[]) if (m[k] === undefined || (Array.isArray(m[k]) && !(m[k] as unknown[]).length)) delete m[k];
  return m;
}
