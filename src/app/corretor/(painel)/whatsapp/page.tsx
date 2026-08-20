import type { Metadata } from "next";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import type { ModoBotWhatsapp, StatusConexaoWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import { WhatsappManager } from "./WhatsappManager";

export const metadata: Metadata = {
  title: "Meu Assistente WhatsApp IA | Next Home",
};

export default async function WhatsappPainelPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  // A configuração é lida do banco, não presumida: o painel precisa abrir
  // mostrando o que está de fato valendo para o número deste corretor.
  const supabase = await createClient();
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(
      "nome_assistente, tom_voz, modo_bot, status_conexao, telefone_conectado, palavra_chave_ativacao",
    )
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">Assistente WhatsApp & IA</h1>
        <p className="text-fluid-sm mt-1 text-apoio">
          Conecte seu WhatsApp pessoal de trabalho para que sua IA atenda, envie fotos/plantas e qualifique seus leads automaticamente.
        </p>
      </div>

      <WhatsappManager
        corretorNome={corretor.nome}
        configInicial={
          instancia
            ? {
                nomeAssistente: instancia.nome_assistente,
                tomVoz: instancia.tom_voz as TomVozBot,
                modoBot: instancia.modo_bot as ModoBotWhatsapp,
                statusConexao: instancia.status_conexao as StatusConexaoWhatsapp,
                telefoneConectado: instancia.telefone_conectado,
                palavraChaveAtivacao: instancia.palavra_chave_ativacao,
              }
            : null
        }
      />
    </div>
  );
}
