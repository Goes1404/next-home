import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioDeLogo } from "@/components/grupos/FormularioDeLogo";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { podeCancelar, rotinaDeApagarLigada } from "@/lib/grupos/encerramentoRegras";
import { diaEmSP } from "@/lib/crm/resumoDoDia";
import { lerFaturaEmAberto, variaveisDoAsaasFaltando } from "@/lib/cobranca/asaas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { lerAcessosDoGrupo, lerGrupoDaPlataforma } from "@/lib/plataforma/grupos";
import { ROTULO_DO_PLANO, ROTULO_DO_TIPO } from "@/lib/plataforma/rotulosDoGrupo";
import { lerSaudeDosGrupos } from "@/lib/plataforma/saude";
import { CustoDaIa } from "../../CustoDaIa";
import { SeloDoTipo } from "../../SeloDoTipo";
import { SaudeNoDetalhe } from "../../SaudeDoGrupo";
import { lerLimitesDetalhados } from "@/lib/planos/usoDaIa";
import { UsoDosLimites } from "@/components/planos/UsoDosLimites";
import { UsoDaIa } from "../../UsoDaIa";
import { tirarLogoDoGrupoNaPlataforma, trocarLogoDoGrupo } from "../../acoes";
import { CancelamentoDoGrupo } from "./CancelamentoDoGrupo";
import { CobrancaDoGrupo } from "./CobrancaDoGrupo";
import { CobrancaAutomatica } from "./CobrancaAutomatica";
import { EnderecosDoGrupo } from "./EnderecosDoGrupo";
import { FormularioDadosDoGrupo } from "./FormularioDadosDoGrupo";
import { FormularioLimitesDoPlano } from "./FormularioLimitesDoPlano";
import { FormularioTetoDaIa } from "./FormularioTetoDaIa";
import { FormularioNovoAcesso } from "./FormularioNovoAcesso";
import { AcessosDoGrupo } from "./AcessosDoGrupo";
import { SituacaoEPlanoDoGrupo } from "./SituacaoEPlanoDoGrupo";
import { RamoDoGrupo } from "./RamoDoGrupo";
import { NegocioDoGrupo } from "./NegocioDoGrupo";
import { lerNegocioDoGrupo } from "@/lib/plataforma/indicacoes";
import { lerRiscoDaConta } from "@/lib/plataforma/sinaisDeRisco";

