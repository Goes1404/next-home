// Banco local de teste, montado só a partir de supabase/migrations.
//
//   npm run db:teste         sobe o Postgres local e aplica as migrations do zero
//   npm run db:teste:parar   derruba os containers E apaga o volume
//
// Derrubar apaga o volume de propósito: a próxima subida volta a aplicar as
// 158+ migrations num banco vazio, que é exatamente o que este banco existe
// para provar (ver supabase/REPRODUCAO.md). Banco reaproveitado esconderia uma
// migration que deixou de aplicar.
//
// Nunca aponta para produção: o CLI só fala com o Docker local, e a URL
// impressa é a do container (porta de config.toml).
//
// A versão do CLI é fixa. `latest` mudaria o Postgres e os serviços por baixo
// dos testes sem nenhum commit dizer isso.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
} else {
  console.error(`Comando desconhecido: ${comando}. Use "subir" ou "parar".`);
  process.exit(2);
}
