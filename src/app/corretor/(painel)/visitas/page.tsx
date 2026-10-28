import { redirect } from "next/navigation";

/** A tela de Visitas virou a Agenda (27/10/2026); link antigo continua chegando. */
export default function VisitasPage() {
  redirect("/corretor/agenda");
}
