// O que a imobiliária edita no próprio site ("Meu site", 0209, 21/10/2026).
//
// Módulo PURO: validação do que o gestor digita, normalização para o formato
// que o banco guarda e a cor do site com o texto legível por cima. Os
// mesmos limites estão nos CHECKs da 0209 (a coluna é a última barreira).

/**
 * O que se guarda de um grupo (espelho das colunas `site_*` + logo e CRECI).
 * As três cores da 0210 são opcionais no tipo (ausente = nulo) para os dados
 * que já existiam antes dela continuarem valendo como estão.
 */
export type SiteEditavel = {
  logoUrl: string | null;
  cor: string | null;
  /** Segunda cor (0210): etiquetas, selos e o segundo tom dos degradês. */
  corSecundaria?: string | null;
  /** Fundo das páginas do site (0210). */
  corFundo?: string | null;
  /** Texto principal do site (0210); os títulos acompanham. */
  corTexto?: string | null;
  capaUrl: string | null;
  titulo: string | null;
  frase: string | null;
  sobre: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: EnderecoEditavel | null;
  instagram: string | null;
  facebook: string | null;
  creci: string | null;
  creciTipo: "J" | "F" | null;
};

export type EnderecoEditavel = { logradouro: string; bairro: string; cidade: string; uf: string; cep: string };

/** Tudo vazio: o site cai no comportamento de hoje. */
export const SITE_EM_BRANCO: SiteEditavel = {
  logoUrl: null,
  cor: null,
  corSecundaria: null,
  corFundo: null,
  corTexto: null,
  capaUrl: null,
  titulo: null,
  frase: null,
  sobre: null,
  whatsapp: null,
  email: null,
  endereco: null,
  instagram: null,
  facebook: null,
  creci: null,
  creciTipo: null,
};

export const LIMITES = { titulo: 90, frase: 200, sobre: 1200, email: 160, rede: 300, campoDoEndereco: 120 } as const;

/** Os campos de texto que a tela envia (tudo texto digitado; vazio = apagar). */
export type SiteDigitado = {
  cor: string;
  corSecundaria: string;
  corFundo: string;
  corTexto: string;
  titulo: string;
  frase: string;
  sobre: string;
  whatsapp: string;
  email: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  instagram: string;
  facebook: string;
};

/** O que a gravação leva ao banco (só os campos que o formulário edita). */
export type SiteParaGravar = Pick<
  SiteEditavel,
  "cor" | "corSecundaria" | "corFundo" | "corTexto" | "titulo" | "frase" | "sobre" | "whatsapp" | "email" | "endereco" | "instagram" | "facebook"
>;

export type ResultadoDaValidacao =
  | { ok: true; valor: SiteParaGravar }
  | { ok: false; erros: Partial<Record<keyof SiteDigitado, string>> };

/** Espaços das pontas e repetidos fora; vazio vira nulo. */
function limpo(texto: string | null | undefined): string | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** Texto de várias linhas: mantém os parágrafos, tira o excesso de espaço. */
function limpoComParagrafos(texto: string | null | undefined): string | null {
  const t = (texto ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t === "" ? null : t;
}

/** `#rgb` ou `#rrggbb` (com ou sem `#`) → `#rrggbb` minúsculo; nulo se não for cor. */
export function normalizarCor(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  return null;
}

/** URL https sem credencial; nulo se não servir. `www.x.com/a` ganha o `https://`. */
export function normalizarUrlHttps(texto: string | null | undefined, max: number = LIMITES.rede): string | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`;
  try {
    const u = new URL(comEsquema);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    const url = u.toString();
    return url.length <= max ? url : null;
  } catch {
    return null;
  }
}

/** `@usuario` vira o endereço do Instagram; o resto segue a regra da URL https. */
export function normalizarInstagram(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  const arroba = /^@?([a-z0-9._]{1,30})$/i.exec(t);
  if (arroba) return `https://www.instagram.com/${arroba[1].toLowerCase()}/`;
  return normalizarUrlHttps(t);
}

/** Telefone brasileiro → E.164 sem `+` (`5511999998888`); nulo se não tiver 10 ou 11 dígitos. */
export function normalizarWhatsapp(texto: string | null | undefined): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) return d;
  if (/^\d{10,11}$/.test(d)) return `55${d}`;
  return null;
}

/** `5511999998888` → `(11) 99999-8888`, para mostrar. */
export function rotuloDoWhatsapp(numero: string): string {
  const d = numero.replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** O que serve de e-mail para o rodapé: uma conta, sem espaço. */
export function normalizarEmail(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim().toLowerCase();
  if (!t || t.length > LIMITES.email) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null;
}

/** `06404326` ou `06404-326` → `06404-326`; nulo se não tiver 8 dígitos. */
export function normalizarCep(texto: string | null | undefined): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
}

