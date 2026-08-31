import type { Metadata } from "next";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import type { ModoBotWhatsapp, StatusConexaoWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import { WhatsappManager } from "./WhatsappManager";
import { AbasWhatsapp } from "@/app/corretor/(painel)/_componentes/AbasWhatsapp";

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
        "nome_assistente, tom_voz, modo_bot, status_conexao, telefone_conectado, palavra_chave_ativacao, palavra_chave_teste, palavras_entrada_cliente",
      )
      .eq("corretor_id", corretor.id)
      .maybeSingle(),
    // Funil real do atendimento (view da 0029): medir conversão, não vibe.
    supabase
      .from("whatsapp_funil_metricas")
      .select(
        "conversas, conversas_com_lead, leads_quentes, visitas_propostas, visitas_agendadas, em_negociacao",
      )
      .eq("corretor_id", corretor.id)
      .maybeSingle(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">WhatsApp</h1>
        <p className="text-fluid-sm mt-1 text-apoio">
          Conecte seu número para a IA atender, mandar fotos e plantas e qualificar seus leads
          enquanto você não está.
        </p>
      </div>

      <AbasWhatsapp
        ativa="ia"
        conectado={instancia?.status_conexao === "conectado"}
      />

      {/*
        O funil do atendimento, em cores que dizem o estágio: cada número
        herda a cor da etapa correspondente do CRM, então "visitas agendadas"
        é azul aqui e no quadro, e o corretor lê a mesma escala nas duas
        telas.
      */}
      {funil && (funil.conversas ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Conversas", funil.conversas, "border-linha", null],
              ["Com ficha no funil", funil.conversas_com_lead, "border-acento-linha", null],
              ["Leads quentes", funil.leads_quentes, "border-etapa-ciano-linha", null],
              /*
               * O degrau que faltava entre conversar e marcar: em quantas
               * conversas a IA chegou a OFERECER a visita. O dado era
               * gravado desde a 0029 e não tinha leitor nenhum (0072).
               */
              [
                "Visitas propostas",
                funil.visitas_propostas,
                "border-etapa-azul-linha",
                "a IA ofereceu",
              ],
              ["Visitas marcadas", funil.visitas_agendadas, "border-etapa-azul-linha", "o cliente aceitou"],
              ["Em negociação", funil.em_negociacao, "border-etapa-laranja-linha", null],
            ] as const
          ).map(([rotulo, valor, borda, detalhe]) => (
            <div
              key={rotulo}
              className={`bg-superficie rounded-2xl border border-l-3 p-4 ${borda}`}
            >
              <p className="text-fluid-xs text-tenue">{rotulo}</p>
              <p className="text-fluid-xl text-titulo font-bold tabular-nums">{valor ?? 0}</p>
              {detalhe && <p className="text-fluid-xs text-tenue mt-0.5">{detalhe}</p>}
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
                palavrasEntradaCliente: instancia.palavras_entrada_cliente,
              }
            : null
        }
      />
    </div>
  );
}
