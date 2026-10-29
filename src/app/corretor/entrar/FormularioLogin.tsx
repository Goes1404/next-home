"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { entrar } from "@/app/corretor/actions";
import { BotaoDeAcesso, CampoDeAcesso, CLASSE_DO_FORMULARIO, ErroDeAcesso } from "../CampoDeAcesso";

// Os campos (rótulo flutuante, ícone, olho da senha) e o botão são os das
// quatro telas de acesso: `CampoDeAcesso.tsx`.

/**
 * Onde o e-mail fica guardado, e o que cada valor significa:
 *
 * - ausente  → nunca decidiu; a caixa nasce marcada (a convenção do "lembrar
 *   de mim"), e o e-mail passa a ser guardado no primeiro login.
 * - `""`     → decidiu que NÃO; a caixa nasce desmarcada nas próximas vezes.
 * - e-mail   → decidiu que sim; o campo já vem preenchido.
 *
 * Três estados numa chave só porque a alternativa (uma chave para o valor e
 * outra para a preferência) permite que as duas divirjam — e aí a tela
 * mostraria uma coisa e o aparelho guardaria outra.
 */
const CHAVE_EMAIL = "nh-corretor-email";

/**
 * `next` é para onde voltar depois de entrar (o proxy o manda quando alguém
 * abre `/plataforma` sem sessão). Vai num campo oculto e a action confere
 * com `destinoSeguro`: aqui ele é só repassado, nunca confiado.
 */
export function FormularioLogin({ next }: { next?: string }) {
  const [estado, action] = useActionState(entrar, undefined);
  const email = useRef<HTMLInputElement>(null);
  const lembrar = useRef<HTMLInputElement>(null);

  /*
   * Lido no efeito e escrito direto no DOM, não em estado do React: os dois
   * campos são não-controlados (é o FormData que a Server Action recebe), e
   * ler `localStorage` durante a renderização daria divergência de
   * hidratação — o servidor não tem como saber o que este aparelho guardou.
   *
   * `try/catch` porque o acessador em si LANÇA em algumas situações (janela
   * anônima, site com dados bloqueados, captura de miniatura). Sem chave
   * guardada, a tela funciona exatamente como antes.
   */
  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(CHAVE_EMAIL);
    } catch {
      return;
    }
    if (salvo === null) return;

    if (salvo === "") {
      if (lembrar.current) lembrar.current.checked = false;
      return;
    }
    if (email.current) email.current.value = salvo;
  }, []);

  /*
   * Grava no ENVIO, que é o momento em que a pessoa escolheu este e-mail —
   * e é a última chance de rodar código aqui, porque a ação termina em
   * `redirect` e este componente nunca volta a montar.
   *
   * A ação continua: nada é impedido, só gravamos antes.
   */
  const aoEnviar = () => {
    const marcado = lembrar.current?.checked ?? false;
    const valor = email.current?.value.trim() ?? "";
    try {
      // Marcado e sem e-mail não decide nada: gravar `""` seria registrar
      // uma recusa que ninguém fez.
      if (marcado && !valor) return;
      localStorage.setItem(CHAVE_EMAIL, marcado ? valor : "");
    } catch {
      // Aparelho que não guarda nada apenas não lembra. Não é erro de login.
    }
  };

  return (
    <form action={action} onSubmit={aoEnviar} className={CLASSE_DO_FORMULARIO}>
      {next && <input type="hidden" name="next" value={next} />}
      {/* E-mail ou nome de usuário (29/10/2026). `name="email"` fica: é o que o
          gerenciador de senhas do aparelho já guardou para este site. */}
      <CampoDeAcesso
        ref={email}
        id="email"
        name="email"
        rotulo="Usuário ou e-mail"
        tipo="login"
        autoComplete="username"
      />
      <CampoDeAcesso id="senha" name="senha" rotulo="Senha" tipo="senha" autoComplete="current-password" />

      {/*
        29/10/2026 ("o campo de entrar está muito grande"): "lembrar" e
        "Esqueci a senha" dividem UMA linha, e o rótulo encurtou para
        "Lembrar e-mail" — continua dizendo O QUE fica guardado (o e-mail;
        a senha, quem guarda é o gerenciador do aparelho, convidado pelo
        `autoComplete`). `min-h-10`: a linha inteira é alvo de polegar.
      */}
      <div className="text-fluid-sm flex min-h-10 items-center justify-between gap-3">
        <label className="text-corpo flex min-h-10 cursor-pointer items-center gap-2 select-none">
          <input
            ref={lembrar}
            type="checkbox"
            name="lembrar"
            defaultChecked
            className="accent-acento size-4 shrink-0 cursor-pointer"
          />
          Lembrar e-mail
        </label>
        <Link
          href="/corretor/esqueci-a-senha"
          className="text-acento hover:text-acento-hover flex min-h-10 items-center font-medium"
        >
          Esqueci a senha
        </Link>
      </div>

      {estado?.erro && <ErroDeAcesso>{estado.erro}</ErroDeAcesso>}

      <BotaoDeAcesso enviando="Entrando…">Entrar</BotaoDeAcesso>
    </form>
  );
}
