import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { CopiarLink } from "@/app/corretor/(painel)/CopiarLink";
import { exigirGestorNaPagina } from "@/lib/guardas";
import {
  linkDeIndicacao,
  linkDoWhatsAppDeIndicacao,
  mensagemDeIndicacao,
} from "@/lib/indicacoes/codigo";
import {
  descricaoDaRecompensa,
  ROTULO_DO_STATUS_DA_INDICACAO,
  statusDaIndicacao,
  type StatusDaIndicacao,
} from "@/lib/indicacoes/indicacao";
import { PAINEL_URL_PADRAO } from "@/lib/marcaDoCrm/marca";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Indique e ganhe" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const COR_DO_STATUS: Record<StatusDaIndicacao, string> = {
  aguardando_pagamento: "bg-campo text-apoio border-linha-forte",
  credito_gerado: "bg-acento-lavado text-titulo border-acento",
  credito_aplicado: "bg-ok-lavado text-ok border-ok-linha",
  conta_cancelada: "bg-perigo-lavado text-perigo border-perigo-linha",
};

type Indicada = { id: string; desde: string; nome: string; status: StatusDaIndicacao; credito: string | null };

/**
 * Indique e ganhe (0247, 29/10/2026): o link da conta, o botão de mandar
 * pelo WhatsApp e as contas que vieram por ele, com a situação de cada uma.
 *
 * Só o gestor (e o corretor independente, que é o gestor do próprio grupo):
 * a recompensa é desconto na mensalidade da CONTA. As tabelas da indicação
 * são globais e só a chave de serviço as lê (0247); por isso a guarda vem
 * antes de tudo, e toda leitura é recortada pelo grupo da sessão (o código e
 * o nome pela linha do grupo; as indicações e os créditos pelas colunas do
 * grupo da sessão). Da conta indicada só aparece o nome e a situação.
 */
export default async function IndiquePage() {
  const gestor = await exigirGestorNaPagina();
  const servico = createServiceClient();
  const grupoId = gestor.grupoId;

  const [conta, indicacoes, creditos] = await Promise.all([
    servico.from("grupos").select("nome, codigo_de_indicacao").eq("id", grupoId).maybeSingle(),
    servico
      .from("indicacoes")
      .select("id, criado_em, grupo_indicado_id")
      .eq("grupo_indicador_id", grupoId)
      .order("criado_em", { ascending: false })
      .limit(200),
    servico
      .from("creditos_de_indicacao")
      .select("indicacao_id, descricao, aplicado_em")
      .eq("grupo_beneficiado_id", grupoId),
  ]);
  for (const r of [conta, indicacoes, creditos]) {
    if (r.error) console.error(`[indique] leitura do grupo ${grupoId} falhou: ${r.error.message}`);
  }

  const idsIndicados = (indicacoes.data ?? []).map((i) => i.grupo_indicado_id);
  const { data: contasIndicadas, error: erroDasContas } =
    idsIndicados.length > 0
      ? await servico.from("grupos").select("id, nome, situacao").in("id", idsIndicados)
      : { data: [] as { id: string; nome: string; situacao: string }[], error: null };
  if (erroDasContas) console.error(`[indique] contas indicadas de ${grupoId} não lidas: ${erroDasContas.message}`);

  const porId = new Map((contasIndicadas ?? []).map((g) => [g.id, g]));
  const creditoPorIndicacao = new Map((creditos.data ?? []).map((c) => [c.indicacao_id, c]));
  const lista: Indicada[] = (indicacoes.data ?? []).map((i) => {
    const indicada = porId.get(i.grupo_indicado_id);
    const credito = creditoPorIndicacao.get(i.id) ?? null;
    return {
      id: i.id,
      desde: i.criado_em,
      nome: indicada?.nome ?? "Conta",
      status: statusDaIndicacao({
        credito: credito ? { aplicadoEm: credito.aplicado_em } : null,
        indicadaEncerrada: indicada?.situacao === "encerrado",
      }),
      credito: credito?.descricao ?? null,
    };
  });

  const codigo = conta.data?.codigo_de_indicacao ?? null;
  const link = codigo ? linkDeIndicacao(codigo, PAINEL_URL_PADRAO) : null;
  const whatsapp = link ? linkDoWhatsAppDeIndicacao(mensagemDeIndicacao(conta.data?.nome ?? "", link)) : null;
  const pagaram = lista.filter((i) => i.status === "credito_gerado" || i.status === "credito_aplicado").length;

  return (
    <div className="max-w-2xl">
      <CabecalhoDeTela
        secao="Conta"
        titulo="Indique e ganhe"
        descricao="Indique a Astro para quem também atende clientes pelo WhatsApp e ganhe desconto na sua mensalidade."
      />

      <section className="cartao mt-8 p-5" aria-labelledby="titulo-como-funciona">
        <h2 id="titulo-como-funciona" className="text-titulo text-fluid-base font-medium">
          Como funciona
        </h2>
        <ol className="text-fluid-sm text-corpo mt-3 list-decimal space-y-1.5 pl-5">
          <li>Mande o seu link para quem pode usar o CRM.</li>
          <li>A pessoa abre o link e cria a conta (o teste grátis vale).</li>
          <li>
            Quando a conta indicada pagar a primeira mensalidade, você ganha{" "}
            <strong className="text-titulo">{descricaoDaRecompensa()}</strong>, aplicado pela Astro na sua próxima
            cobrança.
          </li>
        </ol>
        <p className="text-fluid-xs text-apoio mt-3">
          O link vale por 30 dias no aparelho de quem abriu. Cada conta só pode ser indicada uma vez, e a sua própria
          conta não conta.
        </p>
      </section>

      <section className="cartao mt-6 p-5" aria-labelledby="titulo-seu-link">
        <h2 id="titulo-seu-link" className="text-titulo text-fluid-base font-medium">
          Seu link
        </h2>
        {link ? (
          <>
            <CopiarLink link={link} />
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener"
                className="botao-secundario text-fluid-sm text-titulo mt-3 inline-flex min-h-11 items-center justify-center rounded-full px-5 font-medium"
              >
                Mandar pelo WhatsApp
              </a>
            )}
          </>
        ) : (
          <p className="text-fluid-sm text-apoio mt-2">
            Seu link ainda não está pronto. Tente de novo em alguns minutos ou fale com o suporte da Astro.
          </p>
        )}
      </section>

      <section aria-labelledby="titulo-indicacoes" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titulo-indicacoes" className="font-display text-titulo text-fluid-lg">
            Suas indicações
          </h2>
          {lista.length > 0 && (
            <p className="text-fluid-xs text-apoio">
              {lista.length} {lista.length === 1 ? "conta" : "contas"} · {pagaram} com crédito
            </p>
          )}
        </div>
        {lista.length === 0 ? (
          <p className="text-fluid-sm text-apoio mt-3">Nenhuma conta chegou pelo seu link ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {lista.map((i) => (
              <li key={i.id} className="cartao flex min-w-0 flex-wrap items-start justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="text-titulo text-fluid-sm font-medium break-words">{i.nome}</p>
                  <p className="text-fluid-xs text-apoio">Desde {DATA.format(new Date(i.desde))}</p>
                  {i.credito && <p className="text-fluid-xs text-corpo mt-1">Crédito: {i.credito}</p>}
                </div>
                <span className={`text-fluid-xs shrink-0 rounded-full border px-2.5 py-1 ${COR_DO_STATUS[i.status]}`}>
                  {ROTULO_DO_STATUS_DA_INDICACAO[i.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
