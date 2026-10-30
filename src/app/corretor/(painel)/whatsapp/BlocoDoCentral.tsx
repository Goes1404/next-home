import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { lerCentral } from "@/lib/central/numeroDoCentral";
import { linkDoCentral, telefoneFormatado } from "@/lib/central/constantes";

/**
 * Comandos pelo WhatsApp (0248; plano da onda 0, Task 8): com o recurso
 * ligado pelo gestor e o central conectado, o corretor vê o número e o link
 * para começar. O central reconhece pelo WhatsApp do perfil, então o número
 * dele aparece aqui para conferir.
 */
export async function BlocoDoCentral() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const whatsapp = corretor.whatsapp ?? null;
  const [central, { data: grupo }] = await Promise.all([
    lerCentral(),
    createServiceClient().from("grupos").select("central_whatsapp_ativo").eq("id", corretor.grupoId).maybeSingle(),
  ]);
  if (!central || grupo?.central_whatsapp_ativo !== true) return null;

  return (
    <section className="cartao p-5">
      <h2 className="text-fluid-base font-bold text-titulo">Comandos pelo WhatsApp</h2>
      <p className="text-fluid-sm text-apoio mt-1">
        Mande mensagem para {telefoneFormatado(central.telefone)} e peça em texto ou áudio: &quot;quais visitas tenho
        hoje?&quot;, &quot;me mostra o lead do final 4321&quot;. Nada muda no CRM sem o seu &quot;sim&quot;.
      </p>
      <p className="text-fluid-xs text-apoio mt-2">
        {whatsapp
          ? `O central reconhece você pelo ${telefoneFormatado(whatsapp)}, o WhatsApp do seu perfil.`
          : "Cadastre o seu WhatsApp no perfil: é por ele que o central reconhece você."}
      </p>
      <a
        href={linkDoCentral(central.telefone)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center text-fluid-sm font-semibold text-acento-suave underline decoration-transparent underline-offset-4 hover:decoration-current"
      >
        Abrir a conversa com o central
      </a>
    </section>
  );
}
