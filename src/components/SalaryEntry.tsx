import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, doc, increment, query, where } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, updateDoc } from "@/src/lib/firebase";
import { Employee, Bank, UserRole, Transaction } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  Save, 
  Calendar, 
  Landmark, 
  Wallet, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Search, 
  Coins, 
  Clock, 
  CreditCard,
  UserCheck,
  Check,
  Trash2,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { motion } from "motion/react";

interface RowState {
  amount: string; // Unified paid salary / advance amount
  notes: string;
}

export default function SalaryEntry({ user, role }: { user: User; role: UserRole }) {
  const normalizedRole = (role || "").toLowerCase().trim();
  const isSuperAdmin = 
    normalizedRole === "super_admin" ||
    normalizedRole === "superadmin" ||
    normalizedRole === "super admin" ||
    normalizedRole.includes("super") ||
    normalizedRole === "admin" ||
    normalizedRole.includes("administrator") ||
    user?.email?.toLowerCase() === "modern@admin.com";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sheet State
  const [sheetData, setSheetData] = useState<Record<string, RowState>>({});
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const unsubEmps = onSnapshot(query(collection(db, "employees"), where("status", "==", "active")), (snap) => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      emps.sort((a, b) => {
        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(emps);
      
      // Initialize sheet data if not already set
      setSheetData(prev => {
        const next = { ...prev };
        emps.forEach(emp => {
          if (!next[emp.id!]) {
            next[emp.id!] = { amount: "", notes: "" };
          }
        });
        return next;
      });
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    const unsubBanks = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    // Snap salary and advance transactions to show already paid amounts this month
    const unsubTx = onSnapshot(collection(db, "transactions"), (snap) => {
      const allTx = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      const payTx = allTx.filter(t => t.category === "Staff Salary" || t.category === "Employee Advance");
      setTransactions(payTx);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    return () => { unsubEmps(); unsubBanks(); unsubTx(); };
  }, []);

  const selectedDateObj = new Date(date);
  const selectedMonthStr = format(selectedDateObj, "yyyy-MM");
  const monthDisplayName = format(selectedDateObj, "MMMM yyyy");

  // Calculate total salary/advance already disbursed to an employee in this month
  const getEmployeePaidThisMonth = (empId: string) => {
    return transactions
      .filter(tx => {
        if (tx.employeeId !== empId) return false;
        try {
          const txMonth = format(new Date(tx.date), "yyyy-MM");
          return txMonth === selectedMonthStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  };

  const handleInputChange = (empId: string, field: keyof RowState, value: string) => {
    setSheetData(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value }
    }));
  };

  // Quick fill remaining balance for an employee
  const handleQuickFillDue = (empId: string, dueAmount: number) => {
    handleInputChange(empId, "amount", dueAmount > 0 ? dueAmount.toString() : "0");
  };

  // Clear all entered amounts
  const handleClearAll = () => {
    const next: Record<string, RowState> = {};
    employees.forEach(emp => {
      next[emp.id!] = { amount: "", notes: "" };
    });
    setSheetData(next);
  };

  const handleSubmit = async () => {
    const entries = (Object.entries(sheetData) as [string, RowState][]).filter(
      ([_, data]) => data.amount && parseFloat(data.amount) > 0
    );
    if (entries.length === 0) {
      return alert("অনুগ্রহ করে অন্তত একজন কর্মীর বেতন/অগ্রিম পরিমাণ লিখুন। (Please input at least one salary/advance amount.)");
    }
    
    setIsSubmitting(true);
    try {
      let totalExpense = 0;

      for (const [empId, data] of entries) {
        const emp = employees.find(e => e.id === empId);
        const amount = parseFloat(data.amount);
        totalExpense += amount;
        
        await addDoc(collection(db, "transactions"), {
          date: new Date(date).toISOString(),
          type: "expense",
          category: "Staff Salary",
          subCategory: emp?.name || "",
          amount: amount,
          paymentMethod,
          notes: data.notes || `বেতন ও অগ্রিম প্রদান (${monthDisplayName})`,
          createdBy: user.uid,
          employeeId: empId
        });
      }

      // Update bank balance if not cash
      if (paymentMethod !== "Cash") {
        const bank = banks.find(b => b.name === paymentMethod);
        if (bank?.id) {
          await updateDoc(doc(db, "banks", bank.id), {
            balance: increment(-totalExpense),
            lastUpdated: new Date().toISOString()
          });
        }
      }

      setSuccess(true);
      // Reset sheet
      const resetData: Record<string, RowState> = {};
      employees.forEach(emp => {
        resetData[emp.id!] = { amount: "", notes: "" };
      });
      setSheetData(resetData);
      
      setTimeout(() => setSuccess(false), 3500);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "transactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter employees by search query
  const filteredEmployees = employees.filter(emp => {
    if (!employeeSearch.trim()) return true;
    const q = employeeSearch.toLowerCase().trim();
    return (
      emp.name.toLowerCase().includes(q) ||
      emp.role.toLowerCase().includes(q) ||
      (emp.department && emp.department.toLowerCase().includes(q)) ||
      (emp.employeeId && emp.employeeId.toLowerCase().includes(q))
    );
  });

  // KPI calculations
  const totalBasePayroll = employees.reduce((sum, e) => sum + (e.salary || 0), 0);
  const totalAlreadyPaidMonth = employees.reduce((sum, e) => sum + getEmployeePaidThisMonth(e.id!), 0);
  const totalEnteredToday = (Object.values(sheetData) as RowState[]).reduce(
    (sum, d) => sum + (parseFloat(d.amount) || 0), 
    0
  );
  const totalStaffReceivingPayment = (Object.values(sheetData) as RowState[]).filter(
    d => parseFloat(d.amount) > 0
  ).length;
  const netRemainingDue = Math.max(0, totalBasePayroll - (totalAlreadyPaidMonth + totalEnteredToday));

  if (loading) {
    return <div className="py-20 text-center text-gray-400 font-medium">Loading Salary Entry Sheet...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shadow-xs">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">বেতন ও অগ্রিম প্রদান (Salary & Advance Entry)</h2>
              <p className="text-slate-500 font-medium text-xs sm:text-sm mt-0.5">
                Paid salary is an advance amount — একক কলামে সহজ ও বড় ইনপুট বক্সে কর্মীদের বেতন ও অগ্রিম প্রদান করুন।
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls: Date & Bank/Cash Selector */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-3xl shadow-sm border border-slate-200/80">
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200/60">
            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
            <input 
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-black text-xs sm:text-sm text-slate-900 cursor-pointer outline-none"
            />
          </div>

          <div className="h-6 w-[1px] bg-slate-200 hidden sm:block" />

          {/* Account Selector */}
          <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200/60">
            {paymentMethod === "Cash" ? (
              <Wallet className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Landmark className="w-4 h-4 text-indigo-500 shrink-0" />
            )}
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-black text-xs sm:text-sm text-slate-900 appearance-none cursor-pointer outline-none pr-3"
            >
              <option value="Cash">Cash Account (ক্যাশ)</option>
              {banks.map(b => (
                <option key={b.id} value={b.name}>{b.name} (৳{b.balance.toLocaleString()})</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Active Staff */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">সক্রিয় কর্মী</span>
          <div className="text-xl font-black text-slate-900 font-mono">
            {employees.length} <span className="text-xs font-semibold text-slate-500">জন</span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold">পে-রোল আর তালিকাভুক্ত</p>
        </div>

        {/* Card 2: Total Base Payroll */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">মাসিক মূল পে-রোল</span>
          <div className="text-xl font-black text-slate-900 font-mono">
            {isSuperAdmin ? `৳${totalBasePayroll.toLocaleString()}` : "***"}
          </div>
          <p className="text-[10px] text-slate-400 font-bold">{monthDisplayName}</p>
        </div>

        {/* Card 3: Already Paid this Month */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">চলতি মাসে ইতোমধ্যে প্রদেয়</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 font-mono">
            {isSuperAdmin ? `৳${totalAlreadyPaidMonth.toLocaleString()}` : "***"}
          </div>
          <p className="text-[10px] text-slate-400 font-bold">বেতন ও অগ্রিম সমন্বিত</p>
        </div>

        {/* Card 4: Today's Total Entry (Highlighted) */}
        <div className="bg-emerald-500/10 p-4 rounded-3xl border-2 border-emerald-400/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">আজকের মোট এন্ট্রি</span>
            <Coins className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            ৳{totalEnteredToday.toLocaleString()}
          </div>
          <p className="text-[10px] text-emerald-800 font-bold">
            {totalStaffReceivingPayment} জন কর্মীর বেতন/অগ্রিম
          </p>
        </div>

        {/* Card 5: Remaining Payroll Balance */}
        <div className="bg-slate-900 text-white p-4 rounded-3xl border border-slate-800 shadow-xs space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">অবশিষ্ট প্রদেয় বকেয়া</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black text-amber-400 font-mono">
            {isSuperAdmin ? `৳${netRemainingDue.toLocaleString()}` : "***"}
          </div>
          <p className="text-[10px] text-slate-400 font-bold">মাসিক ব্যালেন্স</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-[36px] shadow-xl border border-slate-200/80 overflow-hidden space-y-4 p-6 sm:p-8">
        {/* Table Top Controls & Search */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              কর্মীদের বেতন ও অগ্রিম তালিকা — {monthDisplayName}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              যেকোনো কর্মীর বেতন বা অগ্রিম প্রদানের জন্য ইনপুট বক্সে পরিমাণ লিখুন (বাকি সব বাটনে এক ক্লিকেই পূরণ করা যাবে)।
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="কর্মী বা পদবী দিয়ে খুঁজুন..."
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white rounded-2xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 font-bold text-xs outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            {totalEnteredToday > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                title="সব এন্ট্রি ক্লিয়ার করুন"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ক্লিয়ার করুন</span>
              </button>
            )}
          </div>
        </div>

        {/* The Table Layout with BIG Input Box and Line */}
        <div className="overflow-x-auto -mx-6 sm:-mx-8">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100">
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest w-1/4">
                  কর্মী ও পদবী
                </th>
                <th className="px-5 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                  মাসিক মূল বেতন
                </th>
                <th className="px-5 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                  ইতোপূর্বে প্রদান ({monthDisplayName})
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-emerald-800 uppercase tracking-widest w-1/4">
                  বেতন / অগ্রিম প্রদান (PAID SALARY / ADVANCE)
                </th>
                <th className="px-5 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                  অবশিষ্ট বকেয়া
                </th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  রেফারেন্স / নোটস
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 italic font-semibold">
                    কোনো কর্মীর তথ্য পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const alreadyPaid = getEmployeePaidThisMonth(emp.id!);
                  const baseSalary = emp.salary || 0;
                  const currentDue = Math.max(0, baseSalary - alreadyPaid);
                  const currentInput = sheetData[emp.id!]?.amount || "";
                  const inputVal = parseFloat(currentInput) || 0;
                  const afterPaymentRemaining = baseSalary - (alreadyPaid + inputVal);

                  // Extract employee photo
                  const docImg = emp.documents?.find(d => d.type?.startsWith("image/") || d.name?.match(/\.(jpg|jpeg|png|webp|gif)$/i));
                  const photoSrc = emp.photo || docImg?.data || emp.nidFrontPhoto || emp.birthCertificatePhoto;

                  return (
                    <tr 
                      key={emp.id} 
                      className={cn(
                        "hover:bg-emerald-50/20 transition-all group",
                        inputVal > 0 ? "bg-emerald-50/15" : ""
                      )}
                    >
                      {/* Column 1: Employee Details */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center font-bold text-slate-500 shrink-0 border-2 border-slate-200 group-hover:border-emerald-500 shadow-xs transition-all relative">
                            {photoSrc ? (
                              <img 
                                src={photoSrc} 
                                alt={emp.name} 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black flex items-center justify-center text-sm">
                                {emp.name?.charAt(0) || "E"}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-black text-slate-900 text-sm leading-tight group-hover:text-emerald-700 transition-colors">
                                {emp.name}
                              </p>
                              {emp.employeeId && (
                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {emp.employeeId}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                              {emp.role} {emp.department ? `• ${emp.department}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Monthly Basic Salary */}
                      <td className="px-5 py-5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-mono font-black text-slate-900 text-base">
                            {isSuperAdmin ? formatCurrency(baseSalary) : "***"}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            মাসিক চুক্তি
                          </span>
                        </div>
                      </td>

                      {/* Column 3: Already Paid So Far this Month */}
                      <td className="px-5 py-5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={cn(
                            "font-mono font-black text-sm",
                            alreadyPaid > 0 ? "text-emerald-700" : "text-slate-400"
                          )}>
                            {isSuperAdmin ? formatCurrency(alreadyPaid) : "***"}
                          </span>
                          {baseSalary > 0 && (
                            <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                              {Math.round((alreadyPaid / baseSalary) * 100)}% পরিশোধিত
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 4: THE BIG SALARY / ADVANCE INPUT BOX */}
                      <td className="px-6 py-5">
                        <div className="space-y-1.5">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-emerald-600 select-none">
                              ৳
                            </span>
                            <input 
                              type="number"
                              min="0"
                              step="any"
                              placeholder="০.০০"
                              value={sheetData[emp.id!]?.amount || ""}
                              onChange={e => handleInputChange(emp.id!, "amount", e.target.value)}
                              className={cn(
                                "w-full pl-10 pr-4 py-3.5 sm:py-4 bg-white border-2 rounded-2xl font-black font-mono text-base sm:text-lg text-slate-900 shadow-xs outline-none transition-all placeholder:text-slate-300",
                                inputVal > 0 
                                  ? "border-emerald-500 ring-4 ring-emerald-100 bg-emerald-50/20" 
                                  : "border-slate-300 hover:border-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                              )}
                            />
                          </div>

                          {/* Quick Auto-Fill Helper Buttons */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {currentDue > 0 && (
                              <button
                                type="button"
                                onClick={() => handleQuickFillDue(emp.id!, currentDue)}
                                className="text-[10px] font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-200/80 transition-all cursor-pointer inline-flex items-center gap-1 active:scale-95"
                                title="বকেয়া সম্পূর্ণ পূরণ করুন"
                              >
                                <span>বাকি সব: ৳{currentDue.toLocaleString()}</span>
                              </button>
                            )}
                            {currentDue > 0 && (
                              <button
                                type="button"
                                onClick={() => handleQuickFillDue(emp.id!, Math.round(currentDue / 2))}
                                className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 transition-all cursor-pointer active:scale-95"
                                title="বকেয়ার অর্ধেক পূরণ করুন"
                              >
                                হাফ (৫০%)
                              </button>
                            )}
                            {inputVal > 0 && (
                              <button
                                type="button"
                                onClick={() => handleInputChange(emp.id!, "amount", "")}
                                className="text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 transition-all cursor-pointer active:scale-95"
                                title="এন্ট্রি মুছুন"
                              >
                                ক্লিয়ার
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 5: Remaining Due After Payment */}
                      <td className="px-5 py-5 text-center">
                        <div className="inline-flex flex-col items-center">
                          {afterPaymentRemaining <= 0 && (alreadyPaid + inputVal) > 0 ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-black text-xs inline-flex items-center gap-1 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              সম্পূর্ণ পরিশোধ
                            </span>
                          ) : afterPaymentRemaining > 0 ? (
                            <div className="text-center">
                              <span className="font-mono font-black text-amber-700 text-sm block">
                                {isSuperAdmin ? formatCurrency(afterPaymentRemaining) : "***"}
                              </span>
                              <span className="text-[10px] font-bold text-amber-600 uppercase">
                                বাকি থাকবে
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* Column 6: Notes / Remarks */}
                      <td className="px-6 py-5">
                        <input 
                          type="text"
                          placeholder="রেফারেন্স বা মন্তব্য..."
                          value={sheetData[emp.id!]?.notes || ""}
                          onChange={e => handleInputChange(emp.id!, "notes", e.target.value)}
                          className="w-full px-3.5 py-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 font-semibold text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky Bottom Action Footer */}
      <footer className="bg-white p-5 sm:p-6 rounded-[32px] border border-slate-200/80 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-slate-500 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <p>
            রেকর্ড বাটনে ক্লিক করলে প্রতিটি ইনপুটের জন্য আলাদা ক্যাশ/ব্যাংক ট্রানজাকশন লেজারে স্বয়ংক্রিয়ভাবে সেভ হবে।
          </p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
          {success && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-2.5 rounded-2xl border border-emerald-200 font-black text-xs shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>বেতন ও অগ্রিম সফলভাবে রেকর্ড করা হয়েছে!</span>
            </motion.div>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || employees.length === 0 || totalEnteredToday === 0}
            className={cn(
              "w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-4.5 rounded-2xl font-black text-sm sm:text-base transition-all flex items-center justify-center gap-2.5 active:scale-95 shadow-lg disabled:opacity-50 cursor-pointer",
              success ? "bg-emerald-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
            )}
          >
            {isSubmitting ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            <span>
              {isSubmitting 
                ? "প্রক্রিয়াধীন..." 
                : totalEnteredToday > 0 
                  ? `মোট ৳${totalEnteredToday.toLocaleString()} প্রদান করুন (${totalStaffReceivingPayment} জন)` 
                  : "সব পেমেন্ট রেকর্ড করুন"}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}
