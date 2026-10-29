"use client";

import { useActionState } from "react";
import { BotaoDeAcesso, CampoDeAcesso, ChecklistDaSenha, CLASSE_DO_FORMULARIO, ErroDeAcesso } from "../CampoDeAcesso";
import { definirSenha } from "./acoes";

/**
 * Sem campo de senha atual: quem chega pelo convite nunca teve uma, e quem
 * esqueceu não sabe qual é. Com o olho nos dois campos — a senha é digitada
 * no celular, que não mostra o que foi tocado. Campos e botão das telas de
 * acesso: `CampoDeAcesso.tsx`.
 */
export function FormularioDefinirSenha() {
  const [estado, action] = useActionState(definirSenha, undefined);

  return (
    <form action={action} className={CLASSE_DO_FORMULARIO}>
      <CampoDeAcesso
        id="nova"
        name="nova"
        rotulo="Nova senha"
        tipo="senha"
        minLength={8}
        autoComplete="new-password"
      />
      <ChecklistDaSenha campoId="nova" />
      <CampoDeAcesso
        id="confirmacao"
        name="confirmacao"
        rotulo="Repita a senha"
        tipo="senha"
        minLength={8}
        autoComplete="new-password"
      />

      {estado?.erro && <ErroDeAcesso>{estado.erro}</ErroDeAcesso>}

      <BotaoDeAcesso enviando="Salvando…">Salvar senha e entrar</BotaoDeAcesso>
    </form>
  );
}
