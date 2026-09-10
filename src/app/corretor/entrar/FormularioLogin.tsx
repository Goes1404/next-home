"use client";

import { useActionState, useEffect, useRef } from "react";
import { entrar } from "@/app/corretor/actions";
import { CampoSenha } from "@/components/ui/CampoSenha";

// Campo alto e texto em tamanho de leitura: este formulário é digitado no
// celular, quase sempre com uma senha temporária vinda de outro aplicativo.
const CAMPO_BASE =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3.5 text-fluid-base text-titulo placeholder:text-tenue outline-none transition-colors focus:border-acento";

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

export function FormularioLogin() {
  const [estado, action, pendente] = useActionState(entrar, undefined);
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
    <form action={action} onSubmit={aoEnviar} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-fluid-sm mb-1.5 block text-corpo">
          E-mail
        </label>
        <input
          ref={email}
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={CAMPO_BASE}
        />
      </div>

      <div>
        <label htmlFor="senha" className="text-fluid-sm mb-1.5 block text-corpo">
          Senha
        </label>
        {/* Com o olho: quase sempre é a senha provisória do gestor, digitada
            num teclado de celular que não mostra o que foi tocado. */}
        <CampoSenha id="senha" name="senha" required autoComplete="current-password" className={CAMPO_BASE} />
      </div>

      {/*
        A caixa guarda o E-MAIL, e o texto diz isso — "lembrar de mim" sem
        dizer o quê é justamente o rótulo que faz alguém supor que a senha
        ficou salva em algum servidor nosso. Ela não fica: quem guarda senha
        é o gerenciador do próprio aparelho (o teclado do iPhone, o Chrome,
        o gerenciador do Android), convidado pelo `autoComplete` acima.

        `min-h-11` porque isto é tocado com o polegar: a caixinha tem 16px,
        mas a área que responde ao toque é a linha inteira.
      */}
      <label className="text-corpo flex min-h-11 cursor-pointer items-center gap-2.5 select-none">
        <input
          ref={lembrar}
          type="checkbox"
          name="lembrar"
          defaultChecked
          className="accent-acento size-4 shrink-0 cursor-pointer"
        />
        <span className="text-fluid-sm">Salvar meu e-mail neste aparelho</span>
      </label>
      <p className="text-fluid-xs text-tenue -mt-2">
        A senha nunca é salva por nós — quem oferece guardá-la é o seu próprio
        navegador ou celular.
      </p>

      {estado?.erro && <p className="text-fluid-sm text-perigo">{estado.erro}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base w-full rounded-full px-7 py-3.5 font-semibold transition-colors disabled:opacity-60"
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
