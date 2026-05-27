import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, increment, writeBatch } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Transaction, Bank, UserRole, Employee } from "@/src/types";
import { cn, formatCurrency, safeFormat as format } from "@/src/lib/utils";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Search, 
  Calendar, 
  FileDown, 
  ShoppingCart, 
  DollarSign, 
  ChevronDown, 
  ChevronUp, 
  Edit, 
  Trash2, 
  UserCircle, 
  Building2, 
  PiggyBank, 
  Scale, 
  Info, 
  CalendarDays,
  CheckCircle2
} from "lucide-react";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { motion, AnimatePresence } from "motion/react";

interface SalesListProps {
  user: User;
  role: UserRole;
  onEditSales?: (date: string) => void;
}

interface DailySalesGroup {
  dateStr: string; // e.g. "2026-05-21"
  dayName: string; // e.g. "Thursday"
  totalEmployeeSales: number;
  totalWholesaleSales: number;
  totalDeposit: number;
  grandTotal: number;
  transactions: Transaction[];
  employeeBreakdown: {
    employeeId?: string;
    employeeName: string;
    amount: number;
  }[];
}

export default function SalesList({ user, role, onEditSales }: SalesListProps) {
  const { language, t, formatDate, formatNumber, translateValue } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // White-label corporate parameters
  const [companyName, setCompanyName] = useState("Modern Shop");
  const [companyPoweredBy, setCompanyPoweredBy] = useState("Powered by ModernManager");
  const [showPoweredBy, setShowPoweredBy] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Shop");
        setCompanyPoweredBy(data.companyPoweredBy || "Powered by ModernManager");
        setShowPoweredBy(data.showPoweredBy ?? true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/company");
    });
    return () => unsub();
  }, []);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Keep track of which days are expanded
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [dayToDelete, setDayToDelete] = useState<DailySalesGroup | null>(null);

  const canDelete = true;

  useEffect(() => {
    // Sync Transactions (both income and sales-related)
    const q = query(collection(db, "transactions"), orderBy("date", "desc"));
    const unsubTxs = onSnapshot(q, (snapshot) => {
      const allTx = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      
      // Filter for Sales & Deposit categories we interest in grouping
      const salesTx = allTx.filter(tx => 
        tx.type === "income" && 
        (tx.category === "Employee Sales" || 
         tx.category === "Wholesale Sales" || 
         tx.category === "Total Deposit" ||
         tx.category.toLowerCase().includes("sale") || 
         tx.category === "Product Sales" ||
         tx.category === "Retail Sales")
      );
      setTransactions(salesTx);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    // Sync Banks to safely revert balance if a transaction is deleted
    const unsubBanks = onSnapshot(collection(db, "banks"), (snapshot) => {
      setBanks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    // Sync Employees to display profiles/roles beautifully
    const unsubEmps = onSnapshot(collection(db, "employees"), (snapshot) => {
      const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      emps.sort((a, b) => {
        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(emps);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    return () => {
      unsubTxs();
      unsubBanks();
      unsubEmps();
    };
  }, []);

  // Soft toggle expand/collapse for a date row
  const toggleExpand = (dateStr: string) => {
    setExpandedDays(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  // Safe Cascade Delete for an entire Daily Ledger
  const handleDeleteDay = async (group: DailySalesGroup) => {
    try {
      const batch = writeBatch(db);
      for (const tx of group.transactions) {
        if (!tx.id) continue;
        
        // Mark document for deletion in our batch
        batch.delete(doc(db, "transactions", tx.id));
        
        // Revert associated bank account balances if paymentMethod was not cash
        if (tx.paymentMethod && tx.paymentMethod !== "Cash") {
          const matchedBank = banks.find(b => b.name === tx.paymentMethod);
          if (matchedBank?.id) {
            batch.update(doc(db, "banks", matchedBank.id), {
              balance: increment(-tx.amount),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "transactions");
    }
  };

  // Group transactions into daily ledger blocks dynamically
  const getGroupedSales = () => {
    const groups: Record<string, DailySalesGroup> = {};

    transactions.forEach(tx => {
      let dateKey = "";
      try {
        dateKey = format(new Date(tx.date), "yyyy-MM-dd");
      } catch (e) {
        return;
      }

      if (!groups[dateKey]) {
        let day = "Selected Day";
        try {
          day = format(new Date(tx.date), "EEEE");
        } catch (e) {}

        groups[dateKey] = {
          dateStr: dateKey,
          dayName: day,
          totalEmployeeSales: 0,
          totalWholesaleSales: 0,
          totalDeposit: 0,
          grandTotal: 0,
          transactions: [],
          employeeBreakdown: []
        };
      }

      groups[dateKey].transactions.push(tx);

      if (tx.category === "Employee Sales") {
        groups[dateKey].totalEmployeeSales += tx.amount;
        
        // Push or accumulate individual employee breakdown
        const empName = tx.subCategory || "Unknown Employee";
        const existingBreakdown = groups[dateKey].employeeBreakdown.find(e => e.employeeId === tx.employeeId);
        if (existingBreakdown) {
          existingBreakdown.amount += tx.amount;
        } else {
          groups[dateKey].employeeBreakdown.push({
            employeeId: tx.employeeId,
            employeeName: empName,
            amount: tx.amount
          });
        }
      } else if (tx.category === "Wholesale Sales" || tx.category.toLowerCase().includes("wholesale")) {
        groups[dateKey].totalWholesaleSales += tx.amount;
      } else if (tx.category === "Total Deposit" || tx.category.toLowerCase() === "deposit") {
        groups[dateKey].totalDeposit += tx.amount;
      } else {
        // Fallback or legacy "Retail / Product Sales" directly count towards Employee counter sales
        groups[dateKey].totalEmployeeSales += tx.amount;
      }
    });

    // Compute grand totals for each daily block
    Object.values(groups).forEach(g => {
      g.grandTotal = g.totalEmployeeSales + g.totalWholesaleSales - g.totalDeposit;
    });

    return Object.values(groups);
  };

  const allGroupedDays = getGroupedSales();

  // Filter grouped days by Search Query and Date Intervals
  const filteredDailyGroups = allGroupedDays.filter(group => {
    // 1. Check Date Range filters
    let matchesDate = true;
    if (startDate && endDate) {
      const s = startOfDay(new Date(startDate));
      const e = endOfDay(new Date(endDate));
      matchesDate = isWithinInterval(new Date(group.dateStr), { start: s, end: e });
    } else if (startDate) {
      matchesDate = new Date(group.dateStr) >= startOfDay(new Date(startDate));
    } else if (endDate) {
      matchesDate = new Date(group.dateStr) <= endOfDay(new Date(endDate));
    }

    if (!matchesDate) return false;

    // 2. Check text query searches (matches dateStr, dayName, or any staff employee name inside)
    if (!searchQuery) return true;

    const queryLower = searchQuery.toLowerCase();
    const dateMatch = group.dateStr.includes(searchQuery);
    const dayMatch = group.dayName.toLowerCase().includes(queryLower);
    const employeeMatch = group.employeeBreakdown.some(emp => 
      emp.employeeName.toLowerCase().includes(queryLower)
    );

    return dateMatch || dayMatch || employeeMatch;
  });

  // Sort daily records descending (latest entries on top)
  const sortedFilteredGroups = filteredDailyGroups.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  // Cumulative filtered aggregation metrics
  const aggregateEmployeeSales = sortedFilteredGroups.reduce((acc, curr) => acc + curr.totalEmployeeSales, 0);
  const aggregateWholesaleSales = sortedFilteredGroups.reduce((acc, curr) => acc + curr.totalWholesaleSales, 0);
  const aggregateDeposits = sortedFilteredGroups.reduce((acc, curr) => acc + curr.totalDeposit, 0);
  const cumulativeGrandTotal = aggregateEmployeeSales + aggregateWholesaleSales - aggregateDeposits;

  // Export CSV summary of daily grouped records
  const exportGroupedCSV = () => {
    let csvContent = "Date,Day,Staff Sales,Wholesale Sales,Total Deposit,Grand Total,Status\n";
    sortedFilteredGroups.forEach(g => {
      csvContent += `${g.dateStr},${g.dayName},${g.totalEmployeeSales},${g.totalWholesaleSales},${g.totalDeposit},${g.grandTotal}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `daily_sales_ledger_${format(new Date(), "yyyyMMdd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">{t("Sales Hub")}</h2>
          <p className="text-xs font-semibold text-slate-455 uppercase tracking-wider mt-0.5">{t("Audit log of counter sales & store ledger")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportGroupedCSV}
            disabled={sortedFilteredGroups.length === 0}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-md"
          >
            <FileDown className="w-4 h-4 text-slate-350" />
            {t("Export CSV Ledger")}
          </button>
        </div>
      </div>

      {/* Aggregate KPI Financial Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Staff Sales Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">{t("Counter Sales")}</p>
            <h3 className="text-lg font-black text-slate-850 font-mono tracking-tight">{formatCurrency(aggregateEmployeeSales)}</h3>
          </div>
        </div>

        {/* Total Wholesale Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center shrink-0 border border-sky-100">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">{t("Wholesale")}</p>
            <h3 className="text-lg font-black text-slate-850 font-mono tracking-tight">{formatCurrency(aggregateWholesaleSales)}</h3>
          </div>
        </div>

        {/* Total Deposit Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0 border border-rose-100">
            <PiggyBank className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">{t("Deposited Cash")}</p>
            <h3 className="text-lg font-black text-slate-850 font-mono tracking-tight">{formatCurrency(aggregateDeposits)}</h3>
          </div>
        </div>

        {/* Net Cumulative Balance Card */}
        <div className="bg-slate-900 p-5 rounded-2xl shadow-xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white/10 text-white rounded-xl flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-0.5">{t("Aggregate Revenue")}</p>
            <h3 className="text-lg font-black text-white font-mono tracking-tight">{formatCurrency(cumulativeGrandTotal)}</h3>
          </div>
        </div>
      </div>

      {/* Advanced Filter and Search Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Main search text query */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t("Filter staff name, day...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200/55 rounded-xl text-xs font-semibold placeholder-slate-400 focus:border-slate-800 outline-none transition-all"
            />
          </div>

          {/* Start Date selection */}
          <div className="flex items-center bg-slate-50 border border-slate-200/55 rounded-xl px-3 py-2.5 gap-2 transition-all">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent border-none text-xs font-bold outline-none text-slate-700 cursor-pointer"
            />
          </div>

          {/* End Date selection */}
          <div className="flex items-center bg-slate-50 border border-slate-200/55 rounded-xl px-3 py-2.5 gap-2 transition-all">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent border-none text-xs font-bold outline-none text-slate-700 cursor-pointer"
            />
          </div>
        </div>

        {/* Clear filter triggers if active */}
        {(startDate || endDate || searchQuery) && (
          <div className="flex justify-end pr-1">
            <button
              onClick={() => {
                setSearchQuery("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-black uppercase tracking-wider text-rose-600 hover:text-rose-700 cursor-pointer transition-colors"
            >
              {t("Clear active filters")}
            </button>
          </div>
        )}
      </div>

      {/* Main Daily Grouped Sales Accordion List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center text-gray-400 font-medium bg-white rounded-3xl border border-gray-100 shadow-sm">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mb-3" />
            {t("Gathering daily sales logs...")}
          </div>
        ) : sortedFilteredGroups.length === 0 ? (
          <div className="py-16 text-center text-gray-400 bg-white border border-gray-100 rounded-3xl shadow-sm italic p-6">
            <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            {t("No matching daily sales records exist.")}
            <p className="not-italic text-xs text-gray-500 mt-1 font-medium">
              {t("Create a record in the New Sale tab first.")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedFilteredGroups.map((group) => {
              const isExpanded = !!expandedDays[group.dateStr];
              
              return (
                <div 
                  key={group.dateStr} 
                  className={cn(
                    "bg-white border rounded-3xl overflow-hidden transition-all duration-200 shadow-sm",
                    isExpanded ? "border-blue-100 ring-4 ring-blue-50/30" : "border-gray-100 hover:border-gray-200"
                  )}
                >
                  {/* Daily Log Accordion Header */}
                  <div 
                    onClick={() => toggleExpand(group.dateStr)}
                    className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/50"
                  >
                    {/* Left Details: Date & Day Name */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center justify-center text-gray-500 shrink-0">
                        <CalendarDays className="w-5 h-5 text-[#2D7BBF]" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {format(new Date(group.dateStr), "MMM d, yyyy")}
                        </h4>
                        <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase">
                          {group.dayName}
                        </span>
                      </div>
                    </div>

                    {/* Mid Details: Columnized Financial Sum-ups */}
                    <div className="grid grid-cols-2 md:flex md:items-center md:gap-6 gap-y-3 gap-x-2 text-xs font-bold text-gray-600">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider mb-0.5">Staff Sales</span>
                        <span className="font-mono text-gray-900">{formatCurrency(group.totalEmployeeSales)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider mb-0.5">Wholesale</span>
                        <span className="font-mono text-gray-900">{formatCurrency(group.totalWholesaleSales)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider mb-0.5">Deposit</span>
                        <span className="font-mono text-red-500">-{formatCurrency(group.totalDeposit)}</span>
                      </div>
                      <div className="border-t md:border-t-0 md:border-l border-gray-100 pt-2 md:pt-0 md:pl-4">
                        <span className="text-[10px] text-[#2D7BBF] block font-bold uppercase tracking-wider mb-0.5">Grand Total</span>
                        <span className="font-mono text-emerald-600 text-sm">{formatCurrency(group.grandTotal)}</span>
                      </div>
                    </div>

                    {/* Right Actions: Edit, Delete, Toggle */}
                    <div className="flex items-center gap-1.5 self-end md:self-center" onClick={e => e.stopPropagation()}>
                      {/* Edit entries for this day */}
                      {onEditSales && (
                        <button
                          onClick={() => onEditSales(group.dateStr)}
                          className="p-2.5 hover:bg-amber-50 hover:text-amber-700 text-gray-400 transition-all rounded-xl border border-transparent hover:border-amber-100 flex items-center gap-1.5 text-xs font-bold"
                          title="Edit this ledger"
                        >
                          <Edit className="w-4 h-4" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      )}

                      {/* Cascade delete entire day admin-only */}
                      {canDelete && (
                        <button
                          onClick={() => setDayToDelete(group)}
                          className="p-2.5 hover:bg-red-50 hover:text-red-700 text-gray-400 transition-all rounded-xl border border-transparent hover:border-red-100 flex items-center gap-1.5 text-xs font-bold"
                          title="Purge daily ledger"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      )}

                      {/* Expansion arrow indicator */}
                      <button 
                        onClick={() => toggleExpand(group.dateStr)}
                        className="p-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all border border-gray-200 ml-1.5"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Daily Expanded Staff & Breakdown Details */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-gray-100 bg-slate-50/40 overflow-hidden"
                      >
                        <div className="p-5 sm:p-6 space-y-6">
                          <div>
                            <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest pl-0.5 mb-3 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              Breakdown of Staff Counter Sales
                            </h5>
                            
                            {group.employeeBreakdown.length === 0 ? (
                              <p className="text-xs text-gray-400 italic bg-[#fff] border border-gray-100 rounded-2xl p-4 text-center">
                                No individual employee sales registered for this day (Only wholesale or legacy entries exist).
                              </p>
                            ) : (
                              <div className="bg-white border rounded-2xl divide-y divide-gray-50 shadow-sm overflow-hidden">
                                {group.employeeBreakdown.map((empCell) => {
                                  // Resolve real-time image and role metadata of Employee
                                  const matchingDoc = employees.find(e => e.id === empCell.employeeId);
                                  const avatarData = matchingDoc?.documents?.find(d => d.type.startsWith("image/"));
                                  const employeeRole = matchingDoc?.role || "Staff Officer";

                                  return (
                                    <div 
                                      key={empCell.employeeId || empCell.employeeName} 
                                      className="flex justify-between items-center p-4 hover:bg-slate-50/55 transition-all"
                                    >
                                      {/* Left block: Icon, Name and Designation */}
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center overflow-hidden shrink-0">
                                          {avatarData ? (
                                            <img src={avatarData.data} alt="" className="w-full h-full object-cover" />
                                          ) : (
                                            <UserCircle className="w-6 h-6 text-blue-400" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="font-bold text-gray-900 text-sm">{empCell.employeeName}</p>
                                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide leading-none mt-0.5">{employeeRole}</p>
                                        </div>
                                      </div>

                                      {/* Right block: Amount */}
                                      <div className="text-right font-mono font-bold text-gray-800 text-sm">
                                        {formatCurrency(empCell.amount)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Full Day Summary Recital panel */}
                          <div className="bg-white border text-gray-700 border-gray-200/60 p-5 rounded-2xl shadow-sm space-y-3">
                            <h5 className="font-bold text-gray-900 text-xs uppercase tracking-widest pl-0.5 border-b pb-2">
                              Daily Reconciliation
                            </h5>
                            
                            <div className="space-y-2 text-sm font-semibold text-gray-500">
                              <div className="flex justify-between">
                                <span>Summed Staff Sales</span>
                                <span className="font-mono text-gray-900 font-bold">{formatCurrency(group.totalEmployeeSales)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Wholesale Entry</span>
                                <span className="font-mono text-gray-900 font-bold">+{formatCurrency(group.totalWholesaleSales)}</span>
                              </div>
                              <div className="flex justify-between pb-2 border-b border-dashed border-gray-100">
                                <span>Deposit Deductions</span>
                                <span className="font-mono text-red-500 font-bold">-{formatCurrency(group.totalDeposit)}</span>
                              </div>
                              <div className="flex justify-between pt-1 font-bold text-gray-900 text-base">
                                <span className="text-[#2D7BBF]">Grand Ledger Total</span>
                                <span className="font-mono text-emerald-600">{formatCurrency(group.grandTotal)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {dayToDelete && (
        <div id="delete-confirmation-modal" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Delete Daily Sales?</h3>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to delete ALL sales records for <strong className="text-gray-950 font-mono">{dayToDelete.dateStr}</strong> ({dayToDelete.dayName})?
              </p>
              <div className="text-xs text-red-600 bg-red-50 p-4 rounded-2xl mt-3 font-semibold space-y-1">
                <span className="block font-black uppercase text-[10px] tracking-wide mb-1 text-red-700">⚠️ DANGER ZONE: This will permanently delete:</span>
                <span className="block">• {dayToDelete.transactions.length} daily individual sales / deposit transactions</span>
                <span className="block">• Automatically revert any updated bank account balances</span>
                <span className="block font-bold mt-1 text-red-700">This action cannot be undone.</span>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                id="cancel-delete-modal-btn"
                onClick={() => setDayToDelete(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-modal-btn"
                onClick={async () => {
                  const x = dayToDelete;
                  setDayToDelete(null);
                  await handleDeleteDay(x);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-red-100"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer copyright block */}
      <div className="flex flex-col sm:flex-row justify-between items-center text-[11px] text-gray-400 pt-6 px-2 font-medium border-t border-gray-100 mt-8">
        <div>
          Copyright &copy; 2026-2027 {companyName}. {showPoweredBy ? companyPoweredBy : "All rights reserved."}
        </div>
        <div className="mt-1 sm:mt-0 font-semibold text-gray-500">
          Corporate System v2.4
        </div>
      </div>
    </div>
  );
}
