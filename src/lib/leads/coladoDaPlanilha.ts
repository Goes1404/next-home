import { lerNumeroDePlanilha } from "@/lib/inbound/phoneUtils";

/**
 * Colar da planilha sem perder os dígitos do telefone.
 *
 * O Excel e o Google Planilhas mostram número de 12 dígitos ou mais (todo
 * celular com o 55 na frente) em notação científica, e o texto que vai para a
 * área de transferência é o que a tela mostra: "5,51198E+12", sem os últimos
 * sete dígitos. Só que a cópia leva junto uma versão em HTML da tabela, e
 * nela o valor de verdade viaja num atributo da célula:
 *
 * - Excel: `x:num="5511981918127"`;
 * - Google Planilhas: `data-sheets-value='{"1":3,"3":5511981918127}'` (tipo 3
 *   é número, e a chave "3" guarda o valor);
 * - LibreOffice: `sdval="5511981918127"`.
 *
 * Aqui o texto colado volta com o número inteiro. A troca só acontece quando
 * a tabela do HTML bate com o texto (mesmo número de linhas, e as outras
 * células da linha iguais) e quando o valor escondido arredonda exatamente
 * para o que a tela mostrava. Na dúvida, o texto fica como veio, e a
 * importação marca a linha (ver `lerNumeroDePlanilha`). Trocar errado mandaria
 * a mensagem para a pessoa da linha de cima.
 */

type CelulaHtml = { texto: string; valor: string | null };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodificar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
    if (nome[0] === "#") {
      const codigo = nome[1] === "x" || nome[1] === "X" ? parseInt(nome.slice(2), 16) : Number(nome.slice(1));
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
    }
    return ENTIDADES[nome.toLowerCase()] ?? inteira;
  });
}

/** Espaço comum e o duro (`&nbsp;` do Excel) contam igual; as pontas não contam. */
function normalizar(texto: string): string {
  return texto.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function atributo(atributos: string, nome: string): string | null {
  const m = atributos.match(new RegExp(`(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return decodificar(m[1] ?? m[2] ?? m[3] ?? "");
}

/** Os dígitos do valor escondido na célula, se ele for um número inteiro. */
function valorDaCelula(atributos: string): string | null {
  const daSheets = atributo(atributos, "data-sheets-value");
  if (daSheets) {
    try {
      const dado = JSON.parse(daSheets) as Record<string, unknown>;
      const numero = dado["3"];
      if (dado["1"] === 3 && typeof numero === "number" && Number.isInteger(numero) && numero > 0) {
        return numero.toFixed(0);
      }
    } catch {
      // Formato interno do Google, sem documentação: se mudar, o texto fica como veio.
    }
    return null;
  }

  const bruto = atributo(atributos, "x:num") ?? atributo(atributos, "sdval");
  if (!bruto) return null;
  if (/^\d+$/.test(bruto)) return bruto;
  const lido = lerNumeroDePlanilha(bruto);
  return lido?.tipo === "inteiro" ? lido.digitos : null;
}

function linhasDoHtml(html: string): CelulaHtml[][] | null {
  const linhas: CelulaHtml[][] = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celulas: CelulaHtml[] = [];
    for (const td of tr[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const atributos = td[2];
      // Célula mesclada desloca as posições de um jeito que o texto não
      // registra. Com ela, nenhuma troca é segura.
      if (Number(atributo(atributos, "rowspan") ?? 1) > 1) return null;
      const texto = normalizar(decodificar(td[3].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")));
      celulas.push({ texto, valor: valorDaCelula(atributos) });
      for (let extra = Number(atributo(atributos, "colspan") ?? 1); extra > 1; extra -= 1) {
        celulas.push({ texto: "", valor: null });
      }
    }
    linhas.push(celulas);
  }
  return linhas;
}

/**
 * O valor escondido é o mesmo número que a tela mostrava? "5,51198E+12" diz:
 * 13 dígitos, e os seis primeiros, arredondados, são 551198.
 */
function batemComOMostrado(mostrado: string, digitos: string): boolean {
  const m = mostrado.replace(/\s+/g, "").match(/^\+?(\d+)(?:[.,](\d+))?[eE]\+?(\d{1,2})$/);
  if (!m) return false;
  const inteira = m[1].replace(/^0+/, "");
  const algarismos = inteira + (m[2] ?? "");
  if (!inteira || digitos.length !== inteira.length + Number(m[3])) return false;

  // Até 15 dígitos: o `Number` guarda todos sem arredondar.
  let prefixo = Number(digitos.slice(0, algarismos.length));
  if (Number(digitos[algarismos.length] ?? "0") >= 5) prefixo += 1;
  return prefixo === Number(algarismos);
}

export function recuperarNumerosColados(texto: string, html: string): { texto: string; recuperados: number } {
  const intacto = { texto, recuperados: 0 };
  if (!html || !/<tr\b/i.test(html)) return intacto;

  const linhasDoTexto = texto.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const cortadas = linhasDoTexto.some((linha) =>
    linha.split("\t").some((celula) => lerNumeroDePlanilha(celula)?.tipo === "cortado"),
  );
  if (!cortadas) return intacto;

  const tabela = linhasDoHtml(html);
  if (!tabela || tabela.length !== linhasDoTexto.length) return intacto;

  let recuperados = 0;
  const novas = linhasDoTexto.map((linha, i) => {
    const celulas = linha.split("\t");
    const doHtml = tabela[i];

    // A linha do HTML é a mesma linha do texto? Toda célula que não é
    // número cortado tem de ser igual nas duas versões.
    const mesmaLinha = celulas.every((celula, j) => {
      if (lerNumeroDePlanilha(celula)?.tipo === "cortado") return true;
      return normalizar(celula) === (doHtml[j]?.texto ?? "");
    });
    if (!mesmaLinha) return linha;

    let trocou = false;
    const corrigidas = celulas.map((celula, j) => {
      if (lerNumeroDePlanilha(celula)?.tipo !== "cortado") return celula;
      const valor = doHtml[j]?.valor;
      if (!valor || !batemComOMostrado(celula, valor)) return celula;
      trocou = true;
      recuperados += 1;
      return valor;
    });
    return trocou ? corrigidas.join("\t") : linha;
  });

  return recuperados > 0 ? { texto: novas.join("\n"), recuperados } : intacto;
}
