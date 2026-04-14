// Hand-authored mirror of the Supabase schema in supabase/migrations/*.
// When a real Supabase project exists, regenerate with:
//   pnpm dlx supabase gen types typescript --linked > types/db.ts
// and commit the result. Until then, this file is authoritative for TypeScript.
//
// Note: each Tables / Views entry carries a `Relationships: []` because
// @supabase/supabase-js expects it at the type level (the generator emits it
// automatically).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Role = 'family' | 'companion';
export type TripKind = 'request' | 'offer';
export type TripStatus = 'open' | 'matched' | 'completed' | 'cancelled';
export type MatchRequestStatus = 'pending' | 'accepted' | 'declined' | 'auto_declined';
export type MatchStatus = 'active' | 'completed' | 'cancelled' | 'disputed';
export type VerificationChannel = 'linkedin' | 'twitter' | 'email' | 'whatsapp';
export type GenderPreference = 'any' | 'male' | 'female';
export type AgeBand = '60-70' | '70-80' | '80+';
export type Visibility = 'private' | 'profile' | 'public';

export interface ProfilesRow {
  id: string;
  role: Role;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  bio: string | null;
  languages: string[];
  primary_language: string;
  gender: string | null;
  created_at: string;
}

export interface VerificationsRow {
  id: string;
  user_id: string;
  channel: VerificationChannel;
  handle: string | null;
  verified_at: string | null;
  proof: Json | null;
}

export interface TripsRow {
  id: string;
  user_id: string;
  kind: TripKind;
  route: string[];
  travel_date: string;
  flight_numbers: string[] | null;
  airline: string | null;
  languages: string[];
  gender_preference: GenderPreference;
  help_categories: string[];
  thank_you_eur: number | null;
  notes: string | null;
  status: TripStatus;
  elderly_first_name: string | null;
  elderly_age_band: AgeBand | null;
  elderly_photo_url: string | null;
  elderly_medical_notes: string | null;
  created_at: string;
}

export interface MatchRequestsRow {
  id: string;
  trip_id: string;
  requester_id: string;
  intro_message: string | null;
  status: MatchRequestStatus;
  created_at: string;
  responded_at: string | null;
}

export interface MatchesRow {
  id: string;
  match_request_id: string;
  trip_id: string;
  poster_id: string;
  requester_id: string;
  status: MatchStatus;
  poster_marked_complete: boolean;
  requester_marked_complete: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface MessagesRow {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ReviewsRow {
  id: string;
  match_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface TripPhotosRow {
  id: string;
  match_id: string;
  uploader_id: string;
  photo_url: string;
  caption: string | null;
  visibility: Visibility;
  other_party_consented: boolean;
  created_at: string;
}

export interface ReportsRow {
  id: string;
  reporter_id: string;
  subject_id: string;
  reason: string;
  context: Json | null;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  created_at: string;
}

export interface BlocksRow {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface PublicProfilesRow {
  id: string;
  role: Role;
  display_name: string | null;
  photo_url: string | null;
  bio: string | null;
  languages: string[];
  primary_language: string;
  gender: string | null;
  created_at: string;
  verified_channel_count: number;
}

export interface PublicVerificationsRow {
  user_id: string;
  channel: VerificationChannel;
  verified_at: string;
}

export interface PublicTripsRow {
  id: string;
  user_id: string;
  kind: TripKind;
  route: string[];
  travel_date: string;
  airline: string | null;
  languages: string[];
  gender_preference: GenderPreference;
  help_categories: string[];
  thank_you_eur: number | null;
  notes: string | null;
  status: TripStatus;
  elderly_age_band: AgeBand | null;
  created_at: string;
}

export interface ProfileReviewStatsRow {
  user_id: string;
  review_count: number;
  average_rating: number | null;
}

// --- Insert / Update helpers ------------------------------------------------

type InsertOf<T, Auto extends keyof T> = Omit<T, Auto> & Partial<Pick<T, Auto>>;
type UpdateOf<T> = Partial<T>;

// --- Database -----------------------------------------------------------------
// `__InternalSupabase` is required by @supabase/supabase-js ≥2.100 — it pins
// the PostgREST version used for type narrowing. The CLI includes it in
// generated types; we include it here too.

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: InsertOf<ProfilesRow, 'created_at'>;
        Update: UpdateOf<ProfilesRow>;
        Relationships: [];
      };
      verifications: {
        Row: VerificationsRow;
        Insert: InsertOf<VerificationsRow, 'id'>;
        Update: UpdateOf<VerificationsRow>;
        Relationships: [];
      };
      trips: {
        Row: TripsRow;
        Insert: InsertOf<TripsRow, 'id' | 'created_at' | 'status'>;
        Update: UpdateOf<TripsRow>;
        Relationships: [];
      };
      match_requests: {
        Row: MatchRequestsRow;
        Insert: InsertOf<MatchRequestsRow, 'id' | 'created_at' | 'responded_at' | 'status'>;
        Update: UpdateOf<MatchRequestsRow>;
        Relationships: [];
      };
      matches: {
        Row: MatchesRow;
        Insert: InsertOf<
          MatchesRow,
          | 'id'
          | 'created_at'
          | 'completed_at'
          | 'status'
          | 'poster_marked_complete'
          | 'requester_marked_complete'
        >;
        Update: UpdateOf<MatchesRow>;
        Relationships: [];
      };
      messages: {
        Row: MessagesRow;
        Insert: InsertOf<MessagesRow, 'id' | 'created_at'>;
        Update: UpdateOf<MessagesRow>;
        Relationships: [];
      };
      reviews: {
        Row: ReviewsRow;
        Insert: InsertOf<ReviewsRow, 'id' | 'created_at'>;
        Update: UpdateOf<ReviewsRow>;
        Relationships: [];
      };
      trip_photos: {
        Row: TripPhotosRow;
        Insert: InsertOf<TripPhotosRow, 'id' | 'created_at' | 'visibility' | 'other_party_consented'>;
        Update: UpdateOf<TripPhotosRow>;
        Relationships: [];
      };
      reports: {
        Row: ReportsRow;
        Insert: InsertOf<ReportsRow, 'id' | 'created_at' | 'status'>;
        Update: UpdateOf<ReportsRow>;
        Relationships: [];
      };
      blocks: {
        Row: BlocksRow;
        Insert: InsertOf<BlocksRow, 'created_at'>;
        Update: UpdateOf<BlocksRow>;
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: PublicProfilesRow;
        Relationships: [];
      };
      public_verifications: {
        Row: PublicVerificationsRow;
        Relationships: [];
      };
      public_trips: {
        Row: PublicTripsRow;
        Relationships: [];
      };
      profile_review_stats: {
        Row: ProfileReviewStatsRow;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
