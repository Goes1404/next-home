/**
 * Stub de `server-only` para os testes.
 *
 * O pacote real lança erro quando resolvido fora da condição `react-server`
 * — é assim que ele impede que um módulo de servidor entre num bundle de
 * cliente. Sob o Vitest (ambiente node puro) isso derrubaria qualquer teste
 * que importe, mesmo indiretamente, um módulo marcado como server-only.
 *
 * Trocar pelo vazio aqui preserva a proteção onde ela importa (o build do
 * Next) sem tornar esses módulos intestáveis.
 */
export {};
