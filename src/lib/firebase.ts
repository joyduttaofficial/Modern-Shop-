import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer, updateDoc as firestoreUpdateDoc, DocumentReference, UpdateData } from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

// Validate connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    const isOfflineOrRestricted = 
      errStr.toLowerCase().includes("offline") ||
      errStr.toLowerCase().includes("unavailable") ||
      errStr.toLowerCase().includes("quota") ||
      errStr.toLowerCase().includes("could not reach");
    
    if (isOfflineOrRestricted) {
      handleFirestoreError(error, OperationType.GET, "test/connection");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errStr = error instanceof Error ? error.message : String(error);
  
  // Track quota exceeded or connection/unavailable events globally
  const isQuotaOrRestricted = 
    errStr.toLowerCase().includes("quota exceeded") || 
    errStr.toLowerCase().includes("quota limit exceeded") || 
    errStr.toLowerCase().includes("free daily read units") ||
    errStr.toLowerCase().includes("exceeded free quota") ||
    errStr.toLowerCase().includes("unavailable") ||
    errStr.toLowerCase().includes("could not reach cloud firestore backend");

  if (isQuotaOrRestricted && typeof window !== "undefined") {
    (window as any).__firestore_quota_exceeded__ = true;
    window.dispatchEvent(new CustomEvent("firestore-quota-exceeded"));
  }

  const errInfo: FirestoreErrorInfo = {
    error: errStr,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
  
  console.warn("Firestore Operation Warning/Restricted: ", JSON.stringify(errInfo));

  // To prevent unhandled crashes in read-only background listeners and page initialization,
  // do not throw when checking connection or reading datasets during a restricted state.
  const isReadOp = operationType === OperationType.GET || operationType === OperationType.LIST;
  if (isQuotaOrRestricted && isReadOp) {
    return;
  }

  throw error instanceof Error ? error : new Error(JSON.stringify(errInfo));
}

export async function updateDoc(reference: DocumentReference<any, any>, data: UpdateData<any>) {
  try {
    await firestoreUpdateDoc(reference, data);
  } catch (error: any) {
    const errStr = String(error?.message || error);
    if (
      errStr.toLowerCase().includes("no document to update") ||
      error?.code === "not-found"
    ) {
      console.warn("Document not found for update, skipping gracefully:", reference.path);
      return;
    }
    throw error;
  }
}

