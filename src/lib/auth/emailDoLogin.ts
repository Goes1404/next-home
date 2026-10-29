import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { lerIdentificadorDeLogin } from "./identificadorDeLogin";

/**
 * O e-mail de login a partir do que a pessoa digitou: o próprio e-mail, ou o
 * do nome de usuário (`email_do_usuario`, 0235, só pela chave de serviço).
 */
export async function emailDoLogin(texto: string): Promise<string | null> {
  const id = lerIdentificadorDeLogin(texto);
  if (!id) return null;
  if (id.tipo === "email") return id.email;
  try {
    const { data, error } = await createServiceClient().rpc("email_do_usuario", { p_usuario: id.usuario });
    if (error) {
      console.error(`[entrar] email_do_usuario falhou: ${error.message}`);
      return null;
    }
    return typeof data === "string" && data ? data : null;
  } catch (e) {
    console.error("[entrar] email_do_usuario falhou:", e);
    return null;
  }
}

