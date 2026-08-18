/**
 * Tipos gerados a partir do projeto Supabase real (prhhrqyubjcafvucirri) via
 * Management API — `types/typescript`. Não editar à mão; regenerar sempre
 * que `supabase/migrations/` mudar. Última geração: depois da 0009
 * (aplicada manualmente à conexão direta com Postgres — `gen types` local
 * exige Docker, indisponível neste ambiente; colunas conferidas por
 * introspecção antes de editar este arquivo).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      corretores: {
        Row: {
          ativo: boolean
          bio: string | null
          created_at: string
          creci: string
          em_pausa: boolean
          email: string | null
          foto_url: string | null
          id: string
          nome: string
          papel: string
          regioes: string[] | null
          slug: string | null
          user_id: string | null
          whatsapp: string
          video_url: string | null
        }
        Insert: {
          ativo?: boolean
          bio?: string | null
          created_at?: string
          creci: string
          em_pausa?: boolean
          email?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          papel?: string
          regioes?: string[] | null
          slug?: string | null
          user_id?: string | null
          whatsapp: string
          video_url?: string | null
        }
        Update: {
          ativo?: boolean
          bio?: string | null
          created_at?: string
          creci?: string
          em_pausa?: boolean
          email?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          papel?: string
          regioes?: string[] | null
          slug?: string | null
          user_id?: string | null
          whatsapp?: string
          video_url?: string | null
        }
        Relationships: []
      }
      empreendimento_lazer: {
        Row: {
          empreendimento_id: string
          lazer_item_id: string
        }
        Insert: {
          empreendimento_id: string
          lazer_item_id: string
        }
        Update: {
          empreendimento_id?: string
          lazer_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empreendimento_lazer_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empreendimento_lazer_lazer_item_id_fkey"
            columns: ["lazer_item_id"]
            isOneToOne: false
            referencedRelation: "lazer_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      empreendimentos: {
        Row: {
          bairro: string
          cidade: string
          codigo_legado: string | null
          condominio_valor: number | null
          construtora: string | null
          corretor_id: string | null
          created_at: string
          descricao: string | null
          destaque: boolean
          endereco: string | null
          entrega_prevista: string | null
          finalidade: Database["public"]["Enums"]["finalidade_imovel"]
          id: string
          iptu: number | null
          lat: number | null
          lng: number | null
          nome: string
          ordem: number
          preco_a_partir: number | null
          publicado: boolean
          seo_descricao: string | null
          seo_titulo: string | null
          slug: string
          status: Database["public"]["Enums"]["status_obra"]
          tagline: string | null
          tipo: Database["public"]["Enums"]["tipo_imovel"]
          total_andares: number | null
          total_torres: number | null
          total_unidades: number | null
          updated_at: string
        }
        Insert: {
          bairro: string
          cidade: string
          codigo_legado?: string | null
          condominio_valor?: number | null
          construtora?: string | null
          corretor_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          endereco?: string | null
          entrega_prevista?: string | null
          finalidade?: Database["public"]["Enums"]["finalidade_imovel"]
          id?: string
          iptu?: number | null
          lat?: number | null
          lng?: number | null
          nome: string
          ordem?: number
          preco_a_partir?: number | null
          publicado?: boolean
          seo_descricao?: string | null
          seo_titulo?: string | null
          slug: string
          status?: Database["public"]["Enums"]["status_obra"]
          tagline?: string | null
          tipo?: Database["public"]["Enums"]["tipo_imovel"]
          total_andares?: number | null
          total_torres?: number | null
          total_unidades?: number | null
          updated_at?: string
        }
        Update: {
          bairro?: string
          cidade?: string
          codigo_legado?: string | null
          condominio_valor?: number | null
          construtora?: string | null
          corretor_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          endereco?: string | null
          entrega_prevista?: string | null
          finalidade?: Database["public"]["Enums"]["finalidade_imovel"]
          id?: string
          iptu?: number | null
          lat?: number | null
          lng?: number | null
          nome?: string
          ordem?: number
          preco_a_partir?: number | null
          publicado?: boolean
          seo_descricao?: string | null
          seo_titulo?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["status_obra"]
          tagline?: string | null
          tipo?: Database["public"]["Enums"]["tipo_imovel"]
          total_andares?: number | null
          total_torres?: number | null
          total_unidades?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empreendimentos_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      lazer_itens: {
        Row: {
          icone: string | null
          id: string
          nome: string
        }
        Insert: {
          icone?: string | null
          id?: string
          nome: string
        }
        Update: {
          icone?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          anuncio_origem: string | null
          consentimento_lgpd: boolean
          corretor_id: string | null
          created_at: string
          detalhes: Json | null
          email: string | null
          empreendimento_id: string | null
          etapa: string
          etapa_alterada_em: string
          id: string
          meta_lead_id: string | null
          mensagem: string | null
          nome: string
          origem: string | null
          origem_atribuicao: string | null
          telefone: string | null
          tipo: string
          visita_agendada_em: string | null
        }
        Insert: {
          anuncio_origem?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json | null
          email?: string | null
          empreendimento_id?: string | null
          etapa?: string
          etapa_alterada_em?: string
          id?: string
          meta_lead_id?: string | null
          mensagem?: string | null
          nome: string
          origem?: string | null
          origem_atribuicao?: string | null
          telefone?: string | null
          tipo?: string
          visita_agendada_em?: string | null
        }
        Update: {
          anuncio_origem?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json | null
          email?: string | null
          empreendimento_id?: string | null
          etapa?: string
          etapa_alterada_em?: string
          id?: string
          meta_lead_id?: string | null
          mensagem?: string | null
          nome?: string
          origem?: string | null
          origem_atribuicao?: string | null
          telefone?: string | null
          tipo?: string
          visita_agendada_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      midias: {
        Row: {
          alt: string | null
          altura: number | null
          blur_data_url: string | null
          empreendimento_id: string
          id: string
          largura: number | null
          ordem: number
          tipo: Database["public"]["Enums"]["tipo_midia"]
          url: string
        }
        Insert: {
          alt?: string | null
          altura?: number | null
          blur_data_url?: string | null
          empreendimento_id: string
          id?: string
          largura?: number | null
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_midia"]
          url: string
        }
        Update: {
          alt?: string | null
          altura?: number | null
          blur_data_url?: string | null
          empreendimento_id?: string
          id?: string
          largura?: number | null
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_midia"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "midias_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipologias: {
        Row: {
          area_privativa: number | null
          banheiros: number
          dormitorios: number
          empreendimento_id: string
          id: string
          nome: string
          ordem: number
          planta_url: string | null
          preco: number | null
          suites: number
          unidades_disponiveis: number | null
          vagas: number
        }
        Insert: {
          area_privativa?: number | null
          banheiros?: number
          dormitorios?: number
          empreendimento_id: string
          id?: string
          nome: string
          ordem?: number
          planta_url?: string | null
          preco?: number | null
          suites?: number
          unidades_disponiveis?: number | null
          vagas?: number
        }
        Update: {
          area_privativa?: number | null
          banheiros?: number
          dormitorios?: number
          empreendimento_id?: string
          id?: string
          nome?: string
          ordem?: number
          planta_url?: string | null
          preco?: number | null
          suites?: number
          unidades_disponiveis?: number | null
          vagas?: number
        }
        Relationships: [
          {
            foreignKeyName: "tipologias_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      corretor_atual: { Args: never; Returns: string }
      eh_gestor: { Args: never; Returns: boolean }
    }
    Enums: {
      finalidade_imovel: "lancamento" | "venda"
      status_obra:
        | "breve_lancamento"
        | "pre_lancamento"
        | "lancamento"
        | "em_construcao"
        | "ultimas_unidades"
        | "pronto_para_morar"
      tipo_imovel: "apartamento" | "alto_padrao" | "casa" | "terreno"
      tipo_midia: "foto" | "planta" | "video" | "tour360"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      finalidade_imovel: ["lancamento", "venda"],
      status_obra: [
        "breve_lancamento",
        "pre_lancamento",
        "lancamento",
        "em_construcao",
        "ultimas_unidades",
        "pronto_para_morar",
      ],
      tipo_imovel: ["apartamento", "alto_padrao", "casa", "terreno"],
      tipo_midia: ["foto", "planta", "video", "tour360"],
    },
  },
} as const

