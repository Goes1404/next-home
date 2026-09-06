/**
 * O relatório semanal do gestor (roadmap geral, H4).
 *
 * ## Por que ele existe, e por que só agora
 *
 * As métricas-norte do roadmap mandam "medir toda semana", e até 01/09/2026
 * medir significava alguém abrir o banco e escrever SQL. Foi assim que a
 * queda de três dias do WhatsApp passou despercebida, que a campanha
 * entregou 88 mensagens para 1 resposta sem ninguém notar, e que 21% de
 * cobertura da IA só apareceu quando alguém foi procurar.
 *
 * O padrão é sempre o mesmo nesta casa: **dado que existe e ninguém olha é
 * indistinguível de dado que não existe.** O relatório é o "alguém olha".
 *
 * ## A régua: só é notícia o que MUDOU ou o que está RUIM
 *
 * Relatório que repete os mesmos números toda semana vira paisagem — a
 * mesma lição que reescreveu o `evolucaoConversa` e que decide quando a
 * faixa de queda aparece. Por isso cada linha carrega uma GRAVIDADE, e o
 * assunto do e-mail é o pior achado, não um "resumo semanal" genérico.
 *
 * Função pura: recebe números medidos, devolve o texto. Sem banco, sem
 * relógio implícito, testável.
 */

export type Gravidade = "critico" | "atencao" | "ok";

export interface Achado {
  gravidade: Gravidade;
  titulo: string;
  /** Uma linha explicando o que fazer, ou por que não há o que fazer. */
  detalhe: string;
}

export interface NumerosDaSemana {
  /** Instância de WhatsApp no ar? `null` quando não há instância nenhuma. */
  numeroNoAr: boolean | null;
  /** Há quantos dias está fora, quando está. */
  diasForaDoAr: number | null;
  conversasComFalaDoCliente: number;
  conversasAtendidasPelaIa: number;
  medianaSegundos: number | null;
  visitasPropostas: number;
  visitasMarcadas: number;
  campanhaEntregues: number;
  campanhaRespostas: number;
  imoveisPublicados: number;
  imoveisComCadastroIncompleto: number;
  leadsNovosNaSemana: number;
}

const PESO: Record<Gravidade, number> = { critico: 0, atencao: 1, ok: 2 };

function pct(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/**
 * Os achados, do pior para o melhor.
 *
 * Cada regra existe porque o defeito correspondente JÁ ACONTECEU e passou
 * dias sem ninguém ver.
 */
export function acharNoticias(n: NumerosDaSemana): Achado[] {
  const achados: Achado[] = [];

  // 1. O número fora do ar é o topo de tudo: sem ele, nada mais acontece.
  //    Passou três dias despercebido em 28/08.
  if (n.numeroNoAr === false) {
    achados.push({
      gravidade: "critico",
      titulo:
        n.diasForaDoAr && n.diasForaDoAr >= 1
          ? `O WhatsApp está fora do ar há ${n.diasForaDoAr} ${n.diasForaDoAr === 1 ? "dia" : "dias"}`
          : "O WhatsApp está fora do ar",
      detalhe:
        "Nenhuma mensagem entra ou sai enquanto isso — nem da assistente, nem sua. Reconecte pelo painel.",
    });
  }

  // 2. Cobertura: de quem escreveu, quantos a IA respondeu. Métrica-norte 1.
  const cobertura = pct(n.conversasAtendidasPelaIa, n.conversasComFalaDoCliente);
  if (cobertura !== null && n.conversasComFalaDoCliente >= 5) {
    if (cobertura < 50) {
      achados.push({
        gravidade: "critico",
        titulo: `A assistente respondeu ${cobertura}% de quem escreveu`,
        detalhe: `${n.conversasAtendidasPelaIa} de ${n.conversasComFalaDoCliente} conversas. Costuma ser número fora do ar, conversa esperando a palavra-chave, ou o corretor tendo assumido antes.`,
      });
    } else {
      achados.push({
        gravidade: "ok",
        titulo: `A assistente respondeu ${cobertura}% de quem escreveu`,
        detalhe: `${n.conversasAtendidasPelaIa} de ${n.conversasComFalaDoCliente} conversas.`,
      });
    }
  }

  // 3. Campanha que fala e ninguém responde. Medido em 31/08: 88 para 1.
  const respostaCampanha = pct(n.campanhaRespostas, n.campanhaEntregues);
  if (n.campanhaEntregues >= 20 && respostaCampanha !== null && respostaCampanha < 5) {
    achados.push({
      gravidade: "atencao",
      titulo: `${n.campanhaEntregues} disparos entregues, ${n.campanhaRespostas} ${n.campanhaRespostas === 1 ? "resposta" : "respostas"} (${respostaCampanha}%)`,
      detalhe:
        "A assistente não chega a conversar com quem não responde. O que decide isso é a mensagem de abertura, a lista e o horário — é ajuste de campanha, não de IA.",
    });
  }

  // 4. A visita proposta que não vira visita marcada.
  if (n.visitasPropostas >= 3) {
    const conversao = pct(n.visitasMarcadas, n.visitasPropostas);
    achados.push({
      gravidade: conversao !== null && conversao < 30 ? "atencao" : "ok",
      titulo: `${n.visitasPropostas} visitas oferecidas, ${n.visitasMarcadas} ${n.visitasMarcadas === 1 ? "marcada" : "marcadas"}`,
      detalhe:
        conversao !== null && conversao < 30
          ? "Oferecer horário que existe de verdade (agenda do corretor) é o que mais move este número."
          : "A conversão de oferta em visita está saudável.",
    });
  }

  // 5. Catálogo incompleto: a IA promete a planta que não existe.
  if (n.imoveisComCadastroIncompleto > 0 && n.imoveisPublicados > 0) {
    const fracao = pct(n.imoveisComCadastroIncompleto, n.imoveisPublicados) ?? 0;
    achados.push({
      gravidade: fracao >= 50 ? "atencao" : "ok",
      titulo: `${n.imoveisComCadastroIncompleto} de ${n.imoveisPublicados} imóveis com cadastro incompleto`,
      detalhe:
        "Falta planta, tipologia ou apelido. A assistente promete o que não existe e inventa o que a ficha não tem. A lista está na tela de Imóveis.",
    });
  }

  // 6. Tempo de resposta: só vira notícia quando está RUIM. Quando está bom,
  //    repetir "9 segundos" toda semana é o que transforma relatório em
  //    paisagem.
  if (n.medianaSegundos !== null && n.medianaSegundos > 60) {
    achados.push({
      gravidade: "atencao",
      titulo: `A assistente leva ${n.medianaSegundos}s para a primeira resposta`,
      detalhe: "Acima de um minuto o cliente já saiu do WhatsApp. A meta é responder em segundos.",
    });
  }

  return achados.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]);
}

