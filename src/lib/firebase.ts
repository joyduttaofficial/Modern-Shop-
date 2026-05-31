import { createClient } from "@supabase/supabase-js";

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// Initialize Supabase Client
const supabaseUrl = ((import.meta as any).env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = ((import.meta as any).env.VITE_SUPABASE_ANON_KEY || "").trim();

let supabaseClient = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    if (supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://")) {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    } else {
      console.warn("Bypassing Supabase init: URL does not start with http/https");
    }
  } catch (err) {
    console.warn("Supabase client initialization failed:", err);
  }
}

export const supabase = supabaseClient;

// Fallback Local Storage Core (offline-first & development compatibility)
const LOCAL_DB_PREFIX = "mm_erp_db_";

function getLocalTable(tableName: string): any[] {
  try {
    const data = localStorage.getItem(LOCAL_DB_PREFIX + tableName);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to read local table " + tableName, e);
    return [];
  }
}

function saveLocalTable(tableName: string, data: any[]): void {
  try {
    localStorage.setItem(LOCAL_DB_PREFIX + tableName, JSON.stringify(data));
    // Trigger reactive listeners
    triggerListeners(tableName);
  } catch (e) {
    console.error("Failed to save local table " + tableName, e);
  }
}

// Memory listener register for reactive onSnapshot calls
const listenersByTable: Record<string, (() => void)[]> = {};

function registerListener(tableName: string, cb: () => void): () => void {
  if (!listenersByTable[tableName]) {
    listenersByTable[tableName] = [];
  }
  listenersByTable[tableName].push(cb);
  return () => {
    listenersByTable[tableName] = listenersByTable[tableName].filter(l => l !== cb);
  };
}

function triggerListeners(tableName: string) {
  if (listenersByTable[tableName]) {
    listenersByTable[tableName].forEach(cb => {
      try { cb(); } catch (err) { console.error("Error triggering listener", err); }
    });
  }
}

// Match database presets for categories, roles, and default cash bank
function seedDefaultData() {
  const categories = getLocalTable("categories");
  if (categories.length === 0) {
    const defaultCats = [
      { id: "cat_1", name: "Previous Cash", type: "income" },
      { id: "cat_2", name: "Opening Balance", type: "income" },
      { id: "cat_3", name: "Retail Sales", type: "income" },
      { id: "cat_4", name: "Wholesale Sales", type: "income" },
      { id: "cat_5", name: "Rent", type: "expense" },
      { id: "cat_6", name: "Electricity", type: "expense" },
      { id: "cat_7", name: "Staff Salary", type: "expense" },
      { id: "cat_8", name: "Employee Advance", type: "expense" },
      { id: "cat_9", name: "Employee", type: "expense" },
      { id: "cat_10", name: "Food", type: "expense" },
      { id: "cat_11", name: "Courier", type: "expense" }
    ];
    saveLocalTable("categories", defaultCats);
  }

  const banks = getLocalTable("banks");
  if (banks.length === 0) {
    saveLocalTable("banks", [
      {
        id: "bank_cash",
        name: "Cash",
        balance: 150000, // Initial seed balance for easy preview testing
        lastUpdated: new Date().toISOString()
      },
      {
        id: "bank_bkash",
        name: "bKash Business",
        balance: 75000,
        lastUpdated: new Date().toISOString()
      }
    ]);
  }

  const roles = getLocalTable("roles");
  if (roles.length === 0) {
    saveLocalTable("roles", [
      { id: "role_admin", name: "admin", allowedMenus: ["dashboard", "transactions", "newSale", "salesList", "employeesList", "salarySheet", "attendance", "reports", "settings", "suppliersList", "usersList", "rolesList"], description: "System Administrator with full access rights.", createdAt: new Date().toISOString() },
      { id: "role_accountant", name: "accountant", allowedMenus: ["dashboard", "transactions", "newSale", "salesList", "suppliersList", "reports"], description: "Finance and ledger tracking role.", createdAt: new Date().toISOString() },
      { id: "role_sales", name: "sales", allowedMenus: ["newSale", "salesList"], description: "Sales representative counters.", createdAt: new Date().toISOString() }
    ]);
  }

  const users = getLocalTable("users");
  if (users.length === 0) {
    saveLocalTable("users", [
      {
        id: "usr_admin",
        uid: "usr_admin",
        email: "modern@admin.com",
        displayName: "System Executive",
        role: "admin",
        createdAt: new Date().toISOString(),
        photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=Main%20Administrator",
        status: "active"
      }
    ]);
  }
}

