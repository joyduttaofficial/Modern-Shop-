/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { cn } from "@/src/lib/utils";
import { 
  LayoutDashboard, 
  ReceiptIndianRupee, 
  Users, 
  FileText, 
  Settings as SettingsIcon, 
  Menu, 
  X, 
  Plus, 
  CreditCard,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Sun,
  Moon,
  Boxes,
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Cloud,
  CloudOff,
  ArrowUpRight,
  ArrowUpDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { UserProfile, UserRole, RolePermission, Transaction } from "@/src/types";
import { useLanguage } from "./contexts/LanguageContext";
import defaultLogo from "./assets/images/modern_pro_logo_1780829028289.png";
import {
  saveTransactionsToIndexedDB,
  getTransactionsFromIndexedDB,
  getOfflineStorageStats,
  syncOfflineDataWithFirestore,
  saveSingleTransactionOffline,
  clearAllPendingSyncQueue,
  OfflineStorageStats,
  getIndexedDB
} from "@/src/lib/indexedDbFallback";

// Components
import Dashboard from "./components/Dashboard";
import Transactions from "./components/Transactions";
import Employees from "./components/Employees";
import SalarySheet from "./components/SalarySheet";
import SalaryEntry from "./components/SalaryEntry";
import Attendance from "./components/Attendance";
import Reports from "./components/Reports";
import Settings from "./components/Settings";
import NewSale from "./components/NewSale";
import SalesList from "./components/SalesList";
import Suppliers from "./components/Suppliers";
import Purchase from "./components/Purchase";
import UsersManager from "./components/UsersManager";
import Login from "./components/Login";
import Inventory from "./components/Inventory";

function QuotaExceededOverlay({ onDismiss, databaseId, projectId }: { onDismiss: () => void; databaseId: string; projectId: string }) {
  const upgradeUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`;
  const pricingUrl = "https://firebase.google.com/pricing#cloud-firestore";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs min-h-screen">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 max-w-lg w-full rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-2xl p-6 sm:p-8 space-y-6 relative"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center text-amber-500 shrink-0 border border-amber-100 dark:border-amber-900/30">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100 tracking-tight">
              Firestore Quota Limit Exceeded
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-wider font-semibold">
              spark plan free tier exhausted
            </p>
          </div>
        </div>

        <div className="space-y-4 text-slate-650 dark:text-neutral-300 text-sm leading-relaxed">
          <p>
            The standard Firebase Spark plan has reached its free limit of <strong>daily read units</strong> for this project.
          </p>
          <div className="p-4 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-2">
            <p className="font-medium text-slate-805 dark:text-neutral-200 text-xs text-amber-600 dark:text-amber-500 uppercase tracking-widest leading-none">
              Status & Resolution:
            </p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">
              Firestore read operations are temporarily restricted. Standard daily free tier quotas will automatically reset tomorrow. To instantly restore database connectivity, please enable billing or upgrade the project in the Firebase Console.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Detailed quota information is available under the <strong>Spark plan</strong> column in the <strong>Enterprise edition</strong> section of official Firebase Documentation.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-slate-950 dark:bg-[#d4af37] dark:text-black hover:bg-slate-850 text-white font-bold text-sm tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-950/10 cursor-pointer text-center"
          >
            <span>Upgrade & Enable Billing</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
            </svg>
          </a>

          <a
            href={pricingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 bg-slate-50 dark:bg-zinc-850 hover:bg-slate-100 dark:hover:bg-zinc-850 text-slate-705 dark:text-neutral-200 font-bold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-zinc-700 cursor-pointer text-center"
          >
            View Firebase Pricing Tiers
          </a>

          <button
            onClick={onDismiss}
            className="w-full py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800/40 text-slate-500 hover:text-slate-800 dark:hover:text-neutral-300 font-semibold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer text-center"
          >
            Dismiss & Attempt with Cached Data
          </button>
        </div>
      </motion.div>
    </div>
  );
}

type View = "dashboard" | "transactions" | "newSale" | "salesList" | "newEmployee" | "employeesList" | "employees" | "salaryEntry" | "salarySheet" | "addAttendance" | "attendanceList" | "attendance" | "reports" | "settings" | "newSupplier" | "suppliersList" | "suppliers" | "newPurchase" | "purchaseList" | "paySupplierDue" | "newUser" | "usersList" | "rolesList" | "profileView" | "inventory";

const VALID_VIEWS: View[] = [
  "dashboard",
  "transactions",
  "newSale",
  "salesList",
  "newEmployee",
  "employeesList",
  "employees",
  "salaryEntry",
  "salarySheet",
  "addAttendance",
  "attendanceList",
  "attendance",
  "reports",
  "settings",
  "newSupplier",
  "suppliersList",
  "suppliers",
  "newPurchase",
  "purchaseList",
  "paySupplierDue",
  "newUser",
  "usersList",
  "rolesList",
  "profileView",
  "inventory"
];

export default function App() {
  const { language, setLanguage, t, formatDate } = useLanguage();
  const [activeView, setActiveView] = useState<View>(() => {
    if (typeof window !== "undefined") {
      try {
        const hash = window.location.hash.replace("#", "") as View;
        if (hash && VALID_VIEWS.includes(hash)) {
          return hash;
        }
        const saved = localStorage.getItem("activeView") as View;
        if (saved && VALID_VIEWS.includes(saved)) {
          return saved;
        }
      } catch (e) {
        console.warn("Error reading activeView from storage/hash:", e);
      }
    }
    return "dashboard";
  });

  // Keep localStorage and URL hash in sync with activeView
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("activeView", activeView);
        if (window.location.hash !== `#${activeView}`) {
          window.history.replaceState(null, "", `#${activeView}`);
        }
      } catch (e) {
        console.warn("Error saving activeView:", e);
      }
    }
  }, [activeView]);

  // Support browser Back/Forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as View;
      if (VALID_VIEWS.includes(hash) && hash !== activeView) {
        setActiveView(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [activeView]);
  const [initialActiveTab, setInitialActiveTab] = useState<"income" | "expense">("income");
  const [salesEditDate, setSalesEditDate] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("darkMode");
      return saved ? saved === "true" : false;
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
    }
  }, [darkMode]);

  const [quotaExceeded, setQuotaExceeded] = useState(() => {
    if (typeof window !== "undefined") {
      return !!(window as any).__firestore_quota_exceeded__;
    }
    return false;
  });

  useEffect(() => {
    const checkErrorForQuota = (errStr: string) => {
      if (
        errStr.toLowerCase().includes("quota exceeded") ||
        errStr.toLowerCase().includes("quota limit exceeded") ||
        errStr.toLowerCase().includes("free daily read units") ||
        errStr.toLowerCase().includes("exceeded free quota") ||
        errStr.toLowerCase().includes("unavailable") ||
        errStr.toLowerCase().includes("could not reach cloud firestore backend")
      ) {
        if (typeof window !== "undefined") {
          (window as any).__firestore_quota_exceeded__ = true;
        }
        setQuotaExceeded(true);
      }
    };

    const handleError = (event: ErrorEvent) => {
      const msg = event.message || (event.error && event.error.message) || "";
      checkErrorForQuota(msg);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      checkErrorForQuota(msg);
    };

    const handleCustomEvent = () => {
      setQuotaExceeded(true);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("firestore-quota-exceeded", handleCustomEvent);

    // Patch console.error to track errors caught and logged by firebase code
    const originalConsoleError = console.error;
    console.error = function (...args) {
      originalConsoleError.apply(console, args);
      const strArgs = args.map(arg => {
        try {
          return typeof arg === "object" ? JSON.stringify(arg) : String(arg);
        } catch {
          return String(arg);
        }
      }).join(" ");
      checkErrorForQuota(strArgs);
    };

    if (typeof window !== "undefined" && (window as any).__firestore_quota_exceeded__) {
      setQuotaExceeded(true);
    }

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("firestore-quota-exceeded", handleCustomEvent);
      console.error = originalConsoleError;
    };
  }, []);

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [customRoles, setCustomRoles] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  // -------------------------------------------------------------
  // IndexedDB Local Storage Fallback & Offline State Management
  // -------------------------------------------------------------
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return !navigator.onLine;
    }
    return false;
  });

  const [offlineStats, setOfflineStats] = useState<OfflineStorageStats>({
    transactionsCount: 0,
    salesCount: 0,
    pendingSyncCount: 0,
    lastSyncTime: null,
    isStorageReady: false
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showStorageModal, setShowStorageModal] = useState(false);

  // Initialize and refresh IndexedDB storage stats
  const refreshStorageStats = async () => {
    try {
      const stats = await getOfflineStorageStats();
      setOfflineStats(stats);
    } catch (e) {
      console.warn("Could not load IndexedDB stats:", e);
    }
  };

  useEffect(() => {
    // Initial IndexedDB verification
    getIndexedDB().then(() => {
      refreshStorageStats();
    }).catch((err) => {
      console.warn("IndexedDB initialization warning:", err);
    });

    const handleOnline = async () => {
      setIsOffline(false);
      setSyncFeedback({ type: "info", message: "Network connection restored. Syncing pending data with Firestore..." });
      if (user?.uid) {
        await handleAutoSync();
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setSyncFeedback({ type: "info", message: "Offline mode active: Critical transactions and sales are securely saved in IndexedDB." });
      refreshStorageStats();
    };

    const handleStorageUpdate = () => {
      refreshStorageStats();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("indexeddb-storage-updated", handleStorageUpdate);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("indexeddb-storage-updated", handleStorageUpdate);
    };
  }, [user]);

  // Background mirroring of Firestore transactions into IndexedDB for zero data loss
  useEffect(() => {
    if (!user) return;

    let unsub: (() => void) | null = null;
    try {
      const q = query(collection(db, "transactions"));
      unsub = onSnapshot(q, (snapshot) => {
        const liveTxs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
        if (liveTxs.length > 0) {
          saveTransactionsToIndexedDB(liveTxs).then(() => {
            refreshStorageStats();
          });
        }
        setIsOffline(false);
      }, (err) => {
        console.warn("Firestore snapshot unreachable or restricted, activating IndexedDB fallback layer:", err);
        setIsOffline(true);
        refreshStorageStats();
      });
    } catch (e) {
      console.warn("Error establishing transaction backup listener:", e);
      setIsOffline(true);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const handleAutoSync = async () => {
    if (!user?.uid || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncOfflineDataWithFirestore(db, user.uid);
      await refreshStorageStats();
      if (result.syncedCount > 0) {
        setSyncFeedback({
          type: "success",
          message: `Successfully synchronized ${result.syncedCount} queued offline change${result.syncedCount > 1 ? "s" : ""} with Cloud Firestore!`
        });
      }
    } catch (e) {
      console.error("Auto sync error:", e);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  const handleManualSync = async () => {
    if (!user?.uid) return;
    setIsSyncing(true);
    setSyncFeedback({ type: "info", message: "Connecting to Cloud Firestore..." });
    try {
      const result = await syncOfflineDataWithFirestore(db, user.uid);
      await refreshStorageStats();
      if (result.syncedCount > 0) {
        setSyncFeedback({
          type: "success",
          message: `Synced ${result.syncedCount} queued change${result.syncedCount > 1 ? "s" : ""} to Firestore successfully!`
        });
      } else {
        setSyncFeedback({
          type: "success",
          message: "All local transactions & sales are already up-to-date with Firestore!"
        });
      }
    } catch (e: any) {
      setSyncFeedback({
        type: "error",
        message: `Sync failed: ${e?.message || "Check network/Firestore connection."}`
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  const handleTestOfflineWrite = async () => {
    if (!user?.uid) return;
    const testTx: Transaction = {
      date: new Date().toISOString(),
      type: "income",
      category: "Employee Sales",
      subCategory: "Diagnostic Test",
      amount: 1250,
      paymentMethod: "Cash",
      notes: "Offline Diagnostic Transaction stored via IndexedDB fallback layer",
      createdBy: user.uid
    };

    try {
      await saveSingleTransactionOffline(testTx, true);
      await refreshStorageStats();
      setSyncFeedback({
        type: "success",
        message: "Offline test transaction successfully saved to IndexedDB and queued for sync!"
      });
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: "Failed to write offline test record."
      });
    }
    setTimeout(() => setSyncFeedback(null), 5000);
  };

  // Dynamic Company Branding & Profile States
  const [companyName, setCompanyName] = useState("Modern Pro");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");

  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Pro");
        setCompanyTagline(data.companyTagline || "Automated POS");
        setCompanyLogoUrl(data.companyLogoUrl || "");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/company");
    });
    return () => unsubBranding();
  }, []);

  // Load custom roles
  useEffect(() => {
    if (!user) {
      setCustomRoles([]);
      return;
    }
    const unsubRoles = onSnapshot(collection(db, "roles"), (snap) => {
      const parsedRoles: RolePermission[] = [];
      snap.forEach((doc) => {
        parsedRoles.push({ id: doc.id, ...doc.data() } as RolePermission);
      });
      setCustomRoles(parsedRoles);
    }, (err) => console.error("Roles fetch error", err));
    return () => unsubRoles();
  }, [user]);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      // Immediately unsubscribe from previous profile listener if any
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (u) {
        try {
          // Fetch or create profile. First, check if there's an invited user with this email
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", u.email?.toLowerCase() || ""));
          const querySnap = await getDocs(q);
          
          let profileData: UserProfile | null = null;
          let profileId: string | null = null;

          if (!querySnap.empty) {
            const docSnap = querySnap.docs[0];
            const oldDocId = docSnap.id;
            profileData = docSnap.data() as UserProfile;
            
            if (oldDocId !== u.uid) {
              // Document ID is different from u.uid. Copy the data to u.uid!
              profileData.uid = u.uid;
              await setDoc(doc(db, "users", u.uid), profileData);
              
              // Delete the legacy document
              try {
                await deleteDoc(doc(db, "users", oldDocId));
              } catch (delErr) {
                console.warn("Could not delete legacy invited record", delErr);
              }
              profileId = u.uid;
            } else {
              profileId = oldDocId;
              if (!profileData.uid) {
                profileData.uid = u.uid;
                await setDoc(doc(db, "users", profileId), { uid: u.uid }, { merge: true });
              }
            }
          } else {
            // Fallback to check directly at uid path
            const profileRef = doc(db, "users", u.uid);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              profileData = profileSnap.data() as UserProfile;
              profileId = u.uid;
            }
          }

          if (!profileData) {
            // If no profile found at all, check if first user in system
            const allUsersSnap = await getDocs(collection(db, "users"));
            const isFirstUser = allUsersSnap.empty;
            const isModernAdmin = u.email?.toLowerCase() === "modern@admin.com";

            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || "",
              displayName: isModernAdmin ? "Main Administrator" : (u.displayName || "New User"),
              role: (isFirstUser || isModernAdmin) ? "admin" : "sales", // First user or modern@admin.com is admin
              createdAt: new Date().toISOString(),
              status: "active",
              photoURL: u.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(isModernAdmin ? "Main Administrator" : "New User")}`
            };
            
            profileId = u.uid;
            await setDoc(doc(db, "users", profileId), newProfile);
            profileData = newProfile;
          } else if (u.email?.toLowerCase() === "modern@admin.com" && (profileData.role !== "admin" || profileData.status !== "active")) {
            // Force main admin state to active and role to admin in Firestore
            profileData.role = "admin";
            profileData.status = "active";
            await setDoc(doc(db, "users", profileId), { role: "admin", status: "active" }, { merge: true });
          }

          setProfile(profileData);

          // Listen for profile changes (role updates)
          if (profileId) {
            const profileRef = doc(db, "users", profileId);
            unsubProfile = onSnapshot(profileRef, (snap) => {
              if (snap.exists()) setProfile(snap.data() as UserProfile);
            }, (error) => {
              // Only log if the user is still actively signed in
              if (auth.currentUser) {
                console.error("Profile sync error", error);
              }
            });
          }
        } catch (err) {
          console.error("Error loading user profile:", err);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: ReceiptIndianRupee },
    { 
      id: "sales", 
      label: "Sales Hub", 
      icon: ShoppingCart, 
      children: [
        { id: "newSale", label: "New Sale Entry" },
        { id: "salesList", label: "Sales List / Ledger" }
      ]
    },
    { 
      id: "suppliers", 
      label: "Suppliers", 
      icon: UserPlus, 
      children: [
        { id: "newSupplier", label: "New Supplier Info" },
        { id: "suppliersList", label: "Suppliers Ledger" }
      ]
    },
    { 
      id: "purchases", 
      label: "Purchase Book", 
      icon: CreditCard, 
      children: [
        { id: "newPurchase", label: "New Procurement" },
        { id: "purchaseList", label: "Bills & Purchase List" },
        { id: "paySupplierDue", label: "Supplier Due Payment" }
      ]
    },
    { 
      id: "employees", 
      label: "Employees", 
      icon: Users, 
      children: [
        { id: "newEmployee", label: "Add New Employee" },
        { id: "employeesList", label: "Registered Staff" },
        { id: "salaryEntry", label: "Disburse Salary" },
        { id: "salarySheet", label: "Monthly Ledger" }
      ]
    },
    { 
      id: "attendance", 
      label: "Attendance", 
      icon: ShieldCheck, 
      children: [
        { id: "addAttendance", label: "Daily Input" },
        { id: "attendanceList", label: "Attendance Book" }
      ]
    },
    { id: "inventory", label: "Inventory Hub", icon: Boxes },
    { id: "reports", label: "Reports & PDFs", icon: FileText },
    { 
      id: "users", 
      label: "Users", 
      icon: Users, 
      children: [
        { id: "newUser", label: "New User" },
        { id: "usersList", label: "Users List" },
        { id: "rolesList", label: "Roles List" }
      ]
    },
    { id: "settings", label: "Settings Pane", icon: SettingsIcon },
  ];

  const hasAccessToView = (viewId: string) => {
    if (!profile) return false;
    
    // Admins always have full, unrestricted access to all menus
    if (profile.role === "admin") return true;

    // Strict Admin-only views - Settings, Users and Roles are strictly locked to admin role
    const absoluteAdminOnly = ["settings", "newUser", "usersList", "rolesList"];
    if (absoluteAdminOnly.includes(viewId)) {
      return false;
    }

    // Direct match check on user's assigned role from custom roles collection first
    const matchedRole = customRoles.find(r => r.id === profile.role);
    if (matchedRole) {
      return matchedRole.allowedMenus.includes(viewId);
    }

    // Default built-in fallback permissions if no custom roles are matched
    if (profile.role === "accountant") {
      const restrictedForAccountant = ["newUser", "usersList", "rolesList", "settings"];
      return !restrictedForAccountant.includes(viewId);
    }

    if (profile.role === "sales") {
      const allowedForSales = ["dashboard", "sales", "newSale", "salesList", "transactions", "profileView"];
      return allowedForSales.includes(viewId);
    }

    return false;
  };

  useEffect(() => {
    // Automatically close other menus and expand only the active view's parent folder
    const parent = navItems.find(item => 
      "children" in item && Array.isArray((item as any).children) && 
      (item as any).children.some((child: any) => child.id === activeView)
    );
    if (parent) {
      setExpandedMenus({ [parent.id]: true });
    } else {
      setExpandedMenus({});
    }
  }, [activeView]);

  const handleLogout = () => signOut(auth);

  if (loading && !quotaExceeded) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F5F5F4]">
        <div className="animate-spin rounded-full h-12 w-12 border-slate-900 border-b-2"></div>
      </div>
    );
  }

  if (quotaExceeded) {
    return (
      <QuotaExceededOverlay 
        onDismiss={() => setQuotaExceeded(false)} 
        databaseId="ai-studio-254e2cd5-7d37-444e-878d-72afd87a600f"
        projectId="studio-1767695098-65e9f"
      />
    );
  }

  if (!user || !profile) {
    return <Login />;
  }

  const filteredNavItems = navItems.map(item => {
    if ("children" in item && Array.isArray((item as any).children)) {
      const allowedChildren = (item as any).children.filter((child: any) => hasAccessToView(child.id));
      if (allowedChildren.length > 0) {
        return {
          ...item,
          children: allowedChildren
        };
      }
      return null;
    }
    if (hasAccessToView(item.id)) {
      return item;
    }
    return null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="min-h-screen bg-slate-50/50 flex font-sans text-slate-800 antialiased selection:bg-slate-200">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur border-b border-slate-100 z-50 flex items-center justify-between px-4 print:hidden">
        <div className="flex items-center gap-2">
          {companyLogoUrl ? (
            <img 
              src={companyLogoUrl} 
              alt="Logo" 
              className="w-8 h-8 rounded-lg object-contain border border-slate-100 shadow-xs bg-white shrink-0" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = defaultLogo;
              }}
            />
          ) : (
            <img 
              src={defaultLogo} 
              alt="Logo" 
              className="w-8 h-8 rounded-lg object-contain border border-slate-100 shadow-xs bg-white shrink-0" 
              referrerPolicy="no-referrer"
            />
          )}
          <span className="font-extrabold tracking-tight text-slate-900 text-base">{companyName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-slate-750 hover:bg-slate-50 dark:hover:bg-zinc-800/40 rounded-xl transition-all flex items-center justify-center cursor-pointer"
            title="Toggle theme (Golden & Black)"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-[#d4af37]" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>

          <div className="bg-slate-50 p-0.5 rounded-lg border border-slate-150 flex items-center">
            <button
              onClick={() => setLanguage("en")}
              className={cn(
                "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                language === "en" ? "bg-white text-slate-900 shadow-xs border border-slate-200/50" : "text-slate-500"
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("bn")}
              className={cn(
                "px-2 py-1 text-[10px] font-bold rounded-md transition-all font-sans",
                language === "bn" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500"
              )}
            >
              বাংলা
            </button>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-35 lg:hidden backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
          aria-label="Close sidebar menu"
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 sm:w-80 lg:w-64 bg-white border-r border-slate-100 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static flex flex-col shadow-2xl lg:shadow-none print:hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-5 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-100 [&::-webkit-scrollbar-track]:transparent">
          {/* Menu top logo */}
          <div className="flex items-center gap-3 mb-8 px-2">
            {companyLogoUrl ? (
              <img 
                src={companyLogoUrl} 
                alt="Logo" 
                className="w-10 h-10 rounded-xl object-contain border border-slate-100 shadow-md bg-white shrink-0" 
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = defaultLogo;
                }}
              />
            ) : (
              <img 
                src={defaultLogo} 
                alt="Logo" 
                className="w-10 h-10 rounded-xl object-contain border border-slate-100 shadow-md bg-white shrink-0" 
                referrerPolicy="no-referrer"
              />
            )}
            <div className="truncate">
              <span className="text-lg font-black tracking-tight text-slate-900 block leading-none truncate">{companyName}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 block truncate">{companyTagline}</span>
            </div>
          </div>

          {/* Navigation menus */}
          <nav className="flex-1 space-y-1">
            {filteredNavItems.map((item) => {
              const hasChildren = "children" in item && Array.isArray((item as any).children);
              const isSelected = activeView === item.id || 
                (hasChildren && (item as any).children.some((child: any) => activeView === child.id));

              if (hasChildren) {
                const isExpanded = !!expandedMenus[item.id];
                return (
                  <div key={item.id} className="space-y-0.5">
                    <button
                      onClick={() => {
                        setExpandedMenus(prev => {
                          const wasExpanded = !!prev[item.id];
                          return wasExpanded ? {} : { [item.id]: true };
                        });
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all group text-left cursor-pointer",
                        isSelected 
                          ? "bg-slate-50 text-slate-900 font-bold" 
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={cn(
                          "w-5 h-5 transition-transform group-hover:scale-105 duration-200",
                          isSelected ? "text-slate-950" : "text-slate-400 group-hover:text-slate-700"
                        )} />
                        <span className="font-semibold text-sm">{t(item.label)}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                      )}
                    </button>
                    
                    {isExpanded && (
                      <div className="pl-4 space-y-0.5 mt-0.5 border-l-2 border-slate-100 ml-5.5 mb-1.5 animate-in slide-in-from-top-1 duration-150">
                        {(item as any).children.map((child: any) => {
                          const isChildActive = activeView === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => {
                                setActiveView(child.id as View);
                                if (window.innerWidth < 1024) setIsSidebarOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                                isChildActive 
                                  ? "bg-slate-950 text-white shadow-sm shadow-slate-950/10" 
                                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-50"
                              )}
                            >
                              {t(child.label)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id as View);
                    setExpandedMenus({});
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all group cursor-pointer",
                    activeView === item.id 
                      ? "bg-slate-950 text-white shadow-md shadow-slate-950/15 font-semibold" 
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 transition-transform group-hover:scale-105 duration-200",
                    activeView === item.id ? "text-white" : "text-slate-400 group-hover:text-slate-700"
                  )} />
                  <span className="font-semibold text-sm">{t(item.label)}</span>
                </button>
              );
            })}
          </nav>

          {/* User Profile area inside sidebar bottom */}
          <div className="mt-auto space-y-4 pt-4 border-t border-slate-100">
            <div className="p-3.5 bg-slate-50 rounded-2xl flex items-center gap-3 border border-slate-100/50">
              <div className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center shadow-md shadow-slate-950/10">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("Access Badge")}</p>
                <p className="text-xs font-black text-slate-850 uppercase tracking-widest">{t(profile.role)}</p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setActiveView("profileView");
                setExpandedMenus({});
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 px-1 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-150/50 transition-all text-left group cursor-pointer"
              title="View my polished profile card"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 relative">
                <img 
                  src={profile.photoURL || user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(profile.displayName || user.displayName || "avatar")}`} 
                  alt={profile.displayName || user.displayName || "User"} 
                  referrerPolicy="no-referrer" 
                  className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-200"
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-black text-slate-900 truncate group-hover:text-indigo-700 transition-colors leading-snug">
                  {profile.displayName || user.displayName}
                </p>
                <p className="text-[10px] text-slate-400 truncate font-semibold font-mono leading-none mt-0.5">
                  {profile.email || user.email}
                </p>
              </div>
            </button>

            <button 
              onClick={handleLogout}
              className="w-full py-3 bg-red-50 hover:bg-red-155 hover:text-red-700 text-red-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border border-transparent hover:border-red-100"
            >
              <LogOut className="w-4 h-4" />
              {t("Sign Out Securely")}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto p-3 sm:p-4 lg:p-10 pt-18 sm:pt-20 lg:pt-10 pb-28 lg:pb-10 bg-slate-50/30 print:p-0 print:bg-white print:h-auto print:overflow-visible">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Global Header Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:px-6 sm:py-4 rounded-2xl border border-slate-100 shadow-sm print:hidden">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
                {t(activeView === "dashboard" ? "Dashboard" : 
                   activeView === "transactions" ? "Transactions" :
                   activeView === "newSale" ? "New Sale" :
                   activeView === "salesList" ? "Sales Ledger" :
                   activeView === "newEmployee" ? "New Employee" :
                   activeView === "employeesList" ? "Employees List" :
                   activeView === "employees" ? "Employees List" :
                   activeView === "salaryEntry" ? "Salary Entry" :
                   activeView === "salarySheet" ? "Salary Sheet" :
                   activeView === "addAttendance" ? "Add Attendance" :
                   activeView === "attendanceList" ? "Attendance List" :
                   activeView === "attendance" ? "Add Attendance" :
                   activeView === "newSupplier" ? "New Supplier" :
                   activeView === "suppliersList" ? "Suppliers List" :
                   activeView === "suppliers" ? "Suppliers List" :
                   activeView === "newPurchase" ? "New Purchase" :
                   activeView === "purchaseList" ? "Purchase List" :
                   activeView === "reports" ? "Reports" :
                   activeView === "settings" ? "Settings" : 
                   activeView === "usersList" ? "Users List" :
                   activeView === "rolesList" ? "Roles List" :
                   activeView === "newUser" ? "Pre-Register User" :
                   activeView === "profileView" ? "Profile View" : companyName)}
              </h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {formatDate(new Date())}
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
              {/* IndexedDB Offline Storage & Sync Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowStorageModal(true)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border shadow-xs",
                    isOffline
                      ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      : "bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-neutral-200 border-slate-200 dark:border-zinc-800 hover:bg-slate-100"
                  )}
                  title="Click to view IndexedDB storage status and offline sync diagnostic"
                >
                  <div className="relative flex items-center justify-center">
                    <Database className={cn("w-3.5 h-3.5", isOffline ? "text-amber-600" : "text-emerald-600")} />
                    <span className={cn(
                      "absolute -top-1 -right-1 w-2 h-2 rounded-full",
                      isOffline ? "bg-amber-500 animate-ping" : "bg-emerald-500"
                    )} />
                  </div>
                  <span className="hidden md:inline">
                    {isOffline ? "Offline (IndexedDB)" : "Cloud Synced"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono font-bold">
                    {offlineStats.transactionsCount} txs
                  </span>
                </button>

                {offlineStats.pendingSyncCount > 0 && (
                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    title="Click to push offline changes to Firestore"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                    <span>Sync ({offlineStats.pendingSyncCount})</span>
                  </button>
                )}
              </div>

              {/* Dark Mode Switcher Button */}
              <div className="bg-slate-50 p-1 rounded-xl border border-slate-150 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDarkMode(false)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    !darkMode 
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/50" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                  title="Switch to Light Theme"
                >
                  <Sun className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="hidden sm:inline">Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode(true)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    darkMode 
                      ? "bg-[#d4af37] text-black shadow-xs font-black" 
                      : "text-slate-400 hover:text-slate-800"
                  )}
                  title="Switch to Golden Black Theme"
                >
                  <Moon className="w-3.5 h-3.5 text-black" />
                  <span className="hidden sm:inline">Golden Black</span>
                </button>
              </div>

              {/* Language Switcher Button */}
              <div className="bg-slate-50 p-1 rounded-xl border border-slate-150 inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    language === "en" 
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/50" 
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("bn")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all font-sans cursor-pointer",
                    language === "bn" 
                      ? "bg-slate-950 text-white shadow-xs" 
                      : "text-slate-500 hover:text-slate-950"
                  )}
                >
                  বাংলা
                </button>
              </div>
            </div>
          </div>

          {/* Offline Fallback Alert Banner */}
          {isOffline && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
                  <CloudOff className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold tracking-tight">
                    {t("IndexedDB Local Storage Active (Offline Mode)")}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300/80 mt-0.5">
                    {t("Firestore is unreachable. Transactions and sales are securely stored in your browser's local IndexedDB and will auto-sync when online.")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowStorageModal(true)}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t("Storage Details")}
                </button>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                  {t("Retry Sync")}
                </button>
              </div>
            </div>
          )}

          {/* Sync Feedback Toast */}
          <AnimatePresence>
            {syncFeedback && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  "p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 shadow-md border",
                  syncFeedback.type === "success" 
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" 
                    : syncFeedback.type === "error"
                    ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800"
                    : "bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                )}
              >
                <div className="flex items-center gap-2">
                  {syncFeedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : syncFeedback.type === "error" ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
                  )}
                  <span>{syncFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncFeedback(null)}
                  className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-current opacity-70 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
               {activeView === "dashboard" && (
                <Dashboard 
                  user={user} 
                  role={profile.role} 
                  onNavigate={(view, extra) => {
                    if (view === "transactions" && extra?.activeTab) {
                      setInitialActiveTab(extra.activeTab);
                    }
                    if (view === "newSale") {
                      setSalesEditDate(""); // clear edit date for new sale
                    }
                    setActiveView(view);
                  }}
                />
              )}
              {activeView === "transactions" && (
                <Transactions 
                  user={user} 
                  role={profile.role} 
                  initialActiveTab={initialActiveTab}
                  onClearInitialActiveTab={() => setInitialActiveTab("income")}
                />
              )}
              {activeView === "newSale" && (
                <NewSale 
                  user={user} 
                  role={profile.role} 
                  editDate={salesEditDate} 
                  onClearEditDate={() => setSalesEditDate("")} 
                  onSaveSuccess={() => setActiveView("salesList")}
                />
              )}
              {activeView === "salesList" && (
                <SalesList 
                  user={user} 
                  role={profile.role} 
                  onEditSales={(date) => {
                    setSalesEditDate(date);
                    setActiveView("newSale");
                  }} 
                  onNavigateToNewSale={() => {
                    setSalesEditDate(""); // clear edit date to register fresh sale
                    setActiveView("newSale");
                  }}
                />
              )}
              {activeView === "newEmployee" && (
                <div key="new-employee">
                  <Employees 
                    user={user} 
                    role={profile.role} 
                    mode="new"
                    onSuccess={() => setActiveView("employeesList")}
                  />
                </div>
              )}
              {activeView === "employeesList" && (
                <div key="employees-list">
                  <Employees 
                    user={user} 
                    role={profile.role} 
                    mode="list"
                  />
                </div>
              )}
              {activeView === "employees" && (
                <div key="employees-fallback">
                  <Employees 
                    user={user} 
                    role={profile.role} 
                    mode="list"
                  />
                </div>
              )}
              {activeView === "salaryEntry" && (
                <SalaryEntry 
                  user={user} 
                  role={profile.role} 
                />
              )}
              {activeView === "salarySheet" && (
                <SalarySheet 
                  user={user} 
                  role={profile.role} 
                />
              )}
              {activeView === "addAttendance" && (
                <div key="add-attendance">
                  <Attendance 
                    user={user} 
                    role={profile.role} 
                    mode="add"
                    onSuccess={() => setActiveView("attendanceList")} 
                  />
                </div>
              )}
              {activeView === "attendanceList" && (
                <div key="attendance-list">
                  <Attendance 
                    user={user} 
                    role={profile.role} 
                    mode="list" 
                  />
                </div>
              )}
              {activeView === "attendance" && (
                <div key="attendance-fallback">
                  <Attendance 
                    user={user} 
                    role={profile.role} 
                    mode="add" 
                  />
                </div>
              )}
              {activeView === "newSupplier" && (
                <div key="new-supplier">
                  <Suppliers 
                    user={user} 
                    role={profile.role} 
                    mode="new"
                    onSuccess={() => setActiveView("suppliersList")} 
                  />
                </div>
              )}
              {activeView === "suppliersList" && (
                <div key="suppliers-list">
                  <Suppliers 
                    user={user} 
                    role={profile.role} 
                    mode="list" 
                  />
                </div>
              )}
              {activeView === "suppliers" && (
                <div key="suppliers-fallback">
                  <Suppliers 
                    user={user} 
                    role={profile.role} 
                    mode="list" 
                  />
                </div>
              )}
              {activeView === "newPurchase" && (
                <div key="new-purchase">
                  <Purchase 
                    user={user} 
                    role={profile.role} 
                    mode="new"
                    onSuccess={() => setActiveView("purchaseList")} 
                  />
                </div>
              )}
              {activeView === "purchaseList" && (
                <div key="purchase-list">
                  <Purchase 
                    user={user} 
                    role={profile.role} 
                    mode="list" 
                  />
                </div>
              )}
              {activeView === "paySupplierDue" && (
                <div key="pay-supplier-due">
                  <Purchase 
                    user={user} 
                    role={profile.role} 
                    mode="payDue"
                    onSuccess={() => setActiveView("purchaseList")} 
                  />
                </div>
              )}
              {activeView === "inventory" && <Inventory user={user} role={profile.role} />}
              {activeView === "reports" && <Reports user={user} role={profile.role} />}
              {activeView === "settings" && <Settings user={user} role={profile.role} />}
              {(activeView === "newUser" || activeView === "usersList" || activeView === "rolesList" || activeView === "profileView") && (
                <UsersManager 
                  user={user} 
                  role={profile.role} 
                  activeSubView={activeView as any}
                  onSelectView={(v) => setActiveView(v as View)}
                  onProfileUpdated={async () => {
                    const pRef = doc(db, "users", user.uid);
                    const snap = await getDoc(pRef);
                    if (snap.exists()) setProfile(snap.data() as UserProfile);
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* IndexedDB Local Storage Diagnostics & Management Modal */}
      <AnimatePresence>
        {showStorageModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-zinc-900 max-w-lg w-full rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-6 relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/30">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                      IndexedDB Local Storage Fallback
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-neutral-400">
                      Database: <span className="font-mono font-semibold">modern_pos_offline_db</span> (v1)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStorageModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status and Metric Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cached Transactions</p>
                    <ReceiptIndianRupee className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-xl font-black text-slate-900 dark:text-neutral-100 mt-1 font-mono">
                    {offlineStats.transactionsCount}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">In indexeddb: transactions</p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cached Daily Sales</p>
                    <ShoppingCart className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-xl font-black text-slate-900 dark:text-neutral-100 mt-1 font-mono">
                    {offlineStats.salesCount}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">In indexeddb: sales_records</p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Sync Queue</p>
                    <RefreshCw className={cn("w-4 h-4", offlineStats.pendingSyncCount > 0 ? "text-amber-500" : "text-slate-400")} />
                  </div>
                  <p className={cn(
                    "text-xl font-black mt-1 font-mono",
                    offlineStats.pendingSyncCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-neutral-100"
                  )}>
                    {offlineStats.pendingSyncCount}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Offline mutations queued</p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-zinc-850 rounded-xl border border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Storage Engine</p>
                    <HardDrive className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {offlineStats.isStorageReady ? "Active & Healthy" : "Initializing..."}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {offlineStats.lastSyncTime ? `Synced: ${formatDate(new Date(offlineStats.lastSyncTime))}` : "Sync pending"}
                  </p>
                </div>
              </div>

              {/* Status explanation */}
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-150 dark:border-zinc-800 space-y-1.5 text-xs text-slate-600 dark:text-neutral-400">
                <p className="font-bold text-slate-800 dark:text-neutral-200">
                  Offline Fallback Guarantee:
                </p>
                <p className="leading-relaxed">
                  When internet connectivity or Firestore cloud services are unreachable or restricted, all transaction entries, sales records, and ledger mutations remain 100% durable in IndexedDB and are queued for automatic background replication once connectivity is restored.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="w-full py-2.5 bg-slate-950 dark:bg-[#d4af37] dark:text-black text-white hover:bg-slate-850 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                  <span>{isSyncing ? "Synchronizing with Firestore..." : "Synchronize with Cloud Firestore"}</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleTestOfflineWrite}
                    className="py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-neutral-200 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Test Offline Write</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm("Are you sure you want to clear the pending sync queue?")) {
                        await clearAllPendingSyncQueue();
                        await refreshStorageStats();
                        setSyncFeedback({ type: "info", message: "Pending sync queue reset." });
                      }
                    }}
                    className="py-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800 dark:hover:bg-red-950/40 text-slate-600 dark:text-neutral-300 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Clear Sync Queue</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav 
        id="mobile-bottom-nav" 
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 border-t border-slate-200/90 z-30 flex items-center justify-around px-1 shadow-2xl print:hidden safe-area-bottom backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => {
            setActiveView("dashboard");
            setIsSidebarOpen(false);
          }}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all rounded-xl cursor-pointer",
            activeView === "dashboard" ? "text-blue-600 font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight leading-none">{t("Dashboard")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("newSale");
            setIsSidebarOpen(false);
          }}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all rounded-xl cursor-pointer",
            activeView === "newSale" ? "text-blue-600 font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight leading-none">{t("New Sale")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("transactions");
            setIsSidebarOpen(false);
          }}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all rounded-xl cursor-pointer",
            activeView === "transactions" ? "text-blue-600 font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <ArrowUpDown className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight leading-none">{t("Transactions")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("salesList");
            setIsSidebarOpen(false);
          }}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all rounded-xl cursor-pointer",
            activeView === "salesList" ? "text-blue-600 font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight leading-none">{t("Sales Ledger")}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsSidebarOpen(prev => !prev)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all rounded-xl cursor-pointer",
            isSidebarOpen ? "text-blue-600 font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight leading-none">{t("Menu")}</span>
        </button>
      </nav>
    </div>
  );
}

