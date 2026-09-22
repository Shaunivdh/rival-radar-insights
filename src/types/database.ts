/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Mirrors the live Supabase schema for project `aabshwhxzpfpinazcqqh`.
 * Regenerate after any migration with:
 *
 *   bun run db:types
 *
 * Requires a one-time `bunx supabase login` and
 * `bunx supabase link --project-ref aabshwhxzpfpinazcqqh`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_health_scores: {
        Row: {
          ai_presence_score: number | null;
          business_id: string;
          content_score: number | null;
          engagement_score: number | null;
          gbp_completeness_score: number | null;
          generated_at: string;
          id: string;
          local_visibility_score: number;
          overall_score: number;
          pricing_transparency_score: number | null;
          reputation_score: number | null;
          review_velocity_score: number | null;
          seo_score: number | null;
          summary: string | null;
          trust_score: number | null;
          trustpilot_velocity_score: number | null;
          website_health_score: number | null;
          weekly_delta: number | null;
        };
        Insert: {
          ai_presence_score?: number | null;
          business_id: string;
          content_score?: number | null;
          engagement_score?: number | null;
          gbp_completeness_score?: number | null;
          generated_at?: string;
          id?: string;
          local_visibility_score?: number;
          overall_score: number;
          pricing_transparency_score?: number | null;
          reputation_score?: number | null;
          review_velocity_score?: number | null;
          seo_score?: number | null;
          summary?: string | null;
          trust_score?: number | null;
          trustpilot_velocity_score?: number | null;
          website_health_score?: number | null;
          weekly_delta?: number | null;
        };
        Update: {
          ai_presence_score?: number | null;
          business_id?: string;
          content_score?: number | null;
          engagement_score?: number | null;
          gbp_completeness_score?: number | null;
          generated_at?: string;
          id?: string;
          local_visibility_score?: number;
          overall_score?: number;
          pricing_transparency_score?: number | null;
          reputation_score?: number | null;
          review_velocity_score?: number | null;
          seo_score?: number | null;
          summary?: string | null;
          trust_score?: number | null;
          trustpilot_velocity_score?: number | null;
          website_health_score?: number | null;
          weekly_delta?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_health_scores_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: true;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          anthropic_api_key: string;
          cf_account_id: string;
          cf_api_token: string;
          google_places_api_key: string;
          location: string;
          postcode: string;
          primary_service: string;
          serp_api_key: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          anthropic_api_key?: string;
          cf_account_id?: string;
          cf_api_token?: string;
          google_places_api_key?: string;
          location?: string;
          postcode?: string;
          primary_service?: string;
          serp_api_key?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          anthropic_api_key?: string;
          cf_account_id?: string;
          cf_api_token?: string;
          google_places_api_key?: string;
          location?: string;
          postcode?: string;
          primary_service?: string;
          serp_api_key?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          ai_score: Json | null;
          ai_visibility: Json | null;
          crawl_job_id: string | null;
          crawl_status: string;
          created_at: string;
          domain: string;
          enrichment_errors: Json | null;
          google_data: Json | null;
          google_place_id: string | null;
          id: string;
          is_own_business: boolean;
          last_crawled_at: string | null;
          name: string;
          pagespeed_data: Json | null;
          project_id: string;
          review_sentiment: Json | null;
          serp_data: Json | null;
          url: string;
        };
        Insert: {
          ai_score?: Json | null;
          ai_visibility?: Json | null;
          crawl_job_id?: string | null;
          crawl_status?: string;
          created_at?: string;
          domain: string;
          enrichment_errors?: Json | null;
          google_data?: Json | null;
          google_place_id?: string | null;
          id?: string;
          is_own_business?: boolean;
          last_crawled_at?: string | null;
          name: string;
          pagespeed_data?: Json | null;
          project_id: string;
          review_sentiment?: Json | null;
          serp_data?: Json | null;
          url: string;
        };
        Update: {
          ai_score?: Json | null;
          ai_visibility?: Json | null;
          crawl_job_id?: string | null;
          crawl_status?: string;
          created_at?: string;
          domain?: string;
          enrichment_errors?: Json | null;
          google_data?: Json | null;
          google_place_id?: string | null;
          id?: string;
          is_own_business?: boolean;
          last_crawled_at?: string | null;
          name?: string;
          pagespeed_data?: Json | null;
          project_id?: string;
          review_sentiment?: Json | null;
          serp_data?: Json | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'businesses_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      change_events: {
        Row: {
          business_id: string;
          changes: Json;
          detected_at: string;
          id: string;
          severity: string;
          summary: string;
        };
        Insert: {
          business_id: string;
          changes?: Json;
          detected_at?: string;
          id?: string;
          severity: string;
          summary: string;
        };
        Update: {
          business_id?: string;
          changes?: Json;
          detected_at?: string;
          id?: string;
          severity?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'change_events_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      crawl_health_reports: {
        Row: {
          created_at: string;
          failed: number;
          failure_reasons: Json | null;
          id: string;
          overdue_requeued: number;
          report_date: string;
          stale_recovered: number;
          successful: number;
          total_crawls_24h: number;
        };
        Insert: {
          created_at?: string;
          failed?: number;
          failure_reasons?: Json | null;
          id?: string;
          overdue_requeued?: number;
          report_date?: string;
          stale_recovered?: number;
          successful?: number;
          total_crawls_24h?: number;
        };
        Update: {
          created_at?: string;
          failed?: number;
          failure_reasons?: Json | null;
          id?: string;
          overdue_requeued?: number;
          report_date?: string;
          stale_recovered?: number;
          successful?: number;
          total_crawls_24h?: number;
        };
        Relationships: [];
      };
      crawl_jobs: {
        Row: {
          business_id: string;
          cf_job_id: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          mode: string;
          started_at: string | null;
          status: string;
        };
        Insert: {
          business_id: string;
          cf_job_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          mode?: string;
          started_at?: string | null;
          status?: string;
        };
        Update: {
          business_id?: string;
          cf_job_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          mode?: string;
          started_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'crawl_jobs_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      crawl_logs: {
        Row: {
          business_id: string;
          crawl_job_id: string | null;
          created_at: string;
          id: string;
          message: string | null;
          meta: Json | null;
          status: string;
          step: string;
        };
        Insert: {
          business_id: string;
          crawl_job_id?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          meta?: Json | null;
          status: string;
          step: string;
        };
        Update: {
          business_id?: string;
          crawl_job_id?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          meta?: Json | null;
          status?: string;
          step?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'crawl_logs_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      extracted_signals: {
        Row: {
          business_id: string;
          content: Json | null;
          crawled_at: string;
          engagement: Json | null;
          id: string;
          is_current: boolean;
          scanned_at: string;
          seo: Json | null;
          status: string;
          trust: Json | null;
        };
        Insert: {
          business_id: string;
          content?: Json | null;
          crawled_at?: string;
          engagement?: Json | null;
          id?: string;
          is_current?: boolean;
          scanned_at?: string;
          seo?: Json | null;
          status?: string;
          trust?: Json | null;
        };
        Update: {
          business_id?: string;
          content?: Json | null;
          crawled_at?: string;
          engagement?: Json | null;
          id?: string;
          is_current?: boolean;
          scanned_at?: string;
          seo?: Json | null;
          status?: string;
          trust?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'extracted_signals_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      google_data: {
        Row: {
          address: string | null;
          business_id: string;
          fetched_at: string;
          google_rating: number | null;
          id: string;
          place_id: string | null;
          recent_reviews: Json | null;
          review_count: number | null;
        };
        Insert: {
          address?: string | null;
          business_id: string;
          fetched_at?: string;
          google_rating?: number | null;
          id?: string;
          place_id?: string | null;
          recent_reviews?: Json | null;
          review_count?: number | null;
        };
        Update: {
          address?: string | null;
          business_id?: string;
          fetched_at?: string;
          google_rating?: number | null;
          id?: string;
          place_id?: string | null;
          recent_reviews?: Json | null;
          review_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'google_data_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      priority_actions: {
        Row: {
          action: string;
          actioned_at: string | null;
          category: string;
          competitor_reference: string | null;
          continuity_note: string | null;
          effort: string | null;
          estimated_impact: string;
          generated_at: string;
          id: string;
          note: string | null;
          outcome: string | null;
          priority: number;
          project_id: string;
          reason: string;
          status: string;
          steps: Json | null;
          timeframe: string;
          why_it_matters: string | null;
        };
        Insert: {
          action: string;
          actioned_at?: string | null;
          category: string;
          competitor_reference?: string | null;
          continuity_note?: string | null;
          effort?: string | null;
          estimated_impact: string;
          generated_at?: string;
          id?: string;
          note?: string | null;
          outcome?: string | null;
          priority: number;
          project_id: string;
          reason: string;
          status?: string;
          steps?: Json | null;
          timeframe: string;
          why_it_matters?: string | null;
        };
        Update: {
          action?: string;
          actioned_at?: string | null;
          category?: string;
          competitor_reference?: string | null;
          continuity_note?: string | null;
          effort?: string | null;
          estimated_impact?: string;
          generated_at?: string;
          id?: string;
          note?: string | null;
          outcome?: string | null;
          priority?: number;
          project_id?: string;
          reason?: string;
          status?: string;
          steps?: Json | null;
          timeframe?: string;
          why_it_matters?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'priority_actions_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          id: string;
          location: string | null;
          name: string;
          postcode: string | null;
          primary_service: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          location?: string | null;
          name: string;
          postcode?: string | null;
          primary_service?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          location?: string | null;
          name?: string;
          postcode?: string | null;
          primary_service?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      score_snapshots: {
        Row: {
          ai_presence_score: number | null;
          business_id: string | null;
          gbp_completeness_score: number | null;
          id: string;
          local_visibility_score: number | null;
          overall_score: number | null;
          reputation_score: number | null;
          review_velocity_score: number | null;
          snapshot_at: string | null;
          website_health_score: number | null;
        };
        Insert: {
          ai_presence_score?: number | null;
          business_id?: string | null;
          gbp_completeness_score?: number | null;
          id?: string;
          local_visibility_score?: number | null;
          overall_score?: number | null;
          reputation_score?: number | null;
          review_velocity_score?: number | null;
          snapshot_at?: string | null;
          website_health_score?: number | null;
        };
        Update: {
          ai_presence_score?: number | null;
          business_id?: string | null;
          gbp_completeness_score?: number | null;
          id?: string;
          local_visibility_score?: number | null;
          overall_score?: number | null;
          reputation_score?: number | null;
          review_velocity_score?: number | null;
          snapshot_at?: string | null;
          website_health_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'score_snapshots_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      serp_data: {
        Row: {
          business_id: string;
          featured_snippet: boolean;
          fetched_at: string;
          id: string;
          local_pack_position: number | null;
          organic_position: number | null;
          sitelinks: Json | null;
        };
        Insert: {
          business_id: string;
          featured_snippet?: boolean;
          fetched_at?: string;
          id?: string;
          local_pack_position?: number | null;
          organic_position?: number | null;
          sitelinks?: Json | null;
        };
        Update: {
          business_id?: string;
          featured_snippet?: boolean;
          fetched_at?: string;
          id?: string;
          local_pack_position?: number | null;
          organic_position?: number | null;
          sitelinks?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'serp_data_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      project_id_for_business: { Args: { b_id: string }; Returns: string };
      user_owns_project: { Args: { p_id: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
