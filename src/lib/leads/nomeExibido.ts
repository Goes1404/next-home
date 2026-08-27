/**
 * Como um lead é CHAMADO na tela e na mensagem.
 *
 * Módulo puro e sem dependência nenhuma, de propósito: quem precisa disto é
 * a fila do Início (a tela mais aberta do painel) e o disparo de campanha
 * (que importa o `llm.ts`). Deixar a função morar junto do disparo
 * arrastaria a IA inteira para o grafo do Início — a mesma armadilha do
 * `limitesPdf.ts`, que virou regra desta base: constante ou função pura
 * compartilhada mora sozinha.
 */

/**
 * O nome, quando ele serve para chamar uma pessoa.
 *
 * "Contato sem nome" é o rótulo que a IMPORTAÇÃO grava quando a planilha
 * não trouxe nome. Serve para a ficha do CRM não ficar em branco — e não
 * serve para ser dito a ninguém. Já vazou uma vez para o WhatsApp de um
 * cliente ("Olá, Contato sem nome. É um prazer me apresentar…") e uma
 * segunda vez para o painel, onde a fila do Início mostrou seis linhas
 * idênticas de "Falar com Contato sem nome" — seis pessoas diferentes,
 * indistinguíveis na tela.
 *
 * Telefone também não é nome: quem cadastra o número no campo do nome não
 * está dando um nome.
 */
export function nomeUtilDoLead(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return null;
  if (/^contato sem nome$/i.test(limpo)) return null;
  if (/^[\d\s()+-]+$/.test(limpo)) return null;
  return limpo;
}

/**
 * Telefone brasileiro em formato de gente: `(11) 95721-6675`.
 *
 * Devolve `null` quando não reconhece — melhor não mostrar nada do que
 * mostrar um número remontado errado.
 */
export function telefoneLegivel(telefone: string | null | undefined): string | null {
  const n = (telefone ?? "").replace(/\D/g, "");
  const semDdi = n.startsWith("55") && n.length >= 12 ? n.slice(2) : n;

  if (semDdi.length === 11) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`;
  if (semDdi.length === 10) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`;
  return null;
}

/**
 * Como chamar este lead na tela.
 *
 * Sem nome utilizável, o TELEFONE é a identidade — é o que distingue uma
 * linha da outra numa lista de importados, e é o que o corretor reconhece.
 * "Contato sem nome" só sobra quando não há nem nome nem telefone, e aí é
 * a verdade: não sabemos quem é.
 */
export function nomeParaExibir(lead: {
  nome?: string | null;
  telefone?: string | null;
}): string {
  return nomeUtilDoLead(lead.nome) ?? telefoneLegivel(lead.telefone) ?? "Contato sem nome";
}