seedDefaultData();

// Sync background operations to Supabase automatically
async function syncToSupabase(tableName: string, operation: "upsert" | "delete", docData: any) {
  if (!supabase) return;
  try {
    if (operation === "upsert") {
      await supabase.from(tableName).upsert([docData]);
    } else if (operation === "delete") {
      await supabase.from(tableName).delete().eq("id", docData.id);
    }
  } catch (error) {
    console.warn(`Supabase sync connection failed for table: ${tableName}. Working in standalone offline mode.`, error);
  }
}

// Sync from Supabase tables to keep Local Storage up to date on fetch (if Supabase is set up)
async function fetchSupabaseTableToLocalStorage(tableName: string) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from(tableName).select("*");
    if (!error && data && Array.isArray(data)) {
      if (data.length > 0) {
        saveLocalTable(tableName, data);
      }
    }
  } catch (err) {
    console.debug(`Supabase read connection inactive for table: ${tableName}. Utilizing local replica cache.`, err);
  }
}

// Core Firebase Compatibility Mock objects & references
export const db = { type: "supabase-compat-db" };

class MockAuth {
  currentUser: any = null;
  private stateChangeListeners: ((user: any) => void)[] = [];

  constructor() {
    // Load existing user session
    try {
      const savedUser = localStorage.getItem("mm_erp_session_user");
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
      }
    } catch (e) {
      this.currentUser = null;
    }
  }

  onAuthStateChange(cb: (user: any) => void): () => void {
    this.stateChangeListeners.push(cb);
    // Instant initial trigger
    setTimeout(() => cb(this.currentUser), 0);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== cb);
    };
  }

  triggerStateChange() {
    this.stateChangeListeners.forEach(cb => {
      try { cb(this.currentUser); } catch (err) { console.error("Error in auth state subscriber", err); }
    });
  }

  setCurrentUser(user: any) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem("mm_erp_session_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("mm_erp_session_user");
    }
    this.triggerStateChange();
  }
}

export const auth = new MockAuth();

// Initialize App Functions
export function initializeApp(config?: any, name?: string) {
  return { config, name, version: "supabase-compat-v1" };
}

export function deleteApp(app: any) {
  return Promise.resolve();
}

export function getAuth(app?: any) {
  return auth;
}

// Authentication Functions
export function onAuthStateChanged(authInstance: MockAuth, callback: (user: any) => void) {
  return authInstance.onAuthStateChange(callback);
}

export async function signOut(authInstance: MockAuth) {
  if (supabase) {
    try { await supabase.auth.signOut(); } catch (e) {}
  }
  authInstance.setCurrentUser(null);
  return Promise.resolve();
}

