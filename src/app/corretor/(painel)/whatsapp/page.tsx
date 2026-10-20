import type { Metadata } from "next";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import type { ModoBotWhatsapp, StatusConexaoWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import { WhatsappManager } from "./WhatsappManager";
import { FRASE_NUMERO_EM_OUTRO_GRUPO } from "@/lib/whatsapp/numeroDeUmGrupo";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

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
        "nome_assistente, tom_voz, modo_bot, status_conexao, telefone_conectado, palavra_chave_ativacao, palavra_chave_teste, palavras_entrada_cliente, expediente_inicio, expediente_fim, regras_da_ia",
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

  // O número recusado por ser de outra conta (0198). Consulta à parte: se a
  // coluna ainda não existir (migration depois do deploy), a tela segue sem
  // o aviso em vez de cair inteira.
  const { data: recusa } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("numero_recusado_em")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  // Nome e tom fixados pelo gestor para a equipe (0199): o campo do corretor
  // deixa de valer, e a tela diz isso. Consulta à parte pelo mesmo motivo da
  // de cima: sem a migration, a tela segue sem o aviso.
  const { data: doGrupo } = await supabase
    .from("grupos")
    .select("ia_nome_assistente, ia_tom")
    .eq("id", corretor.grupoId)
    .maybeSingle();
  const fixadoPeloGrupo = {
    nomeAssistente: doGrupo?.ia_nome_assistente ?? null,
    tom: doGrupo?.ia_tom ?? null,
  };

  const avisoDeRecusa =
    recusa?.numero_recusado_em && instancia?.status_conexao !== "conectado" ? FRASE_NUMERO_EM_OUTRO_GRUPO : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <CabecalhoDeTela secao="Assistente" titulo="Minha IA" descricao="Conecte seu número para a IA atender, mandar fotos e plantas e qualificar seus leads enquanto você não está." />
      </div>


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
              ["Leads quentes", funil.leads_quentes, "border-etapa-contato-linha", null],
              /*
               * O degrau que faltava entre conversar e marcar: em quantas
               * conversas a IA chegou a OFERECER a visita. O dado era
               * gravado desde a 0029 e não tinha leitor nenhum (0072).
               */
              [
                "Visitas propostas",
                funil.visitas_propostas,
                "border-etapa-visita-linha",
                "a IA ofereceu",
              ],
              ["Visitas marcadas", funil.visitas_agendadas, "border-etapa-visita-linha", "o cliente aceitou"],
              ["Em negociação", funil.em_negociacao, "border-etapa-doc-linha", null],
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
        avisoDeRecusa={avisoDeRecusa}
        fixadoPeloGrupo={fixadoPeloGrupo}
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
                expedienteInicio: instancia.expediente_inicio,
                expedienteFim: instancia.expediente_fim,
                regrasDaIa: instancia.regras_da_ia,
              }
            : null
        }
      />
    </div>
  );
}
