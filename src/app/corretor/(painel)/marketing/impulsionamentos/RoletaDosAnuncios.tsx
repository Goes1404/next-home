import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { idsDeContasOcultas } from "@/lib/corretores/contaOculta";
import { EditorDaRoleta, type ConfigDaRoleta } from "./EditorDaRoleta";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO } from "@/lib/whatsapp/roletaTextos";

/**
 * "Roleta dos meus anúncios" (0204). Lida pela chave de serviço porque a
 * tabela não dá grant a ninguém; o recorte é feito aqui: tudo pelo grupo da
 * sessão, e o corretor comum só recebe a roleta dele.
 */
export async function RoletaDosAnuncios() {
  const quem = await getCorretorLogado();
  if (!quem) return null;
  const supabase = createServiceClient();
  const gestor = quem.papel === "gestor";

  let roletas = supabase
    .from("roleta_anuncios")
    .select("corretor_id, ligada, modo_aviso, destinos, texto_passagem, texto_abertura")
    .eq("grupo_id", quem.grupoId);
  if (!gestor) roletas = roletas.eq("corretor_id", quem.id);

  const [{ data: corretores }, { data: linhas, error }, { data: instancias }, ocultas, { data: grupo }] = await Promise.all([
    supabase.from("corretores").select("id, nome, whatsapp_grupo_leads_jid").eq("grupo_id", quem.grupoId).eq("ativo", true).order("nome"),
    roletas,
    supabase
      .from("corretor_whatsapp_instancias")
      .select("corretor_id, status_conexao, sessao_caida_em")
      .eq("grupo_id", quem.grupoId),
    idsDeContasOcultas(supabase, quem.grupoId),
    supabase.from("grupos").select("envio_grupo_leads_ativo").eq("id", quem.grupoId).maybeSingle(),
  ]);
  // Erro na leitura da roleta: antes da 0204 a tabela não existe e, antes da
  // 0218, a coluna `modo_aviso` não existe. Nos dois casos a seção some em vez
  // de quebrar a tela.
  if (error) return null;

  const conectados = new Set(
    (instancias ?? []).filter((i) => i.status_conexao === "conectado" && !i.sessao_caida_em).map((i) => i.corretor_id),
  );
  const equipe = (corretores ?? [])
    .filter((c) => !ocultas.has(c.id))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      conectado: conectados.has(c.id),
      temGrupo: !!c.whatsapp_grupo_leads_jid?.trim(),
    }));

  const porCorretor = new Map((linhas ?? []).map((l) => [l.corretor_id, l]));
  const donos = gestor ? equipe : equipe.filter((c) => c.id === quem.id);
  const configs: ConfigDaRoleta[] = donos.map((c) => {
    const l = porCorretor.get(c.id);
    return {
      corretorId: c.id,
      ligada: l?.ligada ?? false,
      destinos: (l?.destinos ?? []).filter((d) => equipe.some((e) => e.id === d)),
      textoPassagem: l?.texto_passagem || TEXTO_PASSAGEM_PADRAO,
      textoAbertura: l?.texto_abertura || TEXTO_ABERTURA_PADRAO,
      modoAviso: l?.modo_aviso === "grupo" ? ("grupo" as const) : ("mensagem" as const),
    };
  });
  if (configs.length === 0) return null;

  return <EditorDaRoleta configs={configs} equipe={equipe} meuId={quem.id} gestor={gestor} grupoTemEnvio={grupo?.envio_grupo_leads_ativo === true} />;
}