/** Só endereço completo vale: meio endereço no rodapé parece erro do site. */
function lerEndereco(d: SiteDigitado, erros: Partial<Record<keyof SiteDigitado, string>>): EnderecoEditavel | null {
  const logradouro = limpo(d.logradouro);
  const bairro = limpo(d.bairro);
  const cidade = limpo(d.cidade);
  const ufBruta = limpo(d.uf);
  const cepBruto = limpo(d.cep);
  if (!logradouro && !bairro && !cidade && !ufBruta && !cepBruto) return null;

  const aqui: Partial<Record<keyof SiteDigitado, string>> = {};
  if (!logradouro) aqui.logradouro = "Informe o logradouro (rua e número) ou apague o endereço inteiro.";
  if (!bairro) aqui.bairro = "Informe o bairro.";
  if (!cidade) aqui.cidade = "Informe a cidade.";
  const uf = ufBruta?.toUpperCase() ?? null;
  if (!uf || !/^[A-Z]{2}$/.test(uf)) aqui.uf = "A UF tem duas letras (ex.: SP).";
  const cep = cepBruto ? normalizarCep(cepBruto) : null;
  if (!cep) aqui.cep = "O CEP tem 8 números (ex.: 06404-326).";
  for (const [campo, valor] of [["logradouro", logradouro], ["bairro", bairro], ["cidade", cidade]] as const) {
    if (valor && valor.length > LIMITES.campoDoEndereco) aqui[campo] = `No máximo ${LIMITES.campoDoEndereco} caracteres.`;
  }
  if (Object.keys(aqui).length > 0 || !logradouro || !bairro || !cidade || !uf || !cep) {
    Object.assign(erros, aqui);
    return null;
  }
  return { logradouro, bairro, cidade, uf, cep };
}

/** Valida e normaliza o formulário "Meu site". Todo campo é opcional. */
export function validarSiteDigitado(d: SiteDigitado): ResultadoDaValidacao {
  const erros: Partial<Record<keyof SiteDigitado, string>> = {};

  const corBruta = limpo(d.cor);
  const cor = corBruta ? normalizarCor(corBruta) : null;
  if (corBruta && !cor) erros.cor = "Use uma cor em hexadecimal, como #1f6f5c.";
  const lerCor = (campo: "corSecundaria" | "corFundo" | "corTexto"): string | null => {
    const bruta = limpo(d[campo]);
    const lida = bruta ? normalizarCor(bruta) : null;
    if (bruta && !lida) erros[campo] = "Use uma cor em hexadecimal, como #1f6f5c.";
    return lida;
  };
  const corSecundaria = lerCor("corSecundaria");
  const corFundo = lerCor("corFundo");
  const corTexto = lerCor("corTexto");

  const titulo = limpo(d.titulo);
  if (titulo && titulo.length > LIMITES.titulo) erros.titulo = `O título passa de ${LIMITES.titulo} caracteres.`;
  const frase = limpo(d.frase);
  if (frase && frase.length > LIMITES.frase) erros.frase = `A frase passa de ${LIMITES.frase} caracteres.`;
  const sobre = limpoComParagrafos(d.sobre);
  if (sobre && sobre.length > LIMITES.sobre) erros.sobre = `O texto passa de ${LIMITES.sobre} caracteres.`;

  const whatsappBruto = limpo(d.whatsapp);
  const whatsapp = whatsappBruto ? normalizarWhatsapp(whatsappBruto) : null;
  if (whatsappBruto && !whatsapp) erros.whatsapp = "Informe o WhatsApp com DDD, como (11) 99999-8888.";

  const emailBruto = limpo(d.email);
  const email = emailBruto ? normalizarEmail(emailBruto) : null;
  if (emailBruto && !email) erros.email = "Esse e-mail não parece certo.";

  const instagramBruto = limpo(d.instagram);
  const instagram = instagramBruto ? normalizarInstagram(instagramBruto) : null;
  if (instagramBruto && !instagram) erros.instagram = "Use o @ do perfil ou o endereço https do Instagram.";
  const facebookBruto = limpo(d.facebook);
  const facebook = facebookBruto ? normalizarUrlHttps(facebookBruto) : null;
  if (facebookBruto && !facebook) erros.facebook = "Use o endereço https da página do Facebook.";

  const endereco = lerEndereco(d, erros);

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, valor: { cor, corSecundaria, corFundo, corTexto, titulo, frase, sobre, whatsapp, email, endereco, instagram, facebook } };
}

// ── Cor do site ───────────────────────────────────────────────────────────

function canal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (WCAG) de `#rrggbb`. */
export function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Razão de contraste (WCAG) entre duas cores `#rrggbb`. */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

export const TEXTO_CLARO = "#ffffff";
export const TEXTO_ESCURO = "#000000";

