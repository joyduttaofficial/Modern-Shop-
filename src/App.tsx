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
  Moon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { UserProfile, UserRole, RolePermission } from "@/src/types";
import { useLanguage } from "./contexts/LanguageContext";

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

type View = "dashboard" | "transactions" | "newSale" | "salesList" | "newEmployee" | "employeesList" | "salaryEntry" | "salarySheet" | "addAttendance" | "attendanceList" | "attendance" | "reports" | "settings" | "newSupplier" | "suppliersList" | "suppliers" | "newPurchase" | "purchaseList" | "newUser" | "usersList" | "rolesList" | "profileView";

export default function App() {
  const { language, setLanguage, t, formatDate } = useLanguage();
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [salesEditDate, setSalesEditDate] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    sales: true,
    employees: true,
    attendance: true,
    suppliers: true,
    purchases: true
  });
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [customRoles, setCustomRoles] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Company Branding & Profile States
  const [companyName, setCompanyName] = useState("Modern Shop");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");

  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Shop");
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

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { 
      id: "sales", 
      label: "Sales Hub", 
      icon: ShoppingCart, 
      children: [
        { id: "newSale", label: "New Sale Entry" },
        { id: "salesList", label: "Sales List / Ledger" }
      ]
    },
    { id: "transactions", label: "Transactions", icon: ReceiptIndianRupee },
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
      icon: ShoppingCart, 
      children: [
        { id: "newPurchase", label: "New Procurement" },
        { id: "purchaseList", label: "Bills & Purchase List" }
      ]
    },
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

    // Direct match check on user's assigned role from custom roles collection first
    const matchedRole = customRoles.find(r => r.id === profile.role);
    if (matchedRole) {
      return matchedRole.allowedMenus.includes(viewId);
    }

    // Default built-in fallback permissions if no custom roles are matched
    const adminOnlyViews = ["newEmployee", "salaryEntry", "salarySheet"];
    if (adminOnlyViews.includes(viewId) && profile.role !== "admin") {
      return false;
    }

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
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(companyName)}`;
              }}
            />
          ) : (
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
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

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-100 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static flex flex-col shadow-xl shadow-slate-100/40 lg:shadow-none print:hidden",
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
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(companyName)}`;
                }}
              />
            ) : (
              <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center shadow-lg shadow-slate-950/10">
                <LayoutDashboard className="w-5.5 h-5.5 text-white" />
              </div>
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
                        setExpandedMenus(prev => ({ ...prev, [item.id]: !prev[item.id] }));
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
      <main className="flex-1 h-screen overflow-y-auto p-4 lg:p-10 pt-20 lg:pt-10 bg-slate-50/30 print:p-0 print:bg-white print:h-auto print:overflow-visible">
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
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {activeView === "dashboard" && <Dashboard user={user} role={profile.role} />}
              {activeView === "transactions" && <Transactions user={user} role={profile.role} />}
              {activeView === "newSale" && (
                <NewSale 
                  user={user} 
                  role={profile.role} 
                  editDate={salesEditDate} 
                  onClearEditDate={() => setSalesEditDate("")} 
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
    </div>
  );
}

