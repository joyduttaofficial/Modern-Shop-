import { createClient } from "@supabase/supabase-js";
 
 // Retrieve potential Supabase credentials from client-side environment (Vite standard)
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || "";
 
export const isSupabaseConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  (supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://"))
);

// Lazy initialization of Supabase client to satisfy AI Studio security directives
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Dual-Engine Local Persistence & Sync state
const STORAGE_PREFIX = "pos_store_";
const localCache: Record<string, Record<string, any>> = {};

// Load existing Local Storage records on initialization
function loadFromSync() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      if (key === `${STORAGE_PREFIX}session_user`) continue;
      const parts = key.slice(STORAGE_PREFIX.length).split(":");
      if (parts.length >= 2) {
        const collection = parts[0];
        const id = parts.slice(1).join(":");
        try {
          if (!localCache[collection]) localCache[collection] = {};
          localCache[collection][id] = JSON.parse(localStorage.getItem(key) || "{}");
        } catch (e) {
          console.error("Local persistence payload parse error", e);
        }
      }
    }
  }
}
loadFromSync();

// Global listeners registry for reactive interface updates
type Listener = (snapshot: { docs: any[]; empty: boolean; size: number; forEach: (cb: any) => void }) => void;
const listeners: Record<string, Set<Listener>> = {};

function triggerListeners(collectionName: string) {
  const colListeners = listeners[collectionName];
  if (!colListeners) return;

  const docs = Object.entries(localCache[collectionName] || {}).map(([id, data]) => ({
    id,
    data: () => data,
    exists: () => true,
  }));

  colListeners.forEach((listener) => {
    try {
      listener({
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach: (callback: any) => docs.forEach(callback),
      });
    } catch (e) {
      console.error("Local listener execution failed:", collectionName, e);
    }
  });
}

// Synchronize all writes to Supabase database (if configured) or local persistence
async function syncWrite(collection: string, id: string, data: any) {
  if (!localCache[collection]) localCache[collection] = {};
  localCache[collection][id] = data;
  localStorage.setItem(`${STORAGE_PREFIX}${collection}:${id}`, JSON.stringify(data));
  triggerListeners(collection);

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from("store_collections")
        .upsert({ collection, id, data });
      if (error) console.error("Supabase write sync warning", error);
    } catch (e) {
      console.error("Supabase write exception", e);
    }
  }
}

// Synchronize deletion events
async function syncDelete(collection: string, id: string) {
  if (localCache[collection]) {
    delete localCache[collection][id];
  }
  localStorage.removeItem(`${STORAGE_PREFIX}${collection}:${id}`);
  triggerListeners(collection);

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from("store_collections")
        .delete()
        .eq("collection", collection)
        .eq("id", id);
      if (error) console.error("Supabase delete sync warning", error);
    } catch (e) {
      console.error("Supabase delete exception", e);
    }
  }
}

// Initial pull on system bootstrap if Supabase credentials are configured
async function fetchAllFromSupabase() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("store_collections")
        .select("collection, id, data");
      
      if (error) {
        console.warn("Supabase collection fetch failed, relying on local store", error.message);
        return;
      }
      if (data) {
        data.forEach((row: any) => {
          const { collection, id, data: docData } = row;
          if (!localCache[collection]) localCache[collection] = {};
          localCache[collection][id] = docData;
          localStorage.setItem(`${STORAGE_PREFIX}${collection}:${id}`, JSON.stringify(docData));
        });
        
        // Notify all active interfaces of fresh downloaded rows
        Object.keys(localCache).forEach((col) => triggerListeners(col));
      }
    } catch (e) {
      console.error("Supabase synchronization exception", e);
    }
  }
}
fetchAllFromSupabase();

