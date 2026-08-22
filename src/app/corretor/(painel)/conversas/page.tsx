import type { Metadata } from "next";
import Link from "next/link";
import { ConversasClient, type ConversaResumo } from "./ConversasClient";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { ROTULO_MODO } from "@/lib/whatsapp/modoBot";
import { createClient } from "@/lib/supabase/server";
import type { ModoBotWhatsapp } from "@/lib/whatsapp/types";

export const metadata: Metadata = { title: "Conversas do WhatsApp" };

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const supabase = await createClient();

  /*
   * O filtro por corretor é OBRIGATÓRIO aqui.
   *
   * Antes ele era omitido de propósito, porque a policy da 0018 recortava
   * sozinha. A 0031 abriu essas tabelas para o gestor (a administração
   * precisa enxergar a operação da equipe) — e, sem o filtro, o
   * `maybeSingle()` da instância passa a receber N linhas e explode
   * justamente na tela do gestor.
   *
   * Esta continua sendo a CAIXA PESSOAL de quem está logado; a visão da
   * equipe mora em /corretor/admin/whatsapp.
   */
  const [{ data: conversas }, { data: instancia }] = await Promise.all([
    supabase
      .from("whatsapp_conversas")
      .select("id, telefone_cliente, nome_cliente, bot_ativo, pausado_humano_ate, ultima_mensagem, ultima_interacao_em, lead_id")
      .eq("corretor_id", corretor.id)
      .order("ultima_interacao_em", { ascending: false })
      .limit(100),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("modo_bot, status_conexao")
      .eq("corretor_id", corretor.id)
      .maybeSingle(),
  ]);

  /*
   * "Está pausada agora?" não é calculado aqui: a resposta depende do
   * relógio, e um booleano gravado no HTML já nasce velho — a pausa vence
   * enquanto a página está aberta. O cliente deriva de `pausadoAte`.
   */
  const lista: ConversaResumo[] = (conversas ?? []).map((c) => ({
    id: c.id,
    telefone: c.telefone_cliente,
    nome: c.nome_cliente,
    botAtivo: c.bot_ativo,
    pausadoAte: c.pausado_humano_ate,
    ultimaMensagem: c.ultima_mensagem,
    ultimaInteracaoEm: c.ultima_interacao_em,
    temLead: Boolean(c.lead_id),
  }));

  const modo = (instancia?.modo_bot ?? null) as ModoBotWhatsapp | null;

  return (
    <div>
      <h1 className="font-display text-titulo text-fluid-2xl">Conversas do WhatsApp</h1>
      <p className="text-fluid-sm text-apoio mt-2 max-w-2xl">
        Quem está falando com o seu número e se a IA está atendendo. Sempre que você responde pelo
        celular, ela se cala por 24 horas naquela conversa — aqui você devolve a palavra a ela
        antes disso.
      </p>

      {modo && (
        <p className="text-fluid-sm text-apoio mt-4">
          Modo do seu número: <span className="text-titulo font-medium">{ROTULO_MODO[modo]}</span>{" "}
          <Link
            href="/corretor/whatsapp"
            className="text-acento-suave underline-offset-4 hover:underline"
          >
            trocar
          </Link>
        </p>
      )}

      <ConversasClient conversas={lista} />
    </div>
  );
}
