import { lerEstadoDosPrimeirosPassos } from "@/lib/crm/estadoDosPrimeirosPassos";
import { inicioConcluido, passosDoInicio, progressoDoInicio } from "@/lib/crm/primeirosPassosDoInicio";
import { CartaoDosPrimeirosPassos } from "./CartaoDosPrimeirosPassos";

/**
 * Os primeiros passos do cliente novo, no TOPO do Início (29/10/2026;
 * nasceu em 26/09/2026 só com os passos do corretor). Fica até tudo estar
 * feito e então SOME — cartão que vive cheio de verde vira paisagem — ou até
 * a pessoa ocultar (no navegador dela). Cada passo diz por que importa e
 * leva à tela que o faz.
 *
 * Uma leva de contagens em paralelo (`lerEstadoDosPrimeirosPassos`), atrás
 * do próprio `<Suspense fallback={null}>` na página: o Início nunca espera.
 */
export async function PrimeirosPassos() {
  const estado = await lerEstadoDosPrimeirosPassos();
  if (!estado) return null;
  const passos = passosDoInicio(estado);
  if (passos.length === 0 || inicioConcluido(passos)) return null;
  return (
    <CartaoDosPrimeirosPassos
      corretorId={estado.corretorId}
      passos={passos}
      progresso={progressoDoInicio(passos)}
      ehGestor={estado.papel === "gestor"}
    />
  );
}
