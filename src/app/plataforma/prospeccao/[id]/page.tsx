import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { exigirEquipeDaProspeccaoNaPagina } from "@/lib/prospeccao/equipe";
import { createServiceClient } from "@/lib/supabase/service";
import { ROTULO_DO_MODELO, ehModelo } from "@/lib/prospeccao/tipos";
import { followupDevido, proximaAcao } from "@/lib/prospeccao/funil";
import { linkDaAmostra, linkDoWhatsapp, mensagemComAmostra, mensagemCurta, mensagemDeFollowup, temLinkDaAmostra, vendedorDaProspeccao } from "@/lib/prospeccao/abordagem";
import { EnviarNoWhatsapp, FichaDaLoja, MudarEtapa } from "../Componentes";

export const metadata: Metadata = { title: "Loja prospectada" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function duracao(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  return `${min} min ${segundos % 60} s`;
}

/**
 * A ficha de uma loja prospectada (0253, 02/11/2026): raio-X, amostra,
 * mensagem, etapa e cada abertura da amostra. Só o administrador da
 * plataforma; a chave de serviço só depois da guarda, e só nas tabelas
 * globais `prospeccao_*`.
 */
export default async function FichaDaLojaPage({ params }: { params: Promise<{ id: string }> }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  await exigirEquipeDaProspeccaoNaPagina(prova);
  const { id } = await params;
  if (!ID.test(id)) notFound();

  const supabase = createServiceClient();
  const [{ data: l }, { data: visitas }] = await Promise.all([
    supabase.from("prospeccao_leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("prospeccao_visitas").select("id, created_at, dispositivo, segundos").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (!l) notFound();

  const amostra = linkDaAmostra(l.slug);
  const mensagem = l.mensagem ?? mensagemCurta({ nome: l.nome, gancho: l.gancho, vendedor: vendedorDaProspeccao() });
  // 0256: na hora do follow-up, o botão manda o follow-up e o registra.
  const followup = followupDevido(l);
  const curta = !temLinkDaAmostra(mensagem);
  const link = l.whatsapp ? linkDoWhatsapp(l.whatsapp, followup ? mensagemDeFollowup({ link: amostra, abordagemTinhaLink: !curta }) : mensagem) : null;
  const linkDaAmostraNoZap =
    curta && (l.etapa === "enviado" || l.etapa === "respondeu") && l.whatsapp && !l.nao_contatar
      ? linkDoWhatsapp(l.whatsapp, mensagemComAmostra({ link: amostra }))
      : null;
  const lacunas = Array.isArray(l.lacunas) ? l.lacunas.filter((x): x is string => typeof x === "string") : [];
  const tempoTotal = (visitas ?? []).reduce((soma, v) => soma + v.segundos, 0);

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/plataforma/prospeccao" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Prospecção
        </Link>
        <h1 className="font-display text-fluid-2xl text-titulo font-semibold">{l.nome}</h1>
        <p className="text-fluid-sm text-apoio mt-1">
          {[l.segmento, ehModelo(l.modelo) ? ROTULO_DO_MODELO[l.modelo] : null, [l.cidade, l.bairro].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-fluid-sm text-corpo mt-2">{proximaAcao(l)}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="cartao flex flex-col gap-3 p-4">
          <h2 className="text-titulo text-fluid-lg font-display">Amostra</h2>
          <p className="text-fluid-sm text-corpo break-all">{amostra}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/astro/amostra/${l.slug}?previa=1`}
              target="_blank"
              rel="noopener"
              className="botao-secundario text-fluid-sm text-titulo inline-flex min-h-11 items-center rounded-full px-4 font-medium"
            >
              Ver amostra
            </a>
            <EnviarNoWhatsapp
              id={l.id}
              link={link}
              bloqueado={l.nao_contatar ? "Pediu para não receber mensagens" : l.whatsapp ? null : "Cadastre o WhatsApp para enviar"}
              tipo={followup ? "followup" : "abordagem"}
              rotulo={followup ? "Enviar follow-up" : "Enviar no WhatsApp"}
            />
            {linkDaAmostraNoZap && (
              <EnviarNoWhatsapp id={l.id} link={linkDaAmostraNoZap} bloqueado={null} tipo="amostra" rotulo="Respondeu? Mandar a amostra" />
            )}
          </div>
          <p className="text-fluid-xs text-apoio">A prévia do painel não conta como abertura.</p>
        </div>
        <div className="cartao flex flex-col gap-3 p-4">
          <MudarEtapa id={l.id} etapa={l.etapa} />
          {l.motivo_perda && <p className="text-fluid-xs text-apoio">Motivo da perda: {l.motivo_perda}</p>}
        </div>
      </div>

      <div className="cartao flex flex-col gap-3 p-4">
        <h2 className="text-titulo text-fluid-lg font-display">Quem abriu a amostra</h2>
        {!visitas?.length ? (
          <p className="text-fluid-sm text-apoio">Ainda não abriu.</p>
        ) : (
          <>
            <p className="text-fluid-sm text-corpo">
              {l.visitas} {l.visitas === 1 ? "abertura" : "aberturas"}, {duracao(tempoTotal)} de leitura no total.
            </p>
            <ul className="flex flex-col gap-1">
              {visitas.map((v) => (
                <li key={v.id} className="text-fluid-sm text-corpo border-linha flex justify-between gap-3 border-b py-2 last:border-0">
                  <span>{DATA_E_HORA.format(new Date(v.created_at))}</span>
                  <span className="text-apoio">
                    {v.dispositivo ?? "dispositivo desconhecido"} · {duracao(v.segundos)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {(lacunas.length > 0 || l.nota_presenca !== null) && (
        <div className="cartao flex flex-col gap-3 p-4">
          <h2 className="text-titulo text-fluid-lg font-display">Raio-X{l.nota_presenca !== null ? `: ${l.nota_presenca}/100` : ""}</h2>
          <ul className="text-fluid-sm text-corpo list-disc pl-5">
            {lacunas.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="text-fluid-xs text-apoio">
            {[
              l.nota_google !== null ? `Google: ${l.nota_google} (${l.avaliacoes ?? 0} avaliações)` : null,
              l.telefone ? `Telefone: ${l.telefone}` : null,
              l.site ? `Site: ${l.site}` : null,
              l.endereco,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="cartao flex flex-col gap-3 p-4">
        <h2 className="text-titulo text-fluid-lg font-display">Ficha e mensagem</h2>
        <FichaDaLoja
          id={l.id}
          inicial={{
            whatsapp: l.whatsapp ?? "",
            instagram: l.instagram ?? "",
            gancho: l.gancho ?? "",
            mensagem,
            observacoes: l.observacoes ?? "",
            naoContatar: l.nao_contatar,
          }}
        />
      </div>
    </section>
  );
}
