"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import type { IntegracaoDePortal } from "@/lib/portais/formatos";
import { desligarPortal, gerarUrlDoPortal } from "./acoes";
import estilos from "./portais.module.css";

export type IntegracaoNaTela = {
  portal: IntegracaoDePortal;
  url: string | null;
  ativo: boolean;
  ultimo: { quando: string; status: string; detalhe: string | null } | null;
  recebidos30d: number;
  criados30d: number;
  ignorados30d: number;
};

const TITULO: Record<IntegracaoDePortal, string> = {
  grupo_olx: "ZAP Imóveis, Viva Real e OLX (Canal Pro)",
  generico: "Outros portais e automações (formato do CRM)",
};

const STATUS: Record<string, string> = {
  criado: "virou lead novo",
  deduplicado: "juntou com uma ficha que já existia",
  repetido: "reenvio do portal, já recebido",
  ignorado: "ignorado",
  erro: "falhou ao gravar (o portal tenta de novo)",
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const EXEMPLO_GENERICO = `POST <URL acima>
Content-Type: application/json

{
  "nome": "Maria Silva",
  "telefone": "11 99999-9999",
  "email": "maria@exemplo.com",
  "mensagem": "Quero visitar no sábado",
  "codigo_imovel": "A123",
  "imovel": "Residencial Parque",
  "portal": "imovelweb",
  "id_externo": "lead-123"
}`;

function Passos({ portal }: { portal: IntegracaoDePortal }) {
  if (portal === "grupo_olx") {
    return (
      <ol className={estilos.passos}>
        <li>Clique em &quot;Gerar URL&quot; e depois em &quot;Copiar URL&quot;.</li>
        <li>
          Entre no <strong>Canal Pro</strong> (canalpro.grupozap.com) com o login da imobiliária.
        </li>
        <li>
          No menu lateral, abra <strong>Integrações de anúncios</strong> → aba <strong>Leads</strong> →{" "}
          <strong>Receber leads no CRM</strong> → <strong>Configurar</strong>.
        </li>
        <li>No nome do CRM, escreva &quot;Astro&quot;. No campo da URL, cole a URL copiada.</li>
        <li>
          Clique em <strong>Salvar alterações</strong>. Os próximos contatos do ZAP, do Viva Real e da OLX chegam aqui
          na hora; o &quot;último lead recebido&quot; abaixo confirma.
        </li>
        <li>
          O código do anúncio no portal (código do anunciante) casa com o campo <strong>código</strong> do imóvel no
          catálogo: preencha-o para o lead já chegar com o imóvel certo.
        </li>
      </ol>
    );
  }
  return (
    <>
      <ol className={estilos.passos}>
        <li>
          <strong>Imovelweb</strong>: não há envio direto de leads para CRM documentado. Continue com o encaminhamento do
          e-mail de leads, ou use uma automação (Zapier, Make) que leia o e-mail e chame a URL abaixo.
        </li>
        <li>
          <strong>Site próprio, landing page ou outro portal</strong>: chame a URL com um POST em JSON. Só o telefone é
          obrigatório; o mesmo telefone junta na ficha que já existe.
        </li>
      </ol>
      <pre className={estilos.exemplo}>{EXEMPLO_GENERICO}</pre>
    </>
  );
}

export function IntegracoesDosPortais({ integracoes }: { integracoes: IntegracaoNaTela[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<IntegracaoDePortal | null>(null);
  const [pendente, iniciar] = useTransition();

  const executar = (fn: () => Promise<{ ok?: string; erro?: string }>) =>
    iniciar(async () => {
      setMsg(null);
      try {
        const r = await fn();
        if (r.erro) setMsg({ tipo: "erro", texto: r.erro });
        else {
          setMsg({ tipo: "ok", texto: r.ok ?? "Feito." });
          router.refresh();
        }
      } catch (e) {
        setMsg({ tipo: "erro", texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo." });
      }
    });

  async function copiar(i: IntegracaoNaTela) {
    if (!i.url) return;
    try {
      await navigator.clipboard.writeText(i.url);
      setCopiado(i.portal);
    } catch {
      setMsg({ tipo: "erro", texto: "Não consegui copiar — selecione a URL e copie à mão." });
    }
  }

  return (
    <div className={estilos.lista}>
      {msg && (
        <p role="status" className={msg.tipo === "erro" ? estilos.erro : estilos.ok}>
          {msg.texto}
        </p>
      )}
      {integracoes.map((i) => (
        <section key={i.portal} className={`cartao ${estilos.cartao}`}>
          <div className={estilos.topo}>
            <h2 className={estilos.titulo}>{TITULO[i.portal]}</h2>
            <span className={i.url && i.ativo ? estilos.seloLigado : estilos.seloDesligado}>
              {i.url && i.ativo ? "Ligada" : "Desligada"}
            </span>
          </div>

          {i.url && i.ativo ? (
            <>
              <p className={estilos.rotulo}>URL para colar no portal (guarde como senha)</p>
              <code className={estilos.url}>{i.url}</code>
              <div className={estilos.acoes}>
                <button type="button" className={estilos.botaoPrimario} onClick={() => copiar(i)}>
                  {copiado === i.portal ? "Copiada" : "Copiar URL"}
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  className={estilos.botao}
                  onClick={() => {
                    if (confirm("Gerar uma URL nova? A atual para de funcionar na hora e precisa ser trocada no portal.")) {
                      setCopiado(null);
                      executar(() => gerarUrlDoPortal(i.portal));
                    }
                  }}
                >
                  Gerar URL nova
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  className={estilos.botaoDiscreto}
                  onClick={() => executar(() => desligarPortal(i.portal))}
                >
                  Desligar
                </button>
              </div>
              <p className={estilos.apoio}>
                {i.ultimo
                  ? `Último lead recebido: ${dataHora.format(new Date(i.ultimo.quando))} — ${STATUS[i.ultimo.status] ?? i.ultimo.status}${
                      i.ultimo.status === "ignorado" && i.ultimo.detalhe ? ` (${i.ultimo.detalhe})` : ""
                    }.`
                  : "Nenhum lead recebido ainda por esta URL."}{" "}
                {i.recebidos30d > 0 &&
                  `Últimos 30 dias: ${i.recebidos30d} recebidos, ${i.criados30d} leads novos${
                    i.ignorados30d > 0 ? `, ${i.ignorados30d} ignorados ou com falha` : ""
                  }.`}
              </p>
            </>
          ) : (
            <div className={estilos.acoes}>
              <button
                type="button"
                disabled={pendente}
                className={estilos.botaoPrimario}
                onClick={() => executar(() => gerarUrlDoPortal(i.portal))}
              >
                Gerar URL
              </button>
            </div>
          )}

          <details className={estilos.detalhes}>
            <summary>Passo a passo</summary>
            <Passos portal={i.portal} />
          </details>
        </section>
      ))}
    </div>
  );
}
