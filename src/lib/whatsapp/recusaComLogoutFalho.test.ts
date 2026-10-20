import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * Número de outra conta cuja sessão NÃO caiu na recusa (0198, achado da
 * revisão da fase 2D).
 *
 * A recusa derruba a sessão na Evolution. Se o logout falha (provedor fora,
 * tempo esgotado), o banco diz "desconectado" mas o número continua no ar:
 * as mensagens dos clientes da outra conta chegariam ao webhook e seriam
 * gravadas neste grupo, e a IA daqui poderia responder por um número que não
 * é dela. Aqui se cobra: a recusa deixa uma pendência quando o logout falha,
 * o webhook não deixa a mensagem seguir enquanto a recusa está em aberto, a
 * varredura do cron tenta de novo, e nada disso derruba o número CERTO que o
 * corretor conectar depois.
 */

const GRUPO = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
let numeroDeOutraConta: boolean;
let estadoNoProvedor:
  | { ok: true; conectado: boolean; estado: string; telefone: string | null }
  | { ok: false; detalhe: string };
const desconectarInstancia = vi.fn(async (_nome: string) => ({ ok: true }) as { ok: boolean; detalhe?: string });
const consultarEstadoConexao = vi.fn(async (_nome: string) => estadoNoProvedor);

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("./provider", async (original) => ({
  ...(await original<typeof import("./provider")>()),
  consultarEstadoConexao: (nome: string) => consultarEstadoConexao(nome),
  desconectarInstancia: (nome: string) => desconectarInstancia(nome),
  consultarMotivoDaQueda: async () => null,
}));

const { recusarNumeroDeOutroGrupo, mensagemDoNumeroPodeSeguir, registrarEventoConexao, sincronizarConexaoInstancia } =
  await import("./repositorio");
const { rederrubarNumerosRecusados } = await import("./recusaPendente");

function instancia() {
  return banco.tabelas.corretor_whatsapp_instancias[0];
}

function resolvida(sobra: Record<string, unknown> = {}) {
  const i = instancia();
  return {
    id: i.id as string,
    instanceName: i.instance_name as string,
    statusConexao: i.status_conexao as string,
    conectadoEm: (i.conectado_em as string | null) ?? null,
    telefoneConectado: (i.telefone_conectado as string | null) ?? null,
    numeroRecusado: Boolean(i.numero_recusado_em),
    ...sobra,
  } as Parameters<typeof mensagemDoNumeroPodeSeguir>[0];
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  desconectarInstancia.mockClear();
  consultarEstadoConexao.mockClear();
  desconectarInstancia.mockImplementation(async () => ({ ok: true }));
  numeroDeOutraConta = true;
  estadoNoProvedor = { ok: true, conectado: true, estado: "open", telefone: "5511988887777" };
  banco = bancoFalso({
    corretor_whatsapp_instancias: [
      {
        id: "inst-b",
        corretor_id: "corretor-b",
        grupo_id: GRUPO,
        instance_name: "b",
        status_conexao: "conectando",
        conectado_em: null,
        telefone_conectado: null,
        numero_recusado_em: null,
        logout_pendente_em: null,
      },
    ],
  });
  banco.cliente.rpc = async (nome: string) =>
    nome === "numero_whatsapp_em_outro_grupo" ? { data: numeroDeOutraConta, error: null } : { data: null, error: null };
});

describe("a recusa com o logout que falha", () => {
  it("deixa a pendência para a varredura tentar de novo", async () => {
    desconectarInstancia.mockImplementation(async () => ({ ok: false, detalhe: "timeout" }));
    const r = await recusarNumeroDeOutroGrupo({ instanciaId: "inst-b", instanceName: "b" });
    expect(r.derrubada).toBe(false);
    expect(instancia().status_conexao).toBe("desconectado");
    expect(instancia().numero_recusado_em).toBeTruthy();
    expect(instancia().logout_pendente_em).toBeTruthy();
  });

  it("com o logout que deu certo, não há pendência", async () => {
    const r = await recusarNumeroDeOutroGrupo({ instanciaId: "inst-b", instanceName: "b" });
    expect(r.derrubada).toBe(true);
    expect(instancia().numero_recusado_em).toBeTruthy();
    expect(instancia().logout_pendente_em).toBeNull();
  });
});

describe("a mensagem que chega pelo número recusado", () => {
  beforeEach(async () => {
    desconectarInstancia.mockImplementation(async () => ({ ok: false, detalhe: "timeout" }));
    await recusarNumeroDeOutroGrupo({ instanciaId: "inst-b", instanceName: "b" });
    desconectarInstancia.mockClear();
  });

  it("não segue, e o logout é tentado de novo", async () => {
    expect(await mensagemDoNumeroPodeSeguir(resolvida())).toBe(false);
    expect(desconectarInstancia).toHaveBeenCalledWith("b");
    expect(instancia().status_conexao).toBe("desconectado");
  });

  it("não segue quando o provedor não responde (a recusa continua valendo)", async () => {
    estadoNoProvedor = { ok: false, detalhe: "fora do ar" };
    expect(await mensagemDoNumeroPodeSeguir(resolvida())).toBe(false);
  });

  it("segue quando o corretor já conectou um número certo, e a recusa acaba", async () => {
    numeroDeOutraConta = false;
    estadoNoProvedor = { ok: true, conectado: true, estado: "open", telefone: "5511977776666" };
    expect(await mensagemDoNumeroPodeSeguir(resolvida())).toBe(true);
    expect(instancia().status_conexao).toBe("conectado");
    expect(instancia().numero_recusado_em).toBeNull();
    expect(instancia().logout_pendente_em).toBeNull();
    expect(desconectarInstancia).not.toHaveBeenCalled();
  });
});

