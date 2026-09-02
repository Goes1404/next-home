import { Suspense } from "react";
import Link from "next/link";
import { CopiarLink } from "./CopiarLink";
import { FilaAgora } from "./_componentes/FilaAgora";
import { TermometroFunil } from "./_componentes/TermometroFunil";
import {
  getCliquesWhatsappCorretor,
  getContagemPorEtapa,
  getCorretorLogado,
} from "@/lib/corretorSessao";
import { getFilaDeTrabalho } from "@/lib/crm/filaDeTrabalho";
import { getMinhasTarefas } from "@/lib/crm/dadosLead";
import { site } from "@/lib/site";
import { Esqueleto, EsqueletoCartao, AvisoDeCarregamento } from "./_componentes/Esqueleto";
import { CabecalhoDeTela } from "./_componentes/CabecalhoDeTela";

const ATALHOS = [
  { href: "/corretor/leads", titulo: "Meus leads", texto: "Contatos que chegaram por você." },
  { href: "/corretor/links", titulo: "Links por imóvel", texto: "Link atribuído de cada empreendimento." },
  { href: "/corretor/imoveis", titulo: "Catálogo", texto: "Fotos, textos e preços dos imóveis." },
];

/**
 * A tela inicial do painel — uma FILA, não um relatório (roadmap F3).
 *
 * Antes daqui o corretor abria o painel e via números: 3 pendências, 2
 * visitas, um termômetro. Bonito, e ainda assim ele precisava decidir o que
 * fazer com aquilo. Agora a primeira coisa da tela é a próxima ação, com o
 * botão do WhatsApp ao lado; os números continuam existindo, abaixo, para
 * quem quiser conferir a carteira.
 */
export default async function PainelInicio() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const primeiroNome = corretor.nome.split(" ")[0];

  return (
    <div className="space-y-8">
      {/*
        A frase de apoio não conta mais quantos itens esperam. Isso obrigava a
        página inteira a AGUARDAR a fila (cinco consultas) antes de pintar a
        primeira letra — e o número já aparece no cabeçalho da própria fila,
        um dedo abaixo. Dizer duas vezes custava a tela inteira parada.
      */}
      <CabecalhoDeTela
        titulo={`Olá, ${primeiroNome}`}
        descricao="O que precisa de você agora."
      />

      {/*
        Cada bloco busca o próprio dado atrás do seu `<Suspense>`, em vez de a
        página esperar tudo antes de pintar qualquer coisa. Antes eram três
        leituras em paralelo E DEPOIS, em série, a fila com mais cinco: a tela
        só existia quando a última respondesse. Agora o cabeçalho e a cor do
        módulo aparecem de imediato e cada seção chega quando fica pronta.
      */}
      <Suspense fallback={<EsqueletoCartao linhas={4} />}>
        <BlocoDaFila />
      </Suspense>

      <Suspense fallback={<EsqueletoCartao linhas={1} />}>
        <BlocoDoFunil />
      </Suspense>

      {/*
        O link e os cliques ficam lado a lado porque são a mesma história: o
        link é o que o corretor distribui, e o contador é a resposta de quem
        usou. Separados em cartões distantes, o número perdia a causa.
      */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
          <p className="text-fluid-sm text-titulo font-medium">Seu link pessoal</p>
          <p className="text-fluid-sm text-apoio mt-1">
            Enquanto um cliente navegar por ele, todo botão de WhatsApp do site — em qualquer
            imóvel — fala com você.
          </p>
          <CopiarLink link={`${site.url}/?corretor=${corretor.slug}`} />
        </div>

        <Suspense fallback={<CartaoDeCliques carregando />}>
          <BlocoDeCliques />
        </Suspense>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {ATALHOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="border-linha bg-superficie shadow-painel hover:border-acento-linha rounded-2xl border p-5 transition-colors"
          >
            <p className="font-display text-titulo">{a.titulo}</p>
            <p className="text-fluid-sm text-apoio mt-1">{a.texto}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

/**
 * A fila. É o bloco mais caro do Início (cinco consultas, mais as tarefas
 * antes delas) e o mais importante — por isso ele espera atrás do próprio
 * limite em vez de segurar a página.
 */
async function BlocoDaFila() {
  const tarefas = await getMinhasTarefas();
  const fila = await getFilaDeTrabalho(tarefas);
  return <FilaAgora itens={fila} />;
}

async function BlocoDoFunil() {
  const contagens = await getContagemPorEtapa();
  return <TermometroFunil contagens={contagens} />;
}

async function BlocoDeCliques() {
  const cliques = await getCliquesWhatsappCorretor();
  return <CartaoDeCliques cliques={cliques} />;
}

function CartaoDeCliques({
  cliques,
  carregando,
}: {
  cliques?: { hoje: number; total: number } | null;
  carregando?: boolean;
}) {
  return (
    <div className="border-linha bg-superficie shadow-painel flex flex-col justify-center rounded-2xl border p-5 sm:p-6">
      <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase">
        Cliques hoje
      </span>
      {carregando ? (
        <>
          <AvisoDeCarregamento>Contando os cliques do seu link…</AvisoDeCarregamento>
          <Esqueleto className="mt-2 h-9 w-16" />
          <Esqueleto className="mt-2 h-3 w-40" />
        </>
      ) : (
        <>
          {/* `null` = a contagem falhou. Mostrar "0" aqui faria o corretor
              achar que o link parou de converter. */}
          <p className="font-display text-titulo mt-1 text-4xl tabular-nums">
            {cliques ? cliques.hoje : "—"}
          </p>
          <p className="text-fluid-xs text-apoio mt-1">
            {cliques == null
              ? "Contagem indisponível — tente recarregar em instantes"
              : `${cliques.total} no total acumulado`}
          </p>
        </>
      )}
    </div>
  );
}
