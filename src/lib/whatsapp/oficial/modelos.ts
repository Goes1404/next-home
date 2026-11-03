/**
 * Os modelos (templates) da API oficial: validar antes de mandar à Meta,
 * montar o pedido de criação, montar os parâmetros de cada envio e mostrar a
 * prévia. Puro.
 *
 * Por que modelo e não texto livre: fora da janela de 24 h, a Meta só deixa
 * sair mensagem com modelo APROVADO. O texto é fixo; o que muda por pessoa
 * são as variáveis. Isso substitui a reescrita por IA da lista da Evolution
 * (`variarSemRepetir`): ela existia para o número comum não mandar texto
 * repetido, e no número oficial o texto repetido é exatamente o que a Meta
 * aprova.
 *
 * Variáveis nomeadas ({{nome}}, {{imovel}}), no formato `named` da Meta: o
 * envio cita cada uma pelo nome, e uma troca de ordem no texto não troca o
 * valor de lugar.
 */

export const VARIAVEIS_DO_MODELO = {
  nome: { rotulo: "Primeiro nome do cliente", exemplo: "Carla" },
  imovel: { rotulo: "Nome do imóvel da lista", exemplo: "Dom Parque" },
  corretor: { rotulo: "Nome de quem criou a lista", exemplo: "Rafael" },
  casa: { rotulo: "Nome da imobiliária", exemplo: "Next Home" },
} as const;

export type VariavelDoModelo = keyof typeof VARIAVEIS_DO_MODELO;

export type BotaoDoModelo = { tipo: "interesse" | "parar"; texto: string };

export type DefinicaoDoModelo = {
  nome: string;
  idioma: string;
  categoria: "MARKETING" | "UTILITY";
  corpo: string;
  exemplos: Partial<Record<VariavelDoModelo, string>>;
  cabecalho: "nenhum" | "imagem" | "texto";
  cabecalhoTexto?: string | null;
  rodape?: string | null;
  botoes: BotaoDoModelo[];
};

/**
 * O que o webhook recebe quando a pessoa toca um botão: o `payload` que o
 * ENVIO pôs em cada botão. Com ele, "Parar de receber" é reconhecido mesmo
 * que alguém troque o texto do botão depois.
 */
export const PAYLOAD_PARAR = "PARAR_DE_RECEBER";
export const PAYLOAD_INTERESSE = "TENHO_INTERESSE";

const PADRAO_VARIAVEL = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** As variáveis do texto, na ordem em que aparecem, sem repetir. */
export function variaveisDoCorpo(corpo: string): string[] {
  const vistas: string[] = [];
  for (const m of corpo.matchAll(PADRAO_VARIAVEL)) {
    if (!vistas.includes(m[1])) vistas.push(m[1]);
  }
  return vistas;
}

/** "Lançamento Dom Parque!" → "lancamento_dom_parque". */
export function nomeParaMeta(titulo: string): string {
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "modelo"
  );
}

/**
 * Os problemas do modelo que a Meta reprovaria (ou que o painel reprova por
 * conta própria), em frase de gente. Vazio = pode mandar para aprovação.
 */
