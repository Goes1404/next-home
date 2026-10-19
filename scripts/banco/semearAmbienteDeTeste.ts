/**
 * Dados sintéticos de DOIS grupos no projeto Supabase de testes.
 *
 *   DB_TESTE_URL="<connection string do projeto de TESTE>" \
 *     npx tsx scripts/banco/semearAmbienteDeTeste.ts
 *
 * Roda uma vez, depois de as migrations terem sido aplicadas do zero
 * (docs/AMBIENTE-DE-TESTES.md). Cria os grupos `teste-a` e `teste-b`, cada um
 * com um gestor e um corretor com login, pelo mesmo `criarGrupo` da suíte de
 * isolamento — os dados do E2E têm a mesma forma dos dados que o isolamento
 * prova. Tudo numa transação: se algo falha, nada fica pela metade. Rodar de
 * novo falha no slug repetido, em voz alta.
 *
 * `criarGrupo` grava a senha fixa da suíte local, que aqui não serve: o
 * ambiente de testes fica no ar, e qualquer um que conhecesse o código
 * entraria nele. Cada login ganha uma senha aleatória, impressa uma vez.
 * A do corretor do grupo A vai para os segredos do E2E.
 *
 * `conectar` recusa a URL de produção.
 */
import { randomBytes } from "node:crypto";
import { conectar, criarGrupo } from "../../src/lib/grupos/apoioDoBanco";

async function main() {
  const sql = conectar();
  try {
    const logins = await sql.begin(async (tx) => {
      const a = await criarGrupo(tx, { nome: "Grupo A (teste)", slug: "teste-a" });
      const b = await criarGrupo(tx, { nome: "Grupo B (teste)", slug: "teste-b" });
      const pessoas = [
        { email: "corretor@teste-a.teste", userId: a.corretorUserId },
        { email: "gestor@teste-a.teste", userId: a.gestorUserId },
        { email: "corretor@teste-b.teste", userId: b.corretorUserId },
        { email: "gestor@teste-b.teste", userId: b.gestorUserId },
      ];
      const saida: { email: string; senha: string }[] = [];
      for (const { email, userId } of pessoas) {
        const senha = randomBytes(18).toString("base64url");
        await tx`
          update auth.users
          set encrypted_password = extensions.crypt(${senha}, extensions.gen_salt('bf', 10))
          where id = ${userId}
        `;
        saida.push({ email, senha });
      }
      return saida;
    });

    console.log("Grupos teste-a e teste-b criados. Logins (guarde agora, não são mostrados de novo):");
    for (const { email, senha } of logins) console.log(`  ${email}  ${senha}`);
    console.log("\nSegredos do E2E: E2E_TESTE_EMAIL=corretor@teste-a.teste e E2E_TESTE_SENHA=<a senha dele>.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
