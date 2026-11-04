"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Smartphone } from "lucide-react";
import type { FiltroLeadsCampanha, RecorteDeOrigem } from "@/lib/crm/publicoDaCampanha";
import { formatarTelefoneBr } from "@/lib/inbound/phoneUtils";
import type { ModeloParaLista } from "@/lib/whatsapp/oficial/canalDaLista";
import { renderizarModelo, type ValoresDoEnvio } from "@/lib/whatsapp/oficial/modelos";
import { preverListaOficial } from "../acoes";

/**
 * As peças do assistente da lista que só existem quando a imobiliária tem
 * número OFICIAL (0255): a escolha do canal, o modelo aprovado no lugar do
 * texto livre e o resumo com consentimento e custo.
 */

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EscolhaDoCanal({
  valor,
  aoMudar,
  numero,
}: {
  valor: "evolution" | "oficial";
  aoMudar: (v: "evolution" | "oficial") => void;
  numero: string | null;
}) {
  const opcoes = [
    {
      valor: "evolution" as const,
      titulo: "Pelo meu WhatsApp",
      descricao: "Do seu número, com as proteções de sempre. Para quem já conversa com você.",
      icone: Smartphone,
    },
    {
      valor: "oficial" as const,
      titulo: "Pelo número oficial da imobiliária",
      descricao: `${numero ? `${formatarTelefoneBr(numero)} · ` : ""}Modelo aprovado pela Meta, só para quem autorizou. Seguro para quem nunca falou com você; cada mensagem é cobrada.`,
      icone: BadgeCheck,
    },
  ];
  return (
    <fieldset className="border-linha rounded-2xl border p-3 sm:p-4">
      <legend className="text-fluid-xs text-apoio px-1">Por onde a lista sai?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => aoMudar(o.valor)}
            aria-pressed={valor === o.valor}
            className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
              valor === o.valor ? "border-acento-linha bg-acento-lavado" : "border-linha hover:border-linha-forte"
            }`}
          >
            <o.icone aria-hidden className="text-acento-suave mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="text-fluid-sm text-titulo block font-medium">{o.titulo}</span>
              <span className="text-fluid-xs text-apoio mt-0.5 block leading-snug">{o.descricao}</span>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PassoDoModeloOficial({
  modelos,
  escolhido,
  aoEscolher,
  valores,
  souGestor,
}: {
  modelos: ModeloParaLista[];
  escolhido: string | null;
  aoEscolher: (id: string) => void;
  /** Os mesmos valores do disparo, com "Carla" no lugar do nome do cliente. */
  valores: ValoresDoEnvio;
  souGestor: boolean;
}) {
  if (modelos.length === 0) {
    return (
      <div className="border-alerta-linha bg-alerta-lavado text-fluid-sm mt-4 rounded-xl border p-4">
        <p className="text-titulo font-medium">Ainda não há modelo aprovado pela Meta.</p>
        <p className="text-corpo mt-1">
          Pelo número oficial só sai mensagem com modelo aprovado.{" "}
          {souGestor ? (
            <a href="/corretor/admin/whatsapp-oficial" className="text-titulo font-semibold underline underline-offset-2">
              Criar um modelo
            </a>
          ) : (
            "Peça ao gestor para criar um em Administração → WhatsApp oficial."
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <p className="text-fluid-xs text-apoio">
        O texto é o do modelo aprovado: só o nome e o imóvel mudam de pessoa para pessoa. Não dá para editar aqui.
      </p>
      {modelos.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => aoEscolher(m.id)}
          aria-pressed={escolhido === m.id}
          className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
            escolhido === m.id ? "border-acento-linha bg-acento-lavado" : "border-linha hover:border-linha-forte"
          }`}
        >
          <p className="text-fluid-xs text-tenue font-mono">{m.nome}</p>
          {m.cabecalho === "imagem" && <p className="text-fluid-xs text-apoio mt-1">📷 Com a foto do imóvel no topo</p>}
          {m.cabecalho === "texto" && m.cabecalhoTexto && <p className="text-fluid-sm text-titulo mt-1 font-semibold">{m.cabecalhoTexto}</p>}
          <p className="text-fluid-sm text-corpo mt-1 whitespace-pre-line break-words">
            {renderizarModelo(m.corpo, valores)}
          </p>
          {m.rodape && <p className="text-fluid-xs text-tenue mt-1">{m.rodape}</p>}
          {m.botoes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.botoes.map((b) => (
                <span key={b.texto} className="border-linha text-fluid-xs text-acento-suave rounded-full border px-2.5 py-1">
                  {b.texto}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

export function ResumoOficial({
  filtro,
  imovelSlug,
  recorte,
  leadIds,
  tarifa,
  tetoRestante,
}: {
  filtro: FiltroLeadsCampanha;
  imovelSlug: string | null;
  recorte: RecorteDeOrigem | null;
  leadIds?: string[];
  tarifa: number;
  tetoRestante: number | null;
}) {
  type Previa = ({ total: number; comConsentimento: number } | { erro: string }) & { chave: string };
  const [guardada, setGuardada] = useState<Previa | null>(null);
  const chave = `${filtro}|${imovelSlug}|${recorte?.canal}|${recorte?.anuncio}|${leadIds?.join(",")}`;

  useEffect(() => {
    let vivo = true;
    preverListaOficial(filtro, imovelSlug, recorte, leadIds)
      .then((r) => {
        if (vivo) setGuardada({ ...r, chave });
      })
      .catch(() => {
        if (vivo) setGuardada({ erro: "Não foi possível conferir agora.", chave });
      });
    return () => {
      vivo = false;
    };
    // `chave` resume os quatro parâmetros (objetos novos a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  // Prévia de outro público é "carregando": sem setState no efeito.
  const previa = guardada?.chave === chave ? guardada : null;
  if (!previa) return <p className="text-fluid-xs text-apoio">Conferindo quem autorizou…</p>;
  if ("erro" in previa) return <p className="text-fluid-xs text-perigo">{previa.erro}</p>;

  const fora = previa.total - previa.comConsentimento;
  const passaDoTeto = tetoRestante !== null && previa.comConsentimento > tetoRestante;
  return (
    <div className="border-linha bg-elevado space-y-1.5 rounded-2xl border p-4">
      <p className="text-fluid-sm text-titulo font-semibold">
        {previa.comConsentimento} pessoa{previa.comConsentimento === 1 ? "" : "s"} recebe
        {previa.comConsentimento === 1 ? "" : "m"} pelo número oficial
      </p>
      {fora > 0 && (
        <p className="text-fluid-xs text-apoio">
          {fora === 1
            ? "1 pessoa do público não autorizou receber ofertas pelo WhatsApp e fica de fora."
            : `${fora.toLocaleString("pt-BR")} pessoas do público não autorizaram receber ofertas pelo WhatsApp e ficam de fora.`}{" "}
          O consentimento se registra na ficha do lead.
        </p>
      )}
      <p className="text-fluid-xs text-apoio">
        Custo estimado na Meta: <strong className="text-titulo">{reais(previa.comConsentimento * tarifa)}</strong> (
        {reais(tarifa)} por mensagem entregue, pago pela imobiliária).
      </p>
      {tetoRestante !== null && (
        <p className={`text-fluid-xs ${passaDoTeto ? "text-perigo" : "text-apoio"}`}>
          Teto do mês: cabem mais {tetoRestante.toLocaleString("pt-BR")} mensage{tetoRestante === 1 ? "m" : "ns"}.
          {passaDoTeto ? " Esta lista passa do teto: recorte o público ou fale com o gestor." : ""}
        </p>
      )}
    </div>
  );
}
