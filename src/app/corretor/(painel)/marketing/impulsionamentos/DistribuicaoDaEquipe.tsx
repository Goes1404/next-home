import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clienteParaNumerosDaEquipe } from "@/lib/admin/numerosDaEquipe";
import { idsDeContasOcultas, semContasOcultas } from "@/lib/corretores/contaOculta";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { listarGruposWhatsapp } from "@/lib/whatsapp/provider";
import { ConfigurarGruposDeLeads } from "@/app/corretor/(painel)/admin/whatsapp/ConfigurarGruposDeLeads";
import { opcoesDoNumeroCentral } from "./numeroCentral";

/**
 * Os grupos de WhatsApp dos corretores na aba Roleta (26/10/2026): número
 * central, nome dos grupos e vínculo à mão. A escala e a regra do WhatsApp
 * conectado ficam na tabela da roleta (`EditorDaRoleta`). Antes isto ficava
 * em WhatsApp & IA.
 *
 * Só o gestor. O status dos números sai pela leitura recortada da equipe
 * (`clienteParaNumerosDaEquipe`, só colunas de status, 0134); o resto pela
 * sessão, sempre no grupo do gestor.
 */
export async function DistribuicaoDaEquipe() {
  const gestor = await getCorretorLogado();
  if (gestor?.papel !== "gestor") return null;

  const supabase = await createClient();
  const equipe = await clienteParaNumerosDaEquipe();
  const [{ data: todasInstancias }, { data: pessoas }, ocultas, { data: configuracao }] = await Promise.all([
    equipe.ler((c) =>
      c.from("corretor_whatsapp_instancias").select("corretor_id, instance_name, status_conexao, conectado_em, sessao_caida_em"),
    ),
    supabase
      .from("corretores")
      .select("id, nome, papel, whatsapp_grupo_leads_jid, whatsapp_grupo_leads_nome, whatsapp_grupo_leads_manual")
      .eq("grupo_id", equipe.grupoId),
    // Conta oculta (0189): o número e o grupo dela ficam fora da tela da equipe.
    idsDeContasOcultas(supabase),
    // Pela chave de serviço: o logado só tem SELECT nas colunas públicas de
    // `grupos` (0196); pela sessão esta leitura falhava calada e a tela pedia
    // "Salve o número central" com ele já salvo.
    createServiceClient()
      .from("grupos")
      .select("envio_grupo_leads_ativo, envio_grupo_leads_instancia, padrao_nome_grupo_leads")
      .eq("id", gestor.grupoId)
      .maybeSingle()
      .then((r) => {
        if (r.error) console.error("[grupos] falha ao ler a configuração do grupo", r.error.message);
        return r;
      }),
  ]);

  // A conta oculta fica fora da lista de corretores, mas o número dela pode
  // ser o central (é o da imobiliária): ver `opcoesDoNumeroCentral`.
  const visiveis = semContasOcultas(pessoas ?? [], ocultas, (p) => p.id);
  // Para o gestor escolher à mão o grupo de um corretor: os grupos que o
  // número central enxerga, também listados na tela. Se a leitura falhar, a
  // tela mostra o erro e a sincronização pelo nome continua valendo.
  // Sem escolha na tela (28/10/2026): vale o número salvo; sem ele, o da conta
  // logada, que a primeira ação (sincronizar ou escolher à mão) salva.
  const opcoes = opcoesDoNumeroCentral(todasInstancias ?? [], pessoas ?? [], ocultas);
  const propria = (todasInstancias ?? []).find((i) => i.corretor_id === gestor.id);
  const salvo = configuracao?.envio_grupo_leads_ativo ? configuracao.envio_grupo_leads_instancia : null;
  const central = salvo ?? (propria && opcoes.find((o) => o.instanceName === propria.instance_name)?.conectada ? propria.instance_name : null);
  const [gruposDoCentral, marca] = await Promise.all([
    central ? listarGruposWhatsapp(central) : Promise.resolve({ grupos: [] }),
    lerMarcaDoCrm(gestor.grupoId),
  ]);

  return (
    <ConfigurarGruposDeLeads
      instanciaAtual={central}
      nomeDoCentral={opcoes.find((o) => o.instanceName === central)?.nome.replace(" (conta oculta)", "") ?? null}
      corretores={visiveis
        .filter((p) => p.papel === "corretor")
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          grupoJid: p.whatsapp_grupo_leads_jid,
          grupoNome: p.whatsapp_grupo_leads_nome,
          manual: p.whatsapp_grupo_leads_manual,
        }))}
      padraoDoNome={configuracao?.padrao_nome_grupo_leads ?? null}
      nomeDaImobiliaria={marca.nome}
      gruposDoCentral={[...gruposDoCentral.grupos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
      erroDosGrupos={"erro" in gruposDoCentral ? gruposDoCentral.erro : undefined}
    />
  );
}