// Establish Real-Time changes subscription to keep different panels/devices perfectly in sync
if (isSupabaseConfigured && supabase) {
  supabase
    .channel("store_collections_realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "store_collections" },
      (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const row = payload.new;
          if (row) {
            const { collection, id, data } = row;
            if (!localCache[collection]) localCache[collection] = {};
            localCache[collection][id] = data;
            localStorage.setItem(`${STORAGE_PREFIX}${collection}:${id}`, JSON.stringify(data));
            triggerListeners(collection);
          }
        } else if (payload.eventType === "DELETE") {
          const row = payload.old;
          if (row) {
            const { collection, id } = row;
            if (collection && id && localCache[collection]) {
              delete localCache[collection][id];
              localStorage.removeItem(`${STORAGE_PREFIX}${collection}:${id}`);
              triggerListeners(collection);
            }
          }
        }
      }
    )
    .subscribe();
}

// Constraint helper for offline queries (filtering, ordering, limiters)
function executeConstraints(docs: any[], constraints: any[]) {
  let filtered = [...docs];

  for (const c of constraints) {
    if (c.type === "where") {
      filtered = filtered.filter((doc) => {
        const val = doc.data()[c.field];
        switch (c.operator) {
          case "==":
            return val === c.value;
          case "!=":
            return val !== c.value;
          case ">":
            return val > c.value;
          case ">=":
            return val >= c.value;
          case "<":
            return val < c.value;
          case "<=":
            return val <= c.value;
          case "array-contains":
            return Array.isArray(val) && val.includes(c.value);
          default:
            return true;
        }
      });
    }
  }

  for (const c of constraints) {
    if (c.type === "orderBy") {
      filtered.sort((a, b) => {
        const valA = a.data()[c.field];
        const valB = b.data()[c.field];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (valA === valB) return 0;
        const compare = valA > valB ? 1 : -1;
        return c.direction === "desc" ? -compare : compare;
      });
    }
  }

  for (const c of constraints) {
    if (c.type === "limit") {
      filtered = filtered.slice(0, c.limit);
    }
  }

  return filtered;
}

// --- FIRESTORE EMULATION INTERFACE ---
export const db = { type: "db" };

export function collection(dbRef: any, name: string) {
  return { type: "collection", name };
}

export function doc(dbOrCol: any, collectionOrId?: string, id?: string) {
  if (id) {
    return { type: "doc", collection: collectionOrId, id };
  } else {
    if (dbOrCol.type === "collection") {
      return { type: "doc", collection: dbOrCol.name, id: collectionOrId };
    } else {
      const parts = collectionOrId?.split("/") || [];
      return { type: "doc", collection: parts[0], id: parts[1] };
    }
  }
}

export function query(collectionRef: any, ...constraints: any[]) {
  return { type: "query", name: collectionRef.name, constraints };
}

export function where(field: string, operator: string, value: any) {
  return { type: "where", field, operator, value };
}

export function orderBy(field: string, direction?: "asc" | "desc") {
  return { type: "orderBy", field, direction: direction || "asc" };
}

export function limit(n: number) {
  return { type: "limit", limit: n };
}

export function onSnapshot(queryOrCol: any, onNext: any, onError?: any) {
  const collectionName = queryOrCol.collection || queryOrCol.name;
  if (!collectionName) {
    if (typeof onNext === "function") {
      if (queryOrCol && queryOrCol.type === "doc") {
        onNext({
          exists: () => false,
          data: () => null,
          id: queryOrCol.id || "",
        });
      } else {
        onNext({ docs: [] });
      }
    }
    return () => {};
  }

  // Define the snapshot callback
  const listener = (snap: any) => {
    if (queryOrCol && queryOrCol.type === "doc") {
      const docId = queryOrCol.id;
      const docData = localCache[collectionName]?.[docId];
      onNext({
        exists: () => docData !== undefined,
        data: () => docData || null,
        id: docId,
      });
    } else {
      let docs = snap.docs;
      if (queryOrCol.constraints) {
        docs = executeConstraints(docs, queryOrCol.constraints);
      }
      onNext({
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach: (callback: any) => docs.forEach(callback),
      });
    }
  };

  if (!listeners[collectionName]) {
    listeners[collectionName] = new Set();
  }
  listeners[collectionName].add(listener);

  // Trigger once immediately with the current cache records
  if (queryOrCol && queryOrCol.type === "doc") {
    const docId = queryOrCol.id;
    const docData = localCache[collectionName]?.[docId];
    onNext({
      exists: () => docData !== undefined,
      data: () => docData || null,
      id: docId,
    });
  } else {
    const initialDocs = Object.entries(localCache[collectionName] || {}).map(([id, data]) => ({
      id,
      data: () => data,
      exists: () => true,
    }));
    listener({ docs: initialDocs });
  }

  return () => {
    listeners[collectionName]?.delete(listener);
  };
}