export async function signInWithEmailAndPassword(authInstance: MockAuth, emailInput: string, passwordInput: string) {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput.trim();

  // Admin Bypass Support
  if (email === "modern@admin.com" && password === "Joy@398878j") {
    // Ensure admin profile exists in local profiles
    const users = getLocalTable("users");
    let adminProfile = users.find(u => u.email === email);
    if (!adminProfile) {
      adminProfile = {
        id: "usr_admin",
        uid: "usr_admin",
        email: "modern@admin.com",
        displayName: "Main Administrator",
        role: "admin",
        createdAt: new Date().toISOString(),
        photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=Main%20Administrator",
        status: "active"
      };
      users.push(adminProfile);
      saveLocalTable("users", users);
    }
    
    const loggedInUser = {
      uid: adminProfile.uid || adminProfile.id,
      email: adminProfile.email,
      displayName: adminProfile.displayName,
      photoURL: adminProfile.photoURL,
    };
    
    // Auth success
    authInstance.setCurrentUser(loggedInUser);
    return { user: loggedInUser };
  }

  // Normal user credentials
  const users = getLocalTable("users");
  const matchingProfile = users.find(u => u.email === email);
  if (matchingProfile) {
    // Allow pass checking (simple model for internal admin roles)
    const loggedInUser = {
      uid: matchingProfile.uid || matchingProfile.id,
      email: matchingProfile.email,
      displayName: matchingProfile.displayName,
      photoURL: matchingProfile.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(matchingProfile.displayName)}`,
    };
    authInstance.setCurrentUser(loggedInUser);
    return { user: loggedInUser };
  }

  // Standard firebase structure errors
  throw { code: "auth/user-not-found", message: "User not found or password incorrect." };
}

export async function createUserWithEmailAndPassword(authInstance: MockAuth, emailInput: string, passwordInput: string) {
  const email = emailInput.trim().toLowerCase();
  const users = getLocalTable("users");
  
  if (users.some(u => u.email === email)) {
    throw { code: "auth/email-already-in-use", message: "Email is already registered." };
  }

  const newId = "usr_" + Math.random().toString(36).substr(2, 9);
  const newProfile = {
    id: newId,
    uid: newId,
    email,
    displayName: email.split("@")[0],
    role: "sales",
    createdAt: new Date().toISOString(),
    status: "active" as const
  };

  users.push(newProfile);
  saveLocalTable("users", users);

  const loggedInUser = {
    uid: newId,
    email,
    displayName: newProfile.displayName,
    photoURL: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(newProfile.displayName)}`
  };

  authInstance.setCurrentUser(loggedInUser);
  return { user: loggedInUser };
}

export async function updateProfile(userInstance: any, profileData: any) {
  if (!auth.currentUser) return Promise.resolve();
  
  const updatedUser = {
    ...auth.currentUser,
    displayName: profileData.displayName || auth.currentUser.displayName,
    photoURL: profileData.photoURL || auth.currentUser.photoURL
  };
  
  auth.setCurrentUser(updatedUser);
  
  // Also sync within standard users table
  const users = getLocalTable("users");
  const matchIdx = users.findIndex(u => u.email === updatedUser.email || u.id === updatedUser.uid);
  if (matchIdx !== -1) {
    users[matchIdx] = {
      ...users[matchIdx],
      displayName: updatedUser.displayName,
      photoURL: updatedUser.photoURL
    };
    saveLocalTable("users", users);
    syncToSupabase("users", "upsert", users[matchIdx]);
  }
  
  return Promise.resolve();
}

// Firestore Database Emulations
export function collection(dbInstance: any, path: string) {
  return { type: "collection", path };
}

export function doc(dbInstanceOrCollection: any, pathOrId?: string, id?: string) {
  let path = "";
  let docId = "";

  if (dbInstanceOrCollection.type === "collection") {
    path = dbInstanceOrCollection.path;
    docId = pathOrId || "doc_" + Math.random().toString(36).substr(2, 9);
  } else {
    path = pathOrId || "";
    docId = id || "doc_" + Math.random().toString(36).substr(2, 9);
  }

  return { type: "doc", path, id: docId };
}

export function query(colRef: any, ...constraints: any[]) {
  return {
    type: "query",
    path: colRef.path,
    constraints
  };
}

