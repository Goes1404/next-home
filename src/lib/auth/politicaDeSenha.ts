/**
 * A régua de senha da Astro (29/10/2026). Pedido do dono: "coloque alguns
 * critérios em criar senha, como letra maiúscula, símbolo… para maior
 * segurança" e "trocar a senha de 3 em 3 meses".
 *
 * Mora fora de qualquer tela porque três lugares escrevem senha: criar senha
 * pelo link (`definir-senha`), trocar senha no painel (`trocarSenha`) e a
 * senha temporária que o administrador da plataforma digita. As três passam
 * pela MESMA régua, e a tela mostra a mesma lista (`ChecklistDaSenha`).
 *
 * Sem `"server-only"`: a lista de regras também desenha o checklist ao vivo
 * no navegador. Nada aqui é segredo.
 */

export type RegraDaSenha = { id: string; rotulo: string; cumpre: (senha: string) => boolean };

export const MINIMO_DA_SENHA = 8;

export const REGRAS_DA_SENHA: readonly RegraDaSenha[] = [
  { id: "tamanho", rotulo: `${MINIMO_DA_SENHA} ou mais caracteres`, cumpre: (s) => s.length >= MINIMO_DA_SENHA },
  { id: "maiuscula", rotulo: "Uma letra maiúscula", cumpre: (s) => /\p{Lu}/u.test(s) },
  { id: "minuscula", rotulo: "Uma letra minúscula", cumpre: (s) => /\p{Ll}/u.test(s) },
  { id: "numero", rotulo: "Um número", cumpre: (s) => /\p{Nd}/u.test(s) },
  { id: "simbolo", rotulo: "Um símbolo (! @ # $ …)", cumpre: (s) => /[^\p{L}\p{Nd}\s]/u.test(s) },
];

/** Regras que a senha ainda não cumpre (vazio = senha aceita). */
export function regrasQueFaltam(senha: string): RegraDaSenha[] {
  return REGRAS_DA_SENHA.filter((r) => !r.cumpre(senha));
}

/**
 * A frase de erro para o servidor devolver, ou `null` se a senha passa.
 * Lista o que falta numa frase só, em minúsculas: "Falta: uma letra
 * maiúscula e um símbolo."
 */
export function erroDaSenha(senha: string): string | null {
  const faltam = regrasQueFaltam(senha);
  if (!faltam.length) return null;
  const itens = faltam.map((r) => r.rotulo.charAt(0).toLowerCase() + r.rotulo.slice(1));
  const lista = itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
  return `A senha precisa de: ${lista}.`;
}

/* ---------------------------------------------------------------------------
 * Validade: a senha vence a cada 90 dias.
 *
 * A data da última troca fica em `app_metadata.senha_trocada_em` (ISO) do
 * usuário do Auth. `app_metadata`, e não `user_metadata`: o próprio usuário
 * consegue reescrever o `user_metadata` pela chave pública e adiaria a troca
 * para sempre; o `app_metadata` só a chave de serviço escreve.
 *
 * Conta sem a data (todas as anteriores a 29/10/2026) começa a contar no
 * primeiro login depois disso — vencer todas no mesmo dia derrubaria a
 * equipe inteira de uma vez.
 * ------------------------------------------------------------------------- */

export const VALIDADE_DA_SENHA_DIAS = 90;
export const CHAVE_SENHA_TROCADA_EM = "senha_trocada_em";
/** Quantos dias antes do vencimento o app começa a avisar. */
export const AVISO_ANTES_DE_VENCER_DIAS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Lê a data da última troca do `app_metadata` (ou `null` se não há). */
export function senhaTrocadaEm(appMetadata: Record<string, unknown> | null | undefined): Date | null {
  const valor = appMetadata?.[CHAVE_SENHA_TROCADA_EM];
  if (typeof valor !== "string") return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Quando a senha vence, a partir da última troca. */
export function vencimentoDaSenha(trocadaEm: Date): Date {
  return new Date(trocadaEm.getTime() + VALIDADE_DA_SENHA_DIAS * DIA_MS);
}

/** Dias inteiros até vencer (negativo = vencida). */
export function diasParaVencer(trocadaEm: Date, agora: Date = new Date()): number {
  return Math.floor((vencimentoDaSenha(trocadaEm).getTime() - agora.getTime()) / DIA_MS);
}

export function senhaVencida(trocadaEm: Date, agora: Date = new Date()): boolean {
  return agora.getTime() >= vencimentoDaSenha(trocadaEm).getTime();
}