export async function addDoc(collectionRef: any, data: any) {
  const collectionName = collectionRef.name;
  const id = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const processed = resolveMagicProperties(collectionName, id, data);
  await syncWrite(collectionName, id, processed);
  return { id };
}

export async function setDoc(docRef: any, data: any, options?: { merge?: boolean }) {
  const { collection, id } = docRef;
  let finalData = data;
  if (options?.merge && localCache[collection]?.[id]) {
    finalData = { ...localCache[collection][id], ...data };
  }
  finalData = resolveMagicProperties(collection, id, finalData);
  await syncWrite(collection, id, finalData);
}

export async function deleteDoc(docRef: any) {
  const { collection, id } = docRef;
  await syncDelete(collection, id);
}

export async function updateDoc(docRef: any, data: any) {
  const { collection, id } = docRef;
  const existing = localCache[collection]?.[id] || {};
  const updated = { ...existing, ...data };
  const finalData = resolveMagicProperties(collection, id, updated);
  await syncWrite(collection, id, finalData);
}

export async function getDoc(docRef: any) {
  const { collection, id } = docRef;
  const data = localCache[collection]?.[id];
  return {
    exists: () => !!data,
    data: () => data || null,
    id,
  };
}

export async function getDocs(queryOrRef: any) {
  const collectionName = queryOrRef.collection || queryOrRef.name;
  const list = Object.entries(localCache[collectionName] || {}).map(([id, data]) => ({
    id,
    data: () => data,
    exists: () => true,
  }));
  const docs = queryOrRef.constraints ? executeConstraints(list, queryOrRef.constraints) : list;
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (callback: any) => docs.forEach(callback),
  };
}

export function increment(value: number) {
  return { __isIncrement: true, value };
}

function resolveMagicProperties(collectionName: string, id: string, data: any) {
  const result = { ...data };
  Object.keys(result).forEach((key) => {
    const val = result[key];
    if (val && typeof val === "object" && val.__isIncrement) {
      const current = localCache[collectionName]?.[id]?.[key] || 0;
      result[key] = current + val.value;
    }
  });
  return result;
}

export function writeBatch(dbRef: any) {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: (docRef: any, data: any, options?: { merge?: boolean }) => {
      ops.push(() => setDoc(docRef, data, options));
    },
    update: (docRef: any, data: any) => {
      ops.push(() => updateDoc(docRef, data));
    },
    delete: (docRef: any) => {
      ops.push(() => deleteDoc(docRef));
    },
    commit: async () => {
      for (const op of ops) {
        await op();
      }
    },
  };
}

// --- AUTHENTICATION EMULATION INTERFACE ---
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

let currentUser: User | null = null;

// Attempt to restore persistent session from browser storage
try {
  const savedUser = localStorage.getItem(`${STORAGE_PREFIX}session_user`);
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  }
} catch (e) {}

const authListeners = new Set<(user: User | null) => void>();

export const auth = {
  get currentUser() {
    return currentUser;
  },
};

export function getAuth(app?: any) {
  return auth;
}

export function onAuthStateChanged(authRef: any, callback: (user: User | null) => void) {
  authListeners.add(callback);
  callback(currentUser);
  return () => {
    authListeners.delete(callback);
  };
}

function triggerAuthChange() {
  authListeners.forEach((cb) => {
    try {
      cb(currentUser);
    } catch (e) {
      console.error("Auth distribution callback failed", e);
    }
  });
}

