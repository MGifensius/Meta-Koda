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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          ends_at: string
          id: string
          internal_notes: string | null
          organization_id: string
          party_size: number
          seated_at: string | null
          source: Database["public"]["Enums"]["booking_source"]
          special_request: string | null
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          table_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          ends_at: string
          id?: string
          internal_notes?: string | null
          organization_id: string
          party_size: number
          seated_at?: string | null
          source: Database["public"]["Enums"]["booking_source"]
          special_request?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          table_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          ends_at?: string
          id?: string
          internal_notes?: string | null
          organization_id?: string
          party_size?: number
          seated_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          special_request?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          note: string
          organization_id: string
          source: string
          source_conversation_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          note: string
          organization_id: string
          source: string
          source_conversation_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          note?: string
          organization_id?: string
          source?: string
          source_conversation_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "koda_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          birth_date: string | null
          created_at: string
          created_by: string | null
          current_tier_id: string | null
          display_id: string
          email: string | null
          full_name: string
          id: string
          is_member: boolean
          member_since: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          points_balance: number
          points_lifetime: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          current_tier_id?: string | null
          display_id: string
          email?: string | null
          full_name: string
          id?: string
          is_member?: boolean
          member_since?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          points_balance?: number
          points_lifetime?: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          current_tier_id?: string | null
          display_id?: string
          email?: string | null
          full_name?: string
          id?: string
          is_member?: boolean
          member_since?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          points_balance?: number
          points_lifetime?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_current_tier_id_fkey"
            columns: ["current_tier_id"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      koda_conversations: {
        Row: {
          channel: string
          created_at: string
          customer_id: string | null
          escalated_reason: string | null
          id: string
          last_message_at: string
          organization_id: string
          status: string
          taken_over_at: string | null
          taken_over_by: string | null
          total_input_tokens: number
          total_output_tokens: number
          total_tool_calls: number
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          customer_id?: string | null
          escalated_reason?: string | null
          id?: string
          last_message_at?: string
          organization_id: string
          status?: string
          taken_over_at?: string | null
          taken_over_by?: string | null
          total_input_tokens?: number
          total_output_tokens?: number
          total_tool_calls?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          escalated_reason?: string | null
          id?: string
          last_message_at?: string
          organization_id?: string
          status?: string
          taken_over_at?: string | null
          taken_over_by?: string | null
          total_input_tokens?: number
          total_output_tokens?: number
          total_tool_calls?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "koda_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "koda_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "koda_conversations_taken_over_by_fkey"
            columns: ["taken_over_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      koda_faq: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "koda_faq_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      koda_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          role: string
          staff_id: string | null
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          role: string
          staff_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string
          staff_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "koda_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "koda_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "koda_messages_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      koda_specials: {
        Row: {
          created_at: string
          description: string | null
          ends_on: string | null
          id: string
          is_active: boolean
          organization_id: string
          starts_on: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          starts_on?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          starts_on?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "koda_specials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_adjustments: {
        Row: {
          affects_lifetime: boolean
          created_at: string
          created_by: string | null
          customer_id: string
          delta_points: number
          id: string
          organization_id: string
          reason: string
        }
        Insert: {
          affects_lifetime?: boolean
          created_at?: string
          created_by?: string | null
          customer_id: string
          delta_points: number
          id?: string
          organization_id: string
          reason: string
        }
        Update: {
          affects_lifetime?: boolean
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delta_points?: number
          id?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_redemptions: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          organization_id: string
          points_spent: number
          reward_id: string | null
          reward_name: string
          reward_type: Database["public"]["Enums"]["loyalty_reward_type"]
          reward_type_value: number
          status: string
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          organization_id: string
          points_spent: number
          reward_id?: string | null
          reward_name: string
          reward_type: Database["public"]["Enums"]["loyalty_reward_type"]
          reward_type_value?: number
          status?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          organization_id?: string
          points_spent?: number
          reward_id?: string | null
          reward_name?: string
          reward_type?: Database["public"]["Enums"]["loyalty_reward_type"]
          reward_type_value?: number
          status?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          min_tier_index: number
          name: string
          organization_id: string
          points_cost: number
          sort_order: number
          type: Database["public"]["Enums"]["loyalty_reward_type"]
          type_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_tier_index?: number
          name: string
          organization_id: string
          points_cost: number
          sort_order?: number
          type: Database["public"]["Enums"]["loyalty_reward_type"]
          type_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_tier_index?: number
          name?: string
          organization_id?: string
          points_cost?: number
          sort_order?: number
          type?: Database["public"]["Enums"]["loyalty_reward_type"]
          type_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          created_at: string
          id: string
          min_points_lifetime: number
          name: string
          organization_id: string
          perks_text: string | null
          tier_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_points_lifetime: number
          name: string
          organization_id: string
          perks_text?: string | null
          tier_index: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_points_lifetime?: number
          name?: string
          organization_id?: string
          perks_text?: string | null
          tier_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          bill_idr: number
          booking_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          earn_rate_idr_per_point: number
          id: string
          organization_id: string
          points_earned: number
        }
        Insert: {
          bill_idr: number
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          earn_rate_idr_per_point: number
          id?: string
          organization_id: string
          points_earned: number
        }
        Update: {
          bill_idr?: number
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          earn_rate_idr_per_point?: number
          id?: string
          organization_id?: string
          points_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          logo_url: string | null
          loyalty_earn_rate_idr_per_point: number
          loyalty_enabled: boolean
          loyalty_program_name: string
          name: string
          operating_hours: string | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          loyalty_earn_rate_idr_per_point?: number
          loyalty_enabled?: boolean
          loyalty_program_name?: string
          name: string
          operating_hours?: string | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          loyalty_earn_rate_idr_per_point?: number
          loyalty_enabled?: boolean
          loyalty_program_name?: string
          name?: string
          operating_hours?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_seen_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          last_seen_at?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_seen_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          capacity: number
          code: string
          created_at: string
          floor_area: string | null
          id: string
          is_active: boolean
          organization_id: string
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
        }
        Insert: {
          capacity: number
          code: string
          created_at?: string
          floor_area?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          code?: string
          created_at?: string
          floor_area?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_booking_with_loyalty: {
        Args: {
          p_bill_idr: number
          p_booking_id: string
          p_redemption_ids: string[]
        }
        Returns: Json
      }
      generate_crockford_id: {
        Args: { length: number; prefix: string }
        Returns: string
      }
      increment_koda_tokens: {
        Args: {
          convo_id: string
          in_tokens: number
          out_tokens: number
          tool_count: number
        }
        Returns: undefined
      }
    }
    Enums: {
      booking_source: "manual" | "walk_in"
      booking_status:
        | "pending"
        | "confirmed"
        | "seated"
        | "completed"
        | "cancelled"
        | "no_show"
      loyalty_reward_type: "free_item" | "percent_discount" | "rupiah_discount"
      profile_status: "active" | "suspended"
      table_status:
        | "available"
        | "reserved"
        | "occupied"
        | "cleaning"
        | "unavailable"
      user_role: "admin" | "front_desk" | "customer_service"
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
      booking_source: ["manual", "walk_in"],
      booking_status: [
        "pending",
        "confirmed",
        "seated",
        "completed",
        "cancelled",
        "no_show",
      ],
      loyalty_reward_type: ["free_item", "percent_discount", "rupiah_discount"],
      profile_status: ["active", "suspended"],
      table_status: [
        "available",
        "reserved",
        "occupied",
        "cleaning",
        "unavailable",
      ],
      user_role: ["admin", "front_desk", "customer_service"],
    },
  },
} as const
