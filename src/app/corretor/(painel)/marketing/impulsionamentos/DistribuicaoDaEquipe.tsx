import Link from "next/link";
import { getCorretorLogado, getEquipeAtiva } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { clienteParaNumerosDaEquipe } from "@/lib/admin/numerosDaEquipe";
import { idsDeContasOcultas, semContasOcultas } from "@/lib/corretores/contaOculta";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { listarGruposWhatsapp } from "@/lib/whatsapp/provider";
import { ConfigurarGruposDeLeads } from "@/app/corretor/(painel)/admin/whatsapp/ConfigurarGruposDeLeads";
import { TogglePausa } from "@/app/corretor/(painel)/admin/leads/TogglePausa";
import { RegraDoNumeroConectado } from "./RegraDoNumeroConectado";

/**
 * Tudo da distribuição de leads da equipe na aba Roleta (26/10/2026): quem
 * entra na escala, se precisa de WhatsApp conectado, e os grupos de WhatsApp
 * dos corretores (número central, nome dos grupos, vínculo à mão). Antes
 * ficava espalhado entre WhatsApp & IA e Leads da equipe.
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
  const [{ data: todasInstancias }, { data: pessoas }, ocultas, { data: configuracao }, escala] = await Promise.all([
    equipe.ler((c) =>
      c.from("corretor_whatsapp_instancias").select("corretor_id, instance_name, status_conexao, conectado_em, sessao_caida_em"),
    ),
    supabase
      .from("corretores")
      .select("id, nome, papel, whatsapp_grupo_leads_jid, whatsapp_grupo_leads_nome, whatsapp_grupo_leads_manual")
      .eq("grupo_id", equipe.grupoId),
    // Conta oculta (0189): o número e o grupo dela ficam fora da tela da equipe.
    idsDeContasOcultas(supabase),
    supabase
      .from("grupos")
      .select("envio_grupo_leads_ativo, envio_grupo_leads_instancia, pular_corretor_whatsapp_desconectado, padrao_nome_grupo_leads")
      .eq("id", gestor.grupoId)
      .maybeSingle(),
    getEquipeAtiva(),
  ]);

  const instancias = semContasOcultas(todasInstancias ?? [], ocultas, (i) => i.corretor_id);
  const visiveis = semContasOcultas(pessoas ?? [], ocultas, (p) => p.id);
  const nomePor = new Map(visiveis.map((p) => [p.id, p.nome]));
  // Para o gestor escolher à mão o grupo de um corretor: os grupos que o
  // número central enxerga. Sem número central, ou se a leitura falhar, a
  // lista fica vazia e a sincronização pelo nome continua valendo.
  const central = configuracao?.envio_grupo_leads_ativo ? configuracao.envio_grupo_leads_instancia : null;
  const [gruposDoCentral, marca] = await Promise.all([
    central ? listarGruposWhatsapp(central) : Promise.resolve({ grupos: [] }),
    lerMarcaDoCrm(gestor.grupoId),
  ]);

  return (
    <>
      <section className="cartao space-y-4 p-5 sm:p-6" aria-labelledby="quem-entra">
        <div>
          <h3 id="quem-entra" className="text-fluid-lg font-semibold text-titulo">
            Quem entra na distribuição
          </h3>
          <p className="mt-1 text-fluid-sm text-corpo">
            Vale para todo lead novo da equipe, de anúncio, do site ou de portal. Quem está em pausa é pulado.
          </p>
        </div>
        <RegraDoNumeroConectado ligada={configuracao?.pular_corretor_whatsapp_desconectado ?? false} />
        <ul className="divide-y divide-linha">
          {escala.map((c) => (
            <li key={c.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-fluid-sm text-titulo">{c.nome}</span>
              <TogglePausa corretorId={c.id} emPausa={c.emPausa} />
            </li>
          ))}
        </ul>
        <p className="text-fluid-xs text-apoio">
          Para passar a carteira de um corretor para outro, use{" "}
          <Link href="/corretor/admin/leads" className="link-acao text-acento">
            Leads da equipe
          </Link>
          .
        </p>
      </section>

      <ConfigurarGruposDeLeads
        instanciaAtual={central}
        instancias={instancias.map((i) => ({
          instanceName: i.instance_name,
          nome: nomePor.get(i.corretor_id) ?? i.instance_name,
          conectada: i.status_conexao === "conectado" && i.conectado_em !== null && i.sessao_caida_em === null,
        }))}
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
        gruposDoCentral={gruposDoCentral.grupos}
      />
    </>
  );
}
