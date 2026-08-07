/**
 * Tipos do schema Supabase.
 *
 * Escrito à mão a partir de `supabase/migrations/0001_init.sql` — o normal
 * seria gerar isto via `generate_typescript_types` contra o projeto real,
 * mas a conta conectada ao MCP aqui não tem acesso administrativo ao
 * projeto configurado em `.env.local`. Assim que houver acesso (service
 * role ou o projeto entrar na organização certa), regenerar e substituir
 * este arquivo por completo.
 */

export type StatusObra =
  | "breve_lancamento"
  | "pre_lancamento"
  | "lancamento"
  | "em_construcao"
  | "ultimas_unidades"
  | "pronto_para_morar";

export type TipoImovel = "apartamento" | "alto_padrao" | "casa" | "terreno";
export type FinalidadeImovel = "lancamento" | "venda";
export type TipoMidia = "foto" | "planta" | "video" | "tour360";

export type Database = {
  public: {
    Tables: {
      corretores: {
        Row: {
          id: string;
          nome: string;
          creci: string;
          whatsapp: string;
          email: string | null;
          foto_url: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["corretores"]["Row"]> & {
          nome: string;
          creci: string;
          whatsapp: string;
        };
        Update: Partial<Database["public"]["Tables"]["corretores"]["Row"]>;
      };
      empreendimentos: {
        Row: {
          id: string;
          slug: string;
          nome: string;
          tagline: string | null;
          descricao: string | null;
          status: StatusObra;
          tipo: TipoImovel;
          finalidade: FinalidadeImovel;
          cidade: string;
          bairro: string;
          endereco: string | null;
          lat: number | null;
          lng: number | null;
          preco_a_partir: number | null;
          iptu: number | null;
          condominio_valor: number | null;
          construtora: string | null;
          total_unidades: number | null;
          total_torres: number | null;
          total_andares: number | null;
          entrega_prevista: string | null;
          destaque: boolean;
          ordem: number;
          seo_titulo: string | null;
          seo_descricao: string | null;
          corretor_id: string | null;
          codigo_legado: string | null;
          publicado: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["empreendimentos"]["Row"]> & {
          slug: string;
          nome: string;
          cidade: string;
          bairro: string;
        };
        Update: Partial<Database["public"]["Tables"]["empreendimentos"]["Row"]>;
      };
      tipologias: {
        Row: {
          id: string;
          empreendimento_id: string;
          nome: string;
          area_privativa: number | null;
          dormitorios: number;
          suites: number;
          banheiros: number;
          vagas: number;
          preco: number | null;
          planta_url: string | null;
          ordem: number;
        };
        Insert: Partial<Database["public"]["Tables"]["tipologias"]["Row"]> & {
          empreendimento_id: string;
          nome: string;
        };
        Update: Partial<Database["public"]["Tables"]["tipologias"]["Row"]>;
      };
      midias: {
        Row: {
          id: string;
          empreendimento_id: string;
          tipo: TipoMidia;
          url: string;
          alt: string | null;
          largura: number | null;
          altura: number | null;
          blur_data_url: string | null;
          ordem: number;
        };
        Insert: Partial<Database["public"]["Tables"]["midias"]["Row"]> & {
          empreendimento_id: string;
          url: string;
        };
        Update: Partial<Database["public"]["Tables"]["midias"]["Row"]>;
      };
      lazer_itens: {
        Row: { id: string; nome: string; icone: string | null };
        Insert: Partial<Database["public"]["Tables"]["lazer_itens"]["Row"]> & { nome: string };
        Update: Partial<Database["public"]["Tables"]["lazer_itens"]["Row"]>;
      };
      empreendimento_lazer: {
        Row: { empreendimento_id: string; lazer_item_id: string };
        Insert: Database["public"]["Tables"]["empreendimento_lazer"]["Row"];
        Update: Partial<Database["public"]["Tables"]["empreendimento_lazer"]["Row"]>;
      };
      leads: {
        Row: {
          id: string;
          empreendimento_id: string | null;
          nome: string;
          email: string | null;
          telefone: string | null;
          mensagem: string | null;
          origem: string | null;
          consentimento_lgpd: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["leads"]["Row"]> & { nome: string };
        Update: Partial<Database["public"]["Tables"]["leads"]["Row"]>;
      };
    };
  };
};
