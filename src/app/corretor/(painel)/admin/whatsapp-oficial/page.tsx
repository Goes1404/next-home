import type { Metadata } from "next";
import { headers } from "next/headers";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { createServiceClient } from "@/lib/supabase/service";
import { pendenciasDaConfiguracao, tokenDoPiloto, versaoGraph } from "@/lib/whatsapp/oficial/configuracao";
import { portaoDoPiloto } from "@/lib/whatsapp/oficial/metricas";
import { medirListasOficiais } from "@/lib/whatsapp/oficial/metricasServidor";
import { fotosDoCatalogo, modelosDoNumero } from "@/lib/whatsapp/oficial/telaDoGestor";
import { limiteDiario, numeroDoGrupo } from "@/lib/whatsapp/oficial/numeros";
import { emReais, TARIFAS_CONFERIDAS_EM, tarifaEmReais } from "@/lib/whatsapp/oficial/tarifas";
import { ConectarPelaMeta } from "./ConectarPelaMeta";
import { EditorDeModelos } from "./EditorDeModelos";
import { AcoesDoNumero, CadastroManual, ConfiguracaoDoNumero } from "./PainelDoNumero";

export const metadata: Metadata = { title: "WhatsApp oficial" };

/**
 * O número OFICIAL da imobiliária (0254): conectar, decidir, criar modelos e
 * medir o piloto. Só o gestor.
 *
 * O gestor não lê conversa (0134): esta tela mostra estado, dinheiro e
 * contagem. A conversa oficial aparece só na ficha do lead, para o dono.
 */

