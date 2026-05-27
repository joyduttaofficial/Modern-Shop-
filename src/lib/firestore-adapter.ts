import * as realFirestore from "@firebase/firestore";

// Mode Check
export const isDemoEnabled = () => {
  return typeof localStorage !== "undefined" && localStorage.getItem("use_demo_mode") === "true";
};

// Simple Client-side Storage for Local Db
const getMockStorage = (): Record<string, any> => {
  try {
    const data = localStorage.getItem("firestore_local_db");
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

const saveMockStorage = (dbData: Record<string, any>) => {
  try {
    localStorage.setItem("firestore_local_db", JSON.stringify(dbData));
    // Trigger window storage event or custom event to notify listeners
    window.dispatchEvent(new Event("firestore_local_update"));
  } catch (e) {
    console.error("Local storage sync error", e);
  }
};

// Seed initial POS demo data if brand new local DB
const seedInitialData = () => {
  const current = getMockStorage();
  
  // Checking if already seeded
  if (Object.keys(current).length > 0) return;

  const initial: Record<string, any> = {
    // Company settings
    "settings/company": {
      id: "company",
      companyName: "Modern Shop (Demo)",
      companyTagline: "Performance Cloud POS & Management",
      companyLogoUrl: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=150&auto=format&fit=crop&q=60"
    },
    // Banks
    "banks/bank_1": { id: "bank_1", name: "Main Counter Cash", type: "cash", balance: 1420500, description: "Daily retail cash terminal" },
    "banks/bank_2": { id: "bank_2", name: "City Bank POS", type: "card", balance: 2840000, description: "Credit/Debit card merchant hub" },
    "banks/bank_3": { id: "bank_3", name: "bKash/Mobile Pay", type: "mobile", balance: 83500, description: "Digital mobile wallets" },
    
    // Custom roles
    "roles/admin": { id: "admin", name: "admin", permissions: { dashboard: true, transactions: true, sales: true, employees: true, attendance: true, suppliers: true, purchases: true, settings: true } },
    "roles/manager": { id: "manager", name: "manager", permissions: { dashboard: true, transactions: true, sales: true, employees: true, attendance: true, suppliers: true, purchases: true, settings: false } },
    "roles/sales": { id: "sales", name: "sales", permissions: { dashboard: true, transactions: false, sales: true, employees: false, attendance: true, suppliers: false, purchases: false, settings: false } },

    // Users
    "users/xIwpE8bPxghPG55PW6oYLNjSU503": {
      id: "xIwpE8bPxghPG55PW6oYLNjSU503",
      uid: "xIwpE8bPxghPG55PW6oYLNjSU503",
      email: "modern@admin.com",
      displayName: "Demo Administrator",
      role: "admin",
      status: "active",
      createdAt: new Date().toISOString(),
      photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=Main%20Administrator"
    },

    // Categories
    "categories/cat_1": { id: "cat_1", name: "Electronics & Accessories", parent: "" },
    "categories/cat_2": { id: "cat_2", name: "Apparel & Textiles", parent: "" },
    "categories/cat_3": { id: "cat_3", name: "Packaged Foodstuff", parent: "" },
    "categories/cat_4": { id: "cat_4", name: "Beverages & Liquids", parent: "" },

    // Employees
    "employees/emp_1": { id: "emp_1", name: "M. Rahman", phone: "01712345678", email: "rahman@modern.com", designation: "Chief Storekeeper", salary: 32000, status: "active", joiningDate: "2024-01-15", department: "management" },
    "employees/emp_2": { id: "emp_2", name: "Nisha Akhter", phone: "01812345679", email: "nisha@modern.com", designation: "Senior Cashier", salary: 22000, status: "active", joiningDate: "2024-03-10", department: "sales" },
    "employees/emp_3": { id: "emp_3", name: "Imran Khan", phone: "01912345680", email: "imran@modern.com", designation: "POS Agent", salary: 18000, status: "active", joiningDate: "2024-04-01", department: "sales" },

    // Suppliers
    "suppliers/sup_1": { id: "sup_1", name: "Galaxy Trading Co.", contactPerson: "S. Alam", phone: "01512345688", address: "Dhaka, Bangladesh", status: "active", remarks: "Key suppliers for packaged foodstuff" },
    "suppliers/sup_2": { id: "sup_2", name: "Apex Electronics Hub", contactPerson: "K. Mahmud", phone: "01612345699", address: "Chittagong, Bangladesh", status: "active", remarks: "Primary electronic gadgets vendor" },

    // Transactions
    "transactions/tx_1": { id: "tx_1", type: "sale", amount: 1540, bankId: "bank_1", date: new Date(Date.now() - 40 * 60 * 1000).toISOString(), category: "Retail POS Sale", note: "Invoice POS-1076", employeeId: "emp_2" },
    "transactions/tx_2": { id: "tx_2", type: "sale", amount: 9800, bankId: "bank_2", date: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(), category: "Wholesale POS Sale", note: "Invoice POS-1075", employeeId: "emp_3" },
    "transactions/tx_3": { id: "tx_3", type: "expense", amount: 450, bankId: "bank_1", date: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), category: "Utility & Office", note: "Electric bulb replacements", employeeId: "emp_1" },
    "transactions/tx_4": { id: "tx_4", type: "purchase", amount: 12500, bankId: "bank_2", date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), category: "Supplier Restock", note: "PO-7023 to Galaxy Trading", supplierId: "sup_1" },
    "transactions/tx_5": { id: "tx_5", type: "deposit", amount: 50000, bankId: "bank_2", date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), category: "Bank Deposit", note: "End of day retail transfer" },
    "transactions/tx_6": { id: "tx_6", type: "sale", amount: 4320, bankId: "bank_1", date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), category: "Retail POS Sale", note: "Invoice POS-1074" }
  };

  saveMockStorage(initial);
};

