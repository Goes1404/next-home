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
    .select("corretor_id, ligada, destinos, texto_passagem, texto_abertura")
    .eq("grupo_id", quem.grupoId);
  if (!gestor) roletas = roletas.eq("corretor_id", quem.id);

  const [{ data: corretores }, { data: linhas, error }, { data: instancias }, ocultas] = await Promise.all([
    supabase.from("corretores").select("id, nome").eq("grupo_id", quem.grupoId).eq("ativo", true).order("nome"),
    roletas,
    supabase
      .from("corretor_whatsapp_instancias")
      .select("corretor_id, status_conexao, sessao_caida_em")
      .eq("grupo_id", quem.grupoId),
    idsDeContasOcultas(supabase, quem.grupoId),
  ]);
  // Antes da 0204 a tabela não existe: a seção some em vez de quebrar a tela.
  if (error) return null;

  const conectados = new Set(
    (instancias ?? []).filter((i) => i.status_conexao === "conectado" && !i.sessao_caida_em).map((i) => i.corretor_id),
  );
  const equipe = (corretores ?? [])
    .filter((c) => !ocultas.has(c.id))
    .map((c) => ({ id: c.id, nome: c.nome, conectado: conectados.has(c.id) }));

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
    };
  });
  if (configs.length === 0) return null;

  return <EditorDaRoleta configs={configs} equipe={equipe} meuId={quem.id} gestor={gestor} />;
}