const ROTULO_QUALIDADE: Record<string, string> = {
  GREEN: "Alta",
  YELLOW: "Média (atenção)",
  RED: "Baixa (risco de limite)",
  UNKNOWN: "Ainda sem avaliação",
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function WhatsappOficialPage() {
  const gestor = await exigirGestorNaPagina();
  const supabase = createServiceClient();
  const numero = await numeroDoGrupo(supabase, gestor.grupoId);

  // Leituras com tipo escrito à mão (`telaDoGestor.ts`): a inferência do
  // Supabase aqui levava o `tsc` do projeto além dos 2 GB.
  const modelos = numero ? await modelosDoNumero(supabase, gestor.grupoId, numero.id) : [];
  const fotos = await fotosDoCatalogo(supabase, gestor.grupoId);
  const medicao = await medirListasOficiais(supabase, gestor.grupoId);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "seu-dominio";
  const urlDoWebhook = `https://${host}/api/webhooks/whatsapp-oficial`;
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() ?? "";
  const configId = process.env.NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID?.trim() ?? "";
  const pendencias = pendenciasDaConfiguracao();
  const ehPiloto = gestor.grupoId === GRUPO_NEXT_HOME_ID;

  const totais = medicao.listas.reduce(
    (t, l) => ({
      enviadas: t.enviadas + l.resumo.enviadas,
      respondidas: t.respondidas + l.resumo.respondidas,
      custo: t.custo + l.resumo.custo,
      visitas: t.visitas + l.resumo.visitas,
      pararam: t.pararam + l.resumo.pararam,
    }),
    { enviadas: 0, respondidas: 0, custo: 0, visitas: 0, pararam: 0 },
  );
  const taxaOficial = totais.enviadas > 0 ? totais.respondidas / totais.enviadas : null;
  const portao = portaoDoPiloto({
    qualidade: numero?.qualidade ?? null,
    modelosPausados: modelos.filter((m) => m.estado === "pausado" || m.estado === "desativado").length,
    taxaOficial,
    taxaEvolution: medicao.taxaEvolution,
  });

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        secao="Administração"
        titulo="WhatsApp oficial"
        descricao="O número da imobiliária na API oficial da Meta: listas seguras para quem nunca falou com o corretor."
      />

      {/* ------------------------------------------------ o número */}
      <section className="cartao space-y-4 p-5 sm:p-6" aria-labelledby="numero-titulo">
        <h2 id="numero-titulo" className="font-display text-titulo text-lg">
          O número
        </h2>
        {!numero ? (
          <div className="space-y-4">
            <p className="text-fluid-sm text-corpo">
              A imobiliária ainda não tem número oficial. Ele é um número SÓ para listas (um chip novo, que não esteja em
              nenhum WhatsApp), aprovado pela Meta. O passo a passo está no guia de ativação.
            </p>
            {appId && configId ? (
              <ConectarPelaMeta appId={appId} configId={configId} versao={versaoGraph()} />
            ) : (
              !ehPiloto && (
                <p className="text-fluid-xs text-apoio">
                  A conexão pela Meta ainda não está liberada nesta plataforma. Fale com o suporte da Astro.
                </p>
              )
            )}
            {ehPiloto && (
              <div className="space-y-2">
                <p className="text-fluid-xs text-apoio">
                  Piloto: cadastro pelos ids do WhatsApp Manager, com o token do ambiente
                  {tokenDoPiloto() ? "." : " (que ainda falta: WHATSAPP_OFICIAL_TOKEN)."}
                </p>
                <CadastroManual />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="text-fluid-sm grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-apoio text-fluid-xs">Número</dt>
                <dd className="text-titulo">
                  {numero.numero ?? "—"} {numero.nome_exibicao ? `· ${numero.nome_exibicao}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-apoio text-fluid-xs">Estado</dt>
                <dd className={numero.estado === "ativo" ? "text-ok" : "text-perigo"}>
                  {numero.estado === "ativo" ? "Ativo" : `Pausado: ${numero.motivo_estado ?? "sem motivo"}`}
                </dd>
              </div>
              <div>
                <dt className="text-apoio text-fluid-xs">Qualidade na Meta</dt>
                <dd className="text-titulo">{ROTULO_QUALIDADE[numero.qualidade ?? "UNKNOWN"] ?? numero.qualidade}</dd>
              </div>
              <div>
                <dt className="text-apoio text-fluid-xs">Limite de pessoas novas por 24 h</dt>
                <dd className="text-titulo">
                  {Number.isFinite(limiteDiario(numero.limite_de_envio))
                    ? limiteDiario(numero.limite_de_envio).toLocaleString("pt-BR")
                    : "Ilimitado"}{" "}
                  <span className="text-apoio text-fluid-xs">({numero.limite_de_envio ?? "não informado"})</span>
                </dd>
              </div>
            </dl>
            <AcoesDoNumero pausado={numero.estado === "pausado"} />
          </div>
        )}
      </section>

      {numero && (
        <>
          {/* ------------------------------------------ decisões */}
          <section className="cartao space-y-4 p-5 sm:p-6" aria-labelledby="decisoes-titulo">
            <h2 id="decisoes-titulo" className="font-display text-titulo text-lg">
              Decisões
            </h2>
            <ConfiguracaoDoNumero
              inicial={{
                liberado: numero.liberado_para_corretores,
                teto: numero.teto_mensal,
                resposta: numero.resposta,
                mensagemFixa: numero.mensagem_fixa,
              }}
            />
          </section>

          {/* ------------------------------------------ modelos */}
          <section className="cartao space-y-4 p-5 sm:p-6" aria-labelledby="modelos-titulo">
            <div>
              <h2 id="modelos-titulo" className="font-display text-titulo text-lg">
                Modelos
              </h2>
              <p className="text-fluid-xs text-apoio mt-1">
                Pelo número oficial só sai mensagem com modelo aprovado pela Meta. Poucos modelos bons, com foto real e o
                botão de parar visível, seguram a qualidade do número.
              </p>
            </div>
            <EditorDeModelos modelos={modelos} fotos={fotos} />
          </section>
        </>
      )}

      {/* ------------------------------------------------ medição do piloto */}
      <section className="cartao space-y-4 p-5 sm:p-6" aria-labelledby="medicao-titulo">
        <div>
          <h2 id="medicao-titulo" className="font-display text-titulo text-lg">
            Medição do piloto
          </h2>
          <p className="text-fluid-xs text-apoio mt-1">
            Custo pela tarifa conferida em {TARIFAS_CONFERIDAS_EM} ({emReais(tarifaEmReais("marketing"))} por mensagem de
            marketing entregue); o valor real é o da fatura da Meta.
          </p>
        </div>
        {medicao.listas.length === 0 ? (
          <p className="text-fluid-sm text-apoio">Nenhuma lista oficial enviada ainda.</p>
        ) : (
          <>
            <dl className="text-fluid-sm grid gap-3 sm:grid-cols-4">
              {[
                ["Enviadas", totais.enviadas.toLocaleString("pt-BR")],
                ["Responderam", `${totais.respondidas} (${pct(taxaOficial)})`],
                ["Listas do WhatsApp dos corretores", `${pct(medicao.taxaEvolution)} de resposta`],
                ["Custo", emReais(totais.custo)],
                ["Custo por resposta", totais.respondidas ? emReais(totais.custo / totais.respondidas) : "—"],
                ["Visitas marcadas", String(totais.visitas)],
                ["Custo por visita", totais.visitas ? emReais(totais.custo / totais.visitas) : "—"],
                ["Pediram para parar", String(totais.pararam)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="border-linha rounded-xl border p-3">
                  <dt className="text-fluid-xs text-apoio">{rotulo}</dt>
                  <dd className="text-titulo mt-0.5 font-semibold tabular-nums">{valor}</dd>
                </div>
              ))}
            </dl>
            <p className={`text-fluid-sm ${portao.passou ? "text-ok" : "text-apoio"}`}>
              {portao.passou
                ? "Portão da expansão: qualidade alta e nenhum modelo pausado. Compare o custo por visita com o que a imobiliária aceita pagar."
                : `Antes de expandir: ${portao.motivos.join("; ")}.`}
            </p>
            <div className="overflow-x-auto">
              <table className="text-fluid-xs w-full min-w-[640px]">
                <thead className="text-apoio text-left">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Lista</th>
                    <th className="py-2 pr-3 font-medium">Enviadas</th>
                    <th className="py-2 pr-3 font-medium">Entregues</th>
                    <th className="py-2 pr-3 font-medium">Lidas</th>
                    <th className="py-2 pr-3 font-medium">Responderam</th>
                    <th className="py-2 pr-3 font-medium">Pararam</th>
                    <th className="py-2 pr-3 font-medium">Custo</th>
                    <th className="py-2 font-medium">Falhas</th>
                  </tr>
                </thead>
                <tbody>
                  {medicao.listas.map((l) => (
                    <tr key={l.id} className="border-linha border-t align-top">
                      <td className="text-titulo py-2 pr-3">
                        {l.titulo}
                        <span className="text-apoio block">
                          {l.corretor ?? "—"} · {new Date(l.criadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{l.resumo.enviadas}</td>
                      <td className="py-2 pr-3 tabular-nums">{l.resumo.entregues}</td>
                      <td className="py-2 pr-3 tabular-nums">{l.resumo.lidas}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {l.resumo.respondidas} ({pct(l.resumo.taxaDeResposta)})
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{l.resumo.pararam}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {emReais(l.resumo.custo)}
                        {l.resumo.custoEstimado ? "*" : ""}
                      </td>
                      <td className="text-apoio py-2">
                        {l.resumo.falhas.length === 0 ? "—" : l.resumo.falhas.map((f) => `${f.total}× ${f.motivo}`).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-fluid-xs text-tenue mt-2">* inclui mensagem ainda sem a confirmação de cobrança da Meta.</p>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------ configuração técnica */}
      <section className="cartao space-y-3 p-5 sm:p-6" aria-labelledby="tecnico-titulo">
        <h2 id="tecnico-titulo" className="font-display text-titulo text-lg">
          Configuração na Meta
        </h2>
        <p className="text-fluid-sm text-corpo">
          No app da Meta (WhatsApp → Configuração), use esta URL de webhook e o token de verificação do ambiente:
        </p>
        <p className="bg-vidro text-fluid-sm text-titulo break-all rounded-xl px-3 py-2 font-mono">{urlDoWebhook}</p>
        <p className="text-fluid-xs text-apoio">
          Campos para assinar: messages, message_template_status_update, message_template_quality_update,
          phone_number_quality_update, account_update e user_preferences.
        </p>
        {pendencias.length > 0 && (
          <p className="text-fluid-xs text-perigo">Falta no ambiente: {pendencias.join("; ")}.</p>
        )}
      </section>
    </div>
  );
}