export function problemasDoModelo(m: DefinicaoDoModelo): string[] {
  const problemas: string[] = [];
  if (!/^[a-z0-9_]+$/.test(m.nome) || m.nome.length > 512) {
    problemas.push("O nome do modelo só pode ter letras minúsculas sem acento, números e _.");
  }
  const corpo = m.corpo.trim();
  if (!corpo) problemas.push("Escreva o texto da mensagem.");
  if (corpo.length > 1024) problemas.push("O texto passa de 1.024 caracteres, o máximo da Meta.");

  const variaveis = variaveisDoCorpo(corpo);
  const desconhecidas = variaveis.filter((v) => !(v in VARIAVEIS_DO_MODELO));
  if (desconhecidas.length > 0) {
    problemas.push(`Variável que não existe: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}.`);
  }
  // Regra da Meta: o texto não pode começar nem terminar numa variável, nem
  // ter duas variáveis coladas.
  if (/^\{\{/.test(corpo) || /\}\}[.!?…]*$/.test(corpo)) {
    problemas.push("O texto não pode começar nem terminar com uma variável: ponha palavras antes e depois.");
  }
  if (/\}\}\s*\{\{/.test(corpo)) problemas.push("Duas variáveis seguidas: ponha palavras entre elas.");
  for (const v of variaveis) {
    if (v in VARIAVEIS_DO_MODELO && !m.exemplos[v as VariavelDoModelo]?.trim()) {
      problemas.push(`Dê um exemplo para {{${v}}}: a Meta exige para aprovar.`);
    }
  }
  // Variável demais para texto de menos é motivo comum de reprovação.
  const palavras = corpo.replace(PADRAO_VARIAVEL, " ").split(/\s+/).filter(Boolean).length;
  if (variaveis.length > 0 && palavras < variaveis.length * 3) {
    problemas.push("Pouco texto para tantas variáveis: a Meta costuma reprovar. Escreva mais.");
  }

  if (m.cabecalho === "texto") {
    const t = (m.cabecalhoTexto ?? "").trim();
    if (!t) problemas.push("Escreva o título do cabeçalho ou tire o cabeçalho.");
    if (t.length > 60) problemas.push("O título do cabeçalho passa de 60 caracteres.");
    if (/\{\{/.test(t)) problemas.push("O título do cabeçalho não leva variável.");
  }
  if ((m.rodape ?? "").length > 60) problemas.push("O rodapé passa de 60 caracteres.");

  if (m.botoes.length > 10) problemas.push("No máximo 10 botões.");
  for (const b of m.botoes) {
    if (!b.texto.trim()) problemas.push("Todo botão precisa de texto.");
    if (b.texto.length > 25) problemas.push(`O botão "${b.texto}" passa de 25 caracteres.`);
  }
  if (new Set(m.botoes.map((b) => b.texto.trim().toLowerCase())).size !== m.botoes.length) {
    problemas.push("Dois botões com o mesmo texto.");
  }
  // Marketing sem um jeito visível de parar é o caminho mais curto para
  // denúncia, e denúncia derruba a qualidade do número inteiro.
  if (m.categoria === "MARKETING" && !m.botoes.some((b) => b.tipo === "parar")) {
    problemas.push('Mensagem de marketing precisa do botão "Parar de receber".');
  }
  return problemas;
}

type ComponenteDeCriacao = Record<string, unknown>;

/** O corpo do `POST /{waba}/message_templates`. */
export function pedidoDeCriacao(m: DefinicaoDoModelo, handleDaImagem?: string | null): Record<string, unknown> {
  const componentes: ComponenteDeCriacao[] = [];
  if (m.cabecalho === "imagem") {
    componentes.push({ type: "header", format: "image", example: { header_handle: [handleDaImagem ?? ""] } });
  } else if (m.cabecalho === "texto" && m.cabecalhoTexto?.trim()) {
    componentes.push({ type: "header", format: "text", text: m.cabecalhoTexto.trim() });
  }

  const variaveis = variaveisDoCorpo(m.corpo);
  const corpo: ComponenteDeCriacao = { type: "body", text: m.corpo.trim() };
  if (variaveis.length > 0) {
    corpo.example = {
      body_text_named_params: variaveis.map((v) => ({
        param_name: v,
        example: m.exemplos[v as VariavelDoModelo] ?? VARIAVEIS_DO_MODELO[v as VariavelDoModelo]?.exemplo ?? v,
      })),
    };
  }
  componentes.push(corpo);

  if (m.rodape?.trim()) componentes.push({ type: "footer", text: m.rodape.trim() });
  if (m.botoes.length > 0) {
    componentes.push({
      type: "buttons",
      buttons: m.botoes.map((b) => ({ type: "quick_reply", text: b.texto.trim() })),
    });
  }

  return {
    name: m.nome,
    language: m.idioma,
    category: m.categoria.toLowerCase(),
    parameter_format: "named",
    components: componentes,
  };
}

export type ValoresDoEnvio = Partial<Record<VariavelDoModelo, string | null | undefined>>;

/**
 * Os `components` do envio: a foto do cabeçalho, cada variável do texto pelo
 * nome e o `payload` de cada botão (`PAYLOAD_PARAR`, `PAYLOAD_INTERESSE`).
 *
 * Variável sem valor recebe um substituto neutro em vez de sair vazia: a
 * Meta recusa parâmetro vazio (132000) e o item viraria erro por um nome de
 * lead faltando. "Olá, tudo bem?" com "você" no lugar do nome ainda é uma
 * mensagem boa.
 */
export function componentesDoEnvio(
  m: Pick<DefinicaoDoModelo, "corpo" | "cabecalho" | "botoes">,
  valores: ValoresDoEnvio,
  imagemUrl?: string | null,
): Record<string, unknown>[] {
  const componentes: Record<string, unknown>[] = [];
  if (m.cabecalho === "imagem" && imagemUrl) {
    componentes.push({ type: "header", parameters: [{ type: "image", image: { link: imagemUrl } }] });
  }
  const variaveis = variaveisDoCorpo(m.corpo);
  if (variaveis.length > 0) {
    componentes.push({
      type: "body",
      parameters: variaveis.map((v) => ({
        type: "text",
        parameter_name: v,
        text: valorOuSubstituto(v, valores),
      })),
    });
  }
  m.botoes.forEach((b, i) => {
    componentes.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(i),
      parameters: [{ type: "payload", payload: b.tipo === "parar" ? PAYLOAD_PARAR : PAYLOAD_INTERESSE }],
    });
  });
  return componentes;
}

