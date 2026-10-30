"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { obterQrCodeInstancia } from "@/lib/whatsapp/provider";
import { INSTANCIA_DO_CENTRAL, TELEFONE_PADRAO_DO_CENTRAL } from "@/lib/central/constantes";
import { esquecerCentral } from "@/lib/central/numeroDoCentral";

/**
 * Conectar o número central da plataforma (onda 0, Task 8). Só o
 * administrador da plataforma.
 *
 * Grava a linha de `central_da_plataforma` (é ela que faz o webhook desviar
 * a instância para o central) e pede o pareamento à Evolution: código de 8
 * caracteres para digitar no celular do chip, ou o QR Code.
 */
export type ResultadoDaConexao =
  | { ok: true; codigo: string | null; qrcode: string | null; jaConectado: boolean }
  | { ok: false; erro: string };

export async function conectarCentral(modo: "codigo" | "qr"): Promise<ResultadoDaConexao> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };

  const telefone = (process.env.CENTRAL_TELEFONE || TELEFONE_PADRAO_DO_CENTRAL).replace(/\D/g, "");
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("central_da_plataforma")
    .upsert({ instance_name: INSTANCIA_DO_CENTRAL, telefone }, { onConflict: "instance_name" });
  if (error) return { ok: false, erro: "Não consegui registrar o número central. A migration 0248 foi aplicada?" };
  esquecerCentral();

  const r = await obterQrCodeInstancia(INSTANCIA_DO_CENTRAL, modo === "codigo" ? telefone : null);
  revalidatePath("/plataforma/central");
  if (!r.ok) return { ok: false, erro: r.detalhe ?? "O provedor de WhatsApp não respondeu. Tente de novo." };
  return { ok: true, codigo: r.codigoPareamento, qrcode: r.qrcodeBase64, jaConectado: r.jaConectado };
}