/**
 * O assunto do e-mail é o PIOR achado, não "Relatório semanal".
 *
 * Assunto genérico é o que faz o relatório não ser aberto — e um relatório
 * não aberto é exatamente igual a não existir.
 */
export function assuntoDoRelatorio(achados: readonly Achado[]): string {
  const pior = achados[0];
  if (!pior || pior.gravidade === "ok") return "Next Home · a semana correu bem";
  return `Next Home · ${pior.titulo}`;
}

export function corpoDoRelatorio(params: {
  achados: readonly Achado[];
  numeros: NumerosDaSemana;
  urlPainel: string;
}): { texto: string; html: string } {
  const { achados, numeros, urlPainel } = params;
  const link = `${urlPainel.replace(/\/$/, "")}/corretor/admin`;

  const icone: Record<Gravidade, string> = { critico: "!!", atencao: "!", ok: "ok" };

  const texto = [
    "A semana em uma tela:",
    "",
    ...achados.map((a) => `[${icone[a.gravidade]}] ${a.titulo}\n    ${a.detalhe}`),
    "",
    `Leads novos na semana: ${numeros.leadsNovosNaSemana}`,
    "",
    `Painel: ${link}`,
    "",
    "Este resumo sai uma vez por semana e só destaca o que mudou ou o que precisa de você.",
  ].join("\n");

  const cor: Record<Gravidade, string> = {
    critico: "#be123c",
    atencao: "#8a5200",
    ok: "#04785f",
  };

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#edf2f0;padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,63,55,0.14);border-radius:16px">
  <tr><td style="padding:24px 28px 0;font:600 17px Georgia,serif;color:#05211c">Next<span style="color:#00594f">Home</span></td></tr>
  <tr><td style="padding:6px 28px 0;font:14px/1.5 Helvetica,Arial,sans-serif;color:#4a6a63">A semana em uma tela</td></tr>
  <tr><td style="padding:18px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${achados
        .map(
          (a) => `<tr><td style="padding:0 0 12px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-left:3px solid ${cor[a.gravidade]};border-radius:0 8px 8px 0;background:rgba(0,63,55,0.03)">
          <tr><td style="padding:12px 14px">
            <p style="margin:0;font:600 15px/1.35 Helvetica,Arial,sans-serif;color:#05211c">${a.titulo}</p>
            <p style="margin:5px 0 0;font:13px/1.55 Helvetica,Arial,sans-serif;color:#183630">${a.detalhe}</p>
          </td></tr>
        </table>
      </td></tr>`,
        )
        .join("")}
    </table>
  </td></tr>
  <tr><td style="padding:6px 28px 0;font:13px/1.6 Helvetica,Arial,sans-serif;color:#183630">
    Leads novos na semana: <strong style="color:#05211c">${numeros.leadsNovosNaSemana}</strong>
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    <a href="${link}" style="display:inline-block;background:#00594f;color:#ffffff;font:600 15px Helvetica,Arial,sans-serif;text-decoration:none;padding:13px 22px;border-radius:999px">Abrir o painel</a>
  </td></tr>
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0;border-top:1px solid rgba(0,63,55,0.14);padding-top:14px;font:12px/1.6 Helvetica,Arial,sans-serif;color:#5f7c76">
      Este resumo sai uma vez por semana e só destaca o que mudou ou o que precisa de você.
    </p>
  </td></tr>
</table>
</body></html>`;

  return { texto, html };
}
