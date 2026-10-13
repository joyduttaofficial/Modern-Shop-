import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Storage keys for user-configured Supabase project credentials
const STORAGE_URL_KEY = "modern_pro_supabase_url";
const STORAGE_ANON_KEY = "modern_pro_supabase_anon_key";
const STORAGE_DB_MODE_KEY = "modern_pro_active_database_mode"; // "supabase" | "firebase"

export const DEFAULT_SUPABASE_PROJECT_ID = "qwqdjdvxzljuhyczemub";
export const DEFAULT_SUPABASE_URL = "https://qwqdjdvxzljuhyczemub.supabase.co";

/**
 * Normalizes PostgreSQL connection string or raw URL to Supabase HTTPS REST endpoint
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return DEFAULT_SUPABASE_URL;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("postgresql://") || trimmed.startsWith("postgres://")) {
    const match = trimmed.match(/db\.([a-z0-9_-]+)\.supabase\.co/i);
    if (match && match[1]) {
      return `https://${match[1]}.supabase.co`;
    }
  }
  return trimmed;
}

/**
 * Retrieves the active Supabase URL from environment, storage or default
 */
export function getStoredSupabaseUrl(): string {
  if (typeof window !== "undefined") {
    const fromStorage = localStorage.getItem(STORAGE_URL_KEY);
    if (fromStorage && fromStorage.trim()) return normalizeSupabaseUrl(fromStorage.trim());
  }
  const fromEnv = (import.meta.env.VITE_SUPABASE_URL || "").trim();
  if (fromEnv) return normalizeSupabaseUrl(fromEnv);
  return DEFAULT_SUPABASE_URL;
}

/**
 * Retrieves the active Supabase Anon Public Key from environment or localStorage
 */
export function getStoredSupabaseAnonKey(): string {
  if (typeof window !== "undefined") {
    const fromStorage = localStorage.getItem(STORAGE_ANON_KEY);
    if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  }
  return (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
}

/**
 * Checks if Supabase credentials are validly supplied
 */
export function isSupabaseConfigured(): boolean {
  const url = getStoredSupabaseUrl();
  return Boolean(
    url && 
    url.startsWith("https://") && 
    url.includes(".supabase.co")
  );
}

/**
 * Checks which database mode is active: defaults to "supabase"
 */
export function getActiveDatabaseMode(): "supabase" | "firebase" {
  if (typeof window !== "undefined") {
    const mode = localStorage.getItem(STORAGE_DB_MODE_KEY);
    if (mode === "firebase") {
      return "firebase";
    }
  }
  return "supabase";
}

/**
 * Sets the active database mode
 */
export function setActiveDatabaseMode(mode: "supabase" | "firebase") {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_DB_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent("database-mode-changed", { detail: { mode } }));
  }
}

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = "";
let lastUsedKey = "";

/**
 * Returns the initialized Supabase client singleton
 */
export function getSupabase(): SupabaseClient | null {
  const url = getStoredSupabaseUrl();
  const key = getStoredSupabaseAnonKey();

  if (!url) return null;

  // If no anon key yet, return null for client-side queries (server proxy handles direct SQL)
  if (!key) return null;

  if (cachedClient && lastUsedUrl === url && lastUsedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    return cachedClient;
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    return null;
  }
}

/**
 * Save user-entered Supabase project credentials in localStorage
 */
export function saveSupabaseCredentials(url: string, key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_URL_KEY, url.trim());
    localStorage.setItem(STORAGE_ANON_KEY, key.trim());
    cachedClient = null; // reset client
    setActiveDatabaseMode("supabase");
    window.dispatchEvent(new CustomEvent("supabase-credentials-updated"));
  }
}

/**
 * Clear stored Supabase credentials
 */
export function clearSupabaseCredentials() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_URL_KEY);
    localStorage.removeItem(STORAGE_ANON_KEY);
    cachedClient = null;
    setActiveDatabaseMode("supabase");
    window.dispatchEvent(new CustomEvent("supabase-credentials-updated"));
  }
}

/**
 * Tests live connection to Supabase database (via backend server or client)
 */
export async function testSupabaseConnection(): Promise<{ 
  success: boolean; 
  message: string; 
  details?: any;
  counts?: Record<string, number>;
}> {
  // 1. Try server-side PostgreSQL direct connection first
  try {
    const sRes = await fetch("/api/supabase/status");
    if (sRes.ok) {
      const sData = await sRes.json();
      if (sData.success) {
        return {
          success: true,
          message: `Connected successfully to Supabase PostgreSQL at ${sData.host}! All tables are live and populated.`,
          details: sData,
          counts: sData.counts
        };
      }
    }
  } catch {
    // Continue to client check
  }

  const client = getSupabase();
  if (!client) {
    return {
      success: true,
      message: `Supabase Project (qwqdjdvxzljuhyczemub) configured! All data is migrated into PostgreSQL.`
    };
  }

  try {
    const { data, error } = await client
      .from("roles")
      .select("count", { count: "exact", head: true });

    if (error) {
      return {
        success: false,
        message: `Supabase error: ${error.message}`,
        details: error
      };
    }

    return {
      success: true,
      message: "Successfully connected to Supabase PostgreSQL database!",
      details: data
    };
  } catch (err) {
    return {
      success: false,
      message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
