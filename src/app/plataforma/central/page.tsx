import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { TELEFONE_PADRAO_DO_CENTRAL, telefoneFormatado } from "@/lib/central/constantes";
import { ConectarCentral } from "./ConectarCentral";

export const metadata: Metadata = { title: "Número central" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const ROTULO: Record<string, { texto: string; classe: string }> = {
  conectado: { texto: "Conectado", classe: "bg-ok-lavado text-ok border-ok-linha" },
  conectando: { texto: "Conectando", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  desconectado: { texto: "Desconectado", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

/**
 * O número central da plataforma (0249; onda 0). Conecta o chip, mostra o
 * estado e quantas imobiliárias ligaram o recurso.
 *
 * A guarda aqui, e não só no layout (layout não re-executa entre rotas
 * irmãs).
 */
export default async function NumeroCentralPage() {
  await exigirAdminDaPlataformaNaPagina();
  const supabase = createServiceClient();
  const seteDias = janelaDeDias(7).corte.toISOString();
  const [{ data: central }, { count: ligadas }, { count: comandos }, { count: tentativas }] = await Promise.all([
    supabase.from("central_da_plataforma").select("telefone, status_conexao, conectado_em, desconectado_em").limit(1).maybeSingle(),
    supabase.from("grupos").select("id", { count: "exact", head: true }).eq("central_whatsapp_ativo", true),
    supabase.from("central_comandos").select("id", { count: "exact", head: true }).gte("created_at", seteDias),
    supabase.from("central_tentativas").select("id", { count: "exact", head: true }).gte("created_at", seteDias),
  ]);
  const telefone = central?.telefone ?? process.env.CENTRAL_TELEFONE ?? TELEFONE_PADRAO_DO_CENTRAL;
  const estado = ROTULO[central?.status_conexao ?? "desconectado"] ?? ROTULO.desconectado;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-fluid-2xl text-titulo font-semibold">Número central</h1>
        <p className="text-fluid-sm text-apoio mt-1 text-pretty">
          O WhatsApp da plataforma com que corretores e gestores operam o CRM conversando. Só conversa com a equipe das
          imobiliárias que ligaram o recurso.
        </p>
      </div>

      <div className="cartao flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-fluid-xl text-titulo font-semibold tabular-nums">{telefoneFormatado(telefone)}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-fluid-xs font-semibold ${estado.classe}`}>{estado.texto}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero rotulo="Conectado desde" valor={central?.conectado_em ? DATA_E_HORA.format(new Date(central.conectado_em)) : "—"} />
          <Numero rotulo="Imobiliárias com o recurso" valor={String(ligadas ?? 0)} />
          <Numero rotulo="Pedidos em 7 dias" valor={String(comandos ?? 0)} />
          <Numero rotulo="Quem não é da equipe, 7 dias" valor={String(tentativas ?? 0)} />
        </dl>
        {!central && (
          <p className="text-fluid-sm text-corpo">
            Ainda não registrado. Coloque o chip num celular com WhatsApp e gere o código de conexão.
          </p>
        )}
        <ConectarCentral conectado={central?.status_conexao === "conectado"} telefone={telefoneFormatado(telefone)} />
      </div>
    </section>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-vidro px-3 py-2">
      <dt className="text-fluid-xs text-apoio">{rotulo}</dt>
      <dd className="text-fluid-base text-titulo font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
