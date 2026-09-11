/**
 * `npm run meta:diag -- <token>` — diz se o token do Meta serve e QUAIS
 * contas de anúncios ele vê, antes de qualquer env var ou redeploy.
 *
 * ## Por que existe
 *
 * Em 11/09/2026 a conexão do Meta Ads travou num ponto bobo: um número de
 * 16 dígitos na mão e nenhum meio de saber se era a conta de anúncios, o
 * app ou a página. O caminho antigo só respondia isso DEPOIS de gravar a
 * variável na Vercel e redeployar — e o sintoma de erro era o mesmo de
 * "não configurado": tabela em zero.
 *
 * Aqui o ID da conta não é adivinhado: ele vem da própria Meta, com o nome
 * da conta do lado. E o token é julgado antes de sair do terminal.
 *
 * Só leitura: duas chamadas GET à Graph API, nenhuma escrita em lugar
 * nenhum. Não toca no banco e não depende do Supabase.
 *
 * Uso:
 *   npm run meta:diag -- EAAG...            # julga o token e lista as contas
 *   npm run meta:diag                       # usa META_ADS_TOKEN do ambiente
 *   npm run meta:diag -- EAAG... --mostrar-token
 */

import {
  contasDeAnuncio,
  lerDebugToken,
  linhasParaColar,
  vereditoDoToken,
  type ContaDeAnuncio,
} from "../src/lib/metaDiagnostico";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";

const argumentos = process.argv.slice(2);
const mostrarToken = argumentos.includes("--mostrar-token");
const token = argumentos.find((a) => !a.startsWith("--")) ?? process.env.META_ADS_TOKEN ?? "";

function encerrar(mensagem: string): never {
  console.error(`\n✗ ${mensagem}\n`);
  process.exit(1);
}

async function buscar<T>(caminho: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    // O corpo é lido mesmo em erro: é lá que mora a mensagem da Meta, que
    // é a parte útil do diagnóstico (o status HTTP sozinho não diz nada).
    return (await resposta.json()) as T;
  } catch (e) {
    console.error(`  (rede falhou em ${caminho}: ${e instanceof Error ? e.message : "erro"})`);
    return null;
  }
}

function imprimirContas(contas: ContaDeAnuncio[]): void {
  console.log(`\nContas de anúncios que este token vê (${contas.length}):`);
  for (const c of contas) {
    const selo = c.ativa ? "ativa" : "INATIVA";
    console.log(`  • ${c.nome}${c.moeda ? ` (${c.moeda})` : ""} — ${selo}`);
    console.log(`    META_ADS_ACCOUNT_ID=${c.id}`);
  }
}

async function main() {
  if (!token) {
    encerrar(
      "Passe o token: npm run meta:diag -- <token>\n  (ou exporte META_ADS_TOKEN no ambiente)",
    );
  }

  // Engano comum e barato de pegar: colar o ID da conta no lugar do token.
  if (/^\d+$/.test(token)) {
    encerrar(
      `"${token}" é só dígitos, então é um ID (de conta, app ou página), não um token.\n` +
        "  Token do Meta começa com EAA e tem mais de cem caracteres.",
    );
  }

  console.log(`\nDiagnóstico do token (${token.slice(0, 6)}…${token.slice(-4)})`);
  console.log("─".repeat(60));

  const bruto = await buscar<Parameters<typeof lerDebugToken>[0]>("debug_token", {
    input_token: token,
    access_token: token,
  });
  const lido = lerDebugToken(bruto ?? null);

  const NOME_DO_TIPO = {
    usuario: "de usuário (vence em até 60 dias)",
    sistema: "de Usuário do Sistema (não vence)",
    pagina: "de página",
    desconhecido: "de tipo não identificado",
  } as const;

  console.log(`Tipo:      ${NOME_DO_TIPO[lido.tipo]}`);
  console.log(`App:       ${lido.appNome ?? "—"}`);
  console.log(`Válido:    ${lido.valido ? "sim" : "não"}`);
  console.log(`ads_read:  ${lido.temAdsRead ? "sim" : "NÃO"}`);
  console.log(`Vence:     ${lido.expiraEm ? lido.expiraEm.toLocaleString("pt-BR") : "não vence"}`);
  if (lido.escopos.length) console.log(`Escopos:   ${lido.escopos.join(", ")}`);

  const contas = contasDeAnuncio(
    await buscar("me/adaccounts", {
      fields: "id,name,account_status,currency",
      limit: "50",
      access_token: token,
    }),
  );

  if (contas.length) imprimirContas(contas);

  const veredito = vereditoDoToken(lido, contas);

  console.log("\n" + "─".repeat(60));

  if (!veredito.serve) {
    console.log(`✗ Este token NÃO serve para o gasto do Meta Ads.\n\n  ${veredito.problema}\n`);
    process.exit(1);
  }

  console.log("✓ Este token serve.\n");
  if (veredito.avisoDeVencimento) {
    console.log(`${veredito.vencePerto ? "!!" : "!"} ${veredito.avisoDeVencimento}\n`);
  }

  const escolhida = contas.find((c) => c.ativa) ?? contas[0];
  console.log("Cole estas duas em Vercel → next-home → Settings → Environment");
  console.log(`Variables → Production (conta "${escolhida.nome}"):\n`);
  /*
   * O token sai MASCARADO por padrão. Ele já está no histórico do shell de
   * quem rodou, então imprimir não acrescenta risco local — mas a saída
   * deste script é exatamente o tipo de texto que se cola numa conversa
   * para pedir ajuda, e aí o token vira credencial vazada. Revelar é um
   * ato explícito (--mostrar-token).
   */
  const tokenParaColar = mostrarToken ? token : `${token.slice(0, 6)}…<use --mostrar-token>`;
  console.log(linhasParaColar(escolhida.id, tokenParaColar));

  if (contas.length > 1) {
    console.log(
      `\n(${contas.length} contas acima — troque o ID se a campanha roda em outra delas.)`,
    );
  }

  console.log("\nDepois: redeploy na Vercel e 'Sincronizar agora' na tela de Anúncios.\n");
}

main().catch((e) => encerrar(e instanceof Error ? e.message : String(e)));