export async function signInWithEmailAndPassword(authRef: any, emailInput: string, passwordInput: string) {
  const cleanEmail = emailInput.trim().toLowerCase();
  const cleanPassword = passwordInput.trim();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (error) {
        throw new Error(error.message);
      }
      if (data?.user) {
        currentUser = {
          uid: data.user.id,
          email: data.user.email || cleanEmail,
          displayName: data.user.user_metadata?.display_name || null,
          photoURL: data.user.user_metadata?.avatar_url || null,
        };
        localStorage.setItem(`${STORAGE_PREFIX}session_user`, JSON.stringify(currentUser));
        triggerAuthChange();
        return { user: currentUser };
      }
    } catch (supabaseErr: any) {
      // Allow fallback to standard demo credentials or local signin if modern@admin.com
      if (cleanEmail !== "modern@admin.com") {
        throw supabaseErr;
      }
    }
  }

  // Local/Emulated User Authentication Verification
  const usersCollection = localCache["users"] || {};
  const matchedUser = Object.values(usersCollection).find((u: any) => u.email?.toLowerCase() === cleanEmail);

  if (cleanEmail === "modern@admin.com" && cleanPassword === "Joy@398878j") {
    currentUser = {
      uid: matchedUser?.uid || matchedUser?.id || "admin-uid-123",
      email: cleanEmail,
      displayName: matchedUser?.displayName || "Main Administrator",
      photoURL: matchedUser?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=Main%2520Administrator`,
    };
    localStorage.setItem(`${STORAGE_PREFIX}session_user`, JSON.stringify(currentUser));
    triggerAuthChange();
    return { user: currentUser };
  }

  if (matchedUser) {
    currentUser = {
      uid: matchedUser.uid || matchedUser.id || `user-uid-${Date.now()}`,
      email: cleanEmail,
      displayName: matchedUser.displayName || "Standard User",
      photoURL: matchedUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(matchedUser.displayName || "User")}`,
    };
    localStorage.setItem(`${STORAGE_PREFIX}session_user`, JSON.stringify(currentUser));
    triggerAuthChange();
    return { user: currentUser };
  }

  throw new Error("auth/user-not-found: Invalid credentials or offline username match failed.");
}

export async function createUserWithEmailAndPassword(authRef: any, emailInput: string, passwordInput: string) {
  const cleanEmail = emailInput.trim().toLowerCase();
  
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: passwordInput,
    });
    if (error) throw new Error(error.message);
    if (data?.user) {
      currentUser = {
        uid: data.user.id,
        email: data.user.email || cleanEmail,
        displayName: null,
        photoURL: null,
      };
      localStorage.setItem(`${STORAGE_PREFIX}session_user`, JSON.stringify(currentUser));
      triggerAuthChange();
      return { user: currentUser };
    }
  }

  currentUser = {
    uid: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    email: cleanEmail,
    displayName: null,
    photoURL: null,
  };
  localStorage.setItem(`${STORAGE_PREFIX}session_user`, JSON.stringify(currentUser));
  triggerAuthChange();
  return { user: currentUser };
}

export async function updateProfile(userRef: User, profileData: { displayName?: string; photoURL?: string }) {
  if (currentUser) {
    if (profileData.displayName !== undefined) currentUser.displayName = profileData.displayName;
    if (profileData.photoURL !== undefined) currentUser.photoURL = profileData.photoURL;
    localStorage.setItem(`${STORAGE_PREFIX}session_user`, JSON.stringify(currentUser));
    triggerAuthChange();
  }

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: profileData.displayName,
        avatar_url: profileData.photoURL,
      },
    });
    if (error) console.error("Supabase Profile update warning", error);
  }
}

export async function signOut(authRef?: any) {
  currentUser = null;
  localStorage.removeItem(`${STORAGE_PREFIX}session_user`);
  triggerAuthChange();

  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
}

export function initializeApp(config: any, name?: string) {
  return { name: name || "app" };
}

export function deleteApp(appRef: any) {
  return Promise.resolve();
}

// Error handling matching legacy structures
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.warn(`Simulated Database warning: [${operationType}] at [${path}]`, error);
}
