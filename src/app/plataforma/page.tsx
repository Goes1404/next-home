import type { Metadata } from "next";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { listarGruposDaPlataforma, type ResumoDeGrupo } from "@/lib/plataforma/grupos";

export const metadata: Metadata = { title: "Grupos" };

const TIPO: Record<ResumoDeGrupo["tipo"], string> = {
  imobiliaria: "Imobiliária",
  independente: "Corretor independente",
};

const PLANO: Record<ResumoDeGrupo["plano"], string> = {
  essencial: "Essencial",
  profissional: "Profissional",
  imobiliaria: "Imobiliária",
  custo: "Preço de custo",
};

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const SITUACAO: Record<ResumoDeGrupo["situacao"], { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-ok-lavado text-ok border-ok-linha" },
  suspenso: { rotulo: "Suspenso", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  encerrado: { rotulo: "Encerrado", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

/**
 * A lista de grupos da plataforma: cadastro e números, nada de conversa nem
 * ficha (desenho §11). A guarda aqui, e não só no layout, porque layout não
 * re-executa entre rotas irmãs; e é dela que sai a prova que a leitura pede.
 */
export default async function PlataformaPage() {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const grupos = await listarGruposDaPlataforma(prova);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-fluid-xs text-apoio tracking-[0.16em] uppercase">Plataforma</p>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Grupos</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          {grupos.length === 1 ? "1 grupo cadastrado." : `${grupos.length} grupos cadastrados.`}
        </p>
      </div>

      {grupos.length === 0 ? (
        <p className="cartao text-fluid-sm text-apoio p-5">Nenhum grupo cadastrado ainda.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {grupos.map((g) => {
            const situacao = SITUACAO[g.situacao];
            return (
              <li key={g.id} className="cartao flex min-w-0 flex-col gap-4 p-5">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-titulo text-fluid-lg font-medium break-words">{g.nome}</h2>
                    <p className="text-fluid-xs text-apoio break-all">{g.slug}</p>
                  </div>
                  <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${situacao.classe}`}>
                    {situacao.rotulo}
                  </span>
                </div>

                <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-apoio text-fluid-xs">Tipo</dt>
                    <dd className="text-titulo">{TIPO[g.tipo]}</dd>
                  </div>
                  <div>
                    <dt className="text-apoio text-fluid-xs">Plano</dt>
                    <dd className="text-titulo">{PLANO[g.plano]}</dd>
                  </div>
                  <div>
                    <dt className="text-apoio text-fluid-xs">Criado em</dt>
                    <dd className="text-titulo">{DATA.format(new Date(g.criadoEm))}</dd>
                  </div>
                </dl>

                <dl className="border-linha grid grid-cols-3 gap-2 border-t pt-4 text-center">
                  <div className="flex flex-col-reverse">
                    <dt className="text-apoio text-fluid-xs">corretores ativos</dt>
                    <dd className="text-titulo text-fluid-xl font-display">{g.corretoresAtivos}</dd>
                  </div>
                  <div className="flex flex-col-reverse">
                    <dt className="text-apoio text-fluid-xs">com login</dt>
                    <dd className="text-titulo text-fluid-xl font-display">{g.comLogin}</dd>
                  </div>
                  <div className="flex flex-col-reverse">
                    <dt className="text-apoio text-fluid-xs">números no ar</dt>
                    <dd className="text-titulo text-fluid-xl font-display">{g.numerosConectados}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
