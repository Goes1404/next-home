// Banco local de teste, montado só a partir de supabase/migrations.
//
//   npm run db:teste         derruba o que houver, apaga o volume, sobe de novo
//                            e aplica TODAS as migrations num banco vazio
//   npm run db:teste:parar   derruba os containers E apaga o volume
//   npm run db:teste:remoto  aplica as migrations no projeto Supabase de
//                            testes (DB_TESTE_URL), com o mesmo CLI fixo;
//                            recusa produção e o banco local
//
// Subir sempre começa derrubando. Com os containers de pé, `supabase start`
// só responde "já está rodando" e devolve sucesso SEM aplicar nenhuma
// migration nova (0159+), e o DB_TESTE_URL impresso apontaria para um esquema
// velho, com o que mais tiver sido criado à mão nele. Conferido em 19/10: uma
// tabela criada com psql sobrevivia a um segundo `npm run db:teste`.
//
// Apagar o volume é de propósito: as 158+ migrations voltam a aplicar num
// banco vazio, que é exatamente o que este banco existe para provar (ver
// supabase/REPRODUCAO.md). Banco reaproveitado esconderia uma migration que
// deixou de aplicar. O custo é ~1 min por subida (as imagens ficam em cache).
//
// Nunca aponta para produção: `subir` e `parar` só falam com o Docker local,
// e a URL impressa é a do container (porta de config.toml). O `remoto` fala
// com a URL que recebe, e por isso passa antes por conferirBancoRemoto
// (bancoRemoto.mjs), que recusa o projeto de produção.
//
// A versão do CLI é fixa. `latest` mudaria o Postgres e os serviços por baixo
// dos testes sem nenhum commit dizer isso.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argumentosDoPushRemoto, conferirBancoRemoto } from "./bancoRemoto.mjs";

const CLI = "supabase@2.121.0";
const URL_DO_BANCO = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Fica de fora o que nenhum teste de banco usa. Auth (gotrue), storage-api,
// postgrest e kong ficam: as migrations escrevem em auth.* e storage.*, e os
// testes de isolamento entram pelo mesmo caminho que o app.
const FORA = [
  "realtime",
  "imgproxy",
  "mailpit",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
];

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function supabase(args) {
  // No Windows o npx é npx.cmd, e execFile/spawn sem shell não o acha
  // (o mesmo ENOENT da catraca de lint).
  const r = spawnSync("npx", ["--yes", CLI, ...args], {
    cwd: raiz,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

const comando = process.argv[2] ?? "subir";

if (comando === "subir") {
  // Sem containers, o stop só avisa que não havia nada e segue. Se ele falhar
  // de verdade (Docker parado), o start abaixo falha também e diz por quê.
  supabase(["stop", "--no-backup"]);
  const status = supabase(["start", "-x", FORA.join(",")]);
  if (status !== 0) {
    console.error(
      "\nO banco de teste não subiu. Se foi uma migration, o erro acima diz qual;" +
        " registre a correção em supabase/REPRODUCAO.md.",
    );
    process.exit(status);
  }
  console.log(`\nDB_TESTE_URL=${URL_DO_BANCO}`);
} else if (comando === "parar") {
  process.exit(supabase(["stop", "--no-backup"]));
} else if (comando === "remoto") {
  // A URL vem do ambiente, e não da linha de comando, para não ficar no
  // histórico do shell junto do nome do comando que escreve no banco.
  let url;
  try {
    url = conferirBancoRemoto(process.env.DB_TESTE_URL);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(2);
  }
  const status = supabase(argumentosDoPushRemoto(url));
  if (status !== 0) {
    console.error(
      "\nAs migrations não aplicaram no projeto de testes. O erro acima diz qual;" +
        " registre a correção em supabase/REPRODUCAO.md.",
    );
  }
  process.exit(status);
} else {
  console.error(`Comando desconhecido: ${comando}. Use "subir", "parar" ou "remoto".`);
  process.exit(2);
}
