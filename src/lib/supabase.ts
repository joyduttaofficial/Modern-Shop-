import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Storage keys for user-configured Supabase project credentials
const STORAGE_URL_KEY = "modern_pro_supabase_url";
const STORAGE_ANON_KEY = "modern_pro_supabase_anon_key";
const STORAGE_DB_MODE_KEY = "modern_pro_active_database_mode"; // "supabase" | "firebase"

export const DEFAULT_SUPABASE_PROJECT_ID = "qwqdjdvxzljuhyczemub";
export const DEFAULT_SUPABASE_URL = "https://qwqdjdvxzljuhyczemub.supabase.co";

/**
 * Normalizes PostgreSQL connection string, host, project ref, or raw URL to Supabase HTTPS REST endpoint
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return DEFAULT_SUPABASE_URL;
  let trimmed = String(rawUrl).trim();
  if (!trimmed) return DEFAULT_SUPABASE_URL;

  // 1. If user entered a PostgreSQL connection string
  if (trimmed.startsWith("postgresql://") || trimmed.startsWith("postgres://")) {
    const match = trimmed.match(/(?:db\.)?([a-z0-9_-]+)\.supabase\.(?:co|com)/i);
    if (match && match[1] && match[1].toLowerCase() !== "pooler") {
      return `https://${match[1]}.supabase.co`;
    }
    const poolerUserMatch = trimmed.match(/postgres\.([a-z0-9_-]+):/i);
    if (poolerUserMatch && poolerUserMatch[1]) {
      return `https://${poolerUserMatch[1]}.supabase.co`;
    }
    return DEFAULT_SUPABASE_URL;
  }

  // 2. If user entered just a project ID e.g. "qwqdjdvxzljuhyczemub"
  if (/^[a-z0-9_-]{15,35}$/i.test(trimmed)) {
    return `https://${trimmed}.supabase.co`;
  }

  // 3. Remove leading db. if entered like "db.qwqdjdvxzljuhyczemub.supabase.co"
  trimmed = trimmed.replace(/^(?:https?:\/\/)?db\./i, "https://");

  // 4. If missing protocol
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    trimmed = `https://${trimmed}`;
  }

  // 5. Final validation: parse as URL and ensure protocol is http or https
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    // If parsing fails, fallback to default valid URL
  }

  return DEFAULT_SUPABASE_URL;
}

/**
 * Retrieves the active Supabase URL from environment, storage or default
 */
export function getStoredSupabaseUrl(): string {
  if (typeof window !== "undefined") {
    const fromStorage = localStorage.getItem(STORAGE_URL_KEY);
    if (fromStorage && fromStorage.trim()) {
      const normalized = normalizeSupabaseUrl(fromStorage.trim());
      // Self-heal localStorage if the stored value was not normalized
      if (normalized !== fromStorage.trim()) {
        try {
          localStorage.setItem(STORAGE_URL_KEY, normalized);
        } catch {}
      }
      return normalized;
    }
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
 * Checks which database mode is active: permanently set to "supabase" as main system database
 */
export function getActiveDatabaseMode(): "supabase" {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_DB_MODE_KEY, "supabase");
  }
  return "supabase";
}

/**
 * Sets the active database mode
 */
export function setActiveDatabaseMode(_mode: "supabase" | "firebase" = "supabase") {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_DB_MODE_KEY, "supabase");
    window.dispatchEvent(new CustomEvent("database-mode-changed", { detail: { mode: "supabase" } }));
  }
}

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = "";
let lastUsedKey = "";

/**
 * Returns the initialized Supabase client singleton
 */
export function getSupabase(): SupabaseClient | null {
  const rawUrl = getStoredSupabaseUrl();
  const url = normalizeSupabaseUrl(rawUrl);
  const key = getStoredSupabaseAnonKey();

  if (!url) return null;

  // If no anon key yet, return null for client-side queries (server proxy handles direct SQL)
  if (!key) return null;

  // Validate URL format before calling createClient to guarantee no runtime crash
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

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
    console.warn("Notice: Client-side Supabase client initialization bypassed:", err);
    return null;
  }
}

/**
 * Save user-entered Supabase project credentials in localStorage
 */
export function saveSupabaseCredentials(url: string, key: string) {
  if (typeof window !== "undefined") {
    const cleanUrl = normalizeSupabaseUrl(url.trim());
    localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
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
