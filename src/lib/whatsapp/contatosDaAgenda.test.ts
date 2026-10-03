import { describe, expect, it } from "vitest";
import { itensDoEvento, lerContato, resumirEventoDeContato } from "./contatosDaAgenda";

// Formatos copiados do que a Evolution v2 monta (whatsapp.baileys.service.ts).
const daAgenda = [{ remoteJid: "5511987654321@s.whatsapp.net", pushName: "Ana Cliente Barueri", profilePicUrl: null, instanceId: "x" }];
const doPerfilNaMensagem = { remoteJid: "5511987654321@s.whatsapp.net", pushName: "Aninha 🌸", profilePicUrl: "https://pps", instanceId: "x" };
const semNome = [{ remoteJid: "5511912345678@s.whatsapp.net", pushName: "5511912345678", profilePicUrl: null, instanceId: "x" }];

describe("eventos de contato da Evolution", () => {
  it("aceita lista (agenda) e objeto solto (mensagem)", () => {
    expect(itensDoEvento(daAgenda)).toHaveLength(1);
    expect(itensDoEvento(doPerfilNaMensagem)).toHaveLength(1);
    expect(itensDoEvento(undefined)).toHaveLength(0);
  });

  it("número no lugar do nome não conta como nome", () => {
    expect(lerContato(semNome[0]).temNome).toBe(false);
    expect(lerContato(daAgenda[0]).temNome).toBe(true);
  });

  it("separa jid de pessoa de jid @lid, que não traz o telefone", () => {
    expect(lerContato({ remoteJid: "123456789012345@lid", pushName: "Ana" }).tipoJid).toBe("lid");
    expect(lerContato(daAgenda[0]).tipoJid).toBe("pessoa");
  });

  it("nome da agenda diferente do perfil é o sinal de que a agenda chega", () => {
    const perfis = new Map([["5511987654321", "Aninha 🌸"]]);
    expect(resumirEventoDeContato(itensDoEvento(daAgenda), perfis)).toMatchObject({ comConversa: 1, diferenteDoPerfil: 1, igualAoPerfil: 0 });
    // O evento que vem junto de toda mensagem repete o perfil: não engana.
    expect(resumirEventoDeContato(itensDoEvento(doPerfilNaMensagem), perfis)).toMatchObject({ comConversa: 1, diferenteDoPerfil: 0, igualAoPerfil: 1 });
  });

  it("contato da agenda pessoal sem conversa não é comparado", () => {
    expect(resumirEventoDeContato(itensDoEvento(daAgenda), new Map())).toMatchObject({ comNome: 1, comConversa: 0 });
  });
});
