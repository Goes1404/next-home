import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import {
  ROTULO_DO_ASSUNTO,
  ROTULO_DO_STATUS_DO_CHAMADO,
  type StatusDoChamado,
} from "@/lib/plataforma/chamadoDeSuporte";
import { FormularioDeSuporte } from "./FormularioDeSuporte";
import { listarMeusChamados } from "./meusChamados";

export const metadata: Metadata = { title: "Suporte da Astro" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const COR_DO_STATUS: Record<StatusDoChamado, string> = {
  novo: "bg-acento-lavado text-titulo border-acento",
  em_atendimento: "bg-alerta-lavado text-alerta border-alerta-linha",
  resolvido: "bg-ok-lavado text-ok border-ok-linha",
};

/**
 * Suporte da Astro (29/10/2026, 0240): o corretor ou o gestor escreve para a
 * equipe que mantém o CRM, e o chamado cai no celular de quem administra a
 * plataforma. Fica no menu da conta (avatar e rodapé da gaveta).
 *
 * Só assunto e mensagem: nome, e-mail e conta saem da sessão. Embaixo, os
 * chamados que a própria pessoa abriu, com o andamento.
 */
export default async function SuportePage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const chamados = await listarMeusChamados();

  return (
    <div className="max-w-2xl">
      <CabecalhoDeTela
        secao="Conta"
        titulo="Suporte da Astro"
        descricao="Dúvida, problema ou sugestão sobre o CRM? Escreva aqui; a equipe da Astro responde em até 1 dia útil."
      />

      <div className="cartao mt-8 p-5">
        <FormularioDeSuporte />
        <p className="text-fluid-xs text-apoio mt-4">
          Para não expor seus clientes, não cole dados de leads na mensagem: se precisar, descreva o caso e a Astro chama
          você.
        </p>
      </div>

      <section aria-labelledby="titulo-meus-chamados" className="mt-10">
        <h2 id="titulo-meus-chamados" className="font-display text-titulo text-fluid-lg">
          Seus chamados
        </h2>
        {chamados.length === 0 ? (
          <p className="text-fluid-sm text-apoio mt-3">Você ainda não abriu nenhum chamado.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {chamados.map((ch) => (
              <li key={ch.id} className="cartao flex min-w-0 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-titulo text-fluid-sm font-medium">{ROTULO_DO_ASSUNTO[ch.assunto]}</p>
                    <p className="text-fluid-xs text-apoio">{DATA_E_HORA.format(new Date(ch.criado_em))}</p>
                  </div>
                  <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${COR_DO_STATUS[ch.status]}`}>
                    {ROTULO_DO_STATUS_DO_CHAMADO[ch.status]}
                  </span>
                </div>
                <p className="text-fluid-sm text-corpo line-clamp-3 break-words whitespace-pre-line">{ch.mensagem}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
