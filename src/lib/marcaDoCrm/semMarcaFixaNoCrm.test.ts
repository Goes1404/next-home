import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/grupos/codigoFonte";

/**
 * Guarda da marca no CRM (21/10/2026): o cliente que entra pelo painel não
 * pode ver "Next Home" nem o endereço da Next Home depois do login.
 *
 * Nos arquivos do painel (`src/app/corretor`), das rotas de API e dos crons
 * (`src/app/api`), e em `src/lib/{crm,notificacoes,whatsapp,auth,corretores,
 * admin,social}`:
 *
 * - `site.url` não monta link: o link para o CORRETOR é de `enderecoDoPainel`
 *   / `linkDoPainel`; o do CLIENTE é de `lerEnderecoDoCliente` (`marcaDoCrm/`).
 * - `site.nome` / `site.wordmark` / `site.nomeCompleto` não entram em texto:
 *   o nome vem da marca do grupo (`lerMarcaDoCrm`, `marcaDoPainel`,
 *   `useNomeDaCasa`).
 *
 * Exceção só declarada abaixo, com motivo. Exceção que deixou de ser
 * necessária também reprova (a lista não envelhece).
 */

const RAIZ = process.cwd();

const PASTAS = [
  "src/app/corretor",
  "src/app/api",
  "src/lib/crm",
  "src/lib/notificacoes",
  "src/lib/whatsapp",
  "src/lib/auth",
  "src/lib/corretores",
  "src/lib/admin",
  "src/lib/social",
];

function arquivosDe(pasta: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, pasta), { withFileTypes: true })) {
    const caminho = `${pasta}/${entrada.name}`;
    if (entrada.isDirectory()) saida.push(...arquivosDe(caminho));
    else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) saida.push(caminho);
  }
  return saida;
}

const PADRAO_URL = /(?<![\w$])site\.url(?![\w$])/;
const PADRAO_NOME = /(?<![\w$])site\.(nome|wordmark|nomeCompleto)(?![\w$])/;

/** `site.url` que fica, e por quê. */
const EXCECOES_URL: Record<string, string> = {
  "src/lib/whatsapp/resolverMidia.ts":
    "link do site que a IA manda ao CLIENTE na conversa (catálogo e página do imóvel): a rota por grupo é do prompt/guardrails da fase 4; fica anotado no HANDOFF",
  "src/lib/whatsapp/apresentacaoDigital.ts":
    "reconhece o link do site da Next Home no texto da IA (par de resolverMidia.ts)",
  "src/lib/whatsapp/autoDisparo.ts":
    "endereço do PRÓPRIO deploy para acender o disparo (reserva de VERCEL_PROJECT_PRODUCTION_URL); não é link para pessoa",
  "src/lib/social/linkDeIndicacao.ts":
    "valor padrão do parâmetro; os quatro chamadores passam o endereço do grupo (lerEnderecoDoCliente)",
};

/** `site.nome` / `site.wordmark` / `site.nomeCompleto` que ficam, e por quê. */
const EXCECOES_NOME: Record<string, string> = {
  "src/app/corretor/(painel)/_componentes/NomeDaCasa.tsx": "marca padrão do contexto, sem provedor: a da instalação (Next Home)",
  "src/app/corretor/(painel)/_componentes/CartaoLead.tsx": "valor padrão do parâmetro; os chamadores passam o nome da casa do grupo",
  "src/app/corretor/(painel)/importar/GmailLeadsExtractor.tsx": "compara com o nome da instalação para manter a grafia 'NextHome' da Next Home",
  "src/app/corretor/(painel)/admin/marca/page.tsx": "visão da Next Home da tela de marca (a das outras imobiliárias é outra: logo e nome do grupo)",
  "src/app/corretor/entrar/page.tsx": "a tela de login, antes de existir sessão: a marca vem do ENDEREÇO (AstroImob x Next Home)",
  "src/lib/admin/relatorioSemanal.ts": "valor padrão do parâmetro; o cron passa o nome do grupo que recebe",
  "src/lib/crm/avisoAoCorretor.ts": "valor padrão do parâmetro; avisarCorretor passa o nome da casa do corretor",
  "src/lib/auth/pedidoDeLinkDeSenha.ts": "reserva quando a linha do grupo não existe; o nome vem de grupos.nome",
  "src/lib/corretores/convite.ts": "reserva quando a linha do grupo não existe; o nome vem de grupos.nome",
  "src/lib/whatsapp/casa.ts": "a Next Home da IA (fase 4): CASA_NEXT_HOME; outro grupo nunca herda",
  "src/lib/whatsapp/focoDaConversa.ts": "palavras da marca para reconhecer o nome na fala do cliente (prompt da IA, fora do CRM)",
};

describe("o CRM não usa a marca fixa da Next Home", () => {
  const todos = PASTAS.flatMap(arquivosDe);

  it("site.url não monta link do painel nem do cliente (só as exceções declaradas)", () => {
    const fora = todos.filter((f) => PADRAO_URL.test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))) && !(f in EXCECOES_URL));
    expect(
      fora,
      "Use enderecoDoPainel/linkDoPainel (link para o corretor) ou lerEnderecoDoCliente (link para o cliente) de @/lib/marcaDoCrm",
    ).toEqual([]);
  });

  it("site.nome / wordmark / nomeCompleto não entram em texto (só as exceções declaradas)", () => {
    const fora = todos.filter((f) => PADRAO_NOME.test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))) && !(f in EXCECOES_NOME));
    expect(fora, "Use o nome da marca do grupo: lerMarcaDoCrm, marcaDoPainel ou useNomeDaCasa").toEqual([]);
  });

  it("toda exceção ainda é necessária", () => {
    const velhasUrl = Object.keys(EXCECOES_URL).filter(
      (f) => !PADRAO_URL.test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))),
    );
    const velhasNome = Object.keys(EXCECOES_NOME).filter(
      (f) => !PADRAO_NOME.test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))),
    );
    expect([...velhasUrl, ...velhasNome]).toEqual([]);
  });

  it("os arquivos das exceções existem nas pastas conferidas", () => {
    for (const f of [...Object.keys(EXCECOES_URL), ...Object.keys(EXCECOES_NOME)]) {
      expect(todos, f).toContain(f);
    }
  });
});
