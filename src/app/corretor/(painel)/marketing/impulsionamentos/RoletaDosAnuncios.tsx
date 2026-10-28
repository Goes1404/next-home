import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { idsDeContasOcultas } from "@/lib/corretores/contaOculta";
import { EditorDaRoleta, type ConfigDaRoleta, type Membro } from "./EditorDaRoleta";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO } from "@/lib/whatsapp/roletaTextos";
import { primeiroNome } from "@/lib/format";

/**
 * "Roleta dos meus anúncios" (0204). Lida pela chave de serviço porque a
 * tabela não dá grant a ninguém; o recorte é feito aqui: tudo pelo grupo da
 * sessão, e o corretor comum só recebe a roleta dele.
 *
 * Desde 26/10/2026 a mesma tabela de corretores mostra a ordem da roleta e,
 * para o gestor, a escala geral (pausa) e a regra do WhatsApp conectado. Em
 * cima, três cartões-resumo levam a cada parte da aba.
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
    supabase
      .from("corretores")
      .select("id, nome, papel, slug, em_pausa, whatsapp_grupo_leads_jid")
      .eq("grupo_id", quem.grupoId)
      .eq("ativo", true)
      .order("nome"),
    roletas,
    supabase
      .from("corretor_whatsapp_instancias")
      .select("corretor_id, status_conexao, sessao_caida_em")
      .eq("grupo_id", quem.grupoId),
    idsDeContasOcultas(supabase, quem.grupoId),
    supabase
      .from("grupos")
      .select("envio_grupo_leads_ativo, pular_corretor_whatsapp_desconectado")
      .eq("id", quem.grupoId)
      .maybeSingle(),
  ]);
  // Erro na leitura da roleta: antes da 0204 a tabela não existe e, antes da
  // 0218, a coluna `modo_aviso` não existe. Nos dois casos a seção some em vez
  // de quebrar a tela.
  if (error) return <SemRoleta />;

  const conectados = new Set(
    (instancias ?? []).filter((i) => i.status_conexao === "conectado" && !i.sessao_caida_em).map((i) => i.corretor_id),
  );
  const visiveis = (corretores ?? []).filter((c) => !ocultas.has(c.id));
  const equipe: Membro[] = visiveis.map((c) => ({
    id: c.id,
    nome: c.nome,
    conectado: conectados.has(c.id),
    temGrupo: !!c.whatsapp_grupo_leads_jid?.trim(),
    // Sem `slug` não há cadastro publicável, e a distribuição (0011) pula.
    naEscala: c.slug ? !c.em_pausa : null,
  }));

  const porCorretor = new Map((linhas ?? []).map((l) => [l.corretor_id, l]));
  // A roleta é sempre a do número de quem está logado (28/10/2026), gestor
  // inclusive: sem seletor de "Roleta do número de". A conta oculta (0189)
  // fica fora da equipe e da lista de quem recebe, mas a roleta do PRÓPRIO
  // número dela vale (era o número do anúncio da Aretz).
  const donos = (corretores ?? []).some((c) => c.id === quem.id) ? [{ id: quem.id }] : [];
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
  if (configs.length === 0) return <SemRoleta />;

  const regra = grupo?.pular_corretor_whatsapp_desconectado ?? false;
  const editor = (
    <EditorDaRoleta
      configs={configs}
      equipe={equipe}
      meuId={quem.id}
      gestor={gestor}
      grupoTemEnvio={grupo?.envio_grupo_leads_ativo === true}
      soConectados={regra}
    />
  );
  if (!gestor) return editor;

  // Os cartões-resumo do gestor: o que está salvo agora, não o rascunho.
  const minha = configs.find((c) => c.corretorId === quem.id) ?? configs[0];
  const naEscala = equipe.filter((m) => m.naEscala === true).length;
  const naDistribuicao = equipe.filter((m) => m.naEscala !== null).length;
  const doGrupo = visiveis.filter((c) => c.papel === "corretor");
  const semGrupo = doGrupo.filter((c) => !c.whatsapp_grupo_leads_jid?.trim()).map((c) => primeiroNome(c.nome));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <CartaoResumo
          href="#roleta"
          rotulo="Roleta dos anúncios"
          valor={minha.ligada ? `Ligada · ${minha.destinos.length} ${minha.destinos.length === 1 ? "corretor" : "corretores"}` : "Desligada"}
          detalhe={minha.modoAviso === "grupo" ? "Aviso no grupo para ligar" : "Mensagem do número do corretor"}
          bom={minha.ligada}
        />
        <CartaoResumo
          href="#corretores"
          rotulo="Na escala"
          valor={`${naEscala} de ${naDistribuicao} ${naDistribuicao === 1 ? "corretor" : "corretores"}`}
          detalhe={`${naDistribuicao - naEscala} em pausa · só com WhatsApp conectado: ${regra ? "sim" : "não"}`}
        />
        <CartaoResumo
          href="#grupos"
          rotulo="Grupos de WhatsApp"
          valor={`${doGrupo.length - semGrupo.length} de ${doGrupo.length} vinculados`}
          detalhe={
            semGrupo.length === 0
              ? "Todos com grupo"
              : `Falta: ${semGrupo.slice(0, 2).join(", ")}${semGrupo.length > 2 ? ` e mais ${semGrupo.length - 2}` : ""}`
          }
          alerta={semGrupo.length > 0}
        />
      </div>
      {editor}
    </div>
  );
}

function CartaoResumo({
  href,
  rotulo,
  valor,
  detalhe,
  bom = false,
  alerta = false,
}: {
  href: string;
  rotulo: string;
  valor: string;
  detalhe: string;
  bom?: boolean;
  alerta?: boolean;
}) {
  return (
    <a
      href={href}
      className="cartao flex flex-col gap-1.5 p-4 transition-colors hover:border-acento-linha sm:p-5"
    >
      <span className="text-fluid-xs text-apoio">{rotulo}</span>
      <span className="font-display text-fluid-lg font-semibold text-titulo">{valor}</span>
      <span className={`text-fluid-xs font-semibold ${bom ? "text-ok" : alerta ? "text-alerta" : "text-apoio"}`}>{detalhe}</span>
    </a>
  );
}

/** Desde as abas (26/10/2026) a roleta é a aba inteira: sumir deixaria a tela em branco. */
function SemRoleta() {
  return <p className="cartao p-4 text-fluid-sm text-corpo">A roleta dos anúncios ainda não está disponível para você.</p>;
}
