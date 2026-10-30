"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { obterQrCodeInstancia } from "@/lib/whatsapp/provider";
import { INSTANCIA_DO_CENTRAL, TELEFONE_PADRAO_DO_CENTRAL } from "@/lib/central/constantes";
import { esquecerCentral } from "@/lib/central/numeroDoCentral";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";

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

/**
 * O número do chip: o digitado na tela (troca de chip, 30/10/2026: o
 * primeiro chip teve o envio pelo sistema barrado pelo WhatsApp), senão o
 * já registrado, senão `CENTRAL_TELEFONE`/o padrão. Antes a tela regravava
 * sempre o padrão, e trocar de chip exigia mudar o código.
 */
export async function conectarCentral(modo: "codigo" | "qr", telefoneDigitado?: string): Promise<ResultadoDaConexao> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { ok: false, erro: admin.erro };

  const supabase = createServiceClient();
  let telefone: string;
  if (telefoneDigitado?.trim()) {
    const normalizado = normalizarTelefoneBr(telefoneDigitado);
    if (!normalizado) return { ok: false, erro: "Número inválido. Use DDD + número, ex.: 11 91234-5678." };
    telefone = normalizado;
  } else {
    const { data: atual } = await supabase.from("central_da_plataforma").select("telefone").eq("instance_name", INSTANCIA_DO_CENTRAL).maybeSingle();
    telefone = (atual?.telefone || process.env.CENTRAL_TELEFONE || TELEFONE_PADRAO_DO_CENTRAL).replace(/\D/g, "");
  }
  const { error } = await supabase
    .from("central_da_plataforma")
    .upsert({ instance_name: INSTANCIA_DO_CENTRAL, telefone }, { onConflict: "instance_name" });
  if (error) return { ok: false, erro: "Não consegui registrar o número central. A migration 0249 foi aplicada?" };
  esquecerCentral();

  const r = await obterQrCodeInstancia(INSTANCIA_DO_CENTRAL, modo === "codigo" ? telefone : null);
  revalidatePath("/plataforma/central");
  if (!r.ok) return { ok: false, erro: r.detalhe ?? "O provedor de WhatsApp não respondeu. Tente de novo." };
  return { ok: true, codigo: r.codigoPareamento, qrcode: r.qrcodeBase64, jaConectado: r.jaConectado };
}
