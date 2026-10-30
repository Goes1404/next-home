import {
  Building2,
  Calculator,
  GraduationCap,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { configDoRamo, type IconeDoRamo as NomeDoIcone, type Ramo } from "./ramos";

/**
 * O desenho de cada ramo (29/10/2026). A configuração (`ramos.ts`) guarda só
 * o NOME do ícone para continuar pura: o servidor, a IA e os testes leem o
 * ramo sem carregar componente de interface.
 */
const ICONES: Record<NomeDoIcone, LucideIcon> = {
  predio: Building2,
  escudo: ShieldCheck,
  balanca: Scale,
  calculadora: Calculator,
  estetoscopio: Stethoscope,
  capelo: GraduationCap,
  sacola: ShoppingBag,
  ferramenta: Wrench,
  estrela: Sparkles,
};

export function IconeDoRamo({ ramo, className }: { ramo: Ramo; className?: string }) {
  const Icone = ICONES[configDoRamo(ramo).icone];
  return <Icone aria-hidden className={className} />;
}
