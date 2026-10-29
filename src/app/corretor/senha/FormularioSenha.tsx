"use client";

import { useActionState } from "react";
import { trocarSenha } from "@/app/corretor/actions";
import { BotaoDeAcesso, CampoDeAcesso, ChecklistDaSenha, CLASSE_DO_FORMULARIO, ErroDeAcesso } from "../CampoDeAcesso";

/** Troca de senha de quem já entrou. Campos e botão: `CampoDeAcesso.tsx`. */
export function FormularioSenha() {
  const [estado, action] = useActionState(trocarSenha, undefined);

  return (
    <form action={action} className={CLASSE_DO_FORMULARIO}>
      <CampoDeAcesso id="atual" name="atual" rotulo="Senha atual" tipo="senha" autoComplete="current-password" />
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
        rotulo="Repita a nova senha"
        tipo="senha"
        minLength={8}
        autoComplete="new-password"
      />

      {estado?.erro && <ErroDeAcesso>{estado.erro}</ErroDeAcesso>}
      {estado?.ok && (
        <p role="status" className="text-fluid-sm text-acento">
          {estado.ok}
        </p>
      )}

      <BotaoDeAcesso enviando="Alterando…">Alterar senha</BotaoDeAcesso>
    </form>
  );
}
