"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Campo de senha com o olho de mostrar/ocultar.
 *
 * ## Por que ele existe
 *
 * A senha do corretor é digitada no CELULAR, num teclado que não mostra o
 * que foi tocado, e muitas vezes é a senha provisória que o gestor mandou
 * por outro aplicativo (`nexthome` + quatro dígitos). Errar sem poder
 * conferir é o caminho curto para a pessoa desistir de entrar — ou pedir
 * uma senha nova que também não vai conseguir digitar.
 *
 * ## O que ele NÃO faz
 *
 * Não guarda estado entre montagens: nasce sempre oculto. Deixar a senha
 * revelada "de uma vez para sempre" transformaria um alívio de digitação
 * em senha à mostra na tela de quem estiver ao lado — e a tela do corretor
 * é aberta em corretor de imóveis, com gente em volta.
 *
 * ## Detalhes que custam tempo se descobertos depois
 *
 * - `type="button"`: sem isto o botão dentro do `<form>` é `submit` por
 *   padrão, e tocar no olho enviaria o formulário.
 * - `pr-14` no campo: o texto precisa parar antes do olho, senão a senha
 *   longa corre por baixo dele.
 * - O botão tem 48px de largura por toda a altura do campo — alvo de
 *   polegar, não um ícone de 16px.
 * - O Edge desenha um olho PRÓPRIO em `input[type=password]`
 *   (`::-ms-reveal`), e sem escondê-lo aparecem dois. A regra está no
 *   `globals.css`, junto dos outros ajustes de elemento.
 */
export function CampoSenha({
  id,
  name,
  autoComplete,
  required = false,
  minLength,
  className = "",
}: {
  id: string;
  name: string;
  /** `current-password` para entrar, `new-password` para trocar. */
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  /** As classes do campo na tela que o usa — a moldura não é decidida aqui. */
  className?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  // Um id próprio para o aviso: `aria-describedby` precisa apontar para um
  // elemento, e a tela que usa o componente não conhece este nó.
  const avisoId = useId();

  return (
    <span className="relative block">
      <input
        id={id}
        name={name}
        type={visivel ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-describedby={visivel ? avisoId : undefined}
        className={`${className} pr-14`}
      />

      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-pressed={visivel}
        aria-controls={id}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="text-apoio hover:text-titulo focus-visible:outline-acento-forte absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        {visivel ? (
          <EyeOff aria-hidden className="size-5" />
        ) : (
          <Eye aria-hidden className="size-5" />
        )}
      </button>

      {/* Só para leitor de tela: quem não vê a tela precisa saber que a
          senha deixou de estar oculta — é a informação que decide se dá
          para digitar ali naquele momento. */}
      <span id={avisoId} className="sr-only" role="status">
        {visivel ? "A senha está visível na tela." : ""}
      </span>
    </span>
  );
}
