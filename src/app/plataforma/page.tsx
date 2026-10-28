import type { Metadata } from "next";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import Link from "next/link";
import type { EstadoDaCobranca } from "@/lib/planos/cobranca";
import { listarGruposDaPlataforma, type ResumoDeGrupo } from "@/lib/plataforma/grupos";
import { FILTROS_DE_TIPO, hrefDoFiltro, lerFiltroDeTipo, separarPorTipo } from "@/lib/plataforma/listaPorTipo";
import { ROTULO_DO_PLANO } from "@/lib/plataforma/rotulosDoGrupo";
import { lerSaudeDosGrupos } from "@/lib/plataforma/saude";
import { CustoDaIa } from "./CustoDaIa";
import { SaudeNoCartao } from "./SaudeDoGrupo";
import { SeloDoTipo } from "./SeloDoTipo";
import { UsoDaIa } from "./UsoDaIa";

export const metadata: Metadata = { title: "Contas" };

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const SITUACAO: Record<ResumoDeGrupo["situacao"], { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-ok-lavado text-ok border-ok-linha" },
  suspenso: { rotulo: "Suspenso", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  encerrado: { rotulo: "Encerrado", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

/** A mensalidade na lista (fase 2C); o plano de custo não é cobrado e fica sem etiqueta. */
const COBRANCA: Partial<Record<EstadoDaCobranca, { rotulo: string; classe: string }>> = {
  em_dia: { rotulo: "Mensalidade em dia", classe: "bg-ok-lavado text-ok border-ok-linha" },
  pendente: { rotulo: "Mensalidade vencida", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  suspenso: { rotulo: "Suspenso por cobrança", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

/** Reais, sem centavos quando redondo (R$ 127, R$ 97,50). */
const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });

function Mensalidade({ g }: { g: ResumoDeGrupo }) {
  if (g.plano === "custo") return <>preço de custo</>;
  return <>{g.mensalidade === null ? "não definida" : REAL.format(g.mensalidade)}</>;
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-apoio text-fluid-xs">{rotulo}</dt>
      <dd className="text-titulo break-words">{children}</dd>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-apoio text-fluid-xs">{rotulo}</dt>
      <dd className="text-titulo text-fluid-xl font-display">{valor}</dd>
    </div>
  );
}

type Busca = Promise<{ tipo?: string | string[] }>;

/**
 * A lista de contas da plataforma, em duas seções: imobiliárias e corretores
 * independentes. Cadastro e números, nada de conversa nem ficha (desenho §11).
 * A guarda aqui, e não só no layout, porque layout não re-executa entre
 * rotas irmãs; e é dela que sai a prova que a leitura pede.
 *
 * O filtro é `?tipo=` (links, funciona sem JS).
 */
export default async function PlataformaPage({ searchParams }: { searchParams: Busca }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const filtro = lerFiltroDeTipo((await searchParams).tipo);
  const grupos = await listarGruposDaPlataforma(prova);
  const saudes = await lerSaudeDosGrupos(prova, grupos);
  const { imobiliarias, independentes } = separarPorTipo(grupos);

  const secoes = [
    {
      tipo: "imobiliaria" as const,
      id: "imobiliarias",
      titulo: "Imobiliárias",
      lista: imobiliarias,
      vazio: "Nenhuma imobiliária cadastrada ainda.",
    },
    {
      tipo: "independente" as const,
      id: "independentes",
      titulo: "Corretores independentes",
      lista: independentes,
      vazio: "Nenhum corretor independente cadastrado ainda.",
    },
  ].filter((secao) => filtro === "todos" || filtro === secao.tipo);

  const cartao = (g: ResumoDeGrupo) => {
    const situacao = SITUACAO[g.situacao];
    const cobranca = COBRANCA[g.cobranca.estado];
    const saude = saudes[g.id];
    const independente = g.tipo === "independente";
    return (
      <li key={g.id} className="cartao flex min-w-0 flex-col gap-4 p-5">
        <SeloDoTipo tipo={g.tipo} grupoId={g.id} />
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-titulo text-fluid-lg font-medium break-words">
              <Link href={`/plataforma/grupos/${g.id}`} className="hover:text-acento inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                {g.nome}
              </Link>
            </h3>
            <p className="text-fluid-xs text-apoio break-all">{g.slug}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${situacao.classe}`}>{situacao.rotulo}</span>
            {cobranca && (
              <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${cobranca.classe}`}>{cobranca.rotulo}</span>
            )}
          </div>
        </div>

        <div className="border-linha border-t pt-4">
          <SaudeNoCartao saude={saude} />
        </div>

        <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-2">
          {independente ? (
            <>
              <Dado rotulo="Corretor">{g.nome}</Dado>
              <Dado rotulo="CRECI">{g.creci ?? "não informado"}</Dado>
              <Dado rotulo="Plano">{ROTULO_DO_PLANO[g.plano]}</Dado>
              <Dado rotulo="Mensalidade">
                <Mensalidade g={g} />
              </Dado>
            </>
          ) : (
            <>
              <Dado rotulo="Corretores ativos">
                <span className="text-fluid-xl font-display">{g.corretoresAtivos}</span>
              </Dado>
              <Dado rotulo="Mensalidade">
                <Mensalidade g={g} />
              </Dado>
              <Dado rotulo="Plano">{ROTULO_DO_PLANO[g.plano]}</Dado>
            </>
          )}
          <Dado rotulo="Criado em">{DATA.format(new Date(g.criadoEm))}</Dado>
        </dl>

        <dl className="border-linha grid grid-cols-2 gap-2 border-t pt-4 text-center">
          {independente ? (
            <Numero rotulo="acesso" valor={g.comLogin > 0 ? "criado" : "pendente"} />
          ) : (
            <Numero rotulo="com login" valor={g.comLogin} />
          )}
          <Numero rotulo="números no ar" valor={g.numerosConectados} />
        </dl>

        <div className="border-linha border-t pt-4">
          <UsoDaIa uso={g.usoDaIa} ajustado={g.tetoAjustado !== null} />
        </div>

        <div className="border-linha border-t pt-4">
          <CustoDaIa custo={saude.custo} mensalidade={saude.mensalidade} cambio={saude.cambio} compacto />
        </div>
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-fluid-xs text-apoio tracking-[0.16em] uppercase">Plataforma</p>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Contas</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          {imobiliarias.length} {imobiliarias.length === 1 ? "imobiliária" : "imobiliárias"} e {independentes.length}{" "}
          {independentes.length === 1 ? "corretor independente" : "corretores independentes"}.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/plataforma/grupos/novo/imobiliaria"
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 items-center justify-center rounded-xl px-4 font-medium"
        >
          Nova imobiliária
        </Link>
        <Link
          href="/plataforma/grupos/novo/independente"
          className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center px-4 font-medium"
        >
          Novo corretor independente
        </Link>
        <Link
          href="/plataforma/acessos"
          className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center px-4 font-medium"
        >
          Buscar acesso e redefinir senha
        </Link>
      </div>

      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
        {FILTROS_DE_TIPO.map((f) => (
          <Link
            key={f.valor}
            href={hrefDoFiltro(f.valor)}
            aria-current={filtro === f.valor ? "page" : undefined}
            className={`text-fluid-sm flex min-h-11 items-center rounded-full border px-4 ${
              filtro === f.valor ? "border-acento bg-acento-lavado text-titulo font-bold" : "border-linha-forte text-corpo"
            }`}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>

      {secoes.map((secao) => (
        <section key={secao.id} aria-labelledby={`titulo-${secao.id}`} className="flex flex-col gap-4">
          <h2 id={`titulo-${secao.id}`} className="text-titulo text-fluid-xl font-display flex items-center gap-2">
            {secao.titulo}
            <span className="text-fluid-sm text-apoio font-sans">({secao.lista.length})</span>
          </h2>
          {secao.lista.length === 0 ? (
            <p className="cartao text-fluid-sm text-apoio p-5">{secao.vazio}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">{secao.lista.map(cartao)}</ul>
          )}
        </section>
      ))}
    </section>
  );
}
