import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Transaction, Bank, UserRole, Product } from "@/src/types";
import { PurchaseModel } from "./Purchase";
import { formatCurrency, cn } from "@/src/lib/utils";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Landmark, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  ShoppingCart, 
  CreditCard, 
  Users, 
  UserCheck, 
  UserX, 
  Coins, 
  CalendarRange,
  Sparkles,
  BarChart4,
  Printer,
  AlertTriangle,
  Bell
} from "lucide-react";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  Legend, 
  Cell 
} from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useLanguage } from "../contexts/LanguageContext";

export default function Dashboard({ 
  user, 
  role,
  onNavigate
}: { 
  user: User; 
  role: UserRole;
  onNavigate?: (view: string, extra?: any) => void;
}) {
  const { language, t, formatCurrency, formatDate, formatNumber, translateValue } = useLanguage();
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [stats, setStats] = useState({
    // Today metrics
    todaySales: 0,
    todayWholesale: 0,
    todayBankDeposit: 0,
    todayBankWithdraw: 0,
    todayExpense: 0,
    todayPurchase: 0,
    todaySupplierPayment: 0,
    todayEmployeePresent: 0,
    todayEmployeeAbsent: 0,
    todayPreviousCash: 0,

    // Total metrics
    totalSales: 0,
    totalWholesale: 0,
    totalBankDeposit: 0,
    totalBankWithdraw: 0,
    totalExpense: 0,
    totalPurchase: 0,
    totalPurchaseDue: 0,
    totalSupplierPayment: 0,
    totalEmployeeAbsentMonth: 0
  });

  const [activeEmpChart, setActiveEmpChart] = useState<"today" | "total">("today");
  const [employeeSalesToday, setEmployeeSalesToday] = useState<any[]>([]);
  const [employeeSalesTotal, setEmployeeSalesTotal] = useState<any[]>([]);
  const [sevenDaysBarChartData, setSevenDaysBarChartData] = useState<any[]>([]);
  const [trendChartData, setTrendChartData] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "products"));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "transactions"),
      orderBy("date", "desc"),
      limit(6)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setRecentTransactions(txs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "banks"), (snapshot) => {
      const bks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bank));
      setBanks(bks);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const today = startOfDay(new Date());
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const todayFormatted = format(new Date(), "yyyy-MM-dd");

        // Simple fetch for summary - in production use aggregation or cloud functions
        const allSnapshot = await getDocs(collection(db, "transactions"));
        const all = allSnapshot.docs.map(doc => doc.data() as Transaction);

        const purchasesSnapshot = await getDocs(collection(db, "purchases"));
        const purchasesList = purchasesSnapshot.docs.map(doc => doc.data() as any);

        const attendanceSnapshot = await getDocs(collection(db, "attendance"));
        const attendanceList = attendanceSnapshot.docs.map(doc => doc.data() as any);

        const employeesSnapshot = await getDocs(collection(db, "employees"));
        const employeesList = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        let todaySales = 0;
        let todayWholesale = 0;
        let todayBankDeposit = 0;
        let todayBankWithdraw = 0;
        let todayExpense = 0;
        let todayPurchase = 0;
        let todaySupplierPayment = 0;
        let todayEmployeePresent = 0;
        let todayEmployeeAbsent = 0;
        let todayPreviousCash = 0;

        let totalSales = 0;
        let totalWholesale = 0;
        let totalBankDeposit = 0;
        let totalBankWithdraw = 0;
        let totalExpense = 0;
        let totalPurchase = 0;
        let totalPurchaseDue = 0;
        let totalSupplierPayment = 0;
        let totalEmployeeAbsentMonth = 0;

        // 1. Transactions calculations
        all.forEach(tx => {
          let isToday = false;
          try {
            const txDateStr = format(new Date(tx.date), "yyyy-MM-dd");
            isToday = txDateStr === todayFormatted;
          } catch (e) {}

          // Sales definition: income and sale category
          const isSale = tx.type === "income" && (
            tx.category === "Employee Sales" || 
            tx.category === "Wholesale Sales" || 
            tx.category === "Retail Sales" || 
            tx.category === "Product Sales" || 
            tx.category.toLowerCase().includes("sale")
          ) &&
          tx.category !== "Opening Balance" &&
          tx.category !== "Previous Cash" &&
          tx.category !== "Bank Deposit" &&
          tx.category !== "Total Deposit" &&
          tx.category !== "Total Bank Deposit";

          const isWholesale = tx.type === "income" && (
            tx.category === "Wholesale Sales" || 
            tx.category.toLowerCase().includes("wholesale")
          );

          const isDeposit = tx.type === "income" && (
            tx.category === "Bank Deposit" || 
            tx.category.toLowerCase().includes("bank deposit")
          );

          const isWithdrawal = tx.type === "expense" && (
            tx.category === "Bank Credit" || 
            tx.category === "Bank Withdrawal" || 
            tx.category.toLowerCase().includes("bank credit") || 
            tx.category.toLowerCase().includes("bank withdrawal") || 
            tx.category.toLowerCase().includes("withdrawal")
          );

          const isSupplierPay = tx.category === "Supplier Due Payment" || tx.category.toLowerCase().includes("supplier payment");

          const isPreviousCash = tx.category === "Previous Cash" || tx.category === "Opening Balance";

          // All-Time Totals
          if (isSale) totalSales += tx.amount;
          if (isWholesale) totalWholesale += tx.amount;
          if (isDeposit) totalBankDeposit += tx.amount;
          if (isWithdrawal) totalBankWithdraw += tx.amount;
          if (tx.type === "expense") totalExpense += tx.amount;
          if (isSupplierPay) totalSupplierPayment += tx.amount;

          // Today Snaps
          if (isToday) {
            if (isSale) todaySales += tx.amount;
            if (isWholesale) todayWholesale += tx.amount;
            if (isDeposit) todayBankDeposit += tx.amount;
            if (isWithdrawal) todayBankWithdraw += tx.amount;
            if (tx.type === "expense") todayExpense += tx.amount;
            if (isSupplierPay) todaySupplierPayment += tx.amount;
            if (isPreviousCash) todayPreviousCash += tx.amount;
          }
        });

        // 2. Purchases calculation
        purchasesList.forEach(p => {
          totalPurchase += p.totalAmount;
          totalPurchaseDue += (p.dueAmount || 0);

          if (p.date === todayFormatted) {
            todayPurchase += p.totalAmount;
          }
        });

        // 3. Attendance calculation
        const currentMonthYear = format(new Date(), "yyyy-MM");
        attendanceList.forEach(a => {
          let isToday = false;
          let isCurrentMonth = false;
          try {
            const aDate = new Date(a.date);
            const aDateStr = format(aDate, "yyyy-MM-dd");
            const aMonthStr = format(aDate, "yyyy-MM");
            isToday = aDateStr === todayFormatted;
            isCurrentMonth = aMonthStr === currentMonthYear;
          } catch (e) {}

          if (isToday) {
            if (a.status === "present" || a.status === "late" || a.status === "half-day") {
              todayEmployeePresent += 1;
            } else if (a.status === "absent") {
              todayEmployeeAbsent += 1;
            }
          }

          if (isCurrentMonth && a.status === "absent") {
            totalEmployeeAbsentMonth += 1;
          }
        });

        setStats({
          todaySales,
          todayWholesale,
          todayBankDeposit,
          todayBankWithdraw,
          todayExpense,
          todayPurchase,
          todaySupplierPayment,
          todayEmployeePresent,
          todayEmployeeAbsent,
          todayPreviousCash,

          totalSales,
          totalWholesale,
          totalBankDeposit,
          totalBankWithdraw,
          totalExpense,
          totalPurchase,
          totalPurchaseDue,
          totalSupplierPayment,
          totalEmployeeAbsentMonth
        });

        // Calculate employee-specific sales
        const employeeSalesMapToday: Record<string, { name: string; amount: number }> = {};
        const employeeSalesMapTotal: Record<string, { name: string; amount: number }> = {};

        employeesList.forEach((emp: any) => {
          if (emp.id) {
            employeeSalesMapToday[emp.id] = { name: emp.name, amount: 0 };
            employeeSalesMapTotal[emp.id] = { name: emp.name, amount: 0 };
          }
        });

        all.forEach(tx => {
          if (tx.category === "Employee Sales" && tx.employeeId) {
            // Total
            if (!employeeSalesMapTotal[tx.employeeId]) {
              employeeSalesMapTotal[tx.employeeId] = { name: tx.subCategory || "Unknown Sales Officer", amount: 0 };
            }
            employeeSalesMapTotal[tx.employeeId].amount += tx.amount;

            // Today
            try {
              const txDateStr = format(new Date(tx.date), "yyyy-MM-dd");
              if (txDateStr === todayFormatted) {
                if (!employeeSalesMapToday[tx.employeeId]) {
                  employeeSalesMapToday[tx.employeeId] = { name: tx.subCategory || "Unknown Sales Officer", amount: 0 };
                }
                employeeSalesMapToday[tx.employeeId].amount += tx.amount;
              }
            } catch (e) {}
          }
        });

        setEmployeeSalesToday(
          Object.values(employeeSalesMapToday)
            .filter((e: any) => e.amount > 0)
            .sort((a: any, b: any) => b.amount - a.amount)
        );
        setEmployeeSalesTotal(
          Object.values(employeeSalesMapTotal)
            .filter((e: any) => e.amount > 0)
            .sort((a: any, b: any) => b.amount - a.amount)
        );

        // Generate comparative 7-day Bar chart data: Sales, Purchase, and Expense
        const barDays = Array.from({ length: 7 }, (_, i) => {
          const date = subDays(new Date(), 6 - i);
          const dayLabel = format(date, "MMM dd");
          const dateStr = format(date, "yyyy-MM-dd");

          const daySales = all
            .filter(tx => {
              try {
                const txDateStr = format(new Date(tx.date), "yyyy-MM-dd");
                return txDateStr === dateStr && tx.type === "income" && (
                  tx.category === "Employee Sales" || 
                  tx.category === "Wholesale Sales" || 
                  tx.category === "Retail Sales" || 
                  tx.category === "Product Sales" || 
                  tx.category.toLowerCase().includes("sale")
                ) &&
                tx.category !== "Opening Balance" &&
                tx.category !== "Previous Cash" &&
                tx.category !== "Bank Deposit" &&
                tx.category !== "Total Deposit" &&
                tx.category !== "Total Bank Deposit";
              } catch(e) { return false; }
            })
            .reduce((sum, tx) => sum + tx.amount, 0);

          const dayPurchase = purchasesList
            .filter(p => p.date === dateStr)
            .reduce((sum, p) => sum + p.totalAmount, 0);

          const dayExpense = all
            .filter(tx => {
              try {
                const txDateStr = format(new Date(tx.date), "yyyy-MM-dd");
                return txDateStr === dateStr && tx.type === "expense";
              } catch(e) { return false; }
            })
            .reduce((sum, tx) => sum + tx.amount, 0);

          return { name: dayLabel, Sales: daySales, Purchase: dayPurchase, Expense: dayExpense };
        });
        setSevenDaysBarChartData(barDays);

        // Generate line trend chart data for last 7 days (Inflow vs Outflow)
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = subDays(new Date(), 6 - i);
          const dayLabel = format(date, "MMM dd");
          const dayIncome = all
            .filter(tx => format(new Date(tx.date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd") && tx.type === "income")
            .reduce((sum, tx) => sum + tx.amount, 0);
          const dayExpense = all
            .filter(tx => format(new Date(tx.date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd") && tx.type === "expense")
            .reduce((sum, tx) => sum + tx.amount, 0);
          return { name: dayLabel, income: dayIncome, expense: dayExpense };
        });
        setTrendChartData(days);

      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const totalBankLastCash = banks.reduce((sum, b) => sum + b.balance, 0);

  // Compute products below user-defined or default threshold
  const lowStockItems = products.filter(p => {
    const threshold = p.minStock !== undefined ? p.minStock : 10;
    return (p.stock || 0) <= threshold;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-3xl font-black tracking-tight text-slate-900">{t("Dashboard Overview")}</h2>
            {lowStockItems.length > 0 && (
              <span 
                className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-black text-white shrink-0 shadow-sm animate-pulse cursor-pointer" 
                title={`${lowStockItems.length} items below minimum stock threshold`}
                onClick={() => onNavigate?.("inventory")}
              >
                {lowStockItems.length}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-500">
            {t("Welcome back,")} <strong className="text-slate-800">{user.displayName?.split(" ")[0]}</strong>. {t("Here's your shop's real-time performance matrix.")}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-sm shadow-slate-950/10 cursor-pointer border border-transparent hover:scale-[1.02] active:scale-[0.98] shrink-0"
        >
          <Printer className="w-4 h-4 text-emerald-400" />
          {t("Print Ledger Report")}
        </button>
      </header>

      {/* Low Stock Notifications Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="print:hidden bg-amber-50/50 border border-amber-200 rounded-2xl p-5 space-y-3.5 shadow-2xs relative overflow-hidden bg-amber-50/40">
          <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center shrink-0 border border-amber-200 shadow-sm">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">
                    {t("Critical Low Stock Notification")}
                  </h3>
                  <span className="bg-rose-100 border border-rose-200 text-rose-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {lowStockItems.length} {t("SKUs Alert")}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  {t("These products have fallen below your custom minimum stock levels. Restock needed immediately.")}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => onNavigate?.("inventory")}
              className="px-3.5 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-amber-700 transition active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <span>{t("Go to Inventory")}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
            {lowStockItems.map((p) => {
              const threshold = p.minStock !== undefined ? p.minStock : 10;
              const isOutOfStock = (p.stock || 0) === 0;
              return (
                <div 
                  key={p.id} 
                  className={cn(
                    "p-3 rounded-xl border flex flex-col justify-between space-y-1.5 transition-colors bg-white hover:border-amber-400 group relative",
                    isOutOfStock ? "border-red-200 bg-red-50/5" : "border-amber-250/70 border-amber-200 pb-2.5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold text-xs text-slate-800 truncate block max-w-[150px]" title={p.name}>
                      {p.name}
                    </span>
                    <span className={cn(
                      "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                      isOutOfStock ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {isOutOfStock ? t("Deficit") : t("Restock")}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                    <div>
                      <span>Stock: </span>
                      <strong className={cn(
                        "font-mono font-bold text-xs",
                        isOutOfStock ? "text-red-600 font-extrabold" : "text-amber-600 font-extrabold"
                      )}>
                        {p.stock}
                      </strong>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase"> {p.unit}</span>
                    </div>
                    <div>
                      <span>Limit: </span>
                      <strong className="font-mono text-slate-700 font-bold bg-slate-100 px-1 rounded">
                        {threshold}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions Panel */}
      <div className="print:hidden bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 bg-slate-900 rounded-full" />
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{t("Quick Actions")}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => onNavigate?.("newSale")}
            className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 border border-slate-150 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer group shadow-xs"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 border border-emerald-100 group-hover:bg-emerald-100/50 transition-colors">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-extrabold text-slate-900 text-sm">{t("New Sale")}</p>
                <p className="text-[11px] text-slate-400 font-semibold">{t("Register a fresh counter or digital sale")}</p>
              </div>
            </div>
            <div className="text-slate-400 group-hover:translate-x-0.5 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => onNavigate?.("transactions", { activeTab: "expense" })}
            className="flex items-center justify-between p-4 bg-white hover:bg-slate-55 border border-slate-150 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer group shadow-xs"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0 border border-rose-100 group-hover:bg-rose-100/50 transition-colors">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-extrabold text-slate-900 text-sm">{t("Add Expense")}</p>
                <p className="text-[11px] text-slate-400 font-semibold">{t("Log general expenses or business outflows")}</p>
              </div>
            </div>
            <div className="text-slate-400 group-hover:translate-x-0.5 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => onNavigate?.("salaryEntry")}
            className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 border border-slate-150 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer group shadow-xs"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 border border-indigo-100 group-hover:bg-indigo-100/50 transition-colors">
                <Coins className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-extrabold text-slate-900 text-sm">{t("Register Salary")}</p>
                <p className="text-[11px] text-slate-400 font-semibold">{t("Add staff payroll payout or advance entry")}</p>
              </div>
            </div>
            <div className="text-slate-400 group-hover:translate-x-0.5 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Daily Performance Section (Today) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 bg-rose-600 rounded-full animate-pulse" />
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{t("Today's Shop Ledger Snapshot")}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard 
            title="Today Sales Amount" 
            value={stats.todaySales} 
            icon={TrendingUp} 
            color="emerald" 
            description="Combined counter, staff & retail sales"
            scope="Today"
          />
          <StatCard 
            title="Today Wholesale" 
            value={stats.todayWholesale} 
            icon={Sparkles} 
            color="teal" 
            description="Wholesale bulk sales recorded today"
            scope="Today"
          />
          <StatCard 
            title="Today Bank Deposit" 
            value={stats.todayBankDeposit} 
            icon={Landmark} 
            color="indigo" 
            description="Total cash deposited into banks today"
            scope="Today"
          />
          <StatCard 
            title="Today Bank Withdraw" 
            value={stats.todayBankWithdraw} 
            icon={ArrowDownRight} 
            color="rose" 
            description="Total cash withdrawn from bank accounts"
            scope="Today"
          />
          <StatCard 
            title="Today's Total Expense" 
            value={stats.todayExpense} 
            icon={TrendingDown} 
            color="orange" 
            description="Outflow & business costs today"
            scope="Today"
          />
          <StatCard 
            title="Today Total Purchase" 
            value={stats.todayPurchase} 
            icon={ShoppingCart} 
            color="amber" 
            description="Suppliers purchases today"
            scope="Today"
          />
          <StatCard 
            title="Today Supplier Payment" 
            value={stats.todaySupplierPayment} 
            icon={CreditCard} 
            color="purple" 
            description="Due payment sent to vendor today"
            scope="Today"
          />
          <StatCard 
            title="Today Input Previous Cash" 
            value={stats.todayPreviousCash} 
            icon={Coins} 
            color="sky" 
            description="Input previous open balance recorded today"
            scope="Today"
          />
          <StatCard 
            title="Today Employee Present" 
            value={stats.todayEmployeePresent} 
            icon={UserCheck} 
            color="emerald" 
            description="Count of checked-in staff members today"
            scope="Today"
            isCount={true}
          />
          <StatCard 
            title="Today Employee Absent" 
            value={stats.todayEmployeeAbsent} 
            icon={UserX} 
            color="rose" 
            description="Count of rostered employees absent today"
            scope="Today"
            isCount={true}
          />
        </div>
      </div>

      {/* Global Reserves & Totals Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 bg-indigo-600 rounded-full" />
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{t("Shop Lifetime Reserves & Aggregates")}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard 
            title="Total Sales Amount" 
            value={stats.totalSales} 
            icon={TrendingUp} 
            color="emerald" 
            description="All-time combined gross shop sales"
            scope="Total"
          />
          <StatCard 
            title="Total Wholesale Amount" 
            value={stats.totalWholesale} 
            icon={Sparkles} 
            color="teal" 
            description="All-time accumulated wholesale sales"
            scope="Total"
          />
          <StatCard 
            title="Total Sales Amount" 
            value={stats.totalSales} 
            icon={TrendingUp} 
            color="emerald" 
            description="Literal secondary total sales matching rule"
            scope="Total Copy"
            printHidden={true}
          />
          <StatCard 
            title="Total Bank Deposit" 
            value={stats.totalBankDeposit} 
            icon={Landmark} 
            color="indigo" 
            description="All-time overall combined bank deposits"
            scope="Total"
          />
          <StatCard 
            title="Total Bank Withdraw" 
            value={stats.totalBankWithdraw} 
            icon={ArrowDownRight} 
            color="rose" 
            description="All-time bank credits & withdrawals cumulative"
            scope="Total"
          />
          <StatCard 
            title="Total Bank Last Cash" 
            value={totalBankLastCash} 
            icon={Wallet} 
            color="sky" 
            description="Combined remaining cash inside all banks now"
            scope="Active Balance"
          />
          <StatCard 
            title="Total Expense Amount" 
            value={stats.totalExpense} 
            icon={TrendingDown} 
            color="orange" 
            description="All-time operational ledger expenses sum"
            scope="Total"
          />
          <StatCard 
            title="Total Purchase" 
            value={stats.totalPurchase} 
            icon={ShoppingCart} 
            color="amber" 
            description="Sum of all supplier purchase bills overall"
            scope="Total"
          />
          <StatCard 
            title="Total Purchase Due" 
            value={stats.totalPurchaseDue} 
            icon={CreditCard} 
            color="pink" 
            description="Total outstanding due balance owed to suppliers"
            scope="Outstanding"
          />
          <StatCard 
            title="Total Supplier Payment" 
            value={stats.totalSupplierPayment} 
            icon={Coins} 
            color="purple" 
            description="Sum of all-time payments made to suppliers"
            scope="Total"
          />
          <StatCard 
            title="Total Employee Absent Month" 
            value={stats.totalEmployeeAbsentMonth} 
            icon={CalendarRange} 
            color="rose" 
            description="Cumulative absent logs logged in current month"
            scope="Month Count"
            isCount={true}
          />
        </div>
      </div>

      {/* Charts Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
        {/* Total Sales, Purchase, & Expense Bar Chart */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart4 className="w-5 h-5 text-emerald-500" />
                {t("Total Sales, Purchase, & Expense Bar Chart")}
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">{t("7-Day comparative grouped comparison")}</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {t("Sales")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {t("Purchase")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {t("Expense")}</span>
            </div>
          </div>
          <div className="h-[300px] w-full min-w-0 relative">
            {!isMounted || sevenDaysBarChartData.length === 0 ? (
              <div className="flex items-center justify-center h-full bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm font-semibold text-slate-400">{t("Loading chart analytics...")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sevenDaysBarChartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8", fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8", fontWeight: 600 }} tickFormatter={(v) => `৳${v}`} />
                  <Tooltip 
                    formatter={(value: any) => [`৳${value.toLocaleString()}`]}
                    contentStyle={{ backgroundColor: "#0F172A", border: "none", borderRadius: "16px", color: "#fff", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="Sales" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Purchase" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Today Employee Sales Chart || Total Top Employee Sales Chart */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30 flex flex-col justify-between print:hidden">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  {t("Staff Sales Performance Matrix")}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">{t("Track individual sales achievements")}</p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setActiveEmpChart("today")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black rounded-lg transition-all",
                    activeEmpChart === "today" 
                      ? "bg-white text-indigo-650 shadow-xs" 
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {t("Today's Sales")}
                </button>
                <button
                  onClick={() => setActiveEmpChart("total")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black rounded-lg transition-all",
                    activeEmpChart === "total" 
                      ? "bg-white text-indigo-650 shadow-xs" 
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {t("All-Time Top")}
                </button>
              </div>
            </div>

            <div className="h-[280px] w-full min-w-0 relative">
              {!isMounted ? (
                <div className="flex flex-col items-center justify-center h-full bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-400">Loading performance data...</p>
                </div>
              ) : ((activeEmpChart === "today" ? employeeSalesToday : employeeSalesTotal).length === 0) ? (
                <div className="flex flex-col items-center justify-center h-full bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <span className="p-3 bg-indigo-50 text-indigo-500 rounded-full mb-2">
                    <TrendingUp className="w-6 h-6" />
                  </span>
                  <p className="text-sm font-bold text-slate-700">No Sales Logged</p>
                  <p className="text-xs font-semibold text-slate-400 max-w-xs mt-1">
                    {activeEmpChart === "today" 
                      ? "No employees have logged counter sales today yet in the 'Sales' tab." 
                      : "No historical sales logged by registered sales employees."}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    layout="vertical"
                    data={activeEmpChart === "today" ? employeeSalesToday : employeeSalesTotal}
                    margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v) => `৳${v}`} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }} />
                    <Tooltip 
                      formatter={(value: any) => [`৳${value.toLocaleString()}`, "Sales"]}
                      contentStyle={{ backgroundColor: "#0F172A", border: "none", borderRadius: "12px", color: "#fff" }}
                    />
                    <Bar dataKey="amount" radius={[0, 8, 8, 0]} maxBarSize={30}>
                      {(activeEmpChart === "today" ? employeeSalesToday : employeeSalesTotal).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? "#10B981" : index === 1 ? "#3B82F6" : "#4F46E5"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cash Inflow vs Outflow & Accounts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
        {/* Trend line Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                {t("Cash Inflow vs Outflow (Trend)")}
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">{t("7-Day ledger inflows and outflows timeline")}</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-slate-600">{t("Inflow")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span className="text-slate-600">{t("Outflow")}</span>
              </div>
            </div>
          </div>
          <div className="h-[285px] w-full min-w-0 relative">
            {!isMounted ? (
              <div className="flex items-center justify-center h-full bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm font-semibold text-slate-400">{t("Loading trend analytics...")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={285}>
                <AreaChart data={trendChartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8", fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8", fontWeight: 600 }} tickFormatter={(v) => `৳${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0F172A", border: "none", borderRadius: "16px", color: "#fff", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Area type="monotone" dataKey="income" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" dataKey="expense" stroke="#FDA4AF" strokeWidth={3} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bank Balances */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30 overflow-hidden flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-indigo-500" />
              {t("Bank Accounts")}
            </h3>
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {banks.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs font-semibold text-slate-400">{t("No bank accounts registered.")}</p>
                </div>
              )}
              {banks.map((bank) => (
                <div key={bank.id} className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl group transition-all border border-slate-100/60 hover:border-slate-200">
                  <div>
                    <p className="font-bold text-slate-800 text-sm group-hover:text-slate-950 transition-colors">{bank.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("Sync")} {language === "bn" ? formatDate(bank.lastUpdated) : format(new Date(bank.lastUpdated), "MMM dd")}</p>
                  </div>
                  <p className="text-base font-mono font-black text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-250/50 shadow-sm">{formatCurrency(bank.balance)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            {t("Recent Logbook Transactions")}
          </h3>
          <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/50 uppercase tracking-widest">
            {language === "bn" ? t("Latest 6 entries") : "Latest 6 entries"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">{t("Timestamp")}</th>
                <th className="px-6 py-4">{t("Account/Category")}</th>
                <th className="px-6 py-4">{t("Gateway")}</th>
                <th className="px-6 py-4 text-right">{t("Magnitude")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors cursor-default group">
                  <td className="px-6 py-4 text-xs font-semibold text-slate-400 whitespace-nowrap">
                    {language === "bn" ? formatDate(tx.date) : format(new Date(tx.date), "MMM dd, yyyy HH:mm")}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{t(tx.category)}</span>
                      {tx.notes && <span className="text-xs text-slate-400 font-medium line-clamp-1">{tx.notes}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-[10px] px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-black uppercase tracking-wider border border-slate-200/20">
                      {t(tx.paymentMethod)}
                    </span>
                  </td>
                  <td className={cn(
                    "px-6 py-4 text-sm font-black text-right whitespace-nowrap font-mono",
                    tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                  )}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{tx.type === "income" ? "+" : "-"}</span>
                      <span>{formatCurrency(tx.amount)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, description, scope = "Global", isCount = false, printHidden = false }: any) {
  const { language, t, formatCurrency, formatNumber } = useLanguage();
  const colorMap: any = {
    emerald: {
      bg: "bg-emerald-50 text-emerald-600 border-emerald-100/55",
      glow: "hover:shadow-emerald-100/40"
    },
    indigo: {
      bg: "bg-indigo-50 text-indigo-600 border-indigo-100/55",
      glow: "hover:shadow-indigo-100/40"
    },
    rose: {
      bg: "bg-rose-50 text-rose-600 border-rose-100/55",
      glow: "hover:shadow-rose-100/40"
    },
    amber: {
      bg: "bg-amber-50 text-amber-600 border-amber-100/55",
      glow: "hover:shadow-amber-100/40"
    },
    violet: {
      bg: "bg-violet-50 text-violet-600 border-violet-100/55",
      glow: "hover:shadow-violet-100/40"
    },
    teal: {
      bg: "bg-teal-50 text-teal-600 border-teal-100/55",
      glow: "hover:shadow-teal-100/40"
    },
    sky: {
      bg: "bg-sky-50 text-sky-600 border-sky-100/55",
      glow: "hover:shadow-sky-100/40"
    },
    orange: {
      bg: "bg-orange-50 text-orange-600 border-orange-100/55",
      glow: "hover:shadow-orange-100/40"
    },
    pink: {
      bg: "bg-pink-50 text-pink-600 border-pink-100/55",
      glow: "hover:shadow-pink-100/40"
    },
    purple: {
      bg: "bg-purple-50 text-purple-600 border-purple-100/55",
      glow: "hover:shadow-purple-100/40"
    },
  };

  const style = colorMap[color] || colorMap.indigo;

  return (
    <div className={cn(
      "bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs hover:shadow-lg transition-all duration-300 group hover:-translate-y-0.5",
      (isCount || printHidden) ? "print:hidden" : "",
      style.glow
    )}>
      <div className="flex items-start justify-between mb-3.5">
        <div className={cn("p-2.5 rounded-xl border transition-transform duration-300 group-hover:scale-105", style.bg)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={cn(
          "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border",
          scope === "Today" ? "bg-orange-55 text-orange-600 border-orange-105" :
          scope === "Total" ? "bg-indigo-55 text-indigo-600 border-indigo-105" :
          "bg-slate-50 text-slate-500 border-slate-100"
        )}>
          {t(scope)}
        </span>
      </div>
      <div>
        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate" title={t(title)}>{t(title)}</p>
        <p className="text-xl font-black text-slate-900 tracking-tight font-mono">
          {isCount ? formatNumber(value) : formatCurrency(value)}
        </p>
      </div>
      <p className="text-[9px] font-bold text-slate-400 mt-2 flex items-center gap-1 border-t border-slate-50 pt-2 truncate" title={t(description)}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse shrink-0" />
        {t(description)}
      </p>
    </div>
  );
}
