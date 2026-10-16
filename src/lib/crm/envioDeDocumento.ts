/**
 * Regras do envio de documento que valem no navegador E no servidor
 * (16/10/2026): o formato que o arquivo de fato tem, a frase de erro que diz
 * a causa real, e a dica de cada item da lista.
 *
 * Módulo PURO de propósito: o navegador do cliente o importa, e qualquer
 * dependência de servidor aqui iria junto para a página pública.
 */

export { formatoDoArquivo } from "./linksDoCliente";

/**
 * Por que o envio falhou, na língua de quem está com o celular na mão.
 *
 * Antes toda falha virava "Sem conexão. Tente de novo." — inclusive o
 * arquivo grande demais, que nunca vai passar, por mais que se tente. Cada
 * causa aqui pede uma ação diferente, e a frase diz qual.
 */
export function motivoDaFalhaDeEnvio(erro: unknown): string {
  const texto =
    erro instanceof Error
      ? `${erro.name} ${erro.message}`
      : typeof erro === "string"
        ? erro
        : erro && typeof erro === "object" && "message" in erro
          ? String((erro as { message: unknown }).message)
          : "";
  const t = texto.toLowerCase();

  if (/payload too large|entity too large|exceeded the maximum|maximum allowed size|\b413\b/.test(t)) {
    return "O arquivo é grande demais (máximo 10 MB). Se for PDF escaneado, salve com qualidade menor ou mande uma foto de cada página.";
  }
  if (/mime type|invalid_mime|not supported|\b415\b/.test(t)) {
    return "Formato não aceito. Envie PDF ou foto (JPG, PNG, WEBP ou HEIC).";
  }
  if (/signature|jwt|expired|\b403\b|\b401\b/.test(t)) {
    return "A autorização do envio expirou. Toque em enviar de novo.";
  }
  if (/failed to fetch|load failed|networkerror|network request failed|fetch failed|the internet connection|offline|aborted/.test(t)) {
    return "Sem internet no momento. Confira a conexão e toque em enviar de novo — nada se perdeu.";
  }
  return "O armazenamento recusou o arquivo agora. Tente de novo em alguns instantes; se continuar, avise seu corretor.";
}

/** Uma linha de ajuda por documento: o que costuma voltar recusado. */
const DICAS: { casa: RegExp; dica: string }[] = [
  // Antes do RG: "CPF (se não estiver no RG/CNH)" cita o RG.
  { casa: /\bcpf\b/, dica: "Só se o número não aparecer no RG ou na CNH." },
  { casa: /\b(rg|cnh)\b/, dica: "Frente e verso, fora da capa plástica, com a foto e os números legíveis. A CNH digital em PDF também vale." },
  { casa: /comprovante de residencia/, dica: "Conta de luz, água, gás, internet ou telefone de até 90 dias, com o endereço inteiro." },
  { casa: /uniao estavel/, dica: "Certidão de casamento ou a declaração de união estável registrada em cartório." },
  { casa: /estado civil|certidao/, dica: "Solteiro: certidão de nascimento. Casado ou divorciado: certidão de casamento, com a averbação se houver." },
  { casa: /holerite|comprovante de renda/, dica: "Os 3 últimos meses. Pode mandar um arquivo por mês." },
  { casa: /fgts/, dica: "O extrato completo em PDF, baixado no app FGTS." },
  { casa: /imposto de renda/, dica: "A declaração completa e o recibo de entrega, em PDF." },
  { casa: /extratos? bancarios?/, dica: "Os últimos 6 meses, em PDF baixado do app do banco." },
  { casa: /pro-labore|decore/, dica: "O DECORE é emitido pelo seu contador." },
  { casa: /proposta assinada|contrato .*assinado/, dica: "Todas as páginas, com as assinaturas visíveis." },
  { casa: /comprovante do sinal/, dica: "O comprovante do Pix ou da transferência, com data e valor." },
  { casa: /ficha cadastral/, dica: "Preenchida e assinada. Se não tiver a ficha, peça ao seu corretor." },
  { casa: /carta de aprovacao/, dica: "A carta que o banco enviou depois de aprovar o crédito." },
];

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** A dica do item, ou `null` quando o corretor escreveu um item que não conhecemos. */
export function dicaDoDocumento(item: string): string | null {
  const t = semAcento(item);
  return DICAS.find((d) => d.casa.test(t))?.dica ?? null;
}
