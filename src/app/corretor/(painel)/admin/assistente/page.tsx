import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import type { LinhaDaCasa } from "@/lib/whatsapp/casa";
import { FormularioAssistente } from "./FormularioAssistente";

export const metadata: Metadata = { title: "Assistente da imobiliária" };
export const dynamic = "force-dynamic";

/**
 * Nome da imobiliária, nome da assistente, região e tom da IA do grupo
 * (fase 4, 0199).
 *
 * A guarda está em CADA `page.tsx` do segmento, não só no layout: layouts não
 * re-executam ao navegar entre rotas irmãs.
 */
export default async function AssistentePage() {
  const gestor = await exigirGestorNaPagina();

  // Pela sessão: a policy da 0190 só deixa ver a linha do próprio grupo, e a
  // 0199 dá ao logado SELECT nas quatro colunas da IA.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grupos")
    .select("id, nome, ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom")
    .eq("id", gestor.grupoId)
    .maybeSingle();
  if (error) console.error("[assistente do grupo] leitura falhou:", error.message);

  const linha: LinhaDaCasa | null = data
    ? {
        nome: data.nome,
        ia_nome_da_casa: data.ia_nome_da_casa,
        ia_nome_assistente: data.ia_nome_assistente,
        ia_regiao: data.ia_regiao,
        ia_tom: data.ia_tom,
      }
    : null;

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        secao="Administração"
        titulo="Assistente da imobiliária"
        descricao="Como a IA se apresenta no WhatsApp de toda a equipe: o nome da casa, a região onde vocês atendem e o jeito de falar."
      />

      {error ? (
        <p className="cartao text-perigo p-4 text-sm">
          Não consegui ler a configuração agora. Recarregue a página para tentar de novo.
        </p>
      ) : (
        <FormularioAssistente grupoId={gestor.grupoId} inicial={linha} />
      )}
    </div>
  );
}
