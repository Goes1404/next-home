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

  // Contagens no banco, não a carteira: com ~100 leads por corretor (e a
  // equipe inteira para o gestor), o Início não tem por que baixar linhas.
  const [tarefas, contagens, cliques] = await Promise.all([
    getMinhasTarefas(),
    getContagemPorEtapa(),
    getCliquesWhatsappCorretor(),
  ]);

  const fila = await getFilaDeTrabalho(tarefas);
  const primeiroNome = corretor.nome.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-titulo text-fluid-2xl">Olá, {primeiroNome}</h1>
        <p className="text-fluid-sm text-apoio mt-1">
          {fila.length === 0
            ? "Nada pendente por aqui."
            : `${fila.length} ${fila.length === 1 ? "coisa esperando" : "coisas esperando"} por você.`}
        </p>
      </div>

      <FilaAgora itens={fila} />

      <TermometroFunil contagens={contagens} />

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

        <div className="border-linha bg-superficie shadow-painel flex flex-col justify-center rounded-2xl border p-5 sm:p-6">
          <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase">
            Cliques hoje
          </span>
          {/* `null` = a contagem falhou. Mostrar "0" aqui faria o corretor
              achar que o link parou de converter. */}
          <p className="font-display text-titulo mt-1 text-4xl tabular-nums">
            {cliques ? cliques.hoje : "—"}
          </p>
          <p className="text-fluid-xs text-apoio mt-1">
            {cliques === null
              ? "Contagem indisponível — tente recarregar em instantes"
              : `${cliques.total} no total acumulado`}
          </p>
        </div>
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
