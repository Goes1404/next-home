import Link from "next/link";
import { Megaphone } from "lucide-react";

/**
 * "Adicionar a uma lista de transmissão" na ficha do lead (plano de
 * ativação, 03/10/2026).
 *
 * Substitui o "Iniciar conversa com IA": a IA só responde (regra N1), e o
 * primeiro contato é do corretor, por lista de transmissão (N2). O botão leva
 * para o assistente de listas já com este lead marcado; quando ele responder,
 * a IA assume a conversa.
 */
export function AdicionarALista({ leadId, temTelefone }: { leadId: string; temTelefone: boolean }) {
  if (!temTelefone) return null;
  return (
    <Link
      href={`/corretor/campanhas?leads=${leadId}`}
      className="text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 font-medium transition-opacity hover:opacity-85"
    >
      <Megaphone className="h-4 w-4" aria-hidden />
      Adicionar a uma lista de transmissão
    </Link>
  );
}
