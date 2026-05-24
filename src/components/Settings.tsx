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

  // Attendance Settings
  const [lateThreshold, setLateThreshold] = useState("10:00");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  useEffect(() => {
    const unsubCats = onSnapshot(query(collection(db, "categories"), orderBy("name")), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });
    const unsubBanks = onSnapshot(query(collection(db, "banks"), orderBy("name")), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    });

    const unsubSettings = onSnapshot(doc(db, "settings", "attendance"), (doc) => {
      if (doc.exists()) {
        setLateThreshold(doc.data().lateThreshold || "10:00");
      }
    });

    let unsubProfiles = () => {};
    if (role === "admin") {
      unsubProfiles = onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), (snap) => {
        setProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
      });
    }

    return () => { unsubCats(); unsubBanks(); unsubProfiles(); };
  }, [role]);

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

  const handleDelete = async (coll: string, id: string) => {
    if (!confirm("Remove this entry?")) return;
    try { await deleteDoc(doc(db, coll, id)); }
    catch (e) { handleFirestoreError(e, OperationType.DELETE, coll); }
  };

  const saveAttendanceSettings = async () => {
    setIsUpdatingSettings(true);
    try {
      await setDoc(doc(db, "settings", "attendance"), {
        lateThreshold,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid
      });
      alert("Attendance policy updated.");
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
        <p className="text-sm text-gray-500">Customize your shop's categories and bank accounts.</p>
      </header>

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
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-3 border border-gray-50 rounded-2xl hover:bg-gray-50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      cat.type === "income" ? "bg-green-500" : "bg-red-500"
                    )} />
                    <span className="font-semibold text-gray-700">{cat.name}</span>
                  </div>
                  <button 
                    onClick={() => handleDelete("categories", cat.id!)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
              {banks.map(bank => (
                <div key={bank.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between group">
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
                    <button 
                      onClick={() => handleDelete("banks", bank.id!)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all bg-white rounded-lg border border-gray-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Policy Section */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-gray-400" />
          Attendance Policy
        </h3>
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="font-bold text-gray-900">Late Arrival Threshold</p>
            <p className="text-sm text-gray-400">Staff will be automatically marked as "Late" if they check in after this time.</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <input 
              type="time"
              value={lateThreshold}
              onChange={e => setLateThreshold(e.target.value)}
              className="px-6 py-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-100 font-black text-lg"
            />
            <button 
              onClick={saveAttendanceSettings}
              disabled={isUpdatingSettings}
              className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isUpdatingSettings ? "Saving..." : "Save Policy"}
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
                  {profiles.map(profile => (
                    <tr key={profile.uid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-400">
                            {profile.displayName[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{profile.displayName}</p>
                            <p className="text-xs text-gray-400">{profile.email}</p>
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
