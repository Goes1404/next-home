/**
 * Proporção do quadro de uma foto no CELULAR, presa entre dois limites.
 *
 * As fotos do catálogo são quase todas panorâmicas: os renders de
 * construtora medem 2:1 a 2,4:1. Num quadro fixo de retrato (4:5, 3:4) o
 * `object-cover` deixava um terço da largura da foto, ampliado para a tela
 * inteira — sobrava um pedaço de parede, sem sentido (relato de 13/10/2026,
 * Dom Parque). O quadro passa a seguir a foto, com dois limites:
 *
 * - `max` (padrão 3:2): mais largo que isso, a foto fica uma faixa baixa
 *   no meio da tela. Um 2:1 recortado para 3:2 ainda mostra 75% da largura.
 * - `min` (padrão 4:5): foto em pé continua em pé, mas não vira um poste.
 *
 * Medida ausente ou inválida cai em `max`: a maioria do catálogo é larga.
 */
export function proporcaoNoCelular(
  foto: { largura?: number | null; altura?: number | null },
  limites: { min?: number; max?: number } = {},
): number {
  const min = limites.min ?? 4 / 5;
  const max = limites.max ?? 3 / 2;
  const { largura, altura } = foto;
  if (!largura || !altura || largura <= 0 || altura <= 0) return max;
  return Math.min(max, Math.max(min, largura / altura));
}
