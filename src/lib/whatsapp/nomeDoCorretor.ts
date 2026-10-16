/**
 * O nome do corretor que a IA escreve é o do cadastro, nunca um inventado.
 *
 * Conversa da Rute, 15/10/2026: a confirmação da visita dizia "você vai
 * falar com o corretor Carlos". A corretora é a Carolini, e nenhum Carlos
 * existe na equipe. A instrução de confirmar mandava "diga o nome do
 * corretor" sem dizer qual era, e a regra 21 proibia dizer que o cliente
 * vai falar com ela: entre as duas ordens, o modelo inventou um terceiro
 * nome. A instrução agora leva o nome; esta função é a rede para quando o
 * modelo escrever outro mesmo assim, porque nome errado manda o cliente
 * procurar no decorado uma pessoa que não existe.
 *
 * Função pura. Só troca o nome que vem logo depois de "corretor"/"corretora"
 * e começa com maiúscula: é a forma em que a invenção aparece, e mexer em
 * qualquer nome solto da frase trocaria o nome do próprio cliente.
 */
import { normalizar } from "./normalizarFala";

const NOME_DEPOIS_DE_CORRETOR =
  /\b([Cc]orretor(?:a)?)\s+([A-ZÀ-Ý][a-zà-ÿ]{2,})(\s+[A-ZÀ-Ý][a-zà-ÿ]{2,})?/g;

export function primeiroNomeDoCorretor(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  return primeiro && primeiro.length >= 2 ? primeiro : null;
}

/** "Carol" vale para "Carolini": apelido é começo do nome, e o contrário também. */
function ehDoCadastro(palavra: string, nomes: string[]): boolean {
  const p = normalizar(palavra);
  return nomes.some((n) => n === p || (p.length >= 3 && (n.startsWith(p) || p.startsWith(n))));
}

export function corrigirNomeDoCorretor(
  texto: string,
  nomeCorretor: string | null | undefined,
  nomeAssistente?: string | null,
): { texto: string; corrigiu: boolean } {
  const primeiro = primeiroNomeDoCorretor(nomeCorretor);
  if (!primeiro || !texto) return { texto, corrigiu: false };
  const nomes = [
    ...(nomeCorretor ?? "").split(/\s+/),
    ...(nomeAssistente ?? "").split(/\s+/),
  ]
    .map((n) => normalizar(n))
    .filter((n) => n.length >= 2);

  let corrigiu = false;
  const novo = texto.replace(NOME_DEPOIS_DE_CORRETOR, (inteiro, palavra: string, nome: string, sobrenome?: string) => {
    if (ehDoCadastro(nome, nomes)) return inteiro;
    corrigiu = true;
    // O sobrenome inventado vai junto; um sobrenome do cadastro fica.
    const resto = sobrenome && ehDoCadastro(sobrenome.trim(), nomes) ? sobrenome : "";
    return `${palavra} ${primeiro}${resto}`;
  });
  return { texto: novo, corrigiu };
}
