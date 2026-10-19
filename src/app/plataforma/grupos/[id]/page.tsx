import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { lerGrupoDaPlataforma } from "@/lib/plataforma/grupos";
import { ROTULO_DO_PLANO, ROTULO_DO_TIPO } from "@/lib/plataforma/rotulosDoGrupo";
import { FormularioDadosDoGrupo } from "./FormularioDadosDoGrupo";

export const metadata: Metadata = { title: "Grupo" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

/**
 * Um grupo na plataforma: o cadastro, os números e os dados que o operador
 * edita (contato de cobrança e institucionais). Nada de conversa, ficha,
 * lead nem nome de cliente (§4, §11) — só contagens de corretor e de número.
 * Uuid fora do formato não chega ao banco: vira 404 direto.
 */
export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const grupo = await lerGrupoDaPlataforma(prova, id);
  if (!grupo) notFound();

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Grupos
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1 break-words">{grupo.nome}</h1>
        <p className="text-fluid-sm text-apoio mt-1 break-all">{grupo.slug}</p>
      </div>

      <dl className="cartao text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-3 p-5 sm:grid-cols-3">
        <div>
          <dt className="text-apoio text-fluid-xs">Tipo</dt>
          <dd className="text-titulo">{ROTULO_DO_TIPO[grupo.tipo]}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Plano</dt>
          <dd className="text-titulo">{ROTULO_DO_PLANO[grupo.plano]}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Criado em</dt>
          <dd className="text-titulo">{DATA.format(new Date(grupo.criadoEm))}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Corretores ativos</dt>
          <dd className="text-titulo">{grupo.corretoresAtivos}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Com login</dt>
          <dd className="text-titulo">{grupo.comLogin}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Números no ar</dt>
          <dd className="text-titulo">{grupo.numerosConectados}</dd>
        </div>
      </dl>
      <p className="text-fluid-xs text-tenue -mt-3">O plano só muda no ciclo seguinte; nesta versão ele não se edita aqui.</p>

      <FormularioDadosDoGrupo
        grupoId={grupo.id}
        inicial={{
          contatoNome: grupo.contatoNome ?? "",
          contatoEmail: grupo.contatoEmail ?? "",
          contatoTelefone: grupo.contatoTelefone ?? "",
          razaoSocial: grupo.razaoSocial ?? "",
          documento: grupo.documento ?? "",
          creci: grupo.creci ?? "",
          creciTipo: grupo.creciTipo ?? "",
          encarregadoNome: grupo.encarregadoNome ?? "",
          encarregadoEmail: grupo.encarregadoEmail ?? "",
        }}
      />
    </section>
  );
}
