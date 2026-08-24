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
  const [{ data: instancia }, { data: funil }] = await Promise.all([
    supabase
      .from("corretor_whatsapp_instancias")
      .select(
        "nome_assistente, tom_voz, modo_bot, status_conexao, telefone_conectado, palavra_chave_ativacao, palavra_chave_teste",
      )
      .eq("corretor_id", corretor.id)
      .maybeSingle(),
    // Funil real do atendimento (view da 0029): medir conversão, não vibe.
    supabase
      .from("whatsapp_funil_metricas")
      .select("conversas, conversas_com_lead, leads_quentes, visitas_agendadas, em_negociacao")
      .eq("corretor_id", corretor.id)
      .maybeSingle(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">Assistente WhatsApp & IA</h1>
        <p className="text-fluid-sm mt-1 text-apoio">
          Conecte seu WhatsApp pessoal de trabalho para que sua IA atenda, envie fotos/plantas e qualifique seus leads automaticamente.
        </p>
      </div>

      {funil && (funil.conversas ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ["Conversas", funil.conversas],
              ["Com ficha no funil", funil.conversas_com_lead],
              ["Leads quentes", funil.leads_quentes],
              ["Visitas agendadas", funil.visitas_agendadas],
              ["Em negociação", funil.em_negociacao],
            ] as const
          ).map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-2xl border border-linha bg-superficie p-4">
              <p className="text-fluid-xs text-tenue">{rotulo}</p>
              <p className="text-fluid-xl font-bold text-titulo">{valor ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      <WhatsappManager
        corretorNome={corretor.nome}
        // Quase sempre é o mesmo número que vai ser pareado — deixar o
        // campo pronto poupa digitação no celular, onde este fluxo mora.
        whatsappCadastro={corretor.whatsapp ?? ""}
        configInicial={
          instancia
            ? {
                nomeAssistente: instancia.nome_assistente,
                tomVoz: instancia.tom_voz as TomVozBot,
                modoBot: instancia.modo_bot as ModoBotWhatsapp,
                statusConexao: instancia.status_conexao as StatusConexaoWhatsapp,
                telefoneConectado: instancia.telefone_conectado,
                palavraChaveAtivacao: instancia.palavra_chave_ativacao,
                palavraChaveTeste: instancia.palavra_chave_teste,
              }
            : null
        }
      />
    </div>
  );
}
