/**
 * O que o Storage quis dizer quando recusou o arquivo.
 *
 * Módulo PURO de propósito: a classificação é a parte que erra, e ela precisa
 * de teste sem rede — mesma razão de `motivoDoErro` viver fora do `fetch` em
 * `gerarImagem.ts`.
 *
 * Existe porque a arte já foi PAGA quando esta falha acontece. Uma frase só
 * ("não deu para guardar") obriga quem investiga a abrir o terminal do
 * servidor para saber se o caso é limite, tipo, permissão ou uma piscada de
 * rede — quatro consertos diferentes atrás da mesma tela. É a lição do
 * pareamento que falhava calado, e a da tela de diagnóstico que nomeava
 * "Gemini" em toda frase de falha.
 */
export type MotivoDeStorage =
  | "tamanho"
  | "tipo"
  | "permissao"
  | "bucket"
  | "rede"
  | "desconhecido";

export type FalhaDeStorage = {
  motivo: MotivoDeStorage;
  /** O que a tela mostra. Diz também se insistir adianta. */
  mensagem: string;
  /** `true` = transitório; repetir o pedido pode resolver sozinho. */
  valeTentarDeNovo: boolean;
};

/**
 * A regra de casamento é sobre a MENSAGEM, não o status: o Storage devolve 400
 * para limite e para tipo, então o número não separa os dois. O status entra
 * só como desempate quando o texto não diz nada.
 */
export function classificarFalhaDeStorage(
  mensagemCrua: string | undefined | null,
  status?: string | number | null,
): FalhaDeStorage {
  const texto = (mensagemCrua ?? "").toLowerCase();
  const codigo = String(status ?? "");

  if (/maximum allowed size|payload too large|entity too large|file size/.test(texto) || codigo === "413") {
    return {
      motivo: "tamanho",
      mensagem:
        "A imagem ficou maior que o limite do armazenamento. Tente na qualidade Rápida ou num formato menor.",
      valeTentarDeNovo: false,
    };
  }

  if (/mime type|content type|not supported|invalid_mime/.test(texto)) {
    return {
      motivo: "tipo",
      mensagem:
        "O armazenamento recusou o formato do arquivo. É configuração do bucket, não do seu pedido — avise quem cuida do sistema.",
      valeTentarDeNovo: false,
    };
  }

  if (/row-level security|unauthorized|forbidden|invalid.*(jwt|key|token)|permission/.test(texto) ||
      codigo === "401" || codigo === "403") {
    return {
      motivo: "permissao",
      mensagem:
        "O sistema não tem permissão para guardar a arte. É configuração do ambiente — avise quem cuida do sistema.",
      valeTentarDeNovo: false,
    };
  }

  if (/bucket not found|does not exist/.test(texto) || codigo === "404") {
    return {
      motivo: "bucket",
      mensagem:
        "O destino da arte não existe neste ambiente. É configuração do sistema — avise quem cuida dele.",
      valeTentarDeNovo: false,
    };
  }

  // `fetch failed` local é rede da MÁQUINA, não do Supabase — já custou uma
  // sessão neste projeto com a OpenAI levando a culpa.
  if (/fetch failed|econnreset|etimedout|enotfound|socket hang up|network|timeout|aborted/.test(texto) ||
      codigo.startsWith("5")) {
    return {
      motivo: "rede",
      mensagem: "A conexão com o armazenamento caiu no meio do envio. Tente de novo em instantes.",
      valeTentarDeNovo: true,
    };
  }

  return {
    motivo: "desconhecido",
    mensagem: "A imagem foi criada, mas o armazenamento recusou o arquivo. Tente de novo em instantes.",
    valeTentarDeNovo: true,
  };
}