export const metadata: Metadata = { title: "Grupo" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

/**
 * Um grupo na plataforma: o cadastro, os números e os dados que o operador
 * edita (contato de cobrança e institucionais). Nada de conversa, ficha,
 * lead nem nome de cliente (§4, §11) — só contagens de corretor e de número.
 * Uuid fora do formato não chega ao banco: vira 404 direto.
 */
export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const grupo = await lerGrupoDaPlataforma(prova, id);
  if (!grupo) notFound();
  const agora = new Date();
  const saude = (await lerSaudeDosGrupos(prova, [grupo], agora))[grupo.id];
  // Artes, vídeos e mensagens de lista do mês (0214). Na plataforma a falha de
  // leitura aparece em voz alta, diferente do painel, que segue liberado.
  const limites = await lerLimitesDetalhados(grupo.id, { estrito: true });
  // A logo do CRM do grupo (0208). A Next Home usa o logotipo da instalação.
  const marca = grupo.id === GRUPO_NEXT_HOME_ID ? null : await lerMarcaDoCrm(grupo.id);
  const acessos = await lerAcessosDoGrupo(prova, grupo.id);
  // Relacionamento (0247, 29/10/2026): termo de adesão, indicações e o risco
  // de cancelamento, em paralelo; falha de cada um só apaga a parte dele.
  const [negocio, risco] = await Promise.all([lerNegocioDoGrupo(prova, grupo.id), lerRiscoDaConta(grupo.id, agora)]);
  // A cobrança automática (0241): a fatura em aberto vem do Asaas na hora;
  // falha do Asaas só esconde o link (lerFaturaEmAberto devolve null).
  const faltandoNoAsaas = variaveisDoAsaasFaltando();
  const fatura =
    faltandoNoAsaas.length === 0 && grupo.asaasAssinaturaId ? await lerFaturaEmAberto(grupo.asaasAssinaturaId) : null;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <div className="mt-1">
          <SeloDoTipo tipo={grupo.tipo} grupoId={grupo.id} />
        </div>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1 break-words">{grupo.nome}</h1>
        <p className="text-fluid-sm text-apoio mt-1 break-all">{grupo.slug}</p>
        {/* A visão de suporte (0243, 29/10/2026): só números, com o acesso registrado. */}
        <Link
          href={`/plataforma/grupos/${grupo.id}/suporte`}
          prefetch={false}
          className="text-fluid-sm botao-secundario text-titulo mt-3 inline-flex min-h-11 items-center px-4 font-medium"
        >
          Abrir visão de suporte
        </Link>
      </div>

      <SaudeNoDetalhe saude={saude} agora={agora} />

      <NegocioDoGrupo grupoId={grupo.id} negocio={negocio} risco={risco} ehContaDaCasa={grupo.id === GRUPO_NEXT_HOME_ID} />

      <dl className="cartao text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-3 p-5 sm:grid-cols-3">
        <div>
          <dt className="text-apoio text-fluid-xs">Tipo</dt>
          <dd className="text-titulo">{ROTULO_DO_TIPO[grupo.tipo]}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Plano</dt>
          <dd className="text-titulo">{ROTULO_DO_PLANO[grupo.plano]}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Criado em</dt>
          <dd className="text-titulo">{DATA.format(new Date(grupo.criadoEm))}</dd>
        </div>
        {grupo.tipo === "independente" ? (
          <>
            <div>
              <dt className="text-apoio text-fluid-xs">O corretor</dt>
              <dd className="text-titulo break-words">{grupo.nome}</dd>
            </div>
            <div>
              <dt className="text-apoio text-fluid-xs">CRECI</dt>
              <dd className="text-titulo break-words">{grupo.creci ?? "não informado"}</dd>
            </div>
            <div>
              <dt className="text-apoio text-fluid-xs">Acesso</dt>
              <dd className="text-titulo">{grupo.comLogin > 0 ? "criado" : "convite pendente"}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt className="text-apoio text-fluid-xs">Corretores ativos</dt>
              <dd className="text-titulo">{grupo.corretoresAtivos}</dd>
            </div>
            <div>
              <dt className="text-apoio text-fluid-xs">Com login</dt>
              <dd className="text-titulo">{grupo.comLogin}</dd>
            </div>
          </>
        )}
        <div>
          <dt className="text-apoio text-fluid-xs">Números no ar</dt>
          <dd className="text-titulo">{grupo.numerosConectados}</dd>
        </div>
      </dl>

      <SituacaoEPlanoDoGrupo
        grupoId={grupo.id}
        situacao={grupo.situacao}
        plano={grupo.plano}
        cancelado={grupo.canceladoEm !== null}
        suspensoPorAtraso={grupo.situacao === "ativo" && grupo.cobranca.estado === "suspenso"}
        temAjusteDeLimite={
          grupo.tetoAjustado !== null ||
          limites.ajustados.arte !== null ||
          limites.ajustados.video !== null ||
          limites.ajustados.lista !== null
        }
        planoFixo={grupo.id === GRUPO_NEXT_HOME_ID}
      />

      <RamoDoGrupo
        grupoId={grupo.id}
        ramo={grupo.ramo}
        descricao={grupo.ramoDescricao}
        fixo={grupo.id === GRUPO_NEXT_HOME_ID}
      />

      <FormularioNovoAcesso grupoId={grupo.id} />

      <AcessosDoGrupo acessos={acessos} />

      <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-ia">
        <h2 id="titulo-ia" className="text-fluid-sm text-titulo font-bold">
          Respostas da IA
        </h2>
        <UsoDaIa uso={grupo.usoDaIa} ajustado={grupo.tetoAjustado !== null} />
        <div className="border-linha border-t pt-5">
          <CustoDaIa custo={saude.custo} mensalidade={saude.mensalidade} cambio={saude.cambio} />
        </div>
        <FormularioTetoDaIa grupoId={grupo.id} inicial={grupo.tetoAjustado} padraoDoPlano={grupo.tetoDoPlano} />
      </section>

      <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-limites">
        <h2 id="titulo-limites" className="text-fluid-sm text-titulo font-bold">
          Artes, vídeos e listas
        </h2>
        <UsoDosLimites
          limites={limites.limites}
          ajustados={{
            arte: limites.ajustados.arte !== null,
            video: limites.ajustados.video !== null,
            lista: limites.ajustados.lista !== null,
          }}
        />
        <FormularioLimitesDoPlano grupoId={grupo.id} iniciais={limites.ajustados} padroes={limites.padroes} />
      </section>

      <CobrancaDoGrupo
        grupoId={grupo.id}
        cobranca={grupo.cobranca}
        mensalidade={grupo.mensalidade}
        diaDoVencimento={grupo.diaDoVencimento}
        pagamentos={grupo.pagamentos}
        suspensoManual={grupo.situacao === "suspenso"}
        hoje={diaEmSP(new Date())}
      />

      <CobrancaAutomatica
        grupoId={grupo.id}
        faltando={faltandoNoAsaas}
        isento={grupo.plano === "custo"}
        assinaturaId={grupo.asaasAssinaturaId}
        fatura={fatura}
        mensalidade={grupo.mensalidade}
        temDocumento={Boolean(grupo.documento)}
      />

      {marca && (
        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-logo">
          <h2 id="titulo-logo" className="text-fluid-sm text-titulo font-bold">
            Logo no CRM
          </h2>
          <FormularioDeLogo
            nomeDaCasa={marca.nome}
            logoAtual={marca.logoUrl}
            enviar={trocarLogoDoGrupo.bind(null, grupo.id)}
            remover={tirarLogoDoGrupoNaPlataforma.bind(null, grupo.id)}
          />
        </section>
      )}

      {/* Os endereços da Next Home ficam no código (`ENDERECOS_DA_NEXT_HOME`). */}
      {grupo.id !== GRUPO_NEXT_HOME_ID && <EnderecosDoGrupo grupoId={grupo.id} enderecos={grupo.enderecos} />}

      <FormularioDadosDoGrupo
        grupoId={grupo.id}
        inicial={{
          contatoNome: grupo.contatoNome ?? "",
          contatoEmail: grupo.contatoEmail ?? "",
          contatoTelefone: grupo.contatoTelefone ?? "",
          razaoSocial: grupo.razaoSocial ?? "",
          documento: grupo.documento ?? "",
          creci: grupo.creci ?? "",
          creciTipo: grupo.creciTipo ?? "",
          encarregadoNome: grupo.encarregadoNome ?? "",
          encarregadoEmail: grupo.encarregadoEmail ?? "",
        }}
      />

      {podeCancelar(grupo.id) && (
        <CancelamentoDoGrupo
          grupoId={grupo.id}
          canceladoEm={grupo.canceladoEm}
          dadosApagadosEm={grupo.dadosApagadosEm}
          copiaFinalApagadaEm={grupo.copiaFinalApagadaEm}
          falhaAoApagar={grupo.falhaAoApagar}
          tentativaDeApagarEm={grupo.tentativaDeApagarEm}
          rotinaLigada={rotinaDeApagarLigada(process.env)}
        />
      )}
    </section>
  );
}
