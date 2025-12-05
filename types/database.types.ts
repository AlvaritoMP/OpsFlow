// Tipos de base de datos generados automáticamente
// Este archivo puede ser generado usando: npx supabase gen types typescript --project-id <project-id>
// Por ahora, definimos tipos básicos para TypeScript

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          email: string
          role: string
          avatar: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          role: string
          avatar?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role?: string
          avatar?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      units: {
        Row: {
          id: string
          name: string
          client_name: string
          address: string
          status: string
          description: string | null
          coordinator_id: string | null
          roving_supervisor_id: string | null
          resident_supervisor_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          client_name: string
          address: string
          status: string
          description?: string | null
          coordinator_id?: string | null
          roving_supervisor_id?: string | null
          resident_supervisor_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          client_name?: string
          address?: string
          status?: string
          description?: string | null
          coordinator_id?: string | null
          roving_supervisor_id?: string | null
          resident_supervisor_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // Agregar más tablas según sea necesario
      [key: string]: any
    }
    Views: {
      [key: string]: never
    }
    Functions: {
      [key: string]: never
    }
    Enums: {
      [key: string]: never
    }
  }
}

