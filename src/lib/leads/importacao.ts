import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";

/**
 * Leitura de listas de leads que o corretor traz de fora — planilha exportada
 * de um portal, tabela colada do Excel, PDF de relatório, lista solta no
 * WhatsApp.
 *
 * A ordem importa: PRIMEIRO o parser determinístico, só DEPOIS a IA. Uma
 * planilha com cabeçalho `nome;telefone;email` não precisa de modelo nenhum
 * para ser lida, e mandar cada importação para a IA custaria dinheiro e
 * tempo para entregar um resultado pior — o parser acerta 100% do que
 * entende, e o que ele não entende é justamente o material solto onde a IA
 * ganha.
 */

/** Um lead lido do arquivo, antes de virar linha no banco. */
export type CandidatoLead = {
  nome: string;
  telefone: string;
  /** E.164 — a chave de deduplicação. `null` = telefone não aproveitável. */
  telefoneE164: string | null;
  email: string | null;
  mensagem: string | null;
  imovelInteresse: string | null;
};

export type ResultadoExtracao = {
  candidatos: CandidatoLead[];
  /** Como o conteúdo foi lido, para a tela dizer ao corretor o que houve. */
  metodo: "tabela" | "ia" | "nenhum";
  aviso?: string;
};

/** Teto por importação — protege contra um PDF de 400 páginas virar 400 inserts. */
export const LIMITE_POR_IMPORTACAO = 300;

const CABECALHOS = {
  nome: ["nome", "name", "cliente", "contato", "lead", "nome completo", "nome do cliente"],
  telefone: ["telefone", "tel", "celular", "fone", "whatsapp", "whats", "phone", "contato telefone"],
  email: ["email", "e-mail", "mail", "correio"],
  mensagem: ["mensagem", "obs", "observacao", "observação", "observacoes", "comentario", "comentário", "descricao", "descrição"],
  imovel: ["imovel", "imóvel", "empreendimento", "interesse", "produto", "anuncio", "anúncio", "referencia", "referência"],
} as const;

type Campo = keyof typeof CABECALHOS;

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function detectarSeparador(linha: string): string {
  if (linha.includes("\t")) return "\t";
  if (linha.includes(";")) return ";";
  if (linha.includes("|")) return "|";
  if (linha.includes(",")) return ",";
  return "\t";
}

function celulas(linha: string, sep: string): string[] {
  return linha.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ""));
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Um telefone brasileiro tem 8 a 13 dígitos; menos que isso é código, mais é ruído. */
function pareceTelefone(valor: string): boolean {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 13) return false;
  // Descarta o que é claramente outra coisa: só dígitos com separador de
  // milhar, data, valor em reais.
  if (/^\d{1,3}([.,]\d{3})+([.,]\d{2})?$/.test(valor.trim())) return false;
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(valor)) return false;
  return true;
}

/** Casa o cabeçalho de cada coluna com o campo que ela alimenta. */
function mapearCabecalho(colunas: string[]): Partial<Record<Campo, number>> | null {
  const mapa: Partial<Record<Campo, number>> = {};

  colunas.forEach((coluna, indice) => {
    const chave = semAcento(coluna);
    if (!chave) return;
    for (const campo of Object.keys(CABECALHOS) as Campo[]) {
      if (mapa[campo] !== undefined) continue;
      if (CABECALHOS[campo].some((c) => chave === c || chave.includes(c))) {
        mapa[campo] = indice;
        return;
      }
    }
  });

  // Sem telefone não há lead nem deduplicação; sem nome, também não é tabela
  // de contatos. Exigir os dois evita tratar uma planilha de preços como
  // lista de clientes.
  return mapa.telefone !== undefined && mapa.nome !== undefined ? mapa : null;
}

/**
 * Sem cabeçalho reconhecível, decide pelo conteúdo: a coluna com cara de
 * telefone é o telefone, a com "@" é o e-mail, e o primeiro texto que sobra
 * é o nome. É como uma pessoa leria a mesma tabela.
 */
function lerLinhaSemCabecalho(colunas: string[]): CandidatoLead | null {
  const idxTelefone = colunas.findIndex(pareceTelefone);
  if (idxTelefone === -1) return null;

  const idxEmail = colunas.findIndex((c) => RE_EMAIL.test(c));
  const idxNome = colunas.findIndex(
    (c, i) => i !== idxTelefone && i !== idxEmail && c.length >= 2 && /\p{L}/u.test(c),
  );

  return montar({
    nome: idxNome >= 0 ? colunas[idxNome] : "",
    telefone: colunas[idxTelefone],
    email: idxEmail >= 0 ? colunas[idxEmail] : null,
    mensagem: null,
    imovelInteresse: null,
  });
}

function montar(bruto: {
  nome: string;
  telefone: string;
  email: string | null;
  mensagem: string | null;
  imovelInteresse: string | null;
}): CandidatoLead | null {
  const telefone = bruto.telefone?.trim();
  if (!telefone || !pareceTelefone(telefone)) return null;

  const email = bruto.email?.trim();
  const nome = bruto.nome?.trim();

  return {
    // Um lead sem nome ainda é um lead — o telefone é o que vale. O rótulo
    // genérico deixa claro na lista que o nome precisa ser preenchido.
    nome: nome && nome.length >= 2 ? nome.slice(0, 120) : "Contato sem nome",
    telefone: telefone.slice(0, 40),
    telefoneE164: normalizarTelefoneBrasileiro(telefone),
    email: email && RE_EMAIL.test(email) ? email.slice(0, 160) : null,
    mensagem: bruto.mensagem?.trim().slice(0, 2000) || null,
    imovelInteresse: bruto.imovelInteresse?.trim().slice(0, 160) || null,
  };
}