/** O texto sobre a cor do site: branco ou escuro, o de maior contraste. */
export function textoSobreACor(hex: string): string {
  return contraste(hex, TEXTO_CLARO) >= contraste(hex, TEXTO_ESCURO) ? TEXTO_CLARO : TEXTO_ESCURO;
}

/** Mistura `hex` com `alvo` na proporção `parte` (0 a 1). */
export function misturar(hex: string, alvo: string, parte: number): string {
  const a = Number.parseInt(hex.slice(1), 16);
  const b = Number.parseInt(alvo.slice(1), 16);
  const c = (deslocamento: number) => {
    const x = (a >> deslocamento) & 255;
    const y = (b >> deslocamento) & 255;
    return Math.round(x + (y - x) * parte)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${c(16)}${c(8)}${c(0)}`;
}

export function rgbDe(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * As variáveis CSS que o site do grupo sobrescreve (o login faz o mesmo com
 * `--color-acento`). O acento de TEXTO (`suave`, `forte`) é a própria cor; o
 * hover escurece ou clareia conforme o texto que a cor leva por cima.
 */
export function variaveisDaCor(hex: string): Record<string, string> {
  const texto = textoSobreACor(hex);
  const hover = texto === TEXTO_CLARO ? misturar(hex, "#000000", 0.18) : misturar(hex, "#ffffff", 0.18);
  return {
    "--color-acento": hex,
    "--color-acento-hover": hover,
    "--color-acento-suave": hex,
    "--color-acento-forte": hex,
    "--color-acento-lavado": `rgb(${rgbDe(hex)} / 0.14)`,
    "--color-acento-linha": `rgb(${rgbDe(hex)} / 0.35)`,
    "--color-sobre-cor": texto,
  };
}

// ── Capa ───────────────────────────────────────────────────────────────────

export const TETO_DA_CAPA_BYTES = 5 * 1024 * 1024;

export type FormatoDaCapa = { mime: "image/png" | "image/jpeg" | "image/webp"; extensao: "png" | "jpg" | "webp" };

/** O formato pelos PRIMEIROS BYTES (o nome e o tipo declarado são digitados por quem envia). */
export function formatoDaCapa(bytes: Uint8Array): FormatoDaCapa | null {
  const eq = (inicio: number, esperado: number[]) => esperado.every((b, i) => bytes[inicio + i] === b);
  if (bytes.length >= 8 && eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extensao: "png" };
  if (bytes.length >= 3 && eq(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extensao: "jpg" };
  if (bytes.length >= 12 && eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return { mime: "image/webp", extensao: "webp" };
  return null;
}

export function problemaDaCapa(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "O arquivo está vazio.";
  if (bytes.length > TETO_DA_CAPA_BYTES) return "A foto de capa passa de 5 MB. Reduza a imagem e tente de novo.";
  if (!formatoDaCapa(bytes)) return "Formato não aceito. Envie a capa em JPG, PNG ou WebP.";
  return null;
}

export function pastaDaCapa(grupoId: string): string {
  return `grupos/${grupoId}/site`;
}

export function caminhoDaCapa(grupoId: string, hash: string, extensao: FormatoDaCapa["extensao"]): string {
  return `${pastaDaCapa(grupoId)}/capa-${hash}.${extensao}`;
}

/** Só a capa DESTE grupo conta como "capa antiga a apagar". */
export function ehCapaDoGrupo(grupoId: string, caminho: string): boolean {
  return new RegExp(`^${pastaDaCapa(grupoId)}/capa-[0-9a-f]{16}\\.(png|jpg|webp)$`).test(caminho);
}

// ── Endereço do site (plataforma) ──────────────────────────────────────────

export type TipoDeEndereco = "proprio" | "gratuito";

/**
 * O host digitado pelo operador: minúsculas, sem esquema, caminho, porta ou
 * barra. Cola de URL (`https://www.x.com.br/`) é aceita e reduzida ao host;
 * o que sobra tem de ser nome de DNS com ponto (a PK da 0201 é o host).
 */
export function lerHostDigitado(texto: string | null | undefined): { ok: true; host: string } | { ok: false; erro: string } {
  let h = (texto ?? "").trim().toLowerCase();
  if (!h) return { ok: false, erro: "Informe o endereço (ex.: www.imobiliariasol.com.br)." };
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  h = h.split(/[/?#]/)[0];
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (/[@:\s]/.test(h)) return { ok: false, erro: "Informe só o endereço, sem usuário, porta nem espaços." };
  if (h.length > 253 || !h.includes(".")) return { ok: false, erro: "Esse endereço não parece um domínio (ex.: www.imobiliariasol.com.br)." };
  if (!h.split(".").every((r) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(r))) {
    return { ok: false, erro: "Esse endereço não é um nome de domínio válido: use letras, números e hífen." };
  }
  return { ok: true, host: h };
}
