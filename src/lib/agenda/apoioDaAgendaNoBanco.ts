// Apoio dos testes de banco da Agenda (0224, 0225…): lead, corretor e
// visitas escritos como a IA, o chat e o painel escrevem. Só para testes.

import type { Conexao } from "@/lib/grupos/apoioDoBanco";

export type Visita = {
  id: string;
  grupo_id: string;
  corretor_id: string;
  status: string;
  inicio: Date;
  fim: Date;
  datas_anteriores: Date[];
};

export async function novoCorretor(sql: Conexao, grupoId: string, slug: string): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.corretores (nome, creci, whatsapp, slug, papel, grupo_id)
    values (${`Terceiro ${slug}`}, ${`TESTE-${slug}`}, '5511900000001', ${slug}, 'corretor', ${grupoId})
    returning id
  `;
  return id;
}

export async function novoLead(sql: Conexao, corretorId: string, nome = "Cliente"): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.leads (nome, telefone, corretor_id)
    values (${nome}, '11988887777', ${corretorId}) returning id
  `;
  return id;
}

/** `horas` a partir da hora cheia de agora (o `now()` da transação). */
export async function daqui(sql: Conexao, horas: number): Promise<Date> {
  const [{ t }] = await sql<{ t: Date }[]>`
    select date_trunc('hour', now()) + make_interval(mins => ${Math.round(horas * 60)}) as t
  `;
  return t;
}

export async function marcar(sql: Conexao, leadId: string, quando: Date | null): Promise<void> {
  await sql`update public.leads set visita_agendada_em = ${quando} where id = ${leadId}`;
}

export async function visitasDo(sql: Conexao, leadId: string): Promise<Visita[]> {
  return sql<Visita[]>`
    select id, grupo_id, corretor_id, status, inicio, fim, datas_anteriores
      from public.visitas where lead_id = ${leadId} order by inicio, created_at
  `;
}
