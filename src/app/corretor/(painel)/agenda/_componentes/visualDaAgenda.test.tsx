import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ItemDaAgenda } from "@/lib/agenda/itens";

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/corretor/agenda" }));
vi.mock("../acoesCompromissos", () => ({ bloquearHorario: vi.fn(), cancelarDoFormulario: vi.fn(), marcarReuniao: vi.fn() }));
vi.mock("../acoesDaEquipe", () => ({ passarVisitaDoFormulario: vi.fn() }));

const { DiaDaAgenda } = await import("./DiaDaAgenda");
const { CalendarioDoCelular } = await import("./CalendarioDoCelular");

/*
 * O visual da Agenda (28/10/2026): a lista fina do dia com a linha do
 * "agora", e a faixa da semana do celular que atravessa a virada do mês sem
 * perder a visão da equipe.
 */
const visita: ItemDaAgenda = {
  tipo: "visita", id: "v1", inicio: "2026-10-28T13:00:00Z", leadId: "l1", nome: "Mariana Costa",
  telefone: "11999990000", imovel: null, confirmadaPeloCliente: true,
};
const reuniao: ItemDaAgenda = {
  tipo: "compromisso", id: "r1", inicio: "2026-10-28T19:00:00Z", fim: "2026-10-28T20:00:00Z",
  subtipo: "reuniao", titulo: "Reunião de metas", podeCancelar: false,
};

describe("DiaDaAgenda", () => {
  it("cada item numa linha: hora, quem e a situação", () => {
    const html = renderToStaticMarkup(
      <DiaDaAgenda itens={[visita, reuniao]} preparoPorLead={{}} agoraIso="2026-10-28T12:00:00Z" dia="2026-10-28" vazio="Nada" />,
    );
    expect(html).toContain("10:00");
    expect(html).toContain("Mariana Costa");
    expect(html).toContain("Visita · confirmada");
    expect(html).toContain("Reunião · até 17:00");
  });

  it("no dia de hoje, a linha do agora entra depois do que já começou", () => {
    const html = renderToStaticMarkup(
      <DiaDaAgenda itens={[visita, reuniao]} preparoPorLead={{}} agoraIso="2026-10-28T15:00:00Z" dia="2026-10-28" vazio="Nada" />,
    );
    expect(html.match(/aria-label="Agora"/g)).toHaveLength(1);
    expect(html.indexOf('aria-label="Agora"')).toBeGreaterThan(html.indexOf("Mariana Costa"));
    expect(html.indexOf('aria-label="Agora"')).toBeLessThan(html.indexOf("Reunião de metas"));
  });

  it("em outro dia, sem linha do agora", () => {
    const html = renderToStaticMarkup(
      <DiaDaAgenda itens={[visita]} preparoPorLead={{}} agoraIso="2026-10-29T15:00:00Z" dia="2026-10-28" vazio="Nada" />,
    );
    expect(html).not.toContain('aria-label="Agora"');
  });

  it("na equipe, a linha diz quem faz a visita", () => {
    const html = renderToStaticMarkup(
      <DiaDaAgenda
        itens={[{ ...visita, corretorNome: "Bruno Teste", status: "marcada" } as ItemDaAgenda]}
        preparoPorLead={{}}
        agoraIso="2026-10-28T12:00:00Z"
        dia="2026-10-28"
        modo="equipe"
        vazio="Nada"
      />,
    );
    expect(html).toContain("Bruno Teste · Marcada");
  });

  it("dia vazio diz que não há nada", () => {
    const html = renderToStaticMarkup(
      <DiaDaAgenda itens={[]} preparoPorLead={{}} agoraIso="2026-10-28T12:00:00Z" dia="2026-10-28" vazio="Nada marcado neste dia." />,
    );
    expect(html).toContain("Nada marcado neste dia.");
  });
});

describe("CalendarioDoCelular", () => {
  it("a semana atravessa a virada do mês e guarda a visão da equipe", () => {
    const html = renderToStaticMarkup(
      <CalendarioDoCelular mes="2026-10" dia="2026-10-01" hoje="2026-10-01" marcadores={{ "2026-09-29": 2 }} consulta="&ver=equipe" />,
    );
    expect(html).toContain('href="?mes=2026-09&amp;dia=2026-09-27&amp;ver=equipe"');
    expect(html).toContain("29, 2 compromissos");
    // As setas andam uma semana.
    expect(html).toContain('href="?mes=2026-10&amp;dia=2026-10-08&amp;ver=equipe"');
  });

  it("fora de hoje aparece o atalho para hoje", () => {
    const html = renderToStaticMarkup(<CalendarioDoCelular mes="2026-10" dia="2026-10-20" hoje="2026-10-28" marcadores={{}} />);
    expect(html).toContain('href="?mes=2026-10&amp;dia=2026-10-28"');
  });
});

describe("retoques do visual (28/10)", () => {
  it("visita sem imóvel não diz 'Imóvel não informado'", async () => {
    const { CartaoDaVisita } = await import("./CartaoDaVisita");
    const html = renderToStaticMarkup(<CartaoDaVisita visita={visita as never} preparo={{}} semMoldura />);
    expect(html).not.toContain("Imóvel não informado");
    expect(html).toContain("Mariana Costa");
  });

  it("o cabeçalho compacto esconde a seção e a descrição no celular", async () => {
    const { CabecalhoDeTela } = await import("@/app/corretor/(painel)/_componentes/CabecalhoDeTela");
    const html = renderToStaticMarkup(<CabecalhoDeTela secao="Leads" titulo="Agenda" descricao="Suas visitas" compacto />);
    expect(html).toMatch(/class="[^"]*hidden[^"]*md:block[^"]*"[^>]*>Leads/);
    expect(html).toMatch(/class="[^"]*hidden[^"]*md:block[^"]*"[^>]*>Suas visitas/);
  });

  it("com duas opções, o Novo pergunta antes qual formulário abrir", async () => {
    const { OpcoesDoNovo } = await import("./AcoesDaAgenda");
    const html = renderToStaticMarkup(
      <OpcoesDoNovo
        opcoes={[
          { chave: "bloquear", rotulo: "Bloquear horário", descricao: "Médico, folga", conteudo: <p>form-b</p> },
          { chave: "reuniao", rotulo: "Marcar reunião", descricao: "Avisa a equipe", conteudo: <p>form-r</p> },
        ]}
      />,
    );
    expect(html).toContain("Bloquear horário");
    expect(html).toContain("Marcar reunião");
    expect(html).not.toContain("form-b");
  });

  it("com uma opção só, o Novo já abre o formulário", async () => {
    const { OpcoesDoNovo } = await import("./AcoesDaAgenda");
    const html = renderToStaticMarkup(
      <OpcoesDoNovo opcoes={[{ chave: "bloquear", rotulo: "Bloquear horário", descricao: "", conteudo: <p>form-b</p> }]} />,
    );
    expect(html).toContain("form-b");
  });
});
