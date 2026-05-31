import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy, setDoc, getDocs } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Category, Bank, TransactionType, UserRole, UserProfile } from "@/src/types";
import { cn } from "@/src/lib/utils";
import { Plus, Trash2, Landmark, Tag, Briefcase, PlusCircle, LayoutGrid, Users, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

export default function Settings({ user, role }: { user: User; role: UserRole }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [catName, setCatName] = useState("");
  const [isWiping, setIsWiping] = useState(false);

  const handleWipeDatabase = async () => {
    if (role !== "admin") {
      alert("Only an administrator can perform a system reset.");
      return;
    }
    const confirm1 = confirm("⚠️ DANGER ZONE: Are you sure you want to remove ALL demo data? This will permanently wipe all Employees, Transactions, Attendance logs, Bank balances, Suppliers, Purchases, and Custom Categories. This action cannot be undone!");
    if (!confirm1) return;

    const confirm2 = confirm("Please confirm once more. Click 'OK' to proceed with wiping the database and seeding a clean blank slate.");
    if (!confirm2) return;

    setIsWiping(true);
    try {
      // 1. Fetch & delete Transactions
      const txSnap = await getDocs(collection(db, "transactions"));
      await Promise.all(txSnap.docs.map(d => deleteDoc(doc(db, "transactions", d.id))));

      // 2. Fetch & delete Employees
      const empSnap = await getDocs(collection(db, "employees"));
      await Promise.all(empSnap.docs.map(d => deleteDoc(doc(db, "employees", d.id))));

      // 3. Fetch & delete Attendance
      const attSnap = await getDocs(collection(db, "attendance"));
      await Promise.all(attSnap.docs.map(d => deleteDoc(doc(db, "attendance", d.id))));

      // 4. Fetch & delete Banks
      const bankSnap = await getDocs(collection(db, "banks"));
      await Promise.all(bankSnap.docs.map(d => deleteDoc(doc(db, "banks", d.id))));

      // 5. Fetch & delete Categories
      const catSnap = await getDocs(collection(db, "categories"));
      await Promise.all(catSnap.docs.map(d => deleteDoc(doc(db, "categories", d.id))));

      // 6. Fetch & delete Purchases
      const purchaseSnap = await getDocs(collection(db, "purchases"));
      await Promise.all(purchaseSnap.docs.map(d => deleteDoc(doc(db, "purchases", d.id))));

      // 7. Fetch & delete Suppliers
      const supplierSnap = await getDocs(collection(db, "suppliers"));
      await Promise.all(supplierSnap.docs.map(d => deleteDoc(doc(db, "suppliers", d.id))));

      // 8. Fetch & delete Supplier Transactions
      const sTxSnap = await getDocs(collection(db, "supplierTransactions"));
      await Promise.all(sTxSnap.docs.map(d => deleteDoc(doc(db, "supplierTransactions", d.id))));

      // Seed Default Blank Slate (Categories & Default Cash bank)
      const defaultCats = [
        { name: "Previous Cash", type: "income" },
        { name: "Opening Balance", type: "income" },
        { name: "Retail Sales", type: "income" },
        { name: "Wholesale Sales", type: "income" },
        { name: "Rent", type: "expense" },
        { name: "Electricity", type: "expense" },
        { name: "Staff Salary", type: "expense" },
        { name: "Employee Advance", type: "expense" },
        { name: "Employee", type: "expense" },
        { name: "Food", type: "expense" },
        { name: "Courier", type: "expense" }
      ];
      await Promise.all(defaultCats.map(cat => addDoc(collection(db, "categories"), cat)));

      await addDoc(collection(db, "banks"), { 
        name: "Cash", 
        balance: 0,
        lastUpdated: new Date().toISOString()
      });

      alert("All demo or mock data has been successfully wiped, and a clean blank slate (standard categories and default Cash account) has been seeded!");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, "all-collections");
    } finally {
      setIsWiping(false);
    }
  };
  const [catType, setCatType] = useState<TransactionType>("income");
  const [bankName, setBankName] = useState("");
  const [bankBalance, setBankBalance] = useState("");

  // Company Branding States
  const [companyName, setCompanyName] = useState("Modern Shop");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyPhone, setCompanyPhone] = useState("+880 1234 567890");
  const [companyEmail, setCompanyEmail] = useState("info@modernmanager.com");
  const [companyAddress, setCompanyAddress] = useState("Dhaka, Bangladesh");
  const [companyPoweredBy, setCompanyPoweredBy] = useState("Powered by ModernManager");
  const [showPoweredBy, setShowPoweredBy] = useState(true);
  const [isUpdatingBranding, setIsUpdatingBranding] = useState(false);
  const [brandingSuccess, setBrandingSuccess] = useState(false);

  // Departments & Employee ID Rule State
  const [departmentsList, setDepartmentsList] = useState<{ id?: string; name: string }[]>([]);
  const [deptName, setDeptName] = useState("");
  const [idPrefixInput, setIdPrefixInput] = useState("MCS");
  const [isUpdatingIdRules, setIsUpdatingIdRules] = useState(false);
  const [idRulesSuccess, setIdRulesSuccess] = useState(false);

  // Attendance Settings
  const [lateThreshold, setLateThreshold] = useState("10:00");
  const [lunchDurationLimit, setLunchDurationLimit] = useState(60);
  const [halfDayThreshold, setHalfDayThreshold] = useState("11:30");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  useEffect(() => {
    const unsubCats = onSnapshot(query(collection(db, "categories"), orderBy("name")), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });
    const unsubBanks = onSnapshot(query(collection(db, "banks"), orderBy("name")), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    });

    const unsubCompanySettings = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Shop");
        setCompanyTagline(data.companyTagline || "Automated POS");
        setCompanyLogoUrl(data.companyLogoUrl || "");
        setCompanyPhone(data.companyPhone || "+880 1234 567890");
        setCompanyEmail(data.companyEmail || "info@modernmanager.com");
        setCompanyAddress(data.companyAddress || "Dhaka, Bangladesh");
        setCompanyPoweredBy(data.companyPoweredBy || "Powered by ModernManager");
        setShowPoweredBy(data.showPoweredBy ?? true);
      }
    });

    const unsubDepts = onSnapshot(query(collection(db, "departments"), orderBy("name")), (snap) => {
      setDepartmentsList(snap.docs.map(d => ({ id: d.id, name: d.data().name } as { id?: string; name: string })));
    });

    const unsubIdSettings = onSnapshot(doc(db, "settings", "employeeId"), (docSnap) => {
      if (docSnap.exists()) {
        setIdPrefixInput(docSnap.data().prefix || "MCS");
      }
    });

    const unsubSettings = onSnapshot(doc(db, "settings", "attendance"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLateThreshold(data.lateThreshold || "10:00");
        setLunchDurationLimit(data.lunchDurationLimit ?? 60);
        setHalfDayThreshold(data.halfDayThreshold || "11:30");
      }
    });

    let unsubProfiles = () => {};
    if (role === "admin") {
      unsubProfiles = onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), (snap) => {
        setProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
      });
    }

    return () => { 
      unsubCats(); 
      unsubBanks(); 
      unsubCompanySettings();
      unsubProfiles(); 
      unsubDepts(); 
      unsubIdSettings(); 
      unsubSettings();
    };
  }, [role]);

  const saveCompanySettings = async () => {
    setIsUpdatingBranding(true);
    setBrandingSuccess(false);
    try {
      await setDoc(doc(db, "settings", "company"), {
        companyName: companyName.trim(),
        companyTagline: companyTagline.trim(),
        companyLogoUrl: companyLogoUrl.trim(),
        companyPhone: companyPhone.trim(),
        companyEmail: companyEmail.trim(),
        companyAddress: companyAddress.trim(),
        companyPoweredBy: companyPoweredBy.trim(),
        showPoweredBy,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid
      });
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 4000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "settings");
    } finally {
      setIsUpdatingBranding(false);
    }
  };

  const handleUpdateRole = async (uid: string, newRole: UserRole) => {
    if (!confirm(`Change user role to ${newRole}?`)) return;
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "users");
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;
    try {
      await addDoc(collection(db, "categories"), { name: catName, type: catType });
      setCatName("");
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, "categories"); }
  };

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !bankBalance) return;
    try {
      await addDoc(collection(db, "banks"), { 
        name: bankName, 
        balance: parseFloat(bankBalance),
        lastUpdated: new Date().toISOString()
      });
      setBankName(""); setBankBalance("");
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, "banks"); }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName) return;
    try {
      await addDoc(collection(db, "departments"), { name: deptName });
      setDeptName("");
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, "departments"); }
  };

  const saveEmployeeIdSettings = async () => {
    setIsUpdatingIdRules(true);
    setIdRulesSuccess(false);
    try {
      await setDoc(doc(db, "settings", "employeeId"), {
        prefix: idPrefixInput.trim(),
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid
      });
      setIdRulesSuccess(true);
      setTimeout(() => setIdRulesSuccess(false), 4000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "settings");
    } finally {
      setIsUpdatingIdRules(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ coll: string; id: string } | null>(null);

  const executeDelete = async (coll: string, id: string) => {
    try { 
      await deleteDoc(doc(db, coll, id)); 
      setDeleteConfirm(null);
    } catch (e) { 
      handleFirestoreError(e, OperationType.DELETE, coll); 
    }
  };

  const saveAttendanceSettings = async () => {
    setIsUpdatingSettings(true);
    setSettingsSuccess(false);
    try {
      await setDoc(doc(db, "settings", "attendance"), {
        lateThreshold,
        lunchDurationLimit: Number(lunchDurationLimit),
        halfDayThreshold,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 4000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "settings");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // Seed default data if empty
  const seedDefaults = async () => {
    const defaultCats = [
      { name: "Previous Cash", type: "income" },
      { name: "Opening Balance", type: "income" },
      { name: "Retail Sales", type: "income" },
      { name: "Wholesale Sales", type: "income" },
      { name: "Rent", type: "expense" },
      { name: "Electricity", type: "expense" },
      { name: "Staff Salary", type: "expense" },
      { name: "Employee Advance", type: "expense" },
      { name: "Employee", type: "expense" },
      { name: "Food", type: "expense" },
      { name: "Courier", type: "expense" }
    ];
    for (const cat of defaultCats) {
      if (!categories.find(c => c.name === cat.name)) {
        await addDoc(collection(db, "categories"), cat);
      }
    }
  };

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-bold tracking-tight mb-1">Preferences</h2>
        <p className="text-sm text-gray-500">Customize your shop's categories, branding logo, system name, and policies.</p>
      </header>

      {/* Dynamic Branding & Corporate Profile Configuration Block */}
      <section className="space-y-6">
        <h3 className="text-lg font-black flex items-center gap-2 text-slate-800">
          <LayoutGrid className="w-5 h-5 text-indigo-500" />
          Company Identity & Branding Studio
        </h3>
        
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          {brandingSuccess && (
            <div className="p-4 bg-emerald-50 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-2xl border border-emerald-100/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              Dynamic company identity & logo parameters updated and synced across all registers!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Details */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1">System Title / Shop Name</label>
                <input 
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Dhaka Apparel Studio"
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200 mt-1 font-bold outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1 font-medium">Tagline / Subtitle</label>
                <input 
                  value={companyTagline}
                  onChange={e => setCompanyTagline(e.target.value)}
                  placeholder="e.g. High Performance Automated POS"
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200 mt-1 font-semibold outline-none text-slate-700"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1 font-medium">Custom Logo Image URL</label>
                <input 
                  value={companyLogoUrl}
                  onChange={e => setCompanyLogoUrl(e.target.value)}
                  placeholder="e.g. https://domain.com/logo.png"
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200 mt-1 font-mono text-xs outline-none text-slate-600"
                />
                <p className="text-[10px] text-gray-400 pl-1 mt-1 leading-relaxed">Provide any publicly hosted secure image URL to override standard visual system dashboards, invoices and PDFs.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1 font-medium">Company Phone</label>
                  <input 
                    value={companyPhone}
                    onChange={e => setCompanyPhone(e.target.value)}
                    placeholder="+880 1700-000000"
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200 mt-1 font-mono text-xs outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1 font-medium">Company Email</label>
                  <input 
                    value={companyEmail}
                    onChange={e => setCompanyEmail(e.target.value)}
                    placeholder="billing@company.com"
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200 mt-1 font-mono text-xs outline-none text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Preview Column */}
            <div className="space-y-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Instant Brand Shell Preview</h4>
                
                {/* Brand Preview layout resembling header-bar logo */}
                <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-xs mb-4">
                  {companyLogoUrl ? (
                    <img 
                      src={companyLogoUrl} 
                      alt="Brand Custom Logo" 
                      className="w-11 h-11 rounded-xl object-contain border border-gray-100 shrink-0 bg-white" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(companyName)}`;
                      }}
                    />
                  ) : (
                    <div className="w-11 h-11 bg-slate-950 rounded-xl flex items-center justify-center shadow-md">
                      <LayoutGrid className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div className="truncate">
                    <span className="text-base font-black tracking-tight text-slate-900 block leading-tight">{companyName}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 block truncate">{companyTagline}</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px] text-gray-500 pl-1">
                  <p className="truncate"><span className="font-bold text-gray-700">Address Address:</span> {companyAddress || "Not entered"}</p>
                  <p><span className="font-bold text-gray-700">Official Contact:</span> {companyPhone}</p>
                  <p><span className="font-bold text-gray-700">Email Contact:</span> {companyEmail}</p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-150">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1 font-medium">Billed Address / Header Location</label>
                  <input 
                    value={companyAddress}
                    onChange={e => setCompanyAddress(e.target.value)}
                    placeholder="e.g. Block C, Banani, Dhaka"
                    className="w-full px-4 py-3 bg-white border border-gray-150 rounded-xl focus:ring-2 focus:ring-gray-200 mt-1 font-medium text-xs outline-none text-slate-800"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">White-Label Branding Footer</p>
                      <p className="text-[10px] text-gray-400 leading-none">Enable custom Powered-By footnote across pages</p>
                    </div>
                    <input 
                      type="checkbox" 
                      id="branding-powered-checkbox"
                      checked={showPoweredBy}
                      onChange={e => setShowPoweredBy(e.target.checked)}
                      className="w-4.5 h-4.5 text-indigo-600 rounded-md border-gray-300 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  {showPoweredBy && (
                    <div className="animate-in fade-in duration-200">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">Sign-off Attribution Credit Text</label>
                      <input 
                        value={companyPoweredBy}
                        onChange={e => setCompanyPoweredBy(e.target.value)}
                        placeholder="e.g. Powered by Dhaka Apparel Group"
                        className="w-full px-3 py-2 bg-white border border-gray-150 rounded-xl focus:ring-2 focus:ring-gray-200 mt-1 font-semibold text-xs outline-none text-slate-800"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button 
              onClick={saveCompanySettings}
              disabled={isUpdatingBranding}
              className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
            >
              {isUpdatingBranding ? "Syncing Identity..." : "Save Corporate Brand"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Categories Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Tag className="w-5 h-5 text-gray-400" />
              Categories
            </h3>
            {categories.length === 0 && (
              <button 
                onClick={seedDefaults}
                className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider hover:bg-blue-100 transition-colors"
              >
                Seed Defaults
              </button>
            )}
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input 
                placeholder="New Category..." 
                value={catName} 
                onChange={e => setCatName(e.target.value)}
                className="flex-1 px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200"
              />
              <select 
                value={catType} 
                onChange={e => setCatType(e.target.value as TransactionType)}
                className="px-3 bg-gray-50 rounded-xl border-none font-bold text-xs"
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <button type="submit" className="p-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all">
                <Plus className="w-5 h-5" />
              </button>
            </form>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
              {categories.map((cat, idx) => (
                <div key={cat.id || `cat-${idx}`} className="flex items-center justify-between p-3 border border-gray-50 rounded-2xl hover:bg-gray-50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      cat.type === "income" ? "bg-green-500" : "bg-red-500"
                    )} />
                    <span className="font-semibold text-gray-700">{cat.name}</span>
                  </div>
                  {deleteConfirm?.coll === "categories" && deleteConfirm?.id === cat.id ? (
                    <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-100">
                      <button 
                        onClick={() => executeDelete("categories", cat.id!)}
                        className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white rounded-md cursor-pointer transition-all"
                      >
                        Confirm
                      </button>
                      <button 
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-gray-105 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700/60 rounded-md cursor-pointer transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setDeleteConfirm({ coll: "categories", id: cat.id! })}
                      className="opacity-100 md:opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-all cursor-pointer"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Banks Section */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
            <Landmark className="w-5 h-5 text-gray-400" />
            Bank Accounts
          </h3>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <form onSubmit={handleAddBank} className="space-y-3">
              <input 
                placeholder="Bank Name (e.g. City Bank)" 
                value={bankName} 
                onChange={e => setBankName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200"
              />
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="Initial Balance" 
                  value={bankBalance} 
                  onChange={e => setBankBalance(e.target.value)}
                  className="flex-1 px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200"
                />
                <button type="submit" className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all">
                  Add Bank
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {banks.map((bank, idx) => (
                <div key={bank.id || `bank-${idx}`} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100">
                      <Landmark className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{bank.name}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400">Current Balance</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-mono font-bold text-lg text-gray-700">৳{bank.balance.toLocaleString()}</p>
                    {deleteConfirm?.coll === "banks" && deleteConfirm?.id === bank.id ? (
                      <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-100">
                        <button 
                          onClick={() => executeDelete("banks", bank.id!)}
                          className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-red-650 hover:bg-red-750 text-white rounded-md cursor-pointer transition-all"
                        >
                          Confirm
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-gray-150 dark:bg-zinc-850 text-gray-600 dark:text-gray-400 hover:bg-gray-250 dark:hover:bg-zinc-750 rounded-md cursor-pointer transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setDeleteConfirm({ coll: "banks", id: bank.id! })}
                        className="opacity-100 md:opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-all bg-white dark:bg-zinc-900 rounded-lg border border-gray-100 dark:border-zinc-800 cursor-pointer"
                        title="Delete Bank Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Departments & Employee ID Generator Config section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Custom Employee Departments Section */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-gray-400" />
            Employee Departments Customizer
          </h3>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <form onSubmit={handleAddDept} className="flex gap-2">
              <input 
                placeholder="New Department (e.g. Sales, Accounts, IT)..." 
                value={deptName} 
                onChange={e => setDeptName(e.target.value)}
                className="flex-1 px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200"
              />
              <button type="submit" className="p-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all">
                <Plus className="w-5 h-5" />
              </button>
            </form>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
              {departmentsList.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-4 pl-1">No custom departments yet. Default system categories will be loaded (Sales, Accounts, Marketing, IT / Support, Management, Delivery, Others).</p>
              ) : (
                departmentsList.map((dept, idx) => (
                  <div key={dept.id || `dept-${idx}`} className="flex items-center justify-between p-3 border border-gray-50 rounded-2xl hover:bg-gray-50 transition-all group">
                    <span className="font-semibold text-gray-700">{dept.name}</span>
                    {deleteConfirm?.coll === "departments" && deleteConfirm?.id === dept.id ? (
                      <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-100">
                        <button 
                          onClick={() => executeDelete("departments", dept.id!)}
                          className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-red-605 hover:bg-red-705 text-white rounded-md cursor-pointer transition-all"
                        >
                          Confirm
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700/60 rounded-md cursor-pointer transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setDeleteConfirm({ coll: "departments", id: dept.id! })}
                        className="opacity-100 md:opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-all cursor-pointer"
                        title="Delete Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Employee ID Format Rule Settings Section */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Tag className="w-5 h-5 text-gray-400" />
            Auto Employee ID Settings
          </h3>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            {idRulesSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-xl border border-emerald-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                Employee ID custom template synchronized perfectly!
              </div>
            )}
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Default ID Prefix</label>
                <input 
                  placeholder="e.g. MCS" 
                  value={idPrefixInput} 
                  onChange={e => setIdPrefixInput(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gray-200 mt-1 font-bold font-mono"
                />
              </div>

              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-600 uppercase mb-1">Quick Preview</p>
                <div className="flex gap-2 text-xs font-bold font-mono">
                  <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">
                    {idPrefixInput.trim() || "(Empty)"} 01
                  </span>
                  <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">
                    {idPrefixInput.trim() || "(Empty)"} 02
                  </span>
                  <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">
                    {idPrefixInput.trim() || "(Empty)"} 03
                  </span>
                </div>
                <p className="text-[10.5px] text-gray-400 mt-2 leading-relaxed">New registrations will calculate the highest digit with matching prefix and suggest sequentially.</p>
              </div>

              <div className="pt-2 flex justify-end">
                <button 
                  onClick={saveEmployeeIdSettings}
                  disabled={isUpdatingIdRules}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingIdRules ? "Syncing..." : "Save ID Setup"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Policy Section */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900">
          <ShieldAlert className="w-5 h-5 text-zinc-400" />
          Attendance Policy & Lunch Configurations
        </h3>
        
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6 md:p-8 space-y-6">
          {settingsSuccess && (
            <div className="p-4 bg-emerald-50 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-2xl border border-emerald-100/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              Attendance parameters updated and synced across all staff registries successfully!
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {/* Setting 1: Late Threshold */}
            <div className="py-4 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-extrabold text-sm text-gray-900 uppercase tracking-tight">Late Arrival Threshold</p>
                <p className="text-xs text-gray-450">Staff will be automatically marked as <span className="font-bold text-amber-600">"Late"</span> if they check in after this hour.</p>
              </div>
              <input 
                type="time"
                value={lateThreshold}
                onChange={e => setLateThreshold(e.target.value)}
                className="px-4 py-2 text-sm bg-gray-50 border border-gray-100 hover:border-gray-200 focus:border-slate-300 rounded-xl font-bold font-mono outline-none focus:ring-0 max-w-[200px]"
              />
            </div>

            {/* Setting 2: Half-Day Threshold */}
            <div className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-extrabold text-sm text-gray-900 uppercase tracking-tight">Half-Day Arrival Threshold</p>
                <p className="text-xs text-gray-450">Checking in after this time automatically sets the marker to <span className="font-bold text-yellow-600">"Half Day"</span> status.</p>
              </div>
              <input 
                type="time"
                value={halfDayThreshold}
                onChange={e => setHalfDayThreshold(e.target.value)}
                className="px-4 py-2 text-sm bg-gray-50 border border-gray-100 hover:border-gray-200 focus:border-slate-300 rounded-xl font-bold font-mono outline-none focus:ring-0 max-w-[200px]"
              />
            </div>

            {/* Setting 3: Allowed Lunch Break (minutes) */}
            <div className="py-4 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-extrabold text-sm text-gray-900 uppercase tracking-tight">Allowed Lunch Duration (Minutes)</p>
                <p className="text-xs text-gray-450">The official time given for lunch. Anyone exceeding this limit will trigger an <span className="font-bold text-red-500">Overtime Breach</span> audit flag.</p>
              </div>
              <div className="flex items-center gap-2 max-w-[200px] w-full">
                <input 
                  type="number"
                  min="10"
                  max="180"
                  value={lunchDurationLimit}
                  onChange={e => setLunchDurationLimit(Number(e.target.value))}
                  className="w-full px-4 py-2 text-sm bg-gray-50 border border-gray-100 hover:border-gray-200 focus:border-slate-300 rounded-xl font-black font-mono outline-none focus:ring-0"
                />
                <span className="text-xs font-extrabold text-gray-400 uppercase shrink-0">Mins</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-150 flex justify-end">
            <button 
              onClick={saveAttendanceSettings}
              disabled={isUpdatingSettings}
              className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isUpdatingSettings ? "Syncing..." : "Save Policy Suite"}
            </button>
          </div>
        </div>
      </div>

      {role === "admin" && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-gray-900" />
            User Management
          </h3>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50/50 text-gray-400 text-[10px] uppercase tracking-widest italic">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {profiles.map((profile, idx) => (
                    <tr key={profile.id || profile.uid || `prof-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-400">
                            {profile.displayName ? profile.displayName[0] : "U"}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{profile.displayName}</p>
                            <p className="text-xs text-gray-400">
                              {profile.username || (profile.email && (profile.email.endsWith("@modernmanager.com") ? profile.email.replace("@modernmanager.com", "") : (profile.email.endsWith("@modernmanager.local") ? profile.email.replace("@modernmanager.local", "") : profile.email)))}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select 
                          value={profile.role}
                          onChange={(e) => handleUpdateRole(profile.uid, e.target.value as UserRole)}
                          className={cn(
                            "text-xs font-bold uppercase tracking-wider py-1.5 px-3 rounded-full border-none focus:ring-0 cursor-pointer",
                            profile.role === "admin" ? "bg-purple-50 text-purple-700" :
                            profile.role === "accountant" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                          )}
                        >
                          <option value="admin">Administrator</option>
                          <option value="accountant">Accountant</option>
                          <option value="sales">Sales Staff</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 font-medium">
                        {format(new Date(profile.createdAt), "MMM dd, yyyy")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-green-500 uppercase tracking-widest">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {role === "admin" && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2 text-red-600">
            <ShieldAlert className="w-6 h-6" />
            Danger Zone
          </h3>
          <div className="bg-red-50 rounded-3xl p-8 border border-red-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1">
              <p className="font-bold text-red-900 text-lg">Wipe Database & Seed Blank Slate</p>
              <p className="text-sm text-red-700 max-w-xl">
                This will instantly and permanently erase all demo data (transactions, staff accounts, attendance records, bank stats, and categories) to restore a fresh blank environment.
              </p>
            </div>
            <button
              onClick={handleWipeDatabase}
              disabled={isWiping}
              className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isWiping ? "Wiping Database..." : "Remove Demo Data"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-2xl font-bold mb-2">Need bulk imports?</h3>
          <p className="text-gray-400 max-w-lg mb-6">Contact administrator to upload large inventory or transaction datasets via JSON migration.</p>
          <button className="px-6 py-3 bg-white text-gray-900 rounded-2xl font-bold hover:bg-gray-100 transition-all active:scale-95">Contact Admin</button>
        </div>
        <LayoutGrid className="absolute -right-10 -bottom-10 w-64 h-64 text-white/5 rotate-12" />
      </div>
    </div>
  );
}
