import type { Empreendimento } from "@/lib/types";
import type { RespostaAgenteIA } from "./aiAgent";
import { soarHumano } from "./vozHumana";
import { removerValores } from "./semValores";
import { resolverAnexos, type AnexoResolvido } from "./resolverMidia";
import { verificarCoerenciaVisita } from "./coerenciaVisita";

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
  slugsBloqueados: number;
  /** A visita foi descartada por prometer um dia e agendar outro? */
  visitaIncoerente: boolean;
};


export function sanearRespostaIA(
  resposta: RespostaAgenteIA,
  catalogo: Empreendimento[],
): RespostaSaneada {
  const slugsPermitidos = new Set(catalogo.map((e) => e.slug));

  /*
   * A IA pede mídia por slug + tipo; quem monta a URL é o código. Isso
   * torna alucinação de URL impossível por construção — antes, ela tinha
   * de copiar um hash de 32 caracteres e errava sempre (0 anexos enviados
   * e 6 bloqueados em produção).
   */
  const { anexos, pedidosSemMidia } = resolverAnexos(resposta.anexosMidia, catalogo);
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
  const texto = semValor.texto;

  /*
   * A visita só passa se a data BATER com o dia prometido no texto. Uma
   * proposta que diz "sábado" e agenda domingo colocaria o cliente e o
   * corretor em dias diferentes — melhor não gravar visita nenhuma e deixar
   * o corretor combinar, do que gravar a errada.
   */
  const visita = resposta.visitaProposta;
  const coerencia = visita?.dataHoraISO
    ? verificarCoerenciaVisita(texto, visita.dataHoraISO)
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
      visitaProposta: coerencia.coerente ? resposta.visitaProposta : null,
    },
    anexos,
    valorRemovido: semValor.removeu,
    anexosBloqueados: pedidosSemMidia.length,
    slugsBloqueados: (resposta.imoveisRecomendados?.length ?? 0) - recomendadosValidos.length,
    visitaIncoerente: !coerencia.coerente,
  };
}
