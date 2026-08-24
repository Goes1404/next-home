import type { Empreendimento } from "@/lib/types";
import type { RespostaAgenteIA } from "./aiAgent";
import { soarHumano } from "./vozHumana";
import { removerValores } from "./semValores";
import { midiasJaEnviadas, resolverAnexos, type AnexoResolvido } from "./resolverMidia";
import { corrigirVisitaNoPassado, verificarCoerenciaVisita } from "./coerenciaVisita";
import { ehRepeticaoDoBot, textoNoLugarDaRepeticao } from "./repeticao";

/**
 * Guardrails de saída: nada sai para o WhatsApp do cliente sem conferir
 * contra o catálogo.
 *
 * O modelo é instruído a só usar mídias do catálogo — mas instrução não é
 * garantia, e uma URL alucinada ia direto para `sendMedia` como anexo real
 * (o único filtro era `a?.url` truthy). Aqui é o trilho do padrão híbrido
 * "trilho + IA": a conversa é livre, os FATOS (mídia, imóvel citado) são
 * validados por código.
 *
 * Além dos fatos, o trilho normaliza a VOZ: `soarHumano` tira o markdown
 * que o WhatsApp não renderiza e as aberturas de manual de atendimento.
 * Isso mora aqui, e não só no prompt, porque instrução de prompt é
 * probabilística — falha justo na resposta que importa — enquanto uma
 * função determinística vale sempre e é testável.
 *
 * Módulo puro de propósito: sem rede e sem banco, para o eval e o vitest
 * exercitarem exatamente o que roda em produção.
 */

export type RespostaSaneada = {
  resposta: RespostaAgenteIA;
  /** Anexos JÁ RESOLVIDOS contra o catálogo — é isto que o webhook envia. */
  anexos: AnexoResolvido[];
  /** A resposta citava um valor e teve de ser limpa? */
  valorRemovido: boolean;
  /** Telemetria: quanta alucinação o trilho segurou (ver ia_interacoes). */
  anexosBloqueados: number;
  /** Anexos que a IA pediu de novo e já tinham sido enviados nesta conversa. */
  anexosRepetidos: number;
  slugsBloqueados: number;
  /** A visita foi descartada por prometer um dia e agendar outro? */
  visitaIncoerente: boolean;
  /** A resposta repetia, palavra por palavra, algo que o bot já tinha dito? */
  repeticaoBloqueada: boolean;
};


export function sanearRespostaIA(
  resposta: RespostaAgenteIA,
  catalogo: Empreendimento[],
  /*
   * O histórico entra aqui só para uma coisa: saber que mídia já foi
   * mandada nesta conversa. A IA entrava em loop reenviando as mesmas
   * fotos, e "não repita" no prompt não segurava — o que segura é a lista
   * do que já saiu.
   */
  historico?: { remetente: string; texto: string }[],
): RespostaSaneada {
  const slugsPermitidos = new Set(catalogo.map((e) => e.slug));

  /*
   * A IA pede mídia por slug + tipo; quem monta a URL é o código. Isso
   * torna alucinação de URL impossível por construção — antes, ela tinha
   * de copiar um hash de 32 caracteres e errava sempre (0 anexos enviados
   * e 6 bloqueados em produção).
   */
  const { anexos, pedidosSemMidia, repetidos } = resolverAnexos(
    resposta.anexosMidia,
    catalogo,
    midiasJaEnviadas(historico),
  );
  if (pedidosSemMidia.length > 0) {
    console.warn(`[guardrails] mídia pedida e não encontrada: ${pedidosSemMidia.join("; ")}`);
  }

  const recomendadosValidos = (resposta.imoveisRecomendados ?? []).filter(
    (r) => r?.slug && slugsPermitidos.has(r.slug),
  );

  /*
   * Valor sai do texto ANTES de qualquer outra coisa. A regra do negócio é
   * que a IA não fala preço — e prompt sozinho vaza, principalmente quando
   * o cliente pergunta duas ou três vezes seguidas.
   */
  const semValor = removerValores(soarHumano(resposta.textoResposta ?? ""));

  /*
   * Repetição literal do que o bot já disse. Medido: 23 das 80 mensagens
   * enviadas em produção fazem parte de grupos de repetição exata — a
   * mesma frase contra três arquivos diferentes, a mesma ficha do imóvel
   * contra quatro perguntas diferentes. É o "looping" que a própria
   * corretora anotou no chat.
   *
   * Vem DEPOIS de `soarHumano` e `removerValores` de propósito: o que se
   * compara é o texto que o cliente vai ler, não o que o modelo escreveu —
   * duas respostas diferentes na origem podem virar a mesma depois da
   * limpeza, e nesse caso o cliente vê repetição do mesmo jeito.
   */
  const repetiu = ehRepeticaoDoBot(semValor.texto, historico);
  if (repetiu) {
    console.warn(`[guardrails] repetição bloqueada: ${semValor.texto.slice(0, 80)}`);
  }
  const texto = repetiu ? textoNoLugarDaRepeticao(historico) : semValor.texto;

  /*
   * A visita só passa se a data BATER com o dia prometido no texto. Uma
   * proposta que diz "sábado" e agenda domingo colocaria o cliente e o
   * corretor em dias diferentes — melhor não gravar visita nenhuma e deixar
   * o corretor combinar, do que gravar a errada.
   */
  const visita = resposta.visitaProposta;
  /*
   * Antes de checar coerência, rola para a frente a data que já passou. Os
   * modelos escolhem o sábado ANTERIOR quando o cliente pede "sábado" — foi
   * medido em três deles no mesmo dia — e a proposta morria em
   * `validarDataVisita`, deixando sem visita justamente o cliente que a
   * pediu. Só age quando o dia da semana bate com o prometido no texto:
   * divergência de verdade continua sendo descartada logo abaixo.
   */
  const dataVisita = visita?.dataHoraISO
    ? corrigirVisitaNoPassado(visita.dataHoraISO, texto)
    : undefined;
  const coerencia = dataVisita
    ? verificarCoerenciaVisita(texto, dataVisita)
    : ({ coerente: true } as const);

  if (!coerencia.coerente) {
    console.warn(
      `[guardrails] visita descartada: texto promete dia ${coerencia.diaNoTexto}, ` +
        `data ${visita?.dataHoraISO} é dia ${coerencia.diaNaData}`,
    );
  }

  return {
    resposta: {
      ...resposta,
      textoResposta: texto,
      anexosMidia: resposta.anexosMidia ?? [],
      imoveisRecomendados: recomendadosValidos,
      visitaProposta:
        coerencia.coerente && visita && dataVisita
          ? { ...visita, dataHoraISO: dataVisita }
          : coerencia.coerente
            ? resposta.visitaProposta
            : null,
    },
    anexos,
    valorRemovido: semValor.removeu,
    anexosRepetidos: repetidos,
    anexosBloqueados: pedidosSemMidia.length,
    slugsBloqueados: (resposta.imoveisRecomendados?.length ?? 0) - recomendadosValidos.length,
    visitaIncoerente: !coerencia.coerente,
    repeticaoBloqueada: repetiu,
  };
}
