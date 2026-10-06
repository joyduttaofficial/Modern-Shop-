import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const firebaseConfig = JSON.parse(fs.readFileSync(path.resolve("./firebase-applet-config.json"), "utf-8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  for (const c of ["employees", "departments", "transactions", "customers", "products"]) {
    try {
      const q = query(collection(db, c), limit(5));
      const s = await getDocs(q);
      console.log(`Success ${c}: ${s.docs.length} docs`);
    } catch (e: any) {
      console.error(`Error for ${c}:`, e.code, e.message);
    }
  }
}
test();
