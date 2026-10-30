// O link pessoal do corretor (30/10/2026): o endereço que atribui o
// atendimento a ele, num lugar só para as duas portas que o entregam — a
// tela Links por imóvel do painel e o "me manda meu link do Vitta" do número
// central (onda 3). Duas montagens divergiriam no primeiro ajuste (grupo sem
// site, corretor sem slug), e o corretor colaria um link que não é o dele.
//
// Módulo PURO e sem import: a lista de links é componente de navegador.

/**
 * O link pessoal de um imóvel. Com site, `/empreendimentos/<slug>?corretor=`;
 * grupo sem site manda o caminho da ficha pública do painel
 * (`caminhoDaFichaPublica`, que já leva o corretor), porque o link do site
 * cairia no login.
 */
export function linkPessoalDoImovel(p: {
  enderecoDoCliente: string;
  slug: string;
  corretorSlug: string;
  /** Grupo sem site: o caminho da ficha pública, já com o corretor. */
  caminhoDaFicha?: string | null;
}): string {
  if (p.caminhoDaFicha) return `${p.enderecoDoCliente}${p.caminhoDaFicha}`;
  return `${p.enderecoDoCliente}/empreendimentos/${p.slug}?corretor=${p.corretorSlug}`;
}

/** O portfólio completo do corretor ("para quando o cliente ainda não sabe o que procura"). */
export function linkDoPortfolio(p: { enderecoDoCliente: string; corretorSlug: string }): string {
  return `${p.enderecoDoCliente}/?corretor=${p.corretorSlug}`;
}

/**
 * A mensagem pronta do botão "Copiar mensagem" da tela de links, que é
 * também a apresentação do imóvel que o central manda ao cliente. Sem bairro
 * ou cidade no cadastro, a frase fecha sem o "em" pendurado.
 */
export function mensagemDoLinkDoImovel(p: { nome: string; bairro?: string | null; cidade?: string | null; link: string }): string {
  const onde = [p.bairro, p.cidade].filter((x) => x && x.trim()).join(", ");
  return `Olá! Separei este empreendimento pra você: ${p.nome}${onde ? `, em ${onde}` : ""}.\n\n${p.link}`;
}
