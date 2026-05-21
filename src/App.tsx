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
  UserPlus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, db } from "@/src/lib/firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { UserProfile, UserRole } from "@/src/types";

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

type View = "dashboard" | "transactions" | "newSale" | "salesList" | "newEmployee" | "employeesList" | "salaryEntry" | "salarySheet" | "addAttendance" | "attendanceList" | "attendance" | "reports" | "settings" | "newSupplier" | "suppliersList" | "suppliers" | "newPurchase" | "purchaseList";

export default function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [salesEditDate, setSalesEditDate] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    sales: true,
    employees: true,
    attendance: true,
    suppliers: true,
    purchases: true
  });
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch or create profile
        const profileRef = doc(db, "users", u.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setProfile(profileSnap.data() as UserProfile);
        } else {
          // Check if first user (make them admin) or regular (make them sales)
          // In a real app, you'd probably default to sales and have an out-of-band admin process
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || "",
            displayName: u.displayName || "New User",
            role: "admin", // Defaulting first user to admin for demo purposes
            createdAt: new Date().toISOString(),
          };
          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        }

        // Listen for profile changes (role updates)
        const unsubProfile = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) setProfile(snap.data() as UserProfile);
        }, (error) => console.error("Profile sync error", error));
        setLoading(false);
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F5F5F4]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100/50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-2xl max-w-md w-full text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-900" />
          <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-slate-100">
            <LayoutDashboard className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">Modern Shop</h1>
          <p className="text-slate-500 font-medium text-sm mb-8">Ultimate Workspace for Sales, Accounts & Team</p>
          <button
            onClick={handleLogin}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-900/10 group cursor-pointer"
          >
            <UserIcon className="w-5 h-5 group-hover:scale-110 transition-transform text-slate-300" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "accountant", "sales"] },
    { 
      id: "sales", 
      label: "Sales Hub", 
      icon: ShoppingCart, 
      roles: ["admin", "accountant", "sales"],
      children: [
        { id: "newSale", label: "New Sale Entry" },
        { id: "salesList", label: "Sales List / Ledger" }
      ]
    },
    { id: "transactions", label: "Transactions", icon: ReceiptIndianRupee, roles: ["admin", "accountant", "sales"] },
    { 
      id: "employees", 
      label: "Employees", 
      icon: Users, 
      roles: ["admin", "accountant"],
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
      roles: ["admin", "accountant"],
      children: [
        { id: "addAttendance", label: "Daily Input" },
        { id: "attendanceList", label: "Attendance Book" }
      ]
    },
    { 
      id: "suppliers", 
      label: "Suppliers", 
      icon: UserPlus, 
      roles: ["admin", "accountant"],
      children: [
        { id: "newSupplier", label: "New Supplier Info" },
        { id: "suppliersList", label: "Suppliers Ledger" }
      ]
    },
    { 
      id: "purchases", 
      label: "Purchase Book", 
      icon: ShoppingCart, 
      roles: ["admin", "accountant"],
      children: [
        { id: "newPurchase", label: "New Procurement" },
        { id: "purchaseList", label: "Bills & Purchase List" }
      ]
    },
    { id: "reports", label: "Reports & PDFs", icon: FileText, roles: ["admin", "accountant"] },
    { id: "settings", label: "Settings Pane", icon: SettingsIcon, roles: ["admin", "accountant"] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(profile.role));

  return (
    <div className="min-h-screen bg-slate-50/50 flex font-sans text-slate-800 antialiased selection:bg-slate-200">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur border-b border-slate-100 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold tracking-tight text-slate-900 text-base">Modern Shop</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-100 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static flex flex-col shadow-xl shadow-slate-100/40 lg:shadow-none",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-5 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-100 [&::-webkit-scrollbar-track]:transparent">
          {/* Menu top logo */}
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center shadow-lg shadow-slate-950/10">
              <LayoutDashboard className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-slate-900 block leading-none">Modern Shop</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 block">Automated POS</span>
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
                        <span className="font-semibold text-sm">{item.label}</span>
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
                              {child.label}
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
                  <span className="font-semibold text-sm">{item.label}</span>
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
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Access Badge</p>
                <p className="text-xs font-black text-slate-850 uppercase tracking-widest">{profile.role}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 px-1">
              <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-250/80 shrink-0">
                <img src={user.photoURL || ""} alt={user.displayName || "User"} referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-slate-900 truncate">{user.displayName}</p>
                <p className="text-[11px] text-slate-400 truncate font-semibold font-mono">{user.email}</p>
              </div>
            </div>

            <button 
              onClick={handleLogout}
              className="w-full py-3 bg-red-50 hover:bg-red-155 hover:text-red-700 text-red-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border border-transparent hover:border-red-100"
            >
              <LogOut className="w-4 h-4" />
              Sign Out Securely
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto p-4 lg:p-10 pt-20 lg:pt-10 bg-slate-50/30">
        <div className="max-w-6xl mx-auto space-y-6">
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
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