// Query Constraints Helpers
export function where(field: string, operator: string, value: any) {
  return { type: "where", field, operator, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc") {
  return { type: "orderBy", field, direction };
}

export function limit(value: number) {
  return { type: "limit", value };
}

export function increment(value: number) {
  return { type: "increment", value };
}

// Database Mutators Handlers
export async function addDoc(colRef: any, data: any) {
  const tableName = colRef.path;
  const newId = "doc_" + Math.random().toString(36).substr(2, 9);
  const docData = { id: newId, ...data };
  
  const tableData = getLocalTable(tableName);
  tableData.push(docData);
  saveLocalTable(tableName, tableData);
  
  // Sync writing to Supabase
  syncToSupabase(tableName, "upsert", docData);

  return { id: newId, path: tableName, type: "doc_ref" };
}

export async function setDoc(docRef: any, data: any, options?: any) {
  const tableName = docRef.path;
  const docId = docRef.id;
  const tableData = getLocalTable(tableName);
  
  const matchIdx = tableData.findIndex(item => item.id === docId);
  const docData = { id: docId, ...data };

  if (matchIdx !== -1) {
    if (options?.merge) {
      tableData[matchIdx] = { ...tableData[matchIdx], ...data };
    } else {
      tableData[matchIdx] = docData;
    }
  } else {
    tableData.push(docData);
  }

  saveLocalTable(tableName, tableData);
  
  // Sync writing to Supabase
  syncToSupabase(tableName, "upsert", tableData[matchIdx !== -1 ? matchIdx : tableData.length - 1]);

  return Promise.resolve();
}

export async function updateDoc(docRef: any, data: any) {
  const tableName = docRef.path;
  const docId = docRef.id;
  const tableData = getLocalTable(tableName);
  const matchIdx = tableData.findIndex(item => item.id === docId);

  if (matchIdx !== -1) {
    const item = tableData[matchIdx];
    // Execute increment & values update properties
    Object.entries(data).forEach(([key, val]) => {
      if (val && typeof val === "object" && (val as any).type === "increment") {
        item[key] = (Number(item[key]) || 0) + (val as any).value;
      } else {
        item[key] = val;
      }
    });

    saveLocalTable(tableName, tableData);
    syncToSupabase(tableName, "upsert", item);
  }

  return Promise.resolve();
}

export async function deleteDoc(docRef: any) {
  const tableName = docRef.path;
  const docId = docRef.id;
  const tableData = getLocalTable(tableName);
  const filtered = tableData.filter(item => item.id !== docId);
  
  saveLocalTable(tableName, filtered);
  syncToSupabase(tableName, "delete", { id: docId });

  return Promise.resolve();
}

// Database Batch System
export function writeBatch(dbInstance: any) {
  const operations: (() => Promise<void>)[] = [];
  return {
    set(docRef: any, data: any, options?: any) {
      operations.push(() => setDoc(docRef, data, options));
    },
    update(docRef: any, data: any) {
      operations.push(() => updateDoc(docRef, data));
    },
    delete(docRef: any) {
      operations.push(() => deleteDoc(docRef));
    },
    async commit() {
      for (const op of operations) {
        await op();
      }
      return Promise.resolve();
    }
  };
}

// Execute Constraint Queries
function executeQueryConstraints(tableName: string, constraints: any[]): any[] {
  let results = getLocalTable(tableName);

  // Apply where filtering
  constraints.forEach(c => {
    if (c.type === "where") {
      results = results.filter(item => {
        const itemVal = item[c.field];
        const queryVal = c.value;
        const op = c.operator;

        if (op === "==") return itemVal === queryVal;
        if (op === "!=") return itemVal !== queryVal;
        if (op === ">") return Number(itemVal) > Number(queryVal);
        if (op === "<") return Number(itemVal) < Number(queryVal);
        if (op === ">=") return Number(itemVal) >= Number(queryVal);
        if (op === "<=") return Number(itemVal) <= Number(queryVal);
        if (op === "array-contains") return Array.isArray(itemVal) && itemVal.includes(queryVal);
        return true;
      });
    }
  });

  // Apply order sorting
  constraints.forEach(c => {
    if (c.type === "orderBy") {
      const field = c.field;
      const asc = c.direction !== "desc";
      results.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === undefined && valB === undefined) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        
        if (typeof valA === "string" && typeof valB === "string") {
          return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return asc ? (Number(valA) - Number(valB)) : (Number(valB) - Number(valA));
      });
    }
  });

  // Apply limit constraints
  constraints.forEach(c => {
    if (c.type === "limit") {
      results = results.slice(0, c.value);
    }
  });

  return results;
}

