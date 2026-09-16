import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import { extrairVariosLeadsViaRegex } from "@/lib/inbound/regexFallback";
import { extrairTextoDePdf } from "./pdfTexto";
import {
  ehExportDeConversa,
  normalizar as normalizarRotulo,
  parsearConversaWhatsapp,
  type AutorDaConversa,
} from "./whatsappExport";
import { lerZip, type MotivoZipIlegivel } from "./zipLeitura";

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
  metodo: "tabela" | "texto" | "ia" | "whatsapp" | "nenhum";
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

  // Mesma escada do PDF: antes de gastar uma chamada de IA, tenta o extrator
  // por regex, que já resolve lista solta no formato "Nome — telefone".
  const doRegex = dedupInterno(
    extrairVariosLeadsViaRegex({ text: limpo }).map((lead) =>
      montarDeExtraido(lead.nome, lead.telefone, lead.email, lead.mensagemOriginal, lead.imovelInteresse),
    ),
  );
  if (doRegex.length > 0) return { candidatos: doRegex, metodo: "texto" };

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
 * PDF, em três tentativas, da mais barata e verificável para a mais cara.
 *
 *   1. Texto embutido no arquivo (`pdfTexto.ts`) lido como tabela. Relatório
 *      de portal e lista exportada são PDF de texto: o conteúdo está lá
 *      dentro, e descomprimir é mais confiável do que pedir a um modelo que
 *      leia o que já está escrito.
 *   2. O mesmo texto pelo extrator por regex do inbound, que já sabe achar
 *      pares nome/telefone em texto corrido — é o formato de relatório que
 *      não vira tabela ao virar texto.
 *   3. IA, com o PDF inteiro. É o caminho do PDF escaneado (página é imagem,
 *      não há texto a extrair) e do diagramado que confunde os dois de cima.
 *
 * Só o passo 3 depende de GEMINI_API_KEY. Sem a chave, PDF de texto continua
 * funcionando — que é a maior parte do que chega.
 */
export async function extrairDePdf(pdf: Buffer | Uint8Array): Promise<ResultadoExtracao> {
  const texto = extrairTextoDePdf(pdf);

  if (texto) {
    const daTabela = dedupInterno(parsearTabelaLeads(texto));
    if (daTabela.length > 0) return { candidatos: daTabela, metodo: "texto" };

    const doRegex = dedupInterno(
      extrairVariosLeadsViaRegex({ text: texto }).map((lead) =>
        montarDeExtraido(lead.nome, lead.telefone, lead.email, lead.mensagemOriginal, lead.imovelInteresse),
      ),
    );
    if (doRegex.length > 0) return { candidatos: doRegex, metodo: "texto" };
  }

  const daIa = await chamarGemini([
    {
      inline_data: {
        mime_type: "application/pdf",
        data: Buffer.isBuffer(pdf) ? pdf.toString("base64") : Buffer.from(pdf).toString("base64"),
      },
    },
  ]);

  if (daIa === null) {
    return {
      candidatos: [],
      metodo: "nenhum",
      aviso: texto
        ? "O PDF tem texto, mas nenhum telefone reconhecível. Confira o arquivo ou cole os contatos na outra aba."
        : "Este PDF não tem texto embutido — provavelmente é escaneado. A leitura por imagem depende da IA, que não está configurada neste ambiente.",
    };
  }

  const unicos = dedupInterno(daIa);
  return {
    candidatos: unicos,
    metodo: "ia",
    aviso: unicos.length === 0 ? "Nenhum contato com telefone foi encontrado no PDF." : undefined,
  };
}