// Seed automatically on trigger
if (isDemoEnabled()) {
  seedInitialData();
}

// Global update listeners
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("firestore_local_update", () => {
    listeners.forEach(l => l());
  });
  window.addEventListener("storage", () => {
    listeners.forEach(l => l());
  });
}

// Proxy definitions
export const getFirestore = (app: any, databaseId?: string) => {
  if (isDemoEnabled()) {
    return { type: "firestore_mock", appId: app?.name, databaseId };
  }
  return realFirestore.getFirestore(app, databaseId);
};

export const doc = (db: any, collectionOrPath: string | any, ...additionalPaths: string[]): any => {
  if (isDemoEnabled()) {
    let finalPath = "";
    if (typeof collectionOrPath === "string") {
      finalPath = collectionOrPath;
    } else if (collectionOrPath && collectionOrPath.path) {
      finalPath = collectionOrPath.path;
    }
    
    if (additionalPaths.length > 0) {
      finalPath = `${finalPath}/${additionalPaths.join("/")}`;
    }
    const idx = finalPath.lastIndexOf("/");
    const id = idx !== -1 ? finalPath.substring(idx + 1) : finalPath;
    return { type: "doc_ref", path: finalPath, id };
  }
  return (realFirestore.doc as any)(db, collectionOrPath, ...additionalPaths);
};

export const collection = (db: any, path: string, ...additionalSegments: string[]): any => {
  if (isDemoEnabled()) {
    let finalPath = path;
    if (additionalSegments.length > 0) {
      finalPath = `${finalPath}/${additionalSegments.join("/")}`;
    }
    return { type: "collection_ref", path: finalPath };
  }
  return (realFirestore.collection as any)(db, path, ...additionalSegments);
};

export const query = (collectionRef: any, ...queryConstraints: any[]): any => {
  if (isDemoEnabled()) {
    return { type: "query_ref", collection: collectionRef, constraints: queryConstraints };
  }
  return (realFirestore.query as any)(collectionRef, ...queryConstraints);
};

export const where = (field: string, op: any, val: any) => {
  if (isDemoEnabled()) {
    return { type: "where_constraint", field, op, val };
  }
  return realFirestore.where(field, op as any, val);
};

export const orderBy = (field: string, direction: any = "asc") => {
  if (isDemoEnabled()) {
    return { type: "orderby_constraint", field, direction };
  }
  return realFirestore.orderBy(field, direction as any);
};

export const limit = (value: number) => {
  if (isDemoEnabled()) {
    return { type: "limit_constraint", value };
  }
  return realFirestore.limit(value);
};

// Snapshot & Document Data Creators
const createMockDocSnapshot = (id: string, path: string, data: any) => {
  return {
    id,
    ref: { path, id },
    exists: () => !!data,
    data: () => (data ? { ...data } : undefined)
  };
};

