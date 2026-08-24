/**
 * O cliente pediu para ser LIGADO.
 *
 * Veio da análise de erro de 23/08/2026 (categoria F6). Trace real, conversa
 * …6256: o cliente escreve "me liga" e a IA responde "Consigo te ligar sim!
 * --- Como já está tarde, posso te ligar amanhã de manhã?".
 *
 * A leitura fácil seria proibir a promessa — a IA não tem telefone. Mas a
 * leitura certa é outra: quem liga é o CORRETOR, e o sistema já sabe
 * transferir para ele (`transferirHumano` dispara o alerta completo, com
 * dossiê). O problema nunca foi prometer; foi prometer sem garantir que
 * alguém do outro lado ficasse sabendo. Naquele trace o alerta dependia de
 * o modelo ter marcado `transferirHumano` — e ele não marcou.
 *
 * Por isso a detecção mora em código: pedido de ligação é sinal forte
 * demais de intenção de compra para ficar na sorte de o modelo classificar
 * certo. Com o alerta garantido, "consigo te ligar sim" vira verdade.
 *
 * Módulo puro: sem rede, sem banco, testável.
 */

const PADROES: RegExp[] = [
  // "me liga", "me liga aí", "me ligue", "pode me ligar", "consegue ligar"
  /\bme\s+lig(a|ue|ar)\b/i,
  /\b(pode|poderia|consegue|consegues|da|dá)\s+(me\s+)?ligar\b/i,
  /\bliga\s+(pra|para)\s+mim\b/i,
  // "prefiro por telefone", "melhor falar por telefone", "me chama no telefone"
  /\b(prefiro|melhor|podemos)\s+.{0,20}\b(por\s+)?telefone\b/i,
  /\bfalar\s+por\s+telefone\b/i,
  /\buma\s+liga(ção|cao)\b/i,
  // "qual seu número", pedindo o contato para ligar
  /\bqual\s+(o\s+)?(seu|teu)\s+(n[úu]mero|telefone)\b/i,
];

/**
 * Frases em que "ligar" NÃO é telefone. Sem elas, "vou ligar para o banco"
 * e "me liga depois que sair o financiamento" (fala sobre terceiro) viram
 * alerta ao corretor — e alerta que dispara à toa deixa de ser lido, que é
 * o mesmo erro já cometido em `evolucaoConversa.ts`.
 */
const EXCECOES: RegExp[] = [
  /\bligar?\s+(para|pra)\s+o?\s*(banco|cart[óo]rio|construtora|imobili[áa]ria|advogad)/i,
  /\bligar\s+o\s+(ar|g[áa]s|chuveiro|forno)/i,
];

export function clientePediuLigacao(mensagem: string): boolean {
  const texto = (mensagem ?? "").trim();
  if (!texto) return false;
  if (EXCECOES.some((p) => p.test(texto))) return false;
  return PADROES.some((p) => p.test(texto));
}
