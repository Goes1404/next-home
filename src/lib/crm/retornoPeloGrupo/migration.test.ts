import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function ler(arquivo: string): string {
  return readFileSync(join(process.cwd(), "supabase", "migrations", arquivo), "utf8");
}

const sql = ler("0218_retorno_da_ligacao_pelo_grupo.sql");

describe("migration 0218: retorno da ligação pelo grupo", () => {
  it("o corretor ganha o lid, único por grupo quando preenchido", () => {
    expect(sql).toMatch(/add column if not exists whatsapp_lid text/);
    expect(sql).toMatch(
      /create unique index if not exists \w+\s+on public\.corretores \(grupo_id, whatsapp_lid\)\s+where whatsapp_lid is not null/,
    );
  });

  it("lead_envios_grupo ganha tentativas, retorno e último aviso", () => {
    expect(sql).toMatch(/tentativas_ligacao integer not null default 0/);
    expect(sql).toMatch(/retorno_em timestamptz/);
    expect(sql).toMatch(/ultima_mensagem_avisada_em timestamptz/);
  });

  it("retornos_de_ligacao: colunas, checks e idempotência por mensagem", () => {
    expect(sql).toMatch(/create table if not exists public\.retornos_de_ligacao/);
    expect(sql).toMatch(/mensagem_id\s+text not null/);
    expect(sql).toMatch(/unique \(grupo_id, mensagem_id\)/);
    expect(sql).toMatch(
      /resultado\s+text check \(resultado in \('atendeu', 'nao_atendeu', 'numero_errado', 'pediu_retorno'\)\)/,
    );
    expect(sql).toMatch(
      /status\s+text not null check \(status in \('aplicado', 'aguardando_escolha', 'sem_leitura', 'falhou'\)\)/,
    );
    expect(sql).not.toMatch(/status\s+text[^,]*default 'aplicado'/);
    expect(sql).toMatch(/opcoes\s+uuid\[\] not null default '\{\}'/);
    expect(sql).toMatch(/corrige_id\s+uuid references public\.retornos_de_ligacao\(id\)/);
    expect(sql).toMatch(/envio_id\s+uuid references public\.lead_envios_grupo\(id\)/);
    expect(sql).toMatch(/leitura\s+jsonb/);
    expect(sql).toMatch(/audio_path\s+text/);
  });

  it("listas_de_retorno_enviadas: uma por gestor e dia", () => {
    expect(sql).toMatch(/create table if not exists public\.listas_de_retorno_enviadas/);
    expect(sql).toMatch(/unique \(gestor_id, dia\)/);
    expect(sql).toMatch(/gestor_id\s+uuid not null references public\.corretores\(id\)/);
  });

  for (const tabela of ["retornos_de_ligacao", "listas_de_retorno_enviadas"]) {
    it(`${tabela}: bloco de segurança do grupo`, () => {
      expect(sql).toContain(`alter table public.${tabela} enable row level security`);
      expect(sql).toContain(`revoke all on public.${tabela} from anon`);
      expect(sql).toContain(`revoke all on public.${tabela} from authenticated`);
      expect(sql).toMatch(
        new RegExp(`create policy isolamento_por_grupo on public\\.${tabela} as restrictive for all to authenticated`),
      );
      expect(sql).toMatch(new RegExp(`create trigger ${tabela}_00_grupo`));
      expect(sql).toMatch(new RegExp(`create trigger ${tabela}_zz_grupo_update`));
      expect(sql).toMatch(new RegExp(`create trigger ${tabela}_zz_grupo_insert`));
      expect(sql).not.toMatch(new RegExp(`grant [a-z, ]+ on public\\.${tabela} to (anon|authenticated)`));
    });
  }

  it("o carimbo e a conferência final usam as mesmas mães", () => {
    const maes = (nome: string) => {
      const achou = sql.match(
        new RegExp(`${nome}[\\s\\S]*?execute function public\\.(?:carimbar_grupo|conferir_grupo_final)\\(([^)]*)\\)`),
      );
      return achou?.[1].replace(/\s+/g, " ").trim();
    };
    const carimbo = maes("create trigger retornos_de_ligacao_00_grupo");
    expect(carimbo).toBeTruthy();
    expect(maes("create trigger retornos_de_ligacao_zz_grupo_insert")).toBe(carimbo);
    expect(maes("create trigger retornos_de_ligacao_zz_grupo_update")).toBe(carimbo);
    // Toda FK para tabela com grupo entra no carimbo (convenção da 0191),
    // inclusive a que aponta para a própria tabela.
    for (const mae of [
      "'lead_id', 'leads', 'id'",
      "'corretor_id', 'corretores', 'id'",
      "'envio_id', 'lead_envios_grupo', 'id'",
      "'corrige_id', 'retornos_de_ligacao', 'id'",
    ]) {
      expect(carimbo).toContain(mae);
    }
    expect(sql).toMatch(
      /before insert or update of grupo_id, lead_id, corretor_id, envio_id, corrige_id on public\.retornos_de_ligacao/,
    );
    expect(sql).toMatch(/new\.corrige_id is distinct from old\.corrige_id/);
    const carimboListas = maes("create trigger listas_de_retorno_enviadas_00_grupo");
    expect(carimboListas).toBeTruthy();
    expect(maes("create trigger listas_de_retorno_enviadas_zz_grupo_insert")).toBe(carimboListas);
    expect(maes("create trigger listas_de_retorno_enviadas_zz_grupo_update")).toBe(carimboListas);
  });

  it("bucket privado, sem policy de storage para anon/authenticated", () => {
    expect(sql).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s+values \('retornos-de-ligacao', 'retornos-de-ligacao', false\)\s+on conflict \(id\) do nothing/,
    );
    expect(sql).not.toMatch(/on storage\.objects/);
  });

  it("ia_interacoes aceita a origem do retorno sem perder as que já existiam (0169)", () => {
    const achou = sql.match(/add constraint ia_interacoes_origem_check\s+check \(origem = any \(array\[([^\]]*)\]\)\)/);
    expect(achou).toBeTruthy();
    const origens = [...achou![1].matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(origens).toEqual([
      "webhook",
      "playground",
      "followup",
      "eval",
      "painel",
      "consultor",
      "financeiro",
      "retorno_ligacao",
    ]);
    expect(sql).toMatch(/alter table public\.ia_interacoes drop constraint if exists ia_interacoes_origem_check/);
  });

  it("tentativa de ligação somada no banco, com o grupo no filtro e só para a chave de serviço", () => {
    const corpo = sql.match(
      /create or replace function public\.somar_tentativa_de_ligacao\(p_envio uuid, p_grupo uuid, p_delta integer\)([\s\S]*?)\$\$;/,
    )?.[1];
    expect(corpo).toBeTruthy();
    expect(corpo).toMatch(/security definer/);
    expect(corpo).toMatch(/set search_path = ''/);
    expect(corpo).toMatch(/tentativas_ligacao = greatest\(0, tentativas_ligacao \+ p_delta\)/);
    expect(corpo).toMatch(/and grupo_id = p_grupo/);
    expect(corpo).toMatch(/p_delta between -1 and 1/);
    expect(sql).toMatch(
      /revoke all on function public\.somar_tentativa_de_ligacao\(uuid, uuid, integer\) from public, anon, authenticated;/,
    );
    expect(sql).toMatch(/grant execute on function public\.somar_tentativa_de_ligacao\(uuid, uuid, integer\) to service_role;/);
  });

  it("é aditiva: nada de drop table nem de apagar coluna", () => {
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/drop column/i);
  });
});
