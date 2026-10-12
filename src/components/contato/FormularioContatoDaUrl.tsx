"use client";

import { useSearchParams } from "next/navigation";
import { FormularioContato, type OpcaoEmpreendimento } from "./FormularioContato";

/**
 * Lê `?empreendimento=<slug>` NO NAVEGADOR e pré-seleciona o imóvel.
 *
 * Até 12/10/2026 a página de contato lia o parâmetro em `searchParams`, no
 * servidor — e isso a tornava dinâmica inteira, renderizada por função a
 * cada visita, para pré-selecionar uma opção de `<select>`. Com
 * `useSearchParams` a página é estática (F2b): o HTML sai com o formulário
 * sem pré-seleção (o `fallback` do `<Suspense>` que envolve este componente
 * na página) e o navegador troca pelo formulário com o imóvel escolhido no
 * primeiro quadro, antes de alguém digitar.
 */
export function FormularioContatoDaUrl({ empreendimentos }: { empreendimentos: OpcaoEmpreendimento[] }) {
  const parametros = useSearchParams();
  return (
    <FormularioContato
      empreendimentos={empreendimentos}
      empreendimentoPreselecionado={parametros.get("empreendimento") ?? undefined}
    />
  );
}
