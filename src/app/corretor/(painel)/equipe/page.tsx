import { redirect } from "next/navigation";

/**
 * A tela de equipe virou a aba "Leads da equipe" da Administração, ao lado de
 * contas, visão geral e WhatsApp. O redirect fica porque o endereço antigo
 * está em links compartilhados e em `revalidatePath("/corretor/equipe")`
 * espalhados pelas actions.
 */
export default function EquipePage() {
  redirect("/corretor/admin/leads");
}