const SUBSTITUTOS: Record<VariavelDoModelo, string> = {
  nome: "tudo bem",
  imovel: "nosso lançamento",
  corretor: "nossa equipe",
  casa: "nossa imobiliária",
};

function valorOuSubstituto(variavel: string, valores: ValoresDoEnvio): string {
  const v = valores[variavel as VariavelDoModelo]?.trim();
  if (v) return v.slice(0, 200);
  return SUBSTITUTOS[variavel as VariavelDoModelo] ?? "—";
}

/** O texto como a pessoa vai ler (prévia na tela e linha na conversa). */
export function renderizarModelo(corpo: string, valores: ValoresDoEnvio): string {
  return corpo.replace(PADRAO_VARIAVEL, (_, v: string) => valorOuSubstituto(v, valores));
}

/** O estado que a Meta escreve (`status` do modelo ou `event` do webhook). */
export function estadoDaMeta(
  valor: string | null | undefined,
): "aprovado" | "em_analise" | "rejeitado" | "pausado" | "desativado" | null {
  switch ((valor ?? "").toUpperCase()) {
    case "APPROVED":
      return "aprovado";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
    case "REINSTATED":
      return "em_analise";
    case "REJECTED":
    case "LIMIT_EXCEEDED":
      return "rejeitado";
    case "PAUSED":
    case "FLAGGED":
      return "pausado";
    case "DISABLED":
    case "DELETED":
    case "ARCHIVED":
      return "desativado";
    default:
      return null;
  }
}

/** Lê `botoes` do banco (jsonb) sem confiar no formato. */
export function botoesDoBanco(valor: unknown): BotaoDoModelo[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((b): b is { tipo: unknown; texto: unknown } => typeof b === "object" && b !== null)
    .map((b) => ({ tipo: b.tipo === "parar" ? ("parar" as const) : ("interesse" as const), texto: String(b.texto ?? "") }))
    .filter((b) => b.texto.trim().length > 0);
}

/** Lê `exemplos` do banco (jsonb). */
export function exemplosDoBanco(valor: unknown): Partial<Record<VariavelDoModelo, string>> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
  const saida: Partial<Record<VariavelDoModelo, string>> = {};
  for (const chave of Object.keys(VARIAVEIS_DO_MODELO) as VariavelDoModelo[]) {
    const v = (valor as Record<string, unknown>)[chave];
    if (typeof v === "string" && v.trim()) saida[chave] = v.trim();
  }
  return saida;
}
