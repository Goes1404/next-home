/**
 * Normalização de telefone brasileiro para o formato que o WhatsApp exige.
 *
 * ## Por que este arquivo existe
 *
 * O provedor só tirava a pontuação (`replace(/\D/g, "")`). Um lead cadastrado
 * como `11.95721-6675` virava `11957216675` — onze dígitos, **sem o código do
 * país**. A Evolution responde a isso com `HTTP 400` e `"exists": false`, que
 * o sistema traduz para "Número não está no WhatsApp".
 *
 * Ou seja: o erro acusava o DADO DO LEAD por um defeito do nosso envio. E era
 * um erro DEFINITIVO — `ehDestinatarioInexistente` marca o item sem
 * retentativa, de propósito, porque um número que não existe não passa a
 * existir em 30 minutos. Resultado: o lead era queimado para sempre por uma
 * vírgula no cadastro.
 *
 * Medido em produção (27/08/2026): **37 dos 95 leads** com telefone (39%)
 * estavam sem o `55` e falhariam exatamente assim. Todos os 95 tinham a
 * coluna `telefone_e164` correta — o banco já sabia normalizar; só o código
 * de envio não.
 *
 * ## Espelha `normalizar_telefone_br` (Postgres), de propósito
 *
 * A coluna gerada `leads.telefone_e164` usa aquela função. Duas regras
 * diferentes para a mesma coisa divergiriam, e a divergência apareceria como
 * "esse lead recebe e aquele não" — o pior tipo de defeito para diagnosticar.
 * Qualquer mudança aqui tem de acontecer lá também.
 */

/**
 * Devolve o número em dígitos com DDI, ou `null` quando não dá para
 * aproveitar nada.
 *
 * `null` em vez de "melhor esforço" é deliberado: mandar para um número
 * inventado é pior do que não mandar — gasta cota, conta como falha do
 * provedor e pode alcançar um desconhecido.
 */
export function normalizarTelefoneBr(bruto: string | null | undefined): string | null {
  const n = (bruto ?? "").replace(/\D/g, "");

  if (n.length === 0) return null;
  // Já tem DDI: 55 + DDD + 8 ou 9 dígitos.
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return n;
  // DDD + número, sem DDI — o caso dos 37 leads.
  if (n.length === 10 || n.length === 11) return `55${n}`;
  // Só o número, sem DDD: assume São Paulo, como o banco faz. É um palpite,
  // mas é o mesmo palpite dos dois lados, e o cadastro da imobiliária é de
  // uma cidade só.
  if (n.length === 8 || n.length === 9) return `5511${n}`;
  // Estrangeiro ou formato que não reconhecemos: passa como está em vez de
  // inventar um DDI brasileiro em cima.
  if (n.length >= 8) return n;

  return null;
}
