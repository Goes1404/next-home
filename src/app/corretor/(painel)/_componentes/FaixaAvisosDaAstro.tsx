import { avisosParaQuemVe } from "@/lib/plataforma/avisoAosClientes";
import { lerAvisosVigentes } from "@/lib/plataforma/avisosVigentes";
import { AvisosDaAstro } from "./AvisosDaAstro";

/**
 * A faixa dos avisos da Astro (0242, 29/10/2026), abaixo do cabeçalho do
 * painel, em toda tela. Uma consulta (deduplicada na requisição) a uma
 * tabela global; o público "só gestores" é respeitado aqui, no servidor —
 * o aviso de gestor nem chega ao navegador do corretor.
 *
 * Mora atrás de um `<Suspense fallback={null}>` no layout: o painel nunca
 * espera por ela. `null` quase sempre (sem aviso no ar).
 */
export async function FaixaAvisosDaAstro({ papel }: { papel: "gestor" | "corretor" }) {
  const avisos = avisosParaQuemVe(await lerAvisosVigentes(), papel);
  if (avisos.length === 0) return null;
  return (
    <AvisosDaAstro
      avisos={avisos.map((a) => ({ id: a.id, titulo: a.titulo, texto: a.texto, tipo: a.tipo, link: a.link }))}
    />
  );
}