describe("a mensagem que chega no pareamento (status conectando)", () => {
  it("de número de outra conta não segue", async () => {
    expect(await mensagemDoNumeroPodeSeguir(resolvida())).toBe(false);
    expect(desconectarInstancia).toHaveBeenCalledWith("b");
  });

  it("de número que não é de outra conta segue", async () => {
    numeroDeOutraConta = false;
    expect(await mensagemDoNumeroPodeSeguir(resolvida())).toBe(true);
  });

  it("instância conectada passa direto, sem perguntar ao provedor", async () => {
    instancia().status_conexao = "conectado";
    expect(await mensagemDoNumeroPodeSeguir(resolvida())).toBe(true);
    expect(consultarEstadoConexao).not.toHaveBeenCalled();
  });
});

describe("a varredura do cron", () => {
  beforeEach(async () => {
    desconectarInstancia.mockImplementation(async () => ({ ok: false, detalhe: "timeout" }));
    await recusarNumeroDeOutroGrupo({ instanciaId: "inst-b", instanceName: "b" });
    desconectarInstancia.mockClear();
    desconectarInstancia.mockImplementation(async () => ({ ok: true }));
  });

  it("derruba de novo a sessão que ficou no ar e apaga a pendência", async () => {
    await rederrubarNumerosRecusados();
    expect(desconectarInstancia).toHaveBeenCalledWith("b");
    expect(instancia().logout_pendente_em).toBeNull();
  });

  it("sessão que já caiu: só apaga a pendência", async () => {
    estadoNoProvedor = { ok: true, conectado: false, estado: "close", telefone: null };
    await rederrubarNumerosRecusados();
    expect(desconectarInstancia).not.toHaveBeenCalled();
    expect(instancia().logout_pendente_em).toBeNull();
  });

  it("provedor fora do ar: a pendência fica para o próximo tique", async () => {
    estadoNoProvedor = { ok: false, detalhe: "fora do ar" };
    await rederrubarNumerosRecusados();
    expect(instancia().logout_pendente_em).toBeTruthy();
  });

  it("aberta sem dizer o número: derruba (não dá para conferir)", async () => {
    estadoNoProvedor = { ok: true, conectado: true, estado: "open", telefone: null };
    await rederrubarNumerosRecusados();
    expect(desconectarInstancia).toHaveBeenCalledWith("b");
    expect(instancia().logout_pendente_em).toBeNull();
  });

  it("não derruba o número certo que o corretor conectou depois", async () => {
    numeroDeOutraConta = false;
    estadoNoProvedor = { ok: true, conectado: true, estado: "open", telefone: "5511977776666" };
    await rederrubarNumerosRecusados();
    expect(desconectarInstancia).not.toHaveBeenCalled();
    expect(instancia().status_conexao).toBe("conectado");
    expect(instancia().logout_pendente_em).toBeNull();
  });
});

describe("a conexão que não foi conferida não apaga a recusa", () => {
  beforeEach(async () => {
    await recusarNumeroDeOutroGrupo({ instanciaId: "inst-b", instanceName: "b" });
  });

  it("evento 'open' sem o número pergunta ao provedor, e sem o número não marca conectado", async () => {
    estadoNoProvedor = { ok: true, conectado: true, estado: "open", telefone: null };
    await registrarEventoConexao({ instanceName: "b", estado: "open", telefone: null });
    expect(consultarEstadoConexao).toHaveBeenCalledWith("b");
    expect(instancia().status_conexao).toBe("desconectado");
    expect(instancia().numero_recusado_em).toBeTruthy();
  });

  it("erro ao gravar a conexão não diz 'conectado' nem apaga a recusa", async () => {
    numeroDeOutraConta = false;
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      const update = q.update;
      q.update = (valores: unknown) => {
        if (valores && typeof valores === "object" && "status_conexao" in valores) {
          return { eq: async () => ({ data: null, error: { message: "canceling statement due to statement timeout" } }) } as never;
        }
        return update(valores);
      };
      return q;
    };
    const estado = await sincronizarConexaoInstancia({
      instanciaId: "inst-b",
      instanceName: "b",
      conectadoEmAtual: null,
      telefoneAtual: null,
    });
    banco.cliente.from = original;
    expect(estado.conectado).toBe(false);
    expect(estado.estado).toBe("indisponivel");
    expect(instancia().numero_recusado_em).toBeTruthy();
  });
});
