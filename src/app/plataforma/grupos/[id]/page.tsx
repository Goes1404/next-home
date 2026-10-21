import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioDeLogo } from "@/components/grupos/FormularioDeLogo";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { podeCancelar, rotinaDeApagarLigada } from "@/lib/grupos/encerramentoRegras";
import { diaEmSP } from "@/lib/crm/resumoDoDia";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { lerGrupoDaPlataforma } from "@/lib/plataforma/grupos";
import { ROTULO_DO_PLANO, ROTULO_DO_TIPO } from "@/lib/plataforma/rotulosDoGrupo";
import { lerSaudeDosGrupos } from "@/lib/plataforma/saude";
import { CustoDaIa } from "../../CustoDaIa";
import { SaudeNoDetalhe } from "../../SaudeDoGrupo";
import { UsoDaIa } from "../../UsoDaIa";
import { tirarLogoDoGrupoNaPlataforma, trocarLogoDoGrupo } from "../../acoes";
import { CancelamentoDoGrupo } from "./CancelamentoDoGrupo";
import { CobrancaDoGrupo } from "./CobrancaDoGrupo";
import { EnderecosDoGrupo } from "./EnderecosDoGrupo";
import { FormularioDadosDoGrupo } from "./FormularioDadosDoGrupo";
import { FormularioTetoDaIa } from "./FormularioTetoDaIa";

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
  // A logo do CRM do grupo (0208). A Next Home usa o logotipo da instalação.
  const marca = grupo.id === GRUPO_NEXT_HOME_ID ? null : await lerMarcaDoCrm(grupo.id);

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Grupos
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1 break-words">{grupo.nome}</h1>
        <p className="text-fluid-sm text-apoio mt-1 break-all">{grupo.slug}</p>
      </div>

      <SaudeNoDetalhe saude={saude} agora={agora} />

      <SaudeNoDetalhe saude={saude} agora={agora} />

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
        <div>
          <dt className="text-apoio text-fluid-xs">Corretores ativos</dt>
          <dd className="text-titulo">{grupo.corretoresAtivos}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Com login</dt>
          <dd className="text-titulo">{grupo.comLogin}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Números no ar</dt>
          <dd className="text-titulo">{grupo.numerosConectados}</dd>
        </div>
      </dl>
      <p className="text-fluid-xs text-tenue -mt-3">O plano só muda no ciclo seguinte; nesta versão ele não se edita aqui.</p>

      <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-ia">
        <h2 id="titulo-ia" className="text-fluid-sm text-titulo font-bold">
          Respostas da IA
        </h2>
        <UsoDaIa uso={grupo.usoDaIa} ajustado={grupo.tetoAjustado !== null} />
        <div className="border-linha border-t pt-5">
          <CustoDaIa custo={saude.custo} mensalidade={saude.mensalidade} cambio={saude.cambio} />
        </div>
        <div className="border-linha border-t pt-5">
          <CustoDaIa custo={saude.custo} mensalidade={saude.mensalidade} cambio={saude.cambio} />
        </div>
        <FormularioTetoDaIa grupoId={grupo.id} inicial={grupo.tetoAjustado} padraoDoPlano={grupo.tetoDoPlano} />
      </section>

      <CobrancaDoGrupo
        grupoId={grupo.id}
        cobranca={grupo.cobranca}
        mensalidade={grupo.mensalidade}
        diaDoVencimento={grupo.diaDoVencimento}
        pagamentos={grupo.pagamentos}
        suspensoManual={grupo.situacao === "suspenso"}
        podeSuspender={grupo.situacao === "ativo" && grupo.canceladoEm === null}
        hoje={diaEmSP(new Date())}
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
