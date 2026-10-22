import { fraseDoQueResta, type SituacaoDoRecurso } from "@/lib/planos/limitesDoPlano";

/**
 * "Restam N este mês", na tela de criar arte, vídeo ou lista (limites do plano).
 * `null` quando o plano não tem teto (a Next Home): ninguém precisa de uma
 * frase que não muda nada. Aviso a partir de 80%, alerta quando acaba.
 */
export function RestamNoMes({ situacao }: { situacao: SituacaoDoRecurso }) {
  const frase = fraseDoQueResta(situacao);
  if (frase === null) return null;
  const classe =
    situacao.nivel === "esgotada"
      ? "border-perigo-linha bg-perigo-lavado text-perigo"
      : situacao.nivel === "aviso"
        ? "border-alerta-linha bg-alerta-lavado text-alerta"
        : "border-linha-forte bg-vidro text-apoio";
  return (
    <p role="status" className={`text-fluid-xs rounded-xl border px-3.5 py-2.5 ${classe}`}>
      {frase}
    </p>
  );
}
