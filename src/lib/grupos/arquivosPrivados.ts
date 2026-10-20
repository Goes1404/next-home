/**
 * Apagar pastas inteiras de um bucket do Storage (0202): a pasta do lead em
 * `documentos-clientes/<lead>/` no pedido do titular, e as pastas privadas do
 * grupo na rotina dos 90 dias.
 *
 * Recebe o `storage.from(bucket)` pronto: quem chama decide o bucket e já
 * conferiu que a pasta é de quem pode apagá-la. Nada aqui lê o banco.
 *
 * A listagem do Storage devolve no máximo `limit` itens por chamada. Sem
 * paginar, uma pasta com mais de 1000 arquivos (mídia recebida no WhatsApp)
 * ficaria pela metade e a ação diria "apagado"; o que sobrasse viraria órfão,
 * sem mais como saber de quem era.
 */

export type ItemDoStorage = { name: string; id: string | null };

export type BucketDoStorage = {
  list: (
    pasta: string,
    opcoes?: { limit?: number; offset?: number },
  ) => PromiseLike<{ data: ItemDoStorage[] | null; error: { message: string } | null }>;
  remove: (caminhos: string[]) => PromiseLike<{ error: { message: string } | null }>;
};

/** Itens por página da listagem (o teto do Storage é 1000). */
export const PAGINA_DO_STORAGE = 1000;

/** Todos os itens diretos de `pasta`, página a página. */
export async function itensDaPasta(storage: BucketDoStorage, pasta: string): Promise<ItemDoStorage[]> {
  const saida: ItemDoStorage[] = [];
  for (let offset = 0; ; offset += PAGINA_DO_STORAGE) {
    const { data, error } = await storage.list(pasta, { limit: PAGINA_DO_STORAGE, offset });
    if (error) throw new Error(error.message);
    const pagina = data ?? [];
    saida.push(...pagina);
    if (pagina.length < PAGINA_DO_STORAGE) return saida;
  }
}

/** Todos os arquivos sob `pasta`, descendo até 3 níveis (lead/whatsapp/…, lead/<token>/…). */
export async function arquivosDaPasta(storage: BucketDoStorage, pasta: string, nivel = 0): Promise<string[]> {
  const saida: string[] = [];
  for (const item of await itensDaPasta(storage, pasta)) {
    const caminho = pasta ? `${pasta}/${item.name}` : item.name;
    // No Storage, pasta é o item sem id.
    if (item.id === null) {
      if (nivel < 3) saida.push(...(await arquivosDaPasta(storage, caminho, nivel + 1)));
    } else saida.push(caminho);
  }
  return saida;
}

/** Apaga todos os arquivos sob `pasta`, de 100 em 100. Devolve quantos saíram. */
export async function apagarPasta(storage: BucketDoStorage, pasta: string): Promise<number> {
  const arquivos = await arquivosDaPasta(storage, pasta);
  for (let i = 0; i < arquivos.length; i += 100) {
    const { error } = await storage.remove(arquivos.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  return arquivos.length;
}

/** Os nomes das pastas na raiz do bucket (os `<lead>` de `documentos-clientes`). */
export async function pastasDaRaiz(storage: BucketDoStorage): Promise<Set<string>> {
  const itens = await itensDaPasta(storage, "");
  return new Set(itens.filter((i) => i.id === null).map((i) => i.name));
}
