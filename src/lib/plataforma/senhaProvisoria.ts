/**
 * Senha provisória que o administrador da plataforma passa para a pessoa
 * (por WhatsApp, telefone, ao lado). Roda no navegador, para a senha não
 * precisar ir e voltar do servidor só para nascer.
 *
 * 12 caracteres sem os que se confundem ao ditar ou ler (0/O, 1/l/I), com
 * pelo menos uma minúscula, uma maiúscula e um dígito: o Auth pode exigir
 * os três, e a pessoa vai trocá-la no primeiro login de qualquer jeito.
 * O sorteio descarta o byte que daria viés (amostragem por rejeição).
 */

const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";
const TODOS = MINUSCULAS + MAIUSCULAS + DIGITOS;
export const TAMANHO_DA_SENHA_PROVISORIA = 12;

type Sorteio = (bytes: Uint8Array) => Uint8Array;

const sorteioDoNavegador: Sorteio = (bytes) => crypto.getRandomValues(bytes);

function sortearIndice(limite: number, sortear: Sorteio): number {
  const teto = 256 - (256 % limite);
  for (;;) {
    const [b] = sortear(new Uint8Array(1));
    if (b < teto) return b % limite;
  }
}

export function gerarSenhaProvisoria(sortear: Sorteio = sorteioDoNavegador): string {
  const escolher = (alfabeto: string) => alfabeto[sortearIndice(alfabeto.length, sortear)];
  const letras = [escolher(MINUSCULAS), escolher(MAIUSCULAS), escolher(DIGITOS)];
  while (letras.length < TAMANHO_DA_SENHA_PROVISORIA) letras.push(escolher(TODOS));
  // Embaralha (Fisher–Yates), senão as três obrigatórias ficariam sempre no começo.
  for (let i = letras.length - 1; i > 0; i--) {
    const j = sortearIndice(i + 1, sortear);
    [letras[i], letras[j]] = [letras[j], letras[i]];
  }
  return letras.join("");
}