// Filtering local collections based on constraints
const getLocalCollectionData = (collPath: string, queryRef?: any): any[] => {
  const dbData = getMockStorage();
  const results: any[] = [];
  
  Object.keys(dbData).forEach(key => {
    // E.g. key is "employees/emp_1", we want prefix "employees"
    const slashIdx = key.lastIndexOf("/");
    const keyColl = slashIdx !== -1 ? key.substring(0, slashIdx) : "";
    const keyId = slashIdx !== -1 ? key.substring(slashIdx + 1) : key;
    
    if (keyColl === collPath) {
      results.push({ id: keyId, path: key, ...dbData[key] });
    }
  });

  // Apply basic where conditions
  let filtered = [...results];
  if (queryRef && queryRef.constraints) {
    queryRef.constraints.forEach((c: any) => {
      if (c && c.type === "where_constraint") {
        const { field, op, val } = c;
        filtered = filtered.filter(item => {
          const itemVal = item[field];
          if (op === "==") return itemVal === val;
          if (op === "!=") return itemVal !== val;
          if (op === ">") return itemVal > val;
          if (op === "<") return itemVal < val;
          if (op === ">=") return itemVal >= val;
          if (op === "<=") return itemVal <= val;
          return true;
        });
      }
    });

    // Apply basic orderBy
    const order = queryRef.constraints.find((c: any) => c && c.type === "orderby_constraint");
    if (order) {
      const { field, direction } = order;
      filtered.sort((a, b) => {
        const aVal = a[field] ?? "";
        const bVal = b[field] ?? "";
        if (aVal < bVal) return direction === "desc" ? 1 : -1;
        if (aVal > bVal) return direction === "desc" ? -1 : 1;
        return 0;
      });
    }

    // Apply limit
    const lim = queryRef.constraints.find((c: any) => c && c.type === "limit_constraint");
    if (lim) {
      filtered = filtered.slice(0, lim.value);
    }
  }

  return filtered;
};

// Handlers
export const getDoc = async (docRef: any): Promise<any> => {
  if (isDemoEnabled()) {
    const dbData = getMockStorage();
    const data = dbData[docRef.path];
    return createMockDocSnapshot(docRef.id, docRef.path, data);
  }
  return realFirestore.getDoc(docRef);
};

export const getDocFromServer = async (docRef: any): Promise<any> => {
  if (isDemoEnabled()) {
    return getDoc(docRef);
  }
  return realFirestore.getDocFromServer(docRef);
};

export const getDocs = async (queryOrCollRef: any): Promise<any> => {
  if (isDemoEnabled()) {
    const collPath = queryOrCollRef.type === "query_ref" ? queryOrCollRef.collection.path : queryOrCollRef.path;
    const items = getLocalCollectionData(collPath, queryOrCollRef.type === "query_ref" ? queryOrCollRef : undefined);
    const docSnapshots = items.map(item => {
      const { id, path, ...rest } = item;
      return createMockDocSnapshot(id, path, rest);
    });

    return {
      docs: docSnapshots,
      empty: docSnapshots.length === 0,
      forEach: (callback: (doc: any) => void) => {
        docSnapshots.forEach(callback);
      }
    };
  }
  return realFirestore.getDocs(queryOrCollRef);
};

export const setDoc = async (docRef: any, data: any, options?: any): Promise<void> => {
  if (isDemoEnabled()) {
    const dbData = getMockStorage();
    const oldData = dbData[docRef.path] || {};
    let finalData = {};
    if (options && options.merge) {
      finalData = { ...oldData, ...data };
    } else {
      finalData = { ...data };
    }
    // Handle increments or custom types
    Object.keys(finalData).forEach(k => {
      const val = (finalData as any)[k];
      if (val && val.type === "increment") {
        const currentVal = Number(oldData[k] || 0);
        (finalData as any)[k] = currentVal + val.value;
      }
    });

    dbData[docRef.path] = finalData;
    saveMockStorage(dbData);
    return Promise.resolve();
  }
  return realFirestore.setDoc(docRef, data, options);
};

export const addDoc = async (collectionRef: any, data: any): Promise<any> => {
  if (isDemoEnabled()) {
    const dbData = getMockStorage();
    const mockId = Math.random().toString(36).substring(2, 11);
    const finalPath = `${collectionRef.path}/${mockId}`;
    
    // Resolve any increment operations
    const savedData = { ...data };
    Object.keys(savedData).forEach(k => {
      const val = savedData[k];
      if (val && val.type === "increment") {
        savedData[k] = val.value;
      }
    });

    dbData[finalPath] = savedData;
    saveMockStorage(dbData);

    const docReference = { type: "doc_ref", path: finalPath, id: mockId };
    return Promise.resolve(docReference);
  }
  return realFirestore.addDoc(collectionRef, data);
};