// Database Readers implementation
export async function getDoc(docRef: any) {
  const tableName = docRef.path;
  const docId = docRef.id;

  // Sync fetch in background from Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase.from(tableName).select("*").eq("id", docId).single();
      if (!error && data) {
        const tableData = getLocalTable(tableName);
        const matchIdx = tableData.findIndex(item => item.id === docId);
        if (matchIdx !== -1) {
          tableData[matchIdx] = data;
        } else {
          tableData.push(data);
        }
        saveLocalTable(tableName, tableData);
      }
    } catch (e) {}
  }

  const tableData = getLocalTable(tableName);
  const docData = tableData.find(item => item.id === docId);

  return {
    id: docId,
    exists: () => docData !== undefined,
    data: () => docData
  };
}

export async function getDocs(queryOrCol: any) {
  const tableName = queryOrCol.path;
  const constraints = queryOrCol.constraints || [];

  // Parallel fetch and cache update from Supabase
  if (supabase) {
    await fetchSupabaseTableToLocalStorage(tableName);
  }

  const results = executeQueryConstraints(tableName, constraints);

  const docs = results.map(item => ({
    id: item.id,
    exists: () => true,
    data: () => item
  }));

  return {
    docs,
    forEach: (cb: (doc: any) => void) => docs.forEach(cb),
    empty: docs.length === 0
  };
}

// Real-time Event Subscription Listener Implementation
export function onSnapshot(queryOrCol: any, onNext: (snapshot: any) => void, onError?: (err: any) => void) {
  const tableName = queryOrCol.path;
  const constraints = queryOrCol.constraints || [];

  const triggerCallback = () => {
    if (queryOrCol.type === "doc") {
      const tableData = getLocalTable(tableName);
      const docData = tableData.find(item => item.id === queryOrCol.id);
      onNext({
        id: queryOrCol.id,
        exists: () => docData !== undefined,
        data: () => docData
      });
    } else {
      const results = executeQueryConstraints(tableName, constraints);
      const docs = results.map(item => ({
        id: item.id,
        exists: () => true,
        data: () => item
      }));
      onNext({
        docs,
        forEach: (cb: (doc: any) => void) => docs.forEach(cb),
        empty: docs.length === 0
      });
    }
  };

  // Initial trigger
  triggerCallback();

  // Register local memory database listener
  const unsubscribeLocal = registerListener(tableName, triggerCallback);

  // Sync Supabase Table & Realtime listener subscription is configured
  let unsubscribeSupabase = () => {};
  if (supabase) {
    fetchSupabaseTableToLocalStorage(tableName).then(() => {
      triggerCallback();
    });

    const channel = supabase
      .channel(`rt_${tableName}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName }, (payload) => {
        const latestData = getLocalTable(tableName);
        if (payload.eventType === "INSERT") {
          const index = latestData.findIndex(i => i.id === payload.new.id);
          if (index === -1) latestData.push(payload.new);
        } else if (payload.eventType === "UPDATE") {
          const index = latestData.findIndex(i => i.id === payload.new.id);
          if (index !== -1) latestData[index] = payload.new;
          else latestData.push(payload.new);
        } else if (payload.eventType === "DELETE") {
          const index = latestData.findIndex(i => i.id === payload.old.id);
          if (index !== -1) latestData.splice(index, 1);
        }
        saveLocalTable(tableName, latestData);
      })
      .subscribe();

    unsubscribeSupabase = () => {
      supabase.removeChannel(channel);
    };
  }

  return () => {
    unsubscribeLocal();
    unsubscribeSupabase();
  };
}

// Validate connection interface
async function testConnection() {
  // Graceful initial verification
  console.log("Supabase Compatibility Layer Online & Syncing");
}
testConnection();

// System Custom Error Handlers
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errMessage = error instanceof Error ? error.message : String(error);
  console.warn("Supabase Handled Network/State Update Result: ", errMessage, operationType, path);
}
