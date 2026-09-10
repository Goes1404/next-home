import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Next Home trata os dados enviados pelo formulário de contato.",
  alternates: { canonical: "/privacidade" },
};

/**
 * A data de "última atualização" é escrita à mão, de propósito: a versão
 * anterior mostrava o mês CORRENTE (`new Date()`), então a política parecia
 * revisada todo mês sem ninguém a ter tocado — e uma data que mente sobre
 * revisão é pior que nenhuma. Ao mudar o texto, mudar a data junto.
 */
const ATUALIZADA_EM = "setembro de 2026";

const SECOES = [
  {
    titulo: "Quais dados coletamos",
    texto: (
      <>
        Quando você envia o formulário de contato ou fala com um corretor, coletamos apenas o
        que você mesmo informa: nome, e-mail e/ou telefone, mensagem e, quando aplicável, o
        empreendimento de interesse. Não usamos cookies de rastreamento próprios além do
        necessário para o funcionamento do site.
      </>
    ),
  },
  {
    titulo: "Para que usamos",
    texto: (
      <>
        Esses dados servem exclusivamente para que a {site.nomeCompleto} (CRECI {site.creci}) ou
        o corretor responsável pelo empreendimento entre em contato com você sobre o imóvel de
        interesse. Não vendemos nem compartilhamos seus dados com terceiros para fins de
        marketing.
      </>
    ),
  },
  {
    titulo: "Base legal e retenção",
    texto: (
      <>
        O tratamento se baseia no seu consentimento explícito, dado no momento do envio do
        formulário, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Os dados
        ficam armazenados enquanto forem necessários para o atendimento da sua solicitação, ou
        até você pedir a exclusão.
      </>
    ),
  },
  {
    titulo: "Seus direitos",
    texto: (
      <>
        Você pode pedir a qualquer momento a confirmação, correção, portabilidade ou exclusão
        dos seus dados, ou revogar o consentimento — basta entrar em contato pelo WhatsApp ou
        pela página de{" "}
        <Link href="/contato" className="text-acento-suave underline-offset-4 hover:underline">
          Contato
        </Link>
        .
      </>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <>
      <Pagina>
        <Secao espaco="abertura">
          <CabecalhoDePagina
            atual="Privacidade"
            rotulo={`Última atualização: ${ATUALIZADA_EM}`}
            titulo="Política de Privacidade"
            lead="O que guardamos quando você fala com a gente, por quê, e como pedir para apagar."
          />
        </Secao>

        <Secao espaco="final">
          {/* Leitura estreita no TEXTO, não na caixa: a seção tem a mesma
              largura das outras páginas; o parágrafo é que para em `2xl`. */}
          <div className="max-w-2xl space-y-8">
            {SECOES.map((s, i) => (
              <Reveal key={s.titulo} as="section" delay={i * 0.05}>
                <h2 className="font-display text-titulo text-lg">{s.titulo}</h2>
                <p className="text-fluid-base text-apoio mt-2 text-pretty">{s.texto}</p>
              </Reveal>
            ))}
          </div>
        </Secao>
      </Pagina>

      <WhatsappCta />
    </>
  );
}