/** Ponte entre o `LeadExtraido` do inbound e o candidato desta importação. */
function montarDeExtraido(
  nome: string,
  telefone: string,
  email: string | null | undefined,
  mensagem: string | null | undefined,
  imovel: string | null | undefined,
): CandidatoLead {
  return (
    montar({
      nome,
      telefone,
      email: email ?? null,
      mensagem: mensagem ?? null,
      imovelInteresse: imovel ?? null,
    }) ?? {
      // `montar` só devolve null quando o telefone não presta, e o extrator
      // por regex já garante o contrário — este ramo é defensivo.
      nome,
      telefone,
      telefoneE164: normalizarTelefoneBrasileiro(telefone),
      email: email ?? null,
      mensagem: mensagem ?? null,
      imovelInteresse: imovel ?? null,
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Conversa exportada do WhatsApp (.zip)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Quem exportou — para que a fala DELE não vire lead.
 *
 * Numa conversa de duas pessoas o nome do arquivo já resolve isso sozinho
 * (ver `descobrirDono` em `whatsappExport.ts`). Em GRUPO não há nada no
 * arquivo que diga quem é quem, e é aqui que o cadastro do corretor da
 * sessão entra: o WhatsApp dele e o nome dele são a única fonte confiável.
 */
export type DonoDaExportacao = {
  nome?: string | null;
  /** O número do aparelho que exportou, em qualquer formato. */
  telefone?: string | null;
};

/** O `.txt` da conversa é minúsculo; o teto existe contra zip bomb. */
const LIMITE_TEXTO_DO_ZIP = 8 * 1024 * 1024;

const EXTENSOES_DE_TEXTO = [".txt", ".csv", ".tsv"];

const RECADO_DO_ZIP: Record<MotivoZipIlegivel, string> = {
  nao_e_zip:
    "Este arquivo não é um .zip válido. Reenvie o arquivo que o WhatsApp gerou, sem abrir nem recompactar.",
  vazio: "O .zip está vazio.",
  protegido_por_senha: "O .zip está protegido por senha e não pode ser lido aqui.",
  zip64:
    "Este .zip usa um formato que não conseguimos ler. Exporte a conversa de novo, escolhendo “Sem mídia”.",
  compressao_desconhecida:
    "Este .zip usa uma compressão que não conseguimos ler. Exporte a conversa de novo pelo próprio WhatsApp.",
  corrompido: "O .zip chegou incompleto ou corrompido. Envie de novo.",
};

/**
 * O rótulo do autor vira telefone só quando ele é SÓ telefone.
 *
 * Contato salvo aparece pelo nome; contato desconhecido aparece como
 * "+55 11 99123-4567" — e é esse o caso de quase todo cliente, porque
 * cliente novo não está na agenda de ninguém.
 *
 * O DDI é conferido antes de normalizar, e isso não é preciosismo: um
 * "+1 415 555 2671" tem onze dígitos, exatamente como um celular brasileiro
 * com DDD, e `normalizarTelefoneBrasileiro` carimbaria um `55` na frente —
 * criando um número que existe e é de outra pessoa. Número estrangeiro entra
 * cru, sem E.164, para o corretor decidir na revisão.
 */
function telefoneDoRotulo(rotulo: string): { telefone: string; e164: string | null } | null {
  const limpo = rotulo.trim();
  if (!/^\+?[\d\s().\-‑–]+$/.test(limpo)) return null;

  const digitos = limpo.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;

  const brasileiro = limpo.startsWith("+") ? digitos.startsWith("55") : digitos.length <= 11;
  return { telefone: limpo, e164: brasileiro ? normalizarTelefoneBrasileiro(limpo) : null };
}

/**
 * As primeiras falas do cliente viram a "mensagem" da ficha.
 *
 * São elas que dizem o que ele quer — "vi o anúncio do Vitra, ainda tem de 2
 * dormitórios?" — e é isso que o corretor lê antes de retomar o contato.
 * Cinco é o bastante para a intenção aparecer sem transformar o campo num
 * despejo da conversa inteira.
 */
function primeirasFalas(autor: AutorDaConversa): string | null {
  const texto = autor.mensagens.slice(0, 5).join(" ").trim();
  return texto ? texto.slice(0, 2000) : null;
}

function candidatoDoAutor(autor: AutorDaConversa): CandidatoLead {
  const doRotulo = telefoneDoRotulo(autor.rotulo);

  return {
    // Sem nome utilizável, a identidade é o telefone — é ele que distingue
    // uma linha da outra na revisão e é ele que o corretor reconhece.
    nome: doRotulo ? "Contato sem nome" : autor.rotulo.slice(0, 120),
    telefone: doRotulo?.telefone.slice(0, 40) ?? "",
    telefoneE164: doRotulo?.e164 ?? null,
    email: null,
    mensagem: primeirasFalas(autor),
    imovelInteresse: null,
  };
}

/**
 * Lê o "Exportar conversa" do WhatsApp e devolve os participantes como leads.
 *
 * O `.zip` do WhatsApp é um contêiner comum, então ele serve para mais que
 * conversa: um `.csv` compactado cai no mesmo caminho e segue para
 * `extrairDeTexto`. Só as MÍDIAS ficam de fora — elas são quase todo o peso
 * do arquivo e não têm contato dentro.
 *
 * Um participante SEM telefone (contato salvo na agenda) continua vindo na
 * lista, com o telefone em branco. É o caso mais comum quando o corretor
 * exporta a conversa de um cliente que ele já tinha salvo, e descartá-lo
 * calado devolveria "nenhum contato encontrado" para um arquivo que tem um.
 * Quem preenche o número é ele, na revisão — está no celular dele.
 */
export async function extrairDeZipWhatsapp(
  zip: Buffer | Uint8Array,
  dono?: DonoDaExportacao,
): Promise<ResultadoExtracao> {
  const leitura = lerZip(Buffer.from(zip), {
    aceitar: (nome) => {
      const minusculo = nome.toLowerCase();
      // `__MACOSX/` é a sombra de metadados que o Finder cria ao recompactar:
      // tem os mesmos nomes e conteúdo nenhum.
      if (minusculo.startsWith("__macosx/") || minusculo.includes("/._")) return false;
      return EXTENSOES_DE_TEXTO.some((ext) => minusculo.endsWith(ext));
    },
    limiteDescomprimido: LIMITE_TEXTO_DO_ZIP,
  });

  if (!leitura.ok) return { candidatos: [], metodo: "nenhum", aviso: RECADO_DO_ZIP[leitura.motivo] };

  if (leitura.arquivos.length === 0) {
    return {
      candidatos: [],
      metodo: "nenhum",
      aviso:
        "Não achamos nenhum arquivo de texto dentro do .zip — só mídia. No WhatsApp, use Exportar conversa → Sem mídia.",
    };
  }

  // O maior arquivo de texto é a conversa: os outros, quando existem, são
  // avisos curtos que o próprio WhatsApp acrescenta.
  const principal = leitura.arquivos.reduce((maior, atual) =>
    atual.conteudo.length > maior.conteudo.length ? atual : maior,
  );
  const texto = principal.conteudo.toString("utf8");

  // `.zip` não é sinônimo de conversa. Lista compactada segue o caminho de
  // sempre, em vez de morrer com "formato não suportado" por causa do envelope.
  if (!ehExportDeConversa(texto)) return extrairDeTexto(texto);

  const conversa = parsearConversaWhatsapp(texto, principal.nome);

  const rotulosDoDono = new Set<string>();
  if (conversa.donoProvavel) rotulosDoDono.add(normalizarRotulo(conversa.donoProvavel));
  if (dono?.nome) rotulosDoDono.add(normalizarRotulo(dono.nome));
  const e164DoDono = dono?.telefone ? normalizarTelefoneBrasileiro(dono.telefone) : null;

  const dosOutros = conversa.autores.filter((autor) => {
    if (rotulosDoDono.has(normalizarRotulo(autor.rotulo))) return false;
    const doRotulo = telefoneDoRotulo(autor.rotulo);
    return !(e164DoDono && doRotulo?.e164 === e164DoDono);
  });

  if (dosOutros.length === 0) {
    return {
      candidatos: [],
      metodo: "nenhum",
      aviso:
        conversa.totalDeMensagens === 0
          ? "O arquivo de conversa veio sem nenhuma mensagem."
          : "Só encontramos as suas próprias mensagens nesta conversa.",
    };
  }

  // Quem mais falou primeiro: numa exportação de grupo, é a ordem em que o
  // corretor quer olhar — e a lista de revisão é lida de cima para baixo.
  const candidatos = dosOutros
    .slice()
    .sort((a, b) => b.mensagens.length - a.mensagens.length)
    .slice(0, LIMITE_POR_IMPORTACAO)
    .map(candidatoDoAutor);

  const semTelefone = candidatos.filter((c) => !c.telefone).length;

  return {
    candidatos,
    metodo: "whatsapp",
    aviso:
      semTelefone > 0
        ? `${semTelefone} ${semTelefone === 1 ? "contato está salvo" : "contatos estão salvos"} na sua agenda, e o WhatsApp não exporta o número de quem está salvo. ${semTelefone === 1 ? "Preencha o telefone na linha" : "Preencha os telefones nas linhas"} antes de confirmar.`
        : undefined,
  };
}
