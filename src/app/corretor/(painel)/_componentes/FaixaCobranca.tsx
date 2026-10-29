import { getCorretorLogado } from "@/lib/corretorSessao";
import { asaasConfigurado, lerFaturaEmAberto } from "@/lib/cobranca/asaas";
import { linkDoWhatsAppDaAstro } from "@/lib/marcaDaPlataforma";
import { avisoDoPainel } from "@/lib/planos/cobranca";
import { lerAssinaturaDoGrupo, lerCobrancaDoGrupo } from "@/lib/planos/cobrancaDoGrupo";

/**
 * A faixa da mensalidade do grupo (fase 2C; teste grátis e Asaas em
 * 29/10/2026, 0241).
 *
 * - **Teste grátis**: quantos dias faltam e quando acaba.
 * - **Pendente** (do dia do vencimento até o 5º dia de atraso): avisa quando
 *   venceu e quando os recursos pagos param.
 * - **Suspenso**: diz o que parou (IA, listas, artes e vídeos) e o que segue
 *   (site, painel e login). O cliente final nunca vê erro: a IA fica calada
 *   e a equipe atende pelas conversas. No fim do teste sem pagamento, diz
 *   que o teste terminou.
 *
 * Para o GESTOR, o botão: "Pagar agora" / "Assinar agora" abre a fatura em
 * aberto do Asaas quando o grupo tem assinatura (lida pela chave de serviço,
 * com o grupo da sessão); sem ela, o teste grátis oferece o WhatsApp da
 * Astro. Falha do Asaas só tira o botão.
 *
 * Aparece para TODOS do grupo: quem atende precisa saber por que a IA calou.
 * Devolve `null` com a cobrança em dia ou isenta, que é quase sempre (mesma
 * régua da `FaixaCotaDaIa`). Classes escritas por extenso: montadas em tempo
 * de execução, o Tailwind não as gera.
 */
export async function FaixaCobranca() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const aviso = avisoDoPainel(await lerCobrancaDoGrupo(corretor.grupoId));
  if (!aviso) return null;

  let botao: { href: string; texto: string } | null = null;
  if (corretor.papel === "gestor") {
    const assinatura = asaasConfigurado() ? await lerAssinaturaDoGrupo(corretor.grupoId) : null;
    const fatura = assinatura ? await lerFaturaEmAberto(assinatura, 4000) : null;
    if (fatura) botao = { href: fatura.url, texto: aviso.teste ? "Assinar agora" : "Pagar agora" };
    else if (aviso.teste) {
      const whatsapp = linkDoWhatsAppDaAstro(undefined, "Olá! Quero assinar a Astro depois do teste grátis.");
      if (whatsapp) botao = { href: whatsapp, texto: "Assinar agora" };
    }
  }

  const cor = aviso.suspenso
    ? "border-perigo-linha bg-perigo-lavado"
    : aviso.teste
      ? "border-linha-forte bg-campo"
      : "border-alerta-linha bg-alerta-lavado";

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pt-4 md:px-8">
      <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${cor}`}>
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-fluid-sm text-titulo font-semibold">{aviso.titulo}</p>
          <p className="text-fluid-xs text-corpo mt-1.5 leading-relaxed text-pretty">{aviso.detalhe}</p>
        </div>
        {botao && (
          <a
            href={botao.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor inline-flex min-h-11 shrink-0 items-center rounded-xl px-5 font-bold"
          >
            {botao.texto}
          </a>
        )}
      </div>
    </div>
  );
}
