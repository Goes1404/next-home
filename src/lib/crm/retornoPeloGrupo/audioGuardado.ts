/**
 * O áudio do relato guardado no Storage, em regras puras (sem rede, sem banco).
 *
 * Fica separado de `audio.ts` (que baixa, guarda e transcreve) para a ficha,
 * a exclusão do lead e a rotina do grupo usarem o bucket e a conferência dos
 * caminhos sem puxar a transcrição junto.
 */

/** Bucket PRIVADO (0218): só a chave de serviço lê e grava. */
export const BUCKET_DO_AUDIO = "retornos-de-ligacao";

/** Quanto tempo vale o link do player na ficha. */
export const SEGUNDOS_DO_LINK_DO_AUDIO = 3600;

/** O que a ficha escreve em cima do relato que veio do grupo. */
export const RETORNO_PELO_GRUPO = "📞 Retorno da ligação (pelo grupo)";

/**
 * Dos caminhos lidos do banco, só os que estão de fato na pasta do grupo
 * (`<grupo>/<arquivo>`, um nível, sem `..`), sem repetidos.
 *
 * O caminho vem de uma coluna que só o servidor grava, mas quem assina o link
 * ou apaga o arquivo usa a chave de serviço, que enxerga o bucket inteiro:
 * conferir o prefixo aqui impede que uma linha torta leve o arquivo de outro
 * grupo.
 */
export function caminhosDeAudioValidos(caminhos: readonly unknown[], grupoId: string): string[] {
  if (!grupoId || grupoId.includes("/") || grupoId.includes("..")) return [];
  const prefixo = `${grupoId}/`;
  const saida = new Set<string>();
  for (const caminho of caminhos) {
    if (typeof caminho !== "string" || !caminho.startsWith(prefixo)) continue;
    const arquivo = caminho.slice(prefixo.length);
    if (!arquivo || arquivo.includes("/") || arquivo.includes("..")) continue;
    saida.add(caminho);
  }
  return [...saida];
}

const RESULTADO_EM_PALAVRAS: Record<string, string> = {
  atendeu: "Atendeu",
  nao_atendeu: "Não atendeu",
  numero_errado: "Número errado",
  pediu_retorno: "Pediu retorno",
};

/** O resultado da ligação em palavras de corretor; valor desconhecido não vira texto cru. */
export function textoDoResultado(resultado: unknown): string | null {
  return typeof resultado === "string" ? (RESULTADO_EM_PALAVRAS[resultado] ?? null) : null;
}

/**
 * Se a linha do histórico é o retorno de uma ligação que o corretor contou no
 * grupo, o que a ficha mostra dela. Qualquer outra linha, `null`.
 */
export function lerRetornoDaInteracao(
  tipo: string,
  detalhes: unknown,
): { resultado: string | null; audioPath: string | null } | null {
  if (tipo !== "ligacao" || typeof detalhes !== "object" || detalhes === null || Array.isArray(detalhes)) return null;
  const d = detalhes as Record<string, unknown>;
  if (d.origem !== "grupo_whatsapp") return null;
  return {
    resultado: textoDoResultado(d.resultado),
    audioPath: typeof d.audio_path === "string" && d.audio_path ? d.audio_path : null,
  };
}
