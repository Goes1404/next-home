import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UsoDosLimites } from "@/components/planos/UsoDosLimites";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { RECURSOS } from "@/lib/planos/limitesDoPlano";
import { lerLimitesDetalhados } from "@/lib/planos/usoDaIa";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { lerGrupoDaPlataforma } from "@/lib/plataforma/grupos";
import { ROTULO_DO_PLANO, ROTULO_DO_TIPO } from "@/lib/plataforma/rotulosDoGrupo";
import { lerSaudeDosGrupos } from "@/lib/plataforma/saude";
import {
  lerAcessoDeSuporte,
  lerEquipeDoSuporte,
  lerFunilEmNumeros,
  type PessoaDaEquipe,
  type StatusDoWhatsapp,
} from "@/lib/plataforma/visaoDeSuporte";
import { ETAPA_LABEL, ETAPAS_FUNIL } from "@/lib/types";
import { CustoDaIa } from "../../../CustoDaIa";
import { UsoDaIa } from "../../../UsoDaIa";
import { FormularioDoAcesso } from "./FormularioDoAcesso";

export const metadata: Metadata = { title: "Visão de suporte" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const NUMERO = new Intl.NumberFormat("pt-BR");
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const WHATSAPP: Record<StatusDoWhatsapp, { rotulo: string; classe: string }> = {
  conectado: { rotulo: "Conectado", classe: "bg-ok-lavado text-ok border-ok-linha" },
  conectando: { rotulo: "Conectando", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  desconectado: { rotulo: "Desconectado", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

const COBRANCA = {
  isento: "Isento (preço de custo)",
  em_dia: "Em dia",
  pendente: "Vencida",
  suspenso: "Suspensa por atraso",
} as const;

const SITUACAO = { ativo: "Ativa", suspenso: "Suspensa", encerrado: "Cancelada" } as const;

type Busca = Promise<{ acesso?: string | string[] }>;

function Caixa({ id, titulo, children, editar }: { id: string; titulo: string; children: React.ReactNode; editar?: string }) {
  return (
    <section className="cartao flex min-w-0 flex-col gap-4 p-5" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-fluid-sm text-titulo font-bold">
          {titulo}
        </h2>
        {editar && (
          <Link href={editar} className="text-fluid-xs text-acento inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            Editar na tela da conta
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-apoio text-fluid-xs">{rotulo}</dt>
      <dd className="text-titulo text-fluid-xl font-display tabular-nums">{NUMERO.format(valor)}</dd>
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-apoio text-fluid-xs">{rotulo}</dt>
      <dd className="text-titulo break-words">{children}</dd>
    </div>
  );
}

function Pessoa({ p }: { p: PessoaDaEquipe }) {
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-fluid-sm font-semibold break-words ${p.ativo ? "text-titulo" : "text-apoio line-through"}`}>{p.nome}</p>
        <p className="text-fluid-xs text-apoio">
          {p.papel === "gestor" ? "Gestor" : "Corretor"}
          {!p.ativo && " · desativado"}
        </p>
      </div>
      <div className="text-fluid-xs flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={p.creciOk ? "text-apoio" : "text-alerta"}>{p.creciOk ? "CRECI ok" : "CRECI pendente"}</span>
        <span className="text-apoio">
          {!p.temLogin
            ? "sem login"
            : p.ultimoAcesso
              ? `último acesso ${DATA_E_HORA.format(new Date(p.ultimoAcesso))}`
              : "nunca entrou"}
        </span>
        {p.whatsapp.length === 0 ? (
          <span className="text-apoio">sem WhatsApp cadastrado</span>
        ) : (
          p.whatsapp.map((w, i) => (
            <span key={i} className={`rounded-full border px-2 py-0.5 ${WHATSAPP[w.status].classe}`}>
              WhatsApp {WHATSAPP[w.status].rotulo.toLowerCase()}
              {w.desde && ` desde ${DATA.format(new Date(w.desde))}`}
            </span>
          ))
        )}
      </div>
    </li>
  );
}

/**
 * A visão de suporte de UMA conta (0243, 29/10/2026): o que o suporte da
 * Astro precisa para atender sem pedir print — o funil em NÚMEROS, a equipe,
 * o WhatsApp de cada um, o uso da IA e do plano, a cobrança, os endereços e
 * as configurações (só leitura, com link para editar na tela da conta).
 *
 * Nunca conversa, mensagem, dossiê, nota nem identidade de lead (nome,
 * telefone, e-mail): leads e visitas só CONTADOS (`visaoDeSuporte.ts`).
 *
 * Todo acesso é registrado ANTES: sem `?acesso=` de um registro recente do
 * próprio administrador para esta conta, a página mostra só o formulário do
 * registro (motivo já escrito, um clique). O gestor da conta vê a lista dos
 * acessos na visão geral do painel.
 */
export default async function VisaoDeSuportePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const grupo = await lerGrupoDaPlataforma(prova, id);
  if (!grupo) notFound();
  const pedido = (await searchParams).acesso;
  const acessoId = Array.isArray(pedido) ? pedido[0] : pedido;
  const agora = new Date();
  const acesso = ehUuid(acessoId) ? await lerAcessoDeSuporte(prova, grupo.id, acessoId, agora) : null;

  const cabecalho = (
    <div>
      <Link href={`/plataforma/grupos/${grupo.id}`} className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
        ← {grupo.nome}
      </Link>
      <p className="text-fluid-xs text-apoio mt-1 tracking-[0.16em] uppercase">Visão de suporte</p>
      <h1 className="font-display text-titulo text-fluid-2xl mt-1 break-words">{grupo.nome}</h1>
      <p className="text-fluid-sm text-apoio mt-1">
        {ROTULO_DO_TIPO[grupo.tipo]} · {ROTULO_DO_PLANO[grupo.plano]} · {SITUACAO[grupo.situacao]}
      </p>
    </div>
  );

  if (!acesso) {
    return (
      <section className="flex max-w-3xl flex-col gap-6">
        {cabecalho}
        <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-registro">
          <h2 id="titulo-registro" className="text-fluid-sm text-titulo font-bold">
            Registrar o acesso
          </h2>
          <p className="text-fluid-sm text-apoio">
            Todo acesso à visão de suporte fica registrado e aparece para o gestor da conta, no painel dele, como “Equipe
            Astro”. A visão mostra só números e configurações: nenhuma conversa, mensagem, anotação nem dado de cliente.
          </p>
          {acessoId && (
            <p role="status" className="text-fluid-sm border-alerta-linha bg-alerta-lavado text-alerta rounded-xl border px-4 py-3">
              Este acesso expirou ou não é seu. Registre um novo para continuar.
            </p>
          )}
          <FormularioDoAcesso grupoId={grupo.id} />
        </section>
      </section>
    );
  }

  const [funil, equipe, saudes, limites] = await Promise.all([
    lerFunilEmNumeros(prova, grupo.id, agora),
    lerEquipeDoSuporte(prova, grupo.id),
    lerSaudeDosGrupos(prova, [grupo], agora),
    lerLimitesDetalhados(grupo.id, { estrito: true }),
  ]);
  const saude = saudes[grupo.id];
  const totalNoFunil = ETAPAS_FUNIL.reduce((s, e) => s + funil.porEtapa[e], 0);
  const telaDaConta = `/plataforma/grupos/${grupo.id}`;
  const ativos = equipe.filter((p) => p.ativo);
  const conectados = ativos.filter((p) => p.whatsapp.some((w) => w.status === "conectado")).length;

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      {cabecalho}

      <p role="status" className="text-fluid-xs border-linha bg-campo text-apoio rounded-xl border px-4 py-3">
        Acesso registrado em {DATA_E_HORA.format(new Date(acesso.criadoEm))}
        {acesso.motivo && <> · {acesso.motivo}</>}. Vale por 2 horas; o gestor da conta vê este registro.
      </p>

      <Caixa id="titulo-funil" titulo="Funil em números">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Numero rotulo="leads nos últimos 7 dias" valor={funil.criadosEm7Dias} />
          <Numero rotulo="leads nos últimos 30 dias" valor={funil.criadosEm30Dias} />
          <Numero rotulo="visitas marcadas (a fazer)" valor={funil.visitasMarcadas} />
          <Numero rotulo="no funil agora" valor={totalNoFunil} />
        </dl>
        <dl className="border-linha grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 sm:grid-cols-5">
          {ETAPAS_FUNIL.map((etapa) => (
            <Numero key={etapa} rotulo={ETAPA_LABEL[etapa]} valor={funil.porEtapa[etapa]} />
          ))}
        </dl>
        <p className="text-fluid-xs text-tenue">
          Só contagens. Arquivados fora do funil: {NUMERO.format(funil.arquivados)}.
        </p>
      </Caixa>

      <Caixa id="titulo-equipe" titulo={`Equipe (${ativos.length} ativos · ${conectados} com WhatsApp no ar)`} editar={`${telaDaConta}#titulo-acessos`}>
        {equipe.length === 0 ? (
          <p className="text-fluid-sm text-apoio">Nenhuma ficha de corretor nesta conta.</p>
        ) : (
          <ul className="divide-linha -my-3 divide-y">
            {equipe.map((p) => (
              <Pessoa key={p.corretorId} p={p} />
            ))}
          </ul>
        )}
      </Caixa>

      <Caixa id="titulo-ia-suporte" titulo="Uso da IA e do plano" editar={`${telaDaConta}#titulo-ia`}>
        <UsoDaIa uso={grupo.usoDaIa} ajustado={grupo.tetoAjustado !== null} />
        <div className="border-linha border-t pt-4">
          <CustoDaIa custo={saude.custo} mensalidade={saude.mensalidade} cambio={saude.cambio} compacto />
        </div>
        <div className="border-linha border-t pt-4">
          <UsoDosLimites
            limites={limites.limites}
            ajustados={{
              arte: limites.ajustados.arte !== null,
              video: limites.ajustados.video !== null,
              lista: limites.ajustados.lista !== null,
            }}
          />
        </div>
      </Caixa>

      <Caixa id="titulo-cobranca-suporte" titulo="Cobrança" editar={`${telaDaConta}#titulo-cobranca`}>
        <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dado rotulo="Situação">{COBRANCA[grupo.cobranca.estado]}</Dado>
          <Dado rotulo="Mensalidade">
            {grupo.plano === "custo" ? "preço de custo" : grupo.mensalidade === null ? "não definida" : REAIS.format(grupo.mensalidade)}
          </Dado>
          <Dado rotulo="Vencimento">todo dia {grupo.diaDoVencimento}</Dado>
          {grupo.cobranca.vencimento && (
            <Dado rotulo="Em aberto desde">
              {DATA.format(new Date(`${grupo.cobranca.vencimento}T12:00:00Z`))} ({grupo.cobranca.diasDeAtraso}{" "}
              {grupo.cobranca.diasDeAtraso === 1 ? "dia" : "dias"})
            </Dado>
          )}
          <Dado rotulo="Próximo vencimento">{DATA.format(new Date(`${grupo.cobranca.proximoVencimento}T12:00:00Z`))}</Dado>
          <Dado rotulo="Último pagamento">
            {grupo.pagamentos[0] ? DATA.format(new Date(`${grupo.pagamentos[0].pagoEm}T12:00:00Z`)) : "nenhum registrado"}
          </Dado>
        </dl>
      </Caixa>

      <Caixa
        id="titulo-enderecos-suporte"
        titulo="Endereços do site"
        editar={grupo.id === GRUPO_NEXT_HOME_ID ? undefined : `${telaDaConta}#titulo-site`}
      >
        {grupo.id === GRUPO_NEXT_HOME_ID ? (
          <p className="text-fluid-sm text-apoio">Os endereços da Next Home ficam no código da instalação.</p>
        ) : grupo.enderecos.length === 0 ? (
          <p className="text-fluid-sm text-apoio">Nenhum endereço ligado.</p>
        ) : (
          <ul className="text-fluid-sm flex flex-col gap-1">
            {grupo.enderecos.map((e) => (
              <li key={e.host} className="text-titulo break-all">
                {e.host}
                <span className="text-apoio">
                  {" "}
                  · {e.tipo === "proprio" ? "domínio próprio" : "endereço gratuito"}
                  {e.principal && " · principal"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Caixa>

      <Caixa id="titulo-configuracoes" titulo="Configurações (só leitura)" editar={`${telaDaConta}#titulo-situacao`}>
        <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dado rotulo="Plano">{ROTULO_DO_PLANO[grupo.plano]}</Dado>
          <Dado rotulo="Situação da conta">{SITUACAO[grupo.situacao]}</Dado>
          <Dado rotulo="Criada em">{DATA.format(new Date(grupo.criadoEm))}</Dado>
          <Dado rotulo="Teto de respostas da IA">
            {grupo.tetoAjustado !== null
              ? `${NUMERO.format(grupo.tetoAjustado)} (ajustado)`
              : grupo.tetoDoPlano === null
                ? "sem limite (plano)"
                : `${NUMERO.format(grupo.tetoDoPlano)} (do plano)`}
          </Dado>
          {RECURSOS.map((r) => {
            const ajustado = limites.ajustados[r];
            const padrao = limites.padroes[r];
            const rotulo = r === "arte" ? "Teto de artes" : r === "video" ? "Teto de vídeos" : "Teto de mensagens de lista";
            return (
              <Dado key={r} rotulo={rotulo}>
                {ajustado !== null
                  ? `${NUMERO.format(ajustado)} (ajustado)`
                  : padrao === null
                    ? "sem limite (plano)"
                    : `${NUMERO.format(padrao)} (do plano)`}
              </Dado>
            );
          })}
          <Dado rotulo="Números de WhatsApp no ar">{NUMERO.format(grupo.numerosConectados)}</Dado>
        </dl>
      </Caixa>
    </section>
  );
}
