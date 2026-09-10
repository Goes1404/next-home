import type { Empreendimento, Midia } from "@/lib/types";
import { fatosDoImovel } from "@/lib/imagens/catalogoNoPrompt";

/**
 * O imóvel que o corretor CITOU no chat, virando insumo do prompt.
 *
 * ## Por que isto existe
 *
 * É o único diferencial real desta tela sobre o ChatGPT. Ele gera imagem com o
 * mesmo modelo; o que ele não tem é a ficha e as fotos DESTE empreendimento.
 * Sem este módulo, `fatosDoImovel` ficaria construída e sem chamador — o
 * padrão que esta base já registrou dez vezes e que a auditoria do plano pegou
 * antes de virar a décima primeira.
 *
 * Módulo separado, e não código solto no `turno.ts`, para ser testável sem
 * mock: `turno.ts` fala com LLM e com o Supabase; isto aqui é função pura
 * sobre um objeto.
 *
 * ## Fotos: teto de 8
 *
 * Faixa mais longa vira galeria, e galeria ninguém percorre — a mesma régua do
 * teto de 6 da fila do Início. E só `foto`: planta e tour não são base para
 * gerar imagem de ambiente.
 */

/** O recorte de `Empreendimento` que o prompt consome. */
export function fatosDoImovelCitado(imovel: Empreendimento): string[] {
  return fatosDoImovel({
    nome: imovel.nome,
    bairro: imovel.bairro,
    cidade: imovel.cidade,
    status: imovel.status,
    construtora: imovel.construtora,
    tipologias: (imovel.tipologias ?? []).map((t) => ({
      areaPrivativa: t.areaPrivativa,
      dormitorios: t.dormitorios,
      vagas: t.vagas,
    })),
    lazer: imovel.lazer ?? [],
  });
}

export type FotoCandidata = { id: string; url: string; alt: string };

const TETO_DE_FOTOS = 8;

/**
 * O `id` é obrigatório aqui, e não é detalhe: é ele que a rota recebe.
 *
 * Mandar a URL faria o servidor baixar um endereço escolhido pelo cliente —
 * a porta para ler qualquer coisa da internet. Com o id, quem decide o acesso
 * é a RLS sobre `midias`, que é a fonte de verdade. Mídia sem id (placeholder,
 * que não veio do banco) simplesmente não entra na faixa.
 */
export function fotosParaReferencia(imovel: Empreendimento): FotoCandidata[] {
  const midias: Midia[] = imovel.midias ?? imovel.galeria ?? [];
  return midias
    .filter((m) => (m as { tipo?: string }).tipo === "foto" && typeof m.id === "string")
    .slice(0, TETO_DE_FOTOS)
    .map((m) => ({ id: m.id as string, url: m.url, alt: m.alt ?? "" }));
}