export const updateDoc = async (docRef: any, dataOrField: any, ...rest: any[]): Promise<void> => {
  if (isDemoEnabled()) {
    const dbData = getMockStorage();
    const current = dbData[docRef.path] || {};
    
    let updates: Record<string, any> = {};
    if (typeof dataOrField === "string") {
      updates[dataOrField] = rest[0];
    } else {
      updates = { ...dataOrField };
    }

    const merged = { ...current };
    Object.keys(updates).forEach(k => {
      const val = updates[k];
      if (val && val.type === "increment") {
        const prev = Number(current[k] || 0);
        merged[k] = prev + val.value;
      } else {
         merged[k] = val;
      }
    });

    dbData[docRef.path] = merged;
    saveMockStorage(dbData);
    return Promise.resolve();
  }
  return (realFirestore.updateDoc as any)(docRef, dataOrField, ...rest);
};

export const deleteDoc = async (docRef: any): Promise<void> => {
  if (isDemoEnabled()) {
    const dbData = getMockStorage();
    delete dbData[docRef.path];
    saveMockStorage(dbData);
    return Promise.resolve();
  }
  return realFirestore.deleteDoc(docRef);
};

export const increment = (value: number) => {
  if (isDemoEnabled()) {
    return { type: "increment", value };
  }
  return realFirestore.increment(value);
};

// Batch Support
export const writeBatch = (db: any): any => {
  if (isDemoEnabled()) {
    const operations: Array<() => void> = [];
    return {
      set: (docRef: any, data: any, options?: any) => {
        operations.push(() => {
          const dbData = getMockStorage();
          const oldData = dbData[docRef.path] || {};
          let fData = {};
          if (options && options.merge) {
            fData = { ...oldData, ...data };
          } else {
            fData = { ...data };
          }
          dbData[docRef.path] = fData;
          saveMockStorage(dbData);
        });
      },
      update: (docRef: any, dataOrField: any, ...rest: any[]) => {
        operations.push(() => {
          const dbData = getMockStorage();
          const current = dbData[docRef.path] || {};
          let updates: Record<string, any> = {};
          if (typeof dataOrField === "string") {
            updates[dataOrField] = rest[0];
          } else {
            updates = { ...dataOrField };
          }
          const merged = { ...current };
          Object.keys(updates).forEach(k => {
            const val = updates[k];
            if (val && val.type === "increment") {
              const prev = Number(current[k] || 0);
              merged[k] = prev + val.value;
            } else {
              merged[k] = val;
            }
          });
          dbData[docRef.path] = merged;
          saveMockStorage(dbData);
        });
      },
      delete: (docRef: any) => {
        operations.push(() => {
          const dbData = getMockStorage();
          delete dbData[docRef.path];
          saveMockStorage(dbData);
        });
      },
      commit: async () => {
        operations.forEach(op => op());
        return Promise.resolve();
      }
    };
  }
  return realFirestore.writeBatch(db);
};

export const onSnapshot = (
  queryOrDocRef: any,
  next: (snapshot: any) => void,
  error?: (error: any) => void,
  options?: any
): (() => void) => {
  if (isDemoEnabled()) {
    const handleLocalChange = () => {
      try {
        if (queryOrDocRef.type === "doc_ref") {
          const dbData = getMockStorage();
          const data = dbData[queryOrDocRef.path];
          const snap = createMockDocSnapshot(queryOrDocRef.id, queryOrDocRef.path, data);
          next(snap);
        } else {
          // It's a collection_ref or query_ref
          const collPath = queryOrDocRef.type === "query_ref" ? queryOrDocRef.collection.path : queryOrDocRef.path;
          const items = getLocalCollectionData(collPath, queryOrDocRef.type === "query_ref" ? queryOrDocRef : undefined);
          const docSnapshots = items.map(item => {
            const { id, path, ...rest } = item;
            return createMockDocSnapshot(id, path, rest);
          });
          
          const snap = {
            docs: docSnapshots,
            empty: docSnapshots.length === 0,
            forEach: (callback: (doc: any) => void) => {
              docSnapshots.forEach(callback);
            }
          };
          next(snap);
        }
      } catch (err) {
        if (error) error(err);
      }
    };

    // Call initially
    handleLocalChange();

    listeners.add(handleLocalChange);
    return () => {
      listeners.delete(handleLocalChange);
    };
  }

  // Original standard firebase listener
  return realFirestore.onSnapshot(queryOrDocRef, next, error);
};
