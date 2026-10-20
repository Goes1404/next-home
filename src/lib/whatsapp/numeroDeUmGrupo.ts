/**
 * Um número de WhatsApp pertence a UM grupo só (0198, resposta 4 do dono).
 *
 * A trava de verdade mora no banco (gatilho
 * `corretor_whatsapp_instancias_10_numero_de_um_grupo`). Este módulo é a
 * pergunta ANTES, para o painel recusar com uma frase clara em vez de um
 * erro de banco, e o reconhecimento do erro do gatilho quando a pergunta não
 * chegou a tempo.
 *
 * Não importa o cliente do Supabase: quem chama passa o dele (a chave de
 * serviço, porque a função do banco só executa para ela).
 */

/** O que o corretor lê quando o número é de outra conta. Não diz de quem. */
export const FRASE_NUMERO_EM_OUTRO_GRUPO =
  "Este número de WhatsApp já está ligado a outra conta da plataforma. Um número só pode estar em uma conta. Para usá-lo aqui, peça para desconectá-lo na outra conta primeiro, ou conecte outro número.";

/**
 * Espelho de `public.chave_do_numero_whatsapp` (0198): só os dígitos, e o
 * celular brasileiro reduzido a 55 + DDD + 8 últimos, para o número com e
 * sem o nono dígito ser o mesmo. O WhatsApp devolve o número sem o 9 em
 * vários DDDs, e o corretor digita com o 9 no pareamento por código.
 */
export function chaveDoNumero(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  if (/^55\d{10,11}$/.test(digitos)) return `55${digitos.slice(2, 4)}${digitos.slice(-8)}`;
  return digitos;
}

type ClienteComRpc = {
  rpc: (
    funcao: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * O número já está ligado a uma instância de OUTRO grupo? `true`/`false`,
 * ou `null` quando o banco não respondeu (a função ainda não existe, rede).
 * `null` não recusa: o gatilho continua sendo a trava.
 */
export async function numeroEmOutroGrupo(
  cliente: ClienteComRpc,
  grupoId: string,
  telefone: string | null | undefined,
): Promise<boolean | null> {
  if (!chaveDoNumero(telefone)) return false;
  const { data, error } = await cliente.rpc("numero_whatsapp_em_outro_grupo", {
    p_grupo: grupoId,
    p_telefone: telefone,
  });
  if (error) {
    console.error("[whatsapp] não consegui conferir se o número é de outro grupo:", error.message);
    return null;
  }
  return data === true;
}

/** O erro que o gatilho da 0198 levanta. */
export function ehRecusaDeNumero(erro: { message?: string } | null | undefined): boolean {
  return Boolean(erro?.message?.includes("numero_em_outro_grupo"));
}