/**
 * Lê texto tabular: CSV, TSV, colado do Excel ou do Google Sheets.
 * Devolve lista vazia quando não reconhece uma tabela — é o sinal de que a
 * IA deve tentar.
 */
export function parsearTabelaLeads(conteudo: string): CandidatoLead[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhas.length === 0) return [];

  const sep = detectarSeparador(linhas[0]);
  const primeira = celulas(linhas[0], sep);
  const mapa = mapearCabecalho(primeira);

  const corpo = mapa ? linhas.slice(1) : linhas;
  const resultados: CandidatoLead[] = [];

  for (const linha of corpo) {
    const colunas = celulas(linha, detectarSeparador(linha));
    if (colunas.length === 0) continue;

    const candidato = mapa
      ? montar({
          nome: colunas[mapa.nome!] ?? "",
          telefone: colunas[mapa.telefone!] ?? "",
          email: mapa.email !== undefined ? (colunas[mapa.email] ?? null) : null,
          mensagem: mapa.mensagem !== undefined ? (colunas[mapa.mensagem] ?? null) : null,
          imovelInteresse: mapa.imovel !== undefined ? (colunas[mapa.imovel] ?? null) : null,
        })
      : lerLinhaSemCabecalho(colunas);

    if (candidato) resultados.push(candidato);
    if (resultados.length >= LIMITE_POR_IMPORTACAO) break;
  }

  return resultados;
}

/** Tira repetidos dentro do próprio arquivo, mantendo o primeiro de cada telefone. */
export function dedupInterno(candidatos: CandidatoLead[]): CandidatoLead[] {
  const vistos = new Set<string>();
  const unicos: CandidatoLead[] = [];
  for (const c of candidatos) {
    const chave = c.telefoneE164 ?? c.telefone.replace(/\D/g, "");
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(c);
  }
  return unicos;
}

const PROMPT = `Você extrai contatos de clientes de documentos imobiliários.
Leia o conteúdo e devolve TODOS os contatos que tenham telefone.

Responda EXCLUSIVAMENTE um JSON válido, sem crases e sem texto em volta:
{"leads":[{"nome":"...","telefone":"...","email":null,"imovelInteresse":null,"mensagem":null}]}

Regras:
- Ignore telefones da imobiliária, do corretor ou do rodapé do documento; só contatos de CLIENTES.
- Nome ausente: use null, não invente.
- Não repita o mesmo telefone.
- Máximo 300 contatos.`;

type ParteGemini = { text: string } | { inline_data: { mime_type: string; data: string } };

async function chamarGemini(partes: ParteGemini[]): Promise<CandidatoLead[] | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  // Mais folgado que os 6s do webhook de e-mail: aqui há uma pessoa
  // esperando na tela e o documento pode ter dezenas de páginas.
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: PROMPT }, ...partes] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
    );

    if (!resposta.ok) {
      console.error("[importacao] Gemini respondeu", resposta.status);
      return null;
    }

    const json = await resposta.json();
    const texto = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return null;

    const parsed = JSON.parse(texto);
    const lista = Array.isArray(parsed.leads) ? parsed.leads : Array.isArray(parsed) ? parsed : [];

    return lista
      .slice(0, LIMITE_POR_IMPORTACAO)
      .map((item: Record<string, unknown>) =>
        montar({
          nome: String(item.nome ?? ""),
          telefone: String(item.telefone ?? ""),
          email: item.email ? String(item.email) : null,
          mensagem: item.mensagem ? String(item.mensagem) : null,
          imovelInteresse: item.imovelInteresse ? String(item.imovelInteresse) : null,
        }),
      )
      .filter((c: CandidatoLead | null): c is CandidatoLead => c !== null);
  } catch (erro) {
    console.error("[importacao] falha ao chamar a IA:", erro);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Texto colado ou arquivo de texto: tabela primeiro, IA se não for tabela. */
export async function extrairDeTexto(conteudo: string): Promise<ResultadoExtracao> {
  const limpo = conteudo.trim();
  if (!limpo) return { candidatos: [], metodo: "nenhum", aviso: "Nada foi colado." };

  const tabela = dedupInterno(parsearTabelaLeads(limpo));
  if (tabela.length > 0) return { candidatos: tabela, metodo: "tabela" };

  const daIa = await chamarGemini([{ text: `Conteúdo:\n${limpo.slice(0, 60_000)}` }]);
  if (daIa === null) {
    return {
      candidatos: [],
      metodo: "nenhum",
      aviso:
        "Não reconhecemos uma tabela e a leitura por IA não está disponível. Cole com uma linha por contato, no formato nome;telefone;email.",
    };
  }

  const unicos = dedupInterno(daIa);
  return {
    candidatos: unicos,
    metodo: "ia",
    aviso: unicos.length === 0 ? "Nenhum contato com telefone foi encontrado no texto." : undefined,
  };
}

/**
 * PDF vai inteiro para a IA, em vez de passar por um extrator de texto.
 * Relatório de portal costuma vir em tabela diagramada — e parte deles é
 * imagem escaneada, que extrator de texto devolve em branco.
 */
export async function extrairDePdf(base64: string): Promise<ResultadoExtracao> {
  const daIa = await chamarGemini([
    { inline_data: { mime_type: "application/pdf", data: base64 } },
  ]);

  if (daIa === null) {
    return {
      candidatos: [],
      metodo: "nenhum",
      aviso: "A leitura de PDF depende da IA, que não está configurada neste ambiente.",
    };
  }

  const unicos = dedupInterno(daIa);
  return {
    candidatos: unicos,
    metodo: "ia",
    aviso: unicos.length === 0 ? "Nenhum contato com telefone foi encontrado no PDF." : undefined,
  };
}
