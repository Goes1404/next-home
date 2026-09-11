/**
 * A memória da conversa — o que sobrevive à janela de 40 falas.
 *
 * ## Por que ela existe
 *
 * Medido em 11/09/2026, nas conversas ativas: das últimas 40 falas, **27
 * eram do corretor** numa, 22 noutra, 17 noutra. O número é o WhatsApp
 * PESSOAL dele, e a conversa humana ocupa a janela da IA. O usuário decidiu
 * manter isso sem teto (a fala dele é contexto legítimo); a memória é o que
 * compensa — ela não é o texto das falas, é o ESTADO da negociação.
 *
 * O que ela guarda: o que ele procura, quanto pode pagar, qual imóvel
 * escolheu, o que já foi oferecido e RECUSADO, o que ficou combinado, e o
 * que ele pediu e ainda não recebeu. O que ela NÃO guarda: transcrição —
 * para isso existe `whatsapp_mensagens`.
 *
 * ## Quem escreve
 *
 * A mesma chamada que já extrai o dossiê, aquela que roda DEPOIS do envio
 * com orçamento próprio de 12s. Zero chamada nova, zero latência a mais
 * para o cliente. O extrator recebe a memória anterior e devolve a nova,
 * então ele ATUALIZA em vez de recomeçar — e é por isso que a mescla aqui
 * substitui em vez de unir: unir acumularia o que já não vale.
 *
 * A exceção é o texto do CORRETOR, e ela é a razão de este módulo existir
 * separado de uma linha de update.
 */

/**
 * Teto da memória, em caracteres.
 *
 * ~1.200 é o tamanho de um parágrafo denso — cabe o estado inteiro de uma
 * negociação e não compete com o histórico no prompt. O prompt do agente
 * gasta ~3.400 tokens; isto acrescenta cerca de 300.
 */
export const TETO_DA_MEMORIA = 1200;

export type MemoriaAnterior = {
  texto: string | null;
  /** A memória atual foi escrita por uma PESSOA pelo painel. */
  doCorretor: boolean;
};

const vazio = (t: string | null | undefined): boolean => !t || !t.trim();

/**
 * Corta no teto, mas em FRONTEIRA DE FRASE.
 *
 * Cortar no meio produz memória que termina em "o cliente prefere o" — e o
 * modelo completa sozinho, que é a família do acabamento inventado. Se não
 * houver ponto nenhum antes do teto, corta no espaço e fecha com ponto.
 */
function cortar(texto: string, teto: number): string {
  const t = texto.trim();
  if (t.length <= teto) return t;

  const pedaco = t.slice(0, teto);
  const ultimoPonto = Math.max(pedaco.lastIndexOf(". "), pedaco.lastIndexOf(".\n"));
  if (ultimoPonto > teto * 0.4) return pedaco.slice(0, ultimoPonto + 1).trim();

  const ultimoEspaco = pedaco.lastIndexOf(" ");
  const base = (ultimoEspaco > 0 ? pedaco.slice(0, ultimoEspaco) : pedaco).trim();
  return base.endsWith(".") ? base : `${base}.`;
}

/**
 * Junta a memória anterior com a que a extração acabou de produzir.
 *
 * Três regras, e a terceira é a que muda o comportamento:
 *
 * 1. **Extração vazia não apaga.** É a mesma regra que o dossiê ganhou na
 *    0106 — `null` de uma extração significa "o assunto não voltou", nunca
 *    "o cliente desdisse".
 * 2. **Extração cheia SUBSTITUI.** Ela já recebeu a anterior e tinha a
 *    tarefa de atualizá-la; unir acumularia o que já não vale (a mesma
 *    razão pela qual a lista de objeções do dossiê substitui em vez de unir).
 * 3. **O texto do corretor é intocável.** Ele vem primeiro e a extração só
 *    ACRESCENTA o que for novo. Correção que a próxima mensagem desfaz
 *    parece botão quebrado — e é assim que alguém para de corrigir.
 */
export function mesclarMemoria(anterior: MemoriaAnterior, nova: string | null): string | null {
  const novaLimpa = vazio(nova) ? null : nova!.trim();
  const anteriorLimpa = vazio(anterior.texto) ? null : anterior.texto!.trim();

  if (!anterior.doCorretor) {
    return novaLimpa ? cortar(novaLimpa, TETO_DA_MEMORIA) : anteriorLimpa;
  }

  // Daqui para baixo, o texto do corretor manda.
  if (!anteriorLimpa) return novaLimpa ? cortar(novaLimpa, TETO_DA_MEMORIA) : null;
  if (!novaLimpa) return anteriorLimpa;
  if (anteriorLimpa.includes(novaLimpa) || novaLimpa.includes(anteriorLimpa)) {
    // Nada de novo (ou a extração só repetiu o que ele escreveu).
    return anteriorLimpa.length >= novaLimpa.length ? anteriorLimpa : cortar(novaLimpa, TETO_DA_MEMORIA);
  }

  /*
   * O corte protege o texto DELE: o teto se aplica ao que a IA acrescenta,
   * não ao que a pessoa escreveu. Se o texto dele sozinho já passa do teto,
   * ele fica inteiro mesmo assim — quem escreveu sabia o que estava fazendo.
   */
  const base = `${anteriorLimpa}`;
  const sobra = TETO_DA_MEMORIA - base.length - 1;
  if (sobra <= 40) return base;
  return `${base} ${cortar(novaLimpa, sobra)}`;
}

/**
 * O bloco que entra no prompt.
 *
 * Devolve string vazia quando não há memória: conversa nova não gasta lugar
 * no prompt dizendo que não tem memória — bloco que só existe para anunciar
 * ausência é ruído, e o prompt já tem 35 mil caracteres de concorrência.
 */
export function blocoDaMemoria(texto: string | null): string {
  if (vazio(texto)) return "";
  return [
    "MEMÓRIA DA CONVERSA (o que já se sabe desta pessoa — vale mais que o histórico abaixo, que é só o trecho recente):",
    texto!.trim(),
    "Use isto para não perguntar de novo o que ele já respondeu e para não oferecer o que ele já recusou. Se algo aqui contradisser o que ele acabou de dizer, o que ele acabou de dizer vence.",
  ].join(String.fromCharCode(10));
}
