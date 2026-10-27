import Link from "next/link";
import { Building2, ChartColumn, Megaphone, MousePointerClick, Shuffle, type LucideIcon } from "lucide-react";

/**
 * As abas de Anúncios pagos (26/10/2026). A tela empilhava cinco blocos numa
 * rolagem só e ninguém achava os tópicos; cada um virou um destino com
 * endereço próprio (`?aba=`), que dá para mandar por link e que carrega só o
 * que precisa.
 *
 * As abas QUEBRAM linha em vez de rolar de lado (`naoRolaDeLado.test.ts`):
 * no celular são duas colunas de botões inteiros.
 */
export type Aba = "resumo" | "campanhas" | "roleta" | "clique" | "meta";

export type DefDaAba = { id: Aba; rotulo: string; titulo: string; descricao: string; icone: LucideIcon };

export const ABAS: DefDaAba[] = [
  {
    id: "resumo",
    rotulo: "Resumo",
    titulo: "Resumo",
    descricao: "Está valendo a pena? O que entrou, quanto custou e quantos viraram visita.",
    icone: ChartColumn,
  },
  {
    id: "campanhas",
    rotulo: "Campanhas",
    titulo: "Campanhas",
    descricao: "Cada campanha, o que ela trouxe e o que fazer com ela.",
    icone: Megaphone,
  },
  {
    id: "roleta",
    rotulo: "Roleta",
    titulo: "Roleta e distribuição",
    descricao: "Para quem vai cada lead novo, quem está na escala e onde o corretor recebe o aviso.",
    icone: Shuffle,
  },
  {
    id: "clique",
    rotulo: "Do clique à conversa",
    titulo: "Do clique à conversa",
    descricao: "Onde o cliente se perde entre clicar no anúncio e mandar a primeira mensagem.",
    icone: MousePointerClick,
  },
  {
    id: "meta",
    rotulo: "Conta da Meta",
    titulo: "Conta da Meta",
    descricao: "O investimento da imobiliária inteira, direto da conta de anúncios. Só o gestor vê.",
    icone: Building2,
  },
];

/** A aba pedida no endereço, se existir para quem está vendo; senão o Resumo. */
export function abaDoEndereco(pedida: string | undefined, gestor: boolean): Aba {
  const achada = ABAS.find((a) => a.id === pedida);
  if (!achada || (achada.id === "meta" && !gestor)) return "resumo";
  return achada.id;
}

export function AbasDosAnuncios({ atual, gestor }: { atual: Aba; gestor: boolean }) {
  const abas = ABAS.filter((a) => a.id !== "meta" || gestor);
  return (
    // A faixa prende no topo só do tablet para cima: no celular ela tem duas
    // ou três linhas, e presa comeria a tela.
    <div className="md:sticky md:top-[var(--painel-topo-visivel)] md:z-20">
      <nav aria-label="Seções de anúncios pagos" className="cartao grid grid-cols-2 gap-2 p-1.5 sm:flex sm:flex-wrap">
        {abas.map(({ id, rotulo, icone: Icone }) => (
          <Link
            key={id}
            href={`?aba=${id}`}
            scroll={false}
            aria-current={id === atual ? "page" : undefined}
            className="botao-aba text-fluid-sm odd:last:col-span-2"
          >
            <Icone aria-hidden className="size-5 shrink-0" />
            <span className="min-w-0 text-center">{rotulo}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function CabecalhoDaAba({ aba }: { aba: Aba }) {
  const def = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const Icone = def.icone;
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-acento-lavado text-acento">
        <Icone aria-hidden className="size-6" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-fluid-xl font-semibold text-titulo">{def.titulo}</h2>
        <p className="text-fluid-sm text-apoio text-pretty">{def.descricao}</p>
      </div>
    </div>
  );
}
