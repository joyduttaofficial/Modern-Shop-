import { useState, useEffect, useRef, useMemo } from "react";
import { User } from "firebase/auth";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, deleteDoc, getDoc, updateDoc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, cleanFirestoreData } from "@/src/lib/firebase";
import { Transaction, Bank, UserRole, Product, CounterSale } from "@/src/types";
import { PurchaseModel } from "./Purchase";
import { cn } from "@/src/lib/utils";
import { getTransactionsFromIndexedDB } from "@/src/lib/indexedDbFallback";
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
  Bell,
  Filter,
  CheckCircle2,
  Coffee,
  AlertCircle,
  XCircle,
  Search,
  ChevronRight,
  Receipt,
  Layers,
  Scale,
  DollarSign,
  Tag,
  ArrowRight,
  Trash2,
  RefreshCw
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
import { format, subDays, startOfDay, endOfDay, isSameDay } from "date-fns";
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
  const normalizedRole = (role || "").toLowerCase().trim();
  const isSuperAdmin = 
    normalizedRole === "admin" ||
    normalizedRole === "super_admin" ||
    normalizedRole === "superadmin" ||
    normalizedRole === "super admin" ||
    normalizedRole.includes("super") ||
    normalizedRole.includes("administrator");

  // Multi-user input filter:
  // For Super Admin: defaults to "all" (store-wide calculation), but can select ANY other user to see calculations of that user's input.
  // For Other Users (including Accountant): defaults to their own UID (displaying calculation for ONLY their own inputs). Cannot select store-wide total calculation.
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>(isSuperAdmin ? "all" : (user?.uid || ""));
  const [systemUsers, setSystemUsers] = useState<{ uid: string; displayName: string; email: string; role: string }[]>([]);

  // Mode for Users: Super Admin sees total calculations. Accountants and other non-admin staff are strictly in inputOnly mode (cannot show total amounts)
  const [viewMode, setViewMode] = useState<"calculation" | "inputOnly">(() => {
    if (!isSuperAdmin) return "inputOnly";
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("dashboard_view_mode");
        if (saved === "inputOnly" || saved === "calculation") return saved;
      } catch (e) {}
    }
    return "calculation";
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list = snap.docs.map(doc => {
        const d = doc.data();
        return {
          uid: d.uid || doc.id,
          displayName: d.displayName || d.name || d.email || "Staff User",
          email: d.email || "",
          role: d.role || "sales"
        };
      });
      setSystemUsers(list);
    }, (err) => console.warn("Could not load users:", err));
    return () => unsub();
  }, []);

  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  const [rawPurchases, setRawPurchases] = useState<any[]>([]);
  const [rawSupplierTransactions, setRawSupplierTransactions] = useState<any[]>([]);
  const [rawSuppliers, setRawSuppliers] = useState<any[]>([]);
  const [rawAttendance, setRawAttendance] = useState<any[]>([]);
  const [rawEmployees, setRawEmployees] = useState<any[]>([]);
  const [rawCounterSales, setRawCounterSales] = useState<CounterSale[]>([]);

  // Two Different Sales Ledgers states & active tab
  const [salesLedgerTab, setSalesLedgerTab] = useState<"dual" | "staff" | "counter">("dual");
  const [staffSalesStats, setStaffSalesStats] = useState({
    todayStaffSales: 0,
    todayWholesale: 0,
    todayDeposit: 0,
    todayStaffNet: 0,
    totalStaffSales: 0,
    totalWholesale: 0,
    totalDeposit: 0,
    totalStaffNet: 0
  });

  const [counterSalesStats, setCounterSalesStats] = useState({
    todayCash: 0,
    todayGrossSlips: 0,
    todayDiscount: 0,
    todayNetPayable: 0,
    todayDue: 0,
    todayCount: 0,
    todayEqualCount: 0,
    todayDueCount: 0,
    totalCash: 0,
    totalGrossSlips: 0,
    totalDiscount: 0,
    totalNetPayable: 0,
    totalDue: 0,
    totalCount: 0
  });

  // Delete state for Counter Sale directly in Dashboard table
  const [saleToDeleteInDashboard, setSaleToDeleteInDashboard] = useState<CounterSale | null>(null);
  const [isDeletingSaleInDashboard, setIsDeletingSaleInDashboard] = useState(false);

  const handleDeleteCounterSaleFromDashboard = async (sale: CounterSale) => {
    if (!sale || !sale.id) return;
    setIsDeletingSaleInDashboard(true);
    try {
      // 1. Delete counterSales document from Firestore
      await deleteDoc(doc(db, "counterSales", sale.id));
      setRawCounterSales(prev => prev.filter(c => c.id !== sale.id));

      // 2. Delete linked income transaction from general transactions collection
      if (sale.transactionId) {
        try {
          await deleteDoc(doc(db, "transactions", sale.transactionId));
        } catch (e) {
          console.warn("Could not delete matching transaction by ID in dashboard:", e);
        }
      }

      // Also clean up any transactions that reference this saleId
      try {
        if (sale.saleId) {
          const txSnap1 = await getDocs(query(collection(db, "transactions"), where("subCategory", "==", sale.saleId)));
          for (const tDoc of txSnap1.docs) {
            await deleteDoc(doc(db, "transactions", tDoc.id));
          }
        }
        const txSnapAll = await getDocs(collection(db, "transactions"));
        for (const tDoc of txSnapAll.docs) {
          const tData = tDoc.data();
          if (
            (sale.transactionId && tDoc.id === sale.transactionId) ||
            (sale.saleId && tData.subCategory === sale.saleId) ||
            (sale.saleId && tData.notes && tData.notes.includes(sale.saleId))
          ) {
            await deleteDoc(doc(db, "transactions", tDoc.id));
          }
        }
        setRawTransactions(prev => prev.filter(t => 
          !(sale.transactionId && t.id === sale.transactionId) &&
          !(sale.saleId && t.subCategory === sale.saleId) &&
          !(sale.saleId && t.notes && t.notes.includes(sale.saleId))
        ));
      } catch (qErr) {
        console.warn("Could not sweep matching transactions for saleId in dashboard:", qErr);
      }

      // 3. Revert Customer Profile totals if this sale was linked to a customer
      if (sale.customerId) {
        try {
          const custDocRef = doc(db, "customers", sale.customerId);
          const custDocSnap = await getDoc(custDocRef);
          if (custDocSnap.exists()) {
            const cData = custDocSnap.data();
            const payable = sale.netPayable ?? (sale.totalSlipsAmount - (sale.discountAmount || 0));
            const newPurchases = Math.max(0, (cData.totalPurchases || 0) - payable);
            const newPaid = Math.max(0, (cData.totalPaid || 0) - (sale.receivedAmount || 0));
            const newDue = Math.max(0, (cData.totalDue || 0) - (sale.dueAmount || 0));
            const newDiscount = Math.max(0, (cData.totalDiscount || 0) - (sale.discountAmount || 0));
            const newPurchasesCount = Math.max(0, (cData.totalPurchasesCount || 1) - 1);
            const newDueCount = (sale.dueAmount || 0) > 0 ? Math.max(0, (cData.totalDueCount || 1) - 1) : (cData.totalDueCount || 0);

            await updateDoc(custDocRef, cleanFirestoreData({
              totalPurchases: newPurchases,
              totalPaid: newPaid,
              totalDue: newDue,
              totalDiscount: newDiscount,
              totalPurchasesCount: newPurchasesCount,
              totalDueCount: newDueCount,
              updatedAt: new Date().toISOString()
            }));
          }
        } catch (cErr) {
          console.warn("Could not revert customer stats upon sale deletion in dashboard:", cErr);
        }
      }

      setSaleToDeleteInDashboard(null);
    } catch (err) {
      console.error("Error deleting counter sale from dashboard:", err);
      alert("কাউন্টার সেল ডিলিট করতে সমস্যা হয়েছে।");
    } finally {
      setIsDeletingSaleInDashboard(false);
    }
  };

  const matchesUser = (item: any) => {
    if (!selectedUserFilter || selectedUserFilter === "all") return true;
    if (!item) return false;
    const targetUser = systemUsers.find(u => u.uid === selectedUserFilter || u.email === selectedUserFilter);
    const targetEmail = targetUser?.email?.toLowerCase();
    const targetName = targetUser?.displayName?.toLowerCase();

    if (item.createdBy) {
      if (item.createdBy === selectedUserFilter) return true;
      if (targetEmail && typeof item.createdBy === "string" && item.createdBy.toLowerCase() === targetEmail) return true;
      if (targetName && typeof item.createdBy === "string" && item.createdBy.toLowerCase() === targetName) return true;
    }
    if (item.userId && (item.userId === selectedUserFilter || (targetEmail && item.userId === targetEmail))) return true;
    if (item.employeeId && item.employeeId === selectedUserFilter) return true;
    if (user?.uid === selectedUserFilter) {
      if (item.createdBy === user.uid) return true;
      if (user.email && typeof item.createdBy === "string" && item.createdBy.toLowerCase() === user.email.toLowerCase()) return true;
    }
    return false;
  };

  const activeFilteredUser = selectedUserFilter === "all" 
    ? null 
    : systemUsers.find(u => u.uid === selectedUserFilter || u.email === selectedUserFilter) || {
        uid: selectedUserFilter,
        displayName: selectedUserFilter === user?.uid ? (user?.displayName || "You") : "Staff User",
        email: selectedUserFilter === user?.uid ? (user?.email || "") : "",
        role: selectedUserFilter === user?.uid ? role : "staff"
      };

  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [userNetCash, setUserNetCash] = useState(0);
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

  // Attendance and Breakfast allowance settings & filter state
  const [lateThreshold, setLateThreshold] = useState("10:00");
  const [breakfastAllowanceAmount, setBreakfastAllowanceAmount] = useState(20);
  const [deductBreakfastOnLate, setDeductBreakfastOnLate] = useState(true);
  const [deductBreakfastOnAbsent, setDeductBreakfastOnAbsent] = useState(true);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(0);
  const [breakfastFilter, setBreakfastFilter] = useState<"all" | "eligible" | "late_deducted" | "late_only" | "absent">("all");
  const [breakfastSearch, setBreakfastSearch] = useState("");

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
    const unsubscribe = onSnapshot(collection(db, "banks"), (snapshot) => {
      const bks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bank));
      setBanks(bks);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    return () => unsubscribe();
  }, []);

  // Listen to collections and store in reactive state
  useEffect(() => {
    let initialLoads = 0;
    const checkInitialDone = () => {
      initialLoads++;
      if (initialLoads >= 7) setLoading(false);
    };

    const unsubTxs = onSnapshot(collection(db, "transactions"), (snap) => {
      setRawTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubPur = onSnapshot(collection(db, "purchases"), (snap) => {
      setRawPurchases(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubSupTx = onSnapshot(collection(db, "supplierTransactions"), (snap) => {
      setRawSupplierTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubSuppliers = onSnapshot(collection(db, "suppliers"), (snap) => {
      setRawSuppliers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubAtt = onSnapshot(collection(db, "attendance"), (snap) => {
      setRawAttendance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubEmp = onSnapshot(collection(db, "employees"), (snap) => {
      setRawEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubCounterSales = onSnapshot(collection(db, "counterSales"), (snap) => {
      setRawCounterSales(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CounterSale)));
      checkInitialDone();
    }, (err) => { console.error(err); checkInitialDone(); });

    const unsubAttSettings = onSnapshot(doc(db, "settings", "attendance"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLateThreshold(data.lateThreshold || "10:00");
        setBreakfastAllowanceAmount(data.breakfastAllowanceAmount ?? 20);
        setDeductBreakfastOnLate(data.deductBreakfastOnLate ?? true);
        setDeductBreakfastOnAbsent(data.deductBreakfastOnAbsent ?? true);
        setGracePeriodMinutes(data.gracePeriodMinutes ?? 0);
      }
    }, (err) => console.warn("Could not load attendance settings:", err));

    return () => {
      unsubTxs();
      unsubPur();
      unsubSupTx();
      unsubSuppliers();
      unsubAtt();
      unsubEmp();
      unsubCounterSales();
      unsubAttSettings();
    };
  }, []);

  // Reconciled datasets: automatically filters out deleted counter cash & orphaned records
  const validCounterSales = useMemo(() => {
    return rawCounterSales.filter(cs => {
      // If sale received cash, verify that its cash transaction was not deleted by user
      if (!cs.receivedAmount || cs.receivedAmount <= 0) return true;
      if (rawTransactions.length === 0) return true; // wait for initial transaction snapshot
      return rawTransactions.some(t => 
        (cs.transactionId && t.id === cs.transactionId) ||
        (cs.saleId && t.subCategory === cs.saleId) ||
        (cs.saleId && t.notes && t.notes.includes(cs.saleId))
      );
    });
  }, [rawCounterSales, rawTransactions]);

  const validTransactions = useMemo(() => {
    return rawTransactions.filter(tx => {
      const isCounterSaleTx = tx.category === "Counter Sale" || 
        (tx.subCategory && tx.subCategory.startsWith("CS-")) ||
        (tx.notes && (tx.notes.includes("Counter Sale [CS-") || tx.notes.includes("কাউন্টার সেল")));
      if (!isCounterSaleTx) return true;
      if (rawCounterSales.length === 0) return true; // wait for initial counter sales snapshot
      return rawCounterSales.some(cs => 
        (tx.subCategory && cs.saleId === tx.subCategory) ||
        (cs.id === tx.subCategory) ||
        (cs.transactionId && cs.transactionId === tx.id) ||
        (tx.notes && cs.saleId && tx.notes.includes(cs.saleId))
      );
    });
  }, [rawTransactions, rawCounterSales]);

  // Reactive Stats Recomputation triggered on data changes or user filter change
  useEffect(() => {
    const today = startOfDay(new Date());
    const todayFormatted = format(new Date(), "yyyy-MM-dd");

    // Filter datasets according to the active user input filter
    const all = validTransactions.filter(matchesUser);
    const purchasesList = rawPurchases.filter(matchesUser);
    const supplierTransactionsList = rawSupplierTransactions.filter(matchesUser);
    const suppliersList = rawSuppliers;
    const attendanceList = rawAttendance;
    const employeesList = rawEmployees;

    // Update recent transactions to show entries input by this user
    const sortedTxs = [...all].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setRecentTransactions(sortedTxs.slice(0, 6));

    // Calculate Net Cash input by this user (Inflows - Outflows)
    const netCash = all.reduce((sum, tx) => (tx.type === "income" ? sum + tx.amount : sum - tx.amount), 0);
    setUserNetCash(netCash);

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

    // Separate tracking for Staff Sales calculation
    let todayStaffSalesVal = 0;
    let todayWholesaleVal = 0;
    let todayDepositVal = 0;
    let totalStaffSalesVal = 0;
    let totalWholesaleVal = 0;
    let totalDepositVal = 0;

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
          tx.category === "Counter Sale" ||
          tx.category.toLowerCase().includes("sale")
        ) &&
        tx.category !== "Opening Balance" &&
        tx.category !== "Previous Cash" &&
        tx.category !== "Bank Deposit" &&
        tx.category !== "Total Deposit" &&
        tx.category !== "Total Bank Deposit";

        const isStaffSale = tx.type === "income" && tx.category === "Employee Sales";

        const isWholesale = tx.type === "income" && (
          tx.category === "Wholesale Sales" || 
          tx.category.toLowerCase().includes("wholesale")
        );

        const isDeposit = tx.type === "income" && (
          tx.category === "Bank Deposit" || 
          tx.category.toLowerCase().includes("bank deposit")
        );

        const isDepositDeduction = (tx.category === "Total Deposit" || tx.subCategory === "Deposit");

        const isWithdrawal = tx.type === "expense" && (
          tx.category === "Bank Credit" || 
          tx.category === "Bank Withdrawal" || 
          tx.category.toLowerCase().includes("bank credit") || 
          tx.category.toLowerCase().includes("bank withdrawal") || 
          tx.category.toLowerCase().includes("withdrawal")
        );

        const isPreviousCash = tx.category === "Previous Cash" || tx.category === "Opening Balance";

        // Staff Sales calculation tracking
        if (isStaffSale) totalStaffSalesVal += tx.amount;
        if (isWholesale) totalWholesaleVal += tx.amount;
        if (isDepositDeduction) totalDepositVal += tx.amount;

        // All-Time Totals
        if (isSale) totalSales += tx.amount;
        if (isWholesale) totalWholesale += tx.amount;
        if (isDeposit) totalBankDeposit += tx.amount;
        if (isWithdrawal) totalBankWithdraw += tx.amount;
        if (tx.type === "expense") totalExpense += tx.amount;

        // Today Snaps
        if (isToday) {
          if (isStaffSale) todayStaffSalesVal += tx.amount;
          if (isWholesale) todayWholesaleVal += tx.amount;
          if (isDepositDeduction) todayDepositVal += tx.amount;

          if (isSale) todaySales += tx.amount;
          if (isWholesale) todayWholesale += tx.amount;
          if (isDeposit) todayBankDeposit += tx.amount;
          if (isWithdrawal) todayBankWithdraw += tx.amount;
          if (tx.type === "expense") todayExpense += tx.amount;
          if (isPreviousCash) todayPreviousCash += tx.amount;
        }
      });

      // 1b. Staff Sales Net Calculation: Staff Gross Sales + Wholesale - Total Deposit/Due
      const todayStaffNet = todayStaffSalesVal + todayWholesaleVal - todayDepositVal;
      const totalStaffNet = totalStaffSalesVal + totalWholesaleVal - totalDepositVal;

      setStaffSalesStats({
        todayStaffSales: todayStaffSalesVal,
        todayWholesale: todayWholesaleVal,
        todayDeposit: todayDepositVal,
        todayStaffNet,
        totalStaffSales: totalStaffSalesVal,
        totalWholesale: totalWholesaleVal,
        totalDeposit: totalDepositVal,
        totalStaffNet
      });

      // 1c. Counter Sales Distinct Calculations from counterSales collection
      // Counter Sales Calculation: Gross Slips - Discounts = Net Payable -> Received Cash + Customer Due
      const counterSalesFiltered = validCounterSales.filter(matchesUser);
      let todayCounterCash = 0;
      let todayCounterGrossSlips = 0;
      let todayCounterDiscount = 0;
      let todayCounterNetPayable = 0;
      let todayCounterDue = 0;
      let todayCounterCount = 0;
      let todayCounterEqualCount = 0;
      let todayCounterDueCount = 0;

      let totalCounterCash = 0;
      let totalCounterGrossSlips = 0;
      let totalCounterDiscount = 0;
      let totalCounterNetPayable = 0;
      let totalCounterDue = 0;
      let totalCounterCount = 0;

      counterSalesFiltered.forEach(cs => {
        let isToday = false;
        try {
          const csDateStr = cs.date || format(new Date(cs.dateTime), "yyyy-MM-dd");
          isToday = csDateStr === todayFormatted;
        } catch (e) {
          isToday = cs.date === todayFormatted;
        }

        const received = cs.receivedAmount || 0;
        const gross = cs.totalSlipsAmount || 0;
        const discount = cs.discountAmount || 0;
        const net = cs.netPayable !== undefined ? cs.netPayable : Math.max(0, gross - discount);
        const due = cs.dueAmount || 0;

        totalCounterCash += received;
        totalCounterGrossSlips += gross;
        totalCounterDiscount += discount;
        totalCounterNetPayable += net;
        totalCounterDue += due;
        totalCounterCount += 1;

        if (isToday) {
          todayCounterCash += received;
          todayCounterGrossSlips += gross;
          todayCounterDiscount += discount;
          todayCounterNetPayable += net;
          todayCounterDue += due;
          todayCounterCount += 1;
          if (cs.balanceStatus === "equal" || cs.isBalanced) {
            todayCounterEqualCount += 1;
          }
          if (due > 0) {
            todayCounterDueCount += 1;
          }
        }
      });

      setCounterSalesStats({
        todayCash: todayCounterCash,
        todayGrossSlips: todayCounterGrossSlips,
        todayDiscount: todayCounterDiscount,
        todayNetPayable: todayCounterNetPayable,
        todayDue: todayCounterDue,
        todayCount: todayCounterCount,
        todayEqualCount: todayCounterEqualCount,
        todayDueCount: todayCounterDueCount,
        totalCash: totalCounterCash,
        totalGrossSlips: totalCounterGrossSlips,
        totalDiscount: totalCounterDiscount,
        totalNetPayable: totalCounterNetPayable,
        totalDue: totalCounterDue,
        totalCount: totalCounterCount
      });

      // 2. Purchases calculation
      const seenPurchaseRefs = new Set<string>();

      purchasesList.forEach(p => {
        const pTotal = p.totalAmount || 0;
        const pPaid = p.paidAmount || 0;
        totalPurchase += pTotal;
        totalSupplierPayment += pPaid;
        if (p.refNo) seenPurchaseRefs.add(p.refNo);

        let isToday = false;
        try {
          const pDateStr = p.date ? format(new Date(p.date), "yyyy-MM-dd") : "";
          isToday = pDateStr === todayFormatted || p.date === todayFormatted;
        } catch (e) {
          isToday = p.date === todayFormatted;
        }

        if (isToday) {
          todayPurchase += pTotal;
          todaySupplierPayment += pPaid;
        }
      });

      // Add purchases from supplierTransactions if not already present in purchasesList
      supplierTransactionsList.forEach(stx => {
        if (stx.type === "purchase" && stx.refNo && !seenPurchaseRefs.has(stx.refNo)) {
          const stxTotal = stx.totalAmount || 0;
          const stxPaid = stx.paidAmount || 0;
          totalPurchase += stxTotal;
          totalSupplierPayment += stxPaid;

          let isToday = false;
          try {
            const stxDateStr = stx.date ? format(new Date(stx.date), "yyyy-MM-dd") : "";
            isToday = stxDateStr === todayFormatted || stx.date === todayFormatted;
          } catch (e) {
            isToday = stx.date === todayFormatted;
          }

          if (isToday) {
            todayPurchase += stxTotal;
            todaySupplierPayment += stxPaid;
          }
        }
      });

      // 3. Due settlement payments to suppliers
      supplierTransactionsList.forEach(stx => {
        if (stx.type === "payment") {
          const stxAmount = stx.totalAmount || 0;
          totalSupplierPayment += stxAmount;

          let isToday = false;
          try {
            const stxDateStr = stx.date ? format(new Date(stx.date), "yyyy-MM-dd") : "";
            isToday = stxDateStr === todayFormatted || stx.date === todayFormatted;
          } catch (e) {
            isToday = stx.date === todayFormatted;
          }

          if (isToday) {
            todaySupplierPayment += stxAmount;
          }
        }
      });

      // 4. Supplier Outstanding Due: dynamically calculate from supplier transactions + opening balance to guarantee 100% precision
      if (suppliersList.length > 0) {
        suppliersList.forEach(s => {
          const sTxs = supplierTransactionsList.filter(t => t.supplierId === s.id);
          if (sTxs.length > 0) {
            let sPurchases = 0;
            let sPayments = 0;
            let sReturns = 0;
            let sLess = 0;
            sTxs.forEach(t => {
              const bdtAmount = t.totalAmount || 0;
              const bdtPaid = t.paidAmount || 0;
              let bdtLess = (t as any).lessAmount || 0;
              if (!bdtLess && t.notes) {
                const lessMatch = t.notes.match(/Less(?:\/Discount)?:\s*(?:৳|BDT)?\s*([\d.]+)/i);
                if (lessMatch) bdtLess = parseFloat(lessMatch[1]) || 0;
              }

              if (t.type === "purchase") {
                sPurchases += bdtAmount;
                sPayments += bdtPaid;
              } else if (t.type === "payment") {
                sPayments += bdtAmount;
                sLess += bdtLess;
              } else if (t.type === "return") {
                sReturns += bdtAmount;
              }
            });
            const opBal = s.openingBalance || 0;
            const dynamicDue = opBal + sPurchases - (sPayments + sLess) - sReturns;
            totalPurchaseDue += Math.max(0, dynamicDue);
          } else {
            totalPurchaseDue += Math.max(0, s.openingBalance || s.purchaseDue || 0);
          }
        });
      } else {
        purchasesList.forEach(p => {
          totalPurchaseDue += Math.max(0, p.dueAmount || 0);
        });
      }

      // 5. Attendance calculation
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
          .reduce((sum, p) => sum + (p.totalAmount || 0), 0);

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
  }, [validTransactions, validCounterSales, rawPurchases, rawSupplierTransactions, rawSuppliers, rawAttendance, rawEmployees, selectedUserFilter, systemUsers]);

  // Automated background reconciliation: cleans up orphan counterSales and orphan transactions from Firestore
  useEffect(() => {
    if (loading) return;
    if (rawTransactions.length === 0 && rawCounterSales.length === 0) return;

    // 1. Orphan counter sales (received cash deleted from transactions)
    const orphanCounterSales = rawCounterSales.filter(cs => 
      cs.receivedAmount && cs.receivedAmount > 0 &&
      !rawTransactions.some(t => 
        (cs.transactionId && t.id === cs.transactionId) ||
        (cs.saleId && t.subCategory === cs.saleId) ||
        (cs.saleId && t.notes && t.notes.includes(cs.saleId))
      )
    );

    for (const ocs of orphanCounterSales) {
      if (ocs.id) {
        deleteDoc(doc(db, "counterSales", ocs.id)).catch(e => console.warn("Auto cleanup counterSale error:", e));
      }
    }

    // 2. Orphan transactions (counter sale was deleted)
    const orphanTxs = rawTransactions.filter(tx => {
      const isCsTx = tx.category === "Counter Sale" || 
        (tx.subCategory && tx.subCategory.startsWith("CS-")) ||
        (tx.notes && (tx.notes.includes("Counter Sale [CS-") || tx.notes.includes("কাউন্টার সেল")));
      if (!isCsTx) return false;
      return !rawCounterSales.some(cs => 
        (tx.subCategory && cs.saleId === tx.subCategory) ||
        (cs.id === tx.subCategory) ||
        (cs.transactionId && cs.transactionId === tx.id) ||
        (tx.notes && cs.saleId && tx.notes.includes(cs.saleId))
      );
    });

    for (const otx of orphanTxs) {
      if (otx.id) {
        deleteDoc(doc(db, "transactions", otx.id)).catch(e => console.warn("Auto cleanup tx error:", e));
      }
    }
  }, [loading, rawTransactions, rawCounterSales]);

  // Manual reconcile trigger
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  const runReconciliation = async (showNotification = false) => {
    setReconciling(true);
    let cleanedCount = 0;
    try {
      // 1. Check for orphaned counterSales whose received cash transaction was deleted by user
      for (const cs of rawCounterSales) {
        if (cs.receivedAmount && cs.receivedAmount > 0) {
          const hasTx = rawTransactions.some(t => 
            (cs.transactionId && t.id === cs.transactionId) ||
            (cs.saleId && t.subCategory === cs.saleId) ||
            (cs.saleId && t.notes && t.notes.includes(cs.saleId))
          );
          if (!hasTx && cs.id) {
            try {
              await deleteDoc(doc(db, "counterSales", cs.id));
              cleanedCount++;
              if (cs.customerId) {
                const cRef = doc(db, "customers", cs.customerId);
                const cSnap = await getDoc(cRef);
                if (cSnap.exists()) {
                  const cd = cSnap.data();
                  const payable = cs.netPayable ?? (cs.totalSlipsAmount - (cs.discountAmount || 0));
                  await updateDoc(cRef, cleanFirestoreData({
                    totalPurchases: Math.max(0, (cd.totalPurchases || 0) - payable),
                    totalPaid: Math.max(0, (cd.totalPaid || 0) - (cs.receivedAmount || 0)),
                    totalDue: Math.max(0, (cd.totalDue || 0) - (cs.dueAmount || 0)),
                    totalDiscount: Math.max(0, (cd.totalDiscount || 0) - (cs.discountAmount || 0)),
                    totalPurchasesCount: Math.max(0, (cd.totalPurchasesCount || 1) - 1),
                    totalDueCount: (cs.dueAmount || 0) > 0 ? Math.max(0, (cd.totalDueCount || 1) - 1) : (cd.totalDueCount || 0),
                    updatedAt: new Date().toISOString()
                  }));
                }
              }
            } catch (err) {
              console.warn("Error deleting orphan counterSale:", err);
            }
          }
        }
      }

      // 2. Check for orphaned transactions whose counter sale was deleted
      for (const tx of rawTransactions) {
        const isCounterSaleTx = tx.category === "Counter Sale" || 
          (tx.subCategory && tx.subCategory.startsWith("CS-")) ||
          (tx.notes && (tx.notes.includes("Counter Sale [CS-") || tx.notes.includes("কাউন্টার সেল")));
        if (isCounterSaleTx && tx.id) {
          const hasCs = rawCounterSales.some(cs => 
            (tx.subCategory && cs.saleId === tx.subCategory) ||
            (cs.id === tx.subCategory) ||
            (cs.transactionId && cs.transactionId === tx.id) ||
            (tx.notes && cs.saleId && tx.notes.includes(cs.saleId))
          );
          if (!hasCs) {
            try {
              await deleteDoc(doc(db, "transactions", tx.id));
              cleanedCount++;
            } catch (err) {
              console.warn("Error deleting orphan transaction:", err);
            }
          }
        }
      }

      if (showNotification) {
        if (cleanedCount > 0) {
          setReconcileMessage(`সফলভাবে ${cleanedCount} টি অসঙ্গতিপূর্ণ বা ডিলিটকৃত রেকর্ড সমন্বয় করা হয়েছে। ড্যাশবোর্ড এখন ১০০% নির্ভুল।`);
        } else {
          setReconcileMessage("সকল কাউন্টার ক্যাশ ও সেলস হিসাব ইতোমধ্যে ১০০% সমন্বিত ও নির্ভুল রয়েছে।");
        }
        setTimeout(() => setReconcileMessage(null), 5000);
      }
    } catch (e) {
      console.error("Reconciliation error:", e);
    } finally {
      setReconciling(false);
    }
  };

  const totalBankLastCash = banks.reduce((sum, b) => sum + b.balance, 0);

  // Compute products below user-defined or default threshold
  const lowStockItems = products.filter(p => {
    const threshold = p.minStock !== undefined ? p.minStock : 10;
    return (p.stock || 0) <= threshold;
  });

  // Helper calculations for Late Duration and Breakfast Allowance
  const getLateDetails = (checkIn?: string) => {
    if (!checkIn) {
      return { isLate: false, minutesLate: 0, formattedDuration: "০ মিনিট" };
    }
    try {
      const [h, m] = checkIn.split(":").map(Number);
      const [thH, thM] = lateThreshold.split(":").map(Number);
      if (isNaN(h) || isNaN(m) || isNaN(thH) || isNaN(thM)) {
        return { isLate: false, minutesLate: 0, formattedDuration: "০ মিনিট" };
      }
      const checkInMins = h * 60 + m;
      const cutoffMins = thH * 60 + thM + (gracePeriodMinutes || 0);

      if (checkInMins > cutoffMins) {
        const diff = checkInMins - (thH * 60 + thM);
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        let formatted = "";
        if (hours > 0 && mins > 0) {
          formatted = `${hours} ঘণ্টা ${mins} মিনিট দেরি`;
        } else if (hours > 0) {
          formatted = `${hours} ঘণ্টা দেরি`;
        } else {
          formatted = `${mins} মিনিট দেরি`;
        }
        return { isLate: true, minutesLate: diff, formattedDuration: formatted };
      }
      return { isLate: false, minutesLate: 0, formattedDuration: "০ মিনিট" };
    } catch {
      return { isLate: false, minutesLate: 0, formattedDuration: "০ মিনিট" };
    }
  };

  const getBreakfastStatus = (emp: any, record?: any) => {
    if (!record || !record.status) {
      return {
        eligible: false,
        amount: 0,
        badgeText: "হাজিরা বাকি",
        reason: "আজকের উপস্থিতি এখনও রেকর্ড করা হয়নি",
        category: "not_marked" as const,
        lateInfo: getLateDetails(undefined)
      };
    }

    if (record.status === "absent" || record.status === "leave") {
      return {
        eligible: false,
        amount: 0,
        badgeText: "নাস্তার টাকা পাবে না",
        reason: record.status === "absent" ? "অনুপস্থিত থাকায় নাস্তার টাকা কর্তন" : "ছুটিতে থাকায় নাস্তার টাকা প্রযোজ্য নয়",
        category: "absent" as const,
        lateInfo: getLateDetails(undefined)
      };
    }

    if (record.status === "holiday") {
      return {
        eligible: false,
        amount: 0,
        badgeText: "ছুটির দিন",
        reason: "অফিস সরকারি বা সাপ্তাহিক বন্ধ",
        category: "holiday" as const,
        lateInfo: getLateDetails(undefined)
      };
    }

    const lateInfo = getLateDetails(record.checkIn);
    const isLateArrival = lateInfo.isLate || record.status === "late" || record.status === "half-day";

    if (isLateArrival && deductBreakfastOnLate) {
      return {
        eligible: false,
        amount: 0,
        badgeText: "নাস্তার টাকা কর্তন",
        reason: `সকাল ${lateThreshold} এর পরে (${record.checkIn || "দেরিতে"}) আসায় নাস্তার টাকা কর্তন (${lateInfo.formattedDuration})`,
        category: "late_deducted" as const,
        lateInfo
      };
    }

    return {
      eligible: true,
      amount: breakfastAllowanceAmount,
      badgeText: `নাস্তা পাবে (৳${breakfastAllowanceAmount})`,
      reason: `সকাল ${lateThreshold} এর আগে সময়মতো উপস্থিত (${record.checkIn || "১০:০০ এর পূর্বে"})`,
      category: "eligible" as const,
      lateInfo
    };
  };

  const getEmployeePhoto = (emp: any) => {
    if (emp.photo) return emp.photo;
    if (emp.nidFrontPhoto) return emp.nidFrontPhoto;
    const docImg = emp.documents?.find((d: any) => d.type?.startsWith("image/"));
    if (docImg) return docImg.data;
    return null;
  };

  const formatTime12 = (time24?: string) => {
    if (!time24) return "--:--";
    try {
      const [h, m] = time24.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return time24;
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${period}`;
    } catch {
      return time24;
    }
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const activeEmployees = rawEmployees.filter((e: any) => e.status !== "inactive" && e.status !== "resigned");

  const staffBreakfastList = activeEmployees.map((emp: any) => {
    const rec = rawAttendance.find((a: any) => {
      if (a.employeeId !== emp.id) return false;
      try {
        const aDateStr = a.date ? format(new Date(a.date), "yyyy-MM-dd") : "";
        return aDateStr === todayStr || a.date === todayStr;
      } catch {
        return a.date === todayStr;
      }
    });
    const bStatus = getBreakfastStatus(emp, rec);
    return {
      emp,
      rec,
      bStatus
    };
  });

  const breakfastSummaryStats = {
    totalStaff: staffBreakfastList.length,
    eligibleCount: staffBreakfastList.filter(s => s.bStatus.category === "eligible").length,
    lateDeductedCount: staffBreakfastList.filter(s => s.bStatus.category === "late_deducted").length,
    lateCount: staffBreakfastList.filter(s => s.bStatus.lateInfo.isLate || s.rec?.status === "late" || s.rec?.status === "half-day").length,
    absentCount: staffBreakfastList.filter(s => s.rec?.status === "absent" || s.rec?.status === "leave").length,
    notMarkedCount: staffBreakfastList.filter(s => !s.rec || !s.rec.status).length,
    totalBreakfastPayable: staffBreakfastList.filter(s => s.bStatus.category === "eligible").length * breakfastAllowanceAmount,
    totalBreakfastSaved: staffBreakfastList.filter(s => s.bStatus.category === "late_deducted").length * breakfastAllowanceAmount,
  };

  const filteredBreakfastList = staffBreakfastList.filter(item => {
    if (breakfastFilter === "eligible" && item.bStatus.category !== "eligible") return false;
    if (breakfastFilter === "late_deducted" && item.bStatus.category !== "late_deducted") return false;
    if (breakfastFilter === "late_only" && !item.bStatus.lateInfo.isLate && item.rec?.status !== "late" && item.rec?.status !== "half-day") return false;
    if (breakfastFilter === "absent" && item.rec?.status !== "absent" && item.rec?.status !== "leave") return false;

    if (breakfastSearch.trim()) {
      const q = breakfastSearch.toLowerCase().trim();
      const nameMatch = item.emp.name?.toLowerCase().includes(q);
      const roleMatch = item.emp.role?.toLowerCase().includes(q);
      const deptMatch = item.emp.department?.toLowerCase().includes(q);
      const idMatch = item.emp.employeeId?.toLowerCase().includes(q);
      return nameMatch || roleMatch || deptMatch || idMatch;
    }
    return true;
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
        <div className="flex items-center gap-2 print:hidden flex-wrap">
          <button
            onClick={() => runReconciliation(true)}
            disabled={reconciling}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-2xs cursor-pointer active:scale-98"
            title="কাউন্টার ক্যাশ ও সেলস হিসাব যাচাই ও সমন্বয় করুন"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-indigo-600", reconciling && "animate-spin")} />
            <span>{reconciling ? "সমন্বয় হচ্ছে..." : "হিসাব অডিট ও সমন্বয়"}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-sm shadow-slate-950/10 cursor-pointer border border-transparent hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            {t("Print Ledger Report")}
          </button>
        </div>
      </header>

      {reconcileMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{reconcileMessage}</span>
          </div>
          <button onClick={() => setReconcileMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold px-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* Multi-User Calculation & Input Filter Scope Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0 border border-slate-200 shadow-2xs">
            <Users className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                {selectedUserFilter === "all" 
                  ? t("Store-Wide Total Calculation (All Users)") 
                  : `${t("Total Calculation for Inputs by")}: ${activeFilteredUser?.displayName || t("Selected User")}`}
              </h3>
              <span className={cn(
                "text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border",
                selectedUserFilter === "all" 
                  ? "bg-slate-100 text-slate-700 border-slate-250" 
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 animate-in fade-in"
              )}>
                {selectedUserFilter === "all" 
                  ? t("Global Store Overview") 
                  : (selectedUserFilter === user.uid ? t("Your Inputs Only") : t("Filtered User Input"))}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {selectedUserFilter === "all"
                ? t("Calculating aggregated metrics across all staff & counter entries.")
                : `${t("Displaying metrics and calculations exclusively for records inputted by")} ${activeFilteredUser?.displayName || t("this user")}.`}
            </p>
          </div>
        </div>

        {/* User filter selector dropdown and mode indicator */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {isSuperAdmin && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-250 rounded-xl px-3 py-1.5 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer py-1 pr-2"
                title={t("Filter total calculation by input of any user")}
              >
                <option value="all">👥 {t("All Users (Total Calculation)")}</option>
                <option value={user.uid}>👤 {t("My Inputs Only")} ({user.displayName?.split(" ")[0] || "Me"})</option>
                {systemUsers.length > 0 && (
                  <optgroup label={t("Select Any Other User")}>
                    {systemUsers
                      .filter(u => u.uid !== user.uid)
                      .map(u => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName} ({u.role || "staff"})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {isSuperAdmin && selectedUserFilter !== "all" && (
            <button
              onClick={() => setSelectedUserFilter("all")}
              className="text-xs font-bold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
              title={t("Reset to all users")}
            >
              {t("Reset to All")}
            </button>
          )}

          {!isSuperAdmin && (
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200/60 rounded-xl px-3 py-1.5 text-indigo-700 font-bold text-xs">
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{t("Input Only Mode Active")}</span>
            </div>
          )}
        </div>
      </div>

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

      {/* Quick Actions Panel - Displayed exclusively for operational staff / other user roles */}
      {!isSuperAdmin && (
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
      )}

      {/* Input-Only Mode Notice for Operational Staff & Accountants */}
      {viewMode === "inputOnly" && !isSuperAdmin && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-200 text-slate-800 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">{t("Quick Input Mode Active")}</h4>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              {t("You are in data-entry mode. Use the Quick Actions panel above to log new sales, expenses, and payroll entries. Store lifetime total calculations are hidden.")}
            </p>
          </div>
        </div>
      )}

      {isSuperAdmin && viewMode === "calculation" && (
        <>
          {/* Daily Performance Section (Today) */}
          <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 bg-rose-600 rounded-full animate-pulse" />
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{t("Today's Shop Ledger Snapshot")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          <StatCard 
            title="Today Staff Sales (Net)" 
            value={staffSalesStats.todayStaffNet} 
            icon={Users} 
            color="emerald" 
            description={`কর্মী: ৳${staffSalesStats.todayStaffSales.toLocaleString()} + হোলসেল: ৳${staffSalesStats.todayWholesale.toLocaleString()} - ডিপোজিট: ৳${staffSalesStats.todayDeposit.toLocaleString()}`}
            scope="Staff Net"
          />
          <StatCard 
            title="Today Counter Cash" 
            value={counterSalesStats.todayCash} 
            icon={Receipt} 
            color="indigo" 
            description={`স্লিপ: ৳${counterSalesStats.todayGrossSlips.toLocaleString()} | বাকি: ৳${counterSalesStats.todayDue.toLocaleString()} (${counterSalesStats.todayCount} বিল)`}
            scope="Counter Cash"
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
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          <StatCard 
            title="Total Staff Sales (Net)" 
            value={staffSalesStats.totalStaffNet} 
            icon={Users} 
            color="emerald" 
            description={`কর্মী মোট: ৳${staffSalesStats.totalStaffSales.toLocaleString()} + হোলসেল - ডিপোজিট`}
            scope="Staff Net"
          />
          <StatCard 
            title="Total Counter Cash" 
            value={counterSalesStats.totalCash} 
            icon={Receipt} 
            color="indigo" 
            description={`মোট স্লিপ: ৳${counterSalesStats.totalGrossSlips.toLocaleString()} | মোট বাকি: ৳${counterSalesStats.totalDue.toLocaleString()}`}
            scope="Counter Cash"
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
            title={selectedUserFilter === "all" ? t("Total Bank Last Cash") : t("User Net Cash Balance")} 
            value={selectedUserFilter === "all" ? totalBankLastCash : userNetCash} 
            icon={Wallet} 
            color="sky" 
            description={selectedUserFilter === "all" ? t("Combined remaining cash inside all banks now") : t("Net cash balance calculated from inputs by this user")}
            scope={selectedUserFilter === "all" ? "Active Balance" : "User Net Cash"}
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

      {/* ================= DUAL SALES LEDGERS & DISTINCT CALCULATIONS HUB ================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md shadow-slate-100/50 p-6 space-y-6">
        {/* Hub Header & Mode Toggle */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-teal-600 to-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/15 shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  দুইটি আলাদা বিক্রয় লেজার ও হিসাব বিশ্লেষণ (Two Sales Ledgers & Calculations)
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  আলাদা ফর্মুলা ও ফলাফল
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                কর্মী বিক্রয় (Staff Sales) এবং কাউন্টার বিক্রয় (Counter Sales) এর দুইটি ভিন্ন হিসাব পদ্ধতি ও পৃথক লেজার খাতা।
              </p>
            </div>
          </div>

          {/* Switcher Pills */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl shrink-0 self-start lg:self-auto gap-1">
            <button
              onClick={() => setSalesLedgerTab("dual")}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                salesLedgerTab === "dual"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>উভয় লেজার পাশাপাশি (Dual View)</span>
            </button>

            <button
              onClick={() => setSalesLedgerTab("staff")}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                salesLedgerTab === "staff"
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>কর্মী বিক্রয় লেজার (Staff Ledger)</span>
            </button>

            <button
              onClick={() => setSalesLedgerTab("counter")}
              className={cn(
                "px-3.5 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                salesLedgerTab === "counter"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Receipt className="w-3.5 h-3.5 text-indigo-600" />
              <span>কাউন্টার স্লিপ লেজার (Counter Ledger)</span>
            </button>
          </div>
        </div>

        {/* 1. DUAL LEDGERS SIDE-BY-SIDE VIEW */}
        {salesLedgerTab === "dual" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* LEDGER 1: Staff Sales Ledger (কর্মী বিক্রয় লেজার) */}
            <div className="bg-gradient-to-br from-emerald-50/40 via-white to-slate-50/60 rounded-3xl border border-emerald-200/80 p-6 space-y-5 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">
                        লেজার নং ১ • শিফট ও কর্মী ভিত্তিক
                      </span>
                      <h4 className="text-base font-black text-slate-900">
                        কর্মী বিক্রয় লেজার (Staff Sales Ledger)
                      </h4>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    Staff Shift Inflow
                  </span>
                </div>

                {/* Calculation Formula Card */}
                <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-900 text-xs font-black">
                    <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>হিসাব পদ্ধতি (Calculation Formula):</span>
                  </div>
                  <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200/60 text-xs font-mono font-bold text-emerald-950 flex flex-wrap items-center gap-2">
                    <span>কর্মী বিক্রয় (Staff)</span>
                    <span className="text-emerald-600">+</span>
                    <span>হোলসেল (Wholesale)</span>
                    <span className="text-rose-500">-</span>
                    <span>ডিপোজিট / বকেয়া (Deposit)</span>
                    <span className="text-emerald-700 font-black">=</span>
                    <span className="text-emerald-700 font-black underline">নিট কর্মী বিক্রয়</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium pt-0.5">
                    আজকের মান: ৳{staffSalesStats.todayStaffSales.toLocaleString()} + ৳{staffSalesStats.todayWholesale.toLocaleString()} - ৳{staffSalesStats.todayDeposit.toLocaleString()} = <strong className="text-emerald-700 font-mono">৳{staffSalesStats.todayStaffNet.toLocaleString()}</strong>
                  </div>
                </div>

                {/* Key Numbers Grid (Today & All-Time) */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Today Snapshot */}
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1">
                      আজকের হিসাব (Today)
                    </span>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">কর্মী বিক্রয়:</span>
                        <span className="font-mono font-bold text-slate-800">৳{staffSalesStats.todayStaffSales.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">হোলসেল (+):</span>
                        <span className="font-mono font-bold text-teal-700">+৳{staffSalesStats.todayWholesale.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ডিপোজিট (-):</span>
                        <span className="font-mono font-bold text-rose-600">-৳{staffSalesStats.todayDeposit.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 font-black text-sm">
                        <span className="text-emerald-800">নিট ফলাফল:</span>
                        <span className="font-mono text-emerald-700">৳{staffSalesStats.todayStaffNet.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* All-Time Snapshot */}
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1">
                      সর্বমোট হিসাব (All-Time)
                    </span>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">কর্মী বিক্রয়:</span>
                        <span className="font-mono font-bold text-slate-800">৳{staffSalesStats.totalStaffSales.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">হোলসেল (+):</span>
                        <span className="font-mono font-bold text-teal-700">+৳{staffSalesStats.totalWholesale.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ডিপোজিট (-):</span>
                        <span className="font-mono font-bold text-rose-600">-৳{staffSalesStats.totalDeposit.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 font-black text-sm">
                        <span className="text-emerald-800">সর্বমোট নিট:</span>
                        <span className="font-mono text-emerald-700">৳{staffSalesStats.totalStaffNet.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-100">
                <button
                  onClick={() => onNavigate?.("salesList")}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>কর্মী বিক্রয় লেজার খাতা দেখুন</span>
                </button>
                <button
                  onClick={() => onNavigate?.("newSale")}
                  className="py-2.5 px-4 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-98 flex items-center gap-1"
                >
                  <span>নতুন এন্ট্রি</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* LEDGER 2: Counter Sales Ledger (কাউন্টার স্লিপ বিক্রয় লেজার) */}
            <div className="bg-gradient-to-br from-indigo-50/40 via-white to-slate-50/60 rounded-3xl border border-indigo-200/80 p-6 space-y-5 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-indigo-800 uppercase tracking-widest block">
                        লেজার নং ২ • কাস্টমার স্লিপ ও ক্যাশ ড্রয়ার
                      </span>
                      <h4 className="text-base font-black text-slate-900">
                        কাউন্টার বিক্রয় লেজার (Counter Sales Ledger)
                      </h4>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                    POS Slip Register
                  </span>
                </div>

                {/* Calculation Formula Card */}
                <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-indigo-900 text-xs font-black">
                    <Scale className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>হিসাব পদ্ধতি (Calculation Formula):</span>
                  </div>
                  <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200/60 text-xs font-mono font-bold text-indigo-950 flex flex-wrap items-center gap-2">
                    <span>মোট স্লিপ (Gross)</span>
                    <span className="text-rose-500">-</span>
                    <span>ছাড় (Discount)</span>
                    <span className="text-indigo-600">=</span>
                    <span className="text-slate-800 font-black">প্রদেয় (Net)</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-indigo-700 underline font-black">প্রাপ্ত ক্যাশ</span>
                    <span className="text-slate-500">+</span>
                    <span className="text-amber-700 font-black">বাকি (Due)</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium pt-0.5">
                    আজকের মান: ৳{counterSalesStats.todayGrossSlips.toLocaleString()} - ৳{counterSalesStats.todayDiscount.toLocaleString()} = ৳{counterSalesStats.todayNetPayable.toLocaleString()} → <strong className="text-indigo-700 font-mono">৳{counterSalesStats.todayCash.toLocaleString()} ক্যাশ</strong> + <strong className="text-amber-700 font-mono">৳{counterSalesStats.todayDue.toLocaleString()} বাকি</strong>
                  </div>
                </div>

                {/* Key Numbers Grid (Today & All-Time) */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Today Snapshot */}
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1">
                      আজকের ক্যাশ ও বাকি (Today)
                    </span>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">মোট স্লিপ:</span>
                        <span className="font-mono font-bold text-slate-800">৳{counterSalesStats.todayGrossSlips.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ছাড়/ডিসকাউন্ট:</span>
                        <span className="font-mono font-bold text-rose-500">-৳{counterSalesStats.todayDiscount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 font-black">
                        <span className="text-indigo-800">ক্যাশ প্রাপ্তি:</span>
                        <span className="font-mono text-indigo-700">৳{counterSalesStats.todayCash.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-700">
                        <span>কাস্টমার বাকি:</span>
                        <span className="font-mono">৳{counterSalesStats.todayDue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* All-Time Snapshot */}
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1">
                      সর্বমোট ক্যাশ ও বাকি (All-Time)
                    </span>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">মোট স্লিপ বিল:</span>
                        <span className="font-mono font-bold text-slate-800">৳{counterSalesStats.totalGrossSlips.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">মোট ছাড়:</span>
                        <span className="font-mono font-bold text-rose-500">-৳{counterSalesStats.totalDiscount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100 font-black">
                        <span className="text-indigo-800">মোট ক্যাশ জমা:</span>
                        <span className="font-mono text-indigo-700">৳{counterSalesStats.totalCash.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-700">
                        <span>মোট বাকি (Due):</span>
                        <span className="font-mono">৳{counterSalesStats.totalDue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-100">
                <button
                  onClick={() => onNavigate?.("counterSalesLedger")}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>কাউন্টার রেজিস্টার</span>
                </button>
                <button
                  onClick={() => onNavigate?.("customerLedger")}
                  className="py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-98 flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                  <span>কাস্টমার লেজার (বাকি খাতা)</span>
                </button>
                <button
                  onClick={() => onNavigate?.("counterSale")}
                  className="py-2.5 px-4 bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-300 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-98 flex items-center gap-1"
                >
                  <span>নতুন স্লিপ সেল</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. STAFF SALES LEDGER DETAILED VIEW */}
        {salesLedgerTab === "staff" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-emerald-950">কর্মী বিক্রয় লেজার খাতা (Staff Sales Ledger Detail)</h4>
                  <p className="text-xs text-emerald-800/80 font-medium">
                    প্রতিটি সেলস অফিসারের আলাদা ইনপুট, পাইকারি (হোলসেল) ও ডিপোজিট সমন্বয় হিসাব
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate?.("salesList")}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 self-start md:self-auto shadow-xs"
              >
                <span>সম্পূর্ণ কর্মী লেজার শিট খুলুন</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Table of staff performance today */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">কর্মী ও পদবী</th>
                    <th className="px-4 py-3">সেকশন / বিভাগ</th>
                    <th className="px-4 py-3 text-right">আজকের বিক্রয় (Today)</th>
                    <th className="px-4 py-3 text-right">সর্বমোট বিক্রয় (All-Time)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">কোন কর্মী পাওয়া যায়নি</td>
                    </tr>
                  ) : (
                    rawEmployees
                      .filter(e => e.status === "active")
                      .map(emp => {
                        const todayEmp = employeeSalesToday.find(e => e.name === emp.name)?.amount || 0;
                        const totalEmp = employeeSalesTotal.find(e => e.name === emp.name)?.amount || 0;
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-900">
                              <div>{emp.name}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{emp.role}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-medium">
                              {emp.department || "Sales"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                              {todayEmp > 0 ? `৳${todayEmp.toLocaleString()}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                              {totalEmp > 0 ? `৳${totalEmp.toLocaleString()}` : "—"}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. COUNTER SALES LEDGER DETAILED VIEW */}
        {salesLedgerTab === "counter" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-indigo-950">কাউন্টার স্লিপ রেজিস্টার ও বিল তালিকা (Counter Bills Ledger)</h4>
                  <p className="text-xs text-indigo-800/80 font-medium">
                    প্রতিটি স্লিপ, ছাড়, নগদ ক্যাশ গ্রহণ এবং গ্রাহক বাকি খাতা
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate?.("counterSalesLedger")}
                className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 self-start md:self-auto shadow-xs"
              >
                <span>সম্পূর্ণ কাউন্টার লেজার রেজিস্টার খুলুন</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Table of recent counter sales bills */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">বিল আইডি ও সময়</th>
                    <th className="px-4 py-3">গ্রাহক</th>
                    <th className="px-4 py-3 text-center">স্লিপ সংখ্যা</th>
                    <th className="px-4 py-3 text-right">মোট স্লিপ</th>
                    <th className="px-4 py-3 text-right">ছাড়</th>
                    <th className="px-4 py-3 text-right">প্রদেয়</th>
                    <th className="px-4 py-3 text-right">প্রাপ্ত ক্যাশ</th>
                    <th className="px-4 py-3 text-right">বাকি (Due)</th>
                    <th className="px-4 py-3 text-center">স্ট্যাটাস</th>
                    <th className="px-4 py-3 text-center">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validCounterSales.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 italic">কাউন্টার সেলের কোনো রেকর্ড পাওয়া যায়নি</td>
                    </tr>
                  ) : (
                    validCounterSales.slice(0, 10).map(cs => (
                      <tr key={cs.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          <div>{cs.saleId}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{cs.time || cs.date}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium">
                          {cs.customerName || `কাস্টমার #${cs.dailySerial || 1}`}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-600">
                          {cs.slips?.length || 1} টি
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          ৳{(cs.totalSlipsAmount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-500">
                          {(cs.discountAmount || 0) > 0 ? `-৳${cs.discountAmount}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          ৳{(cs.netPayable || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-indigo-700">
                          ৳{(cs.receivedAmount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">
                          {(cs.dueAmount || 0) > 0 ? `৳${cs.dueAmount.toLocaleString()}` : "০"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cs.isBalanced || cs.balanceStatus === "equal" ? (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              সমান সমান ✓
                            </span>
                          ) : (cs.dueAmount || 0) > 0 ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                              বাকি
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              ফেরত ৳{cs.changeAmount || 0}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSaleToDeleteInDashboard(cs)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                            title="কাউন্টার সেল ডিলিট করুন (ড্যাশবোর্ড ও খাতা থেকে সমন্বয় হবে)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
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

      {/* ================= NASTA & LATE MONITORING CHART BOARD (নাস্তা ও লেট মনিটরিং চার্ট বোর্ড) ================= */}
      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30 overflow-hidden space-y-6 p-6">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-200/60 flex items-center justify-center text-amber-600 shadow-xs shrink-0">
              <Coffee className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  নাস্তা ও লেট মনিটরিং চার্ট বোর্ড
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                  প্রতিদিনের নাস্তার তালিকা
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                সকাল {lateThreshold} টার পর আসলে লেট গণ্য হবে এবং কর্মীদের দৈনিক ৳{breakfastAllowanceAmount} নাস্তার ভাতা স্বয়ংক্রিয় হিসাব ও কর্তন তালিকা
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigate?.("addAttendance")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs hover:scale-102 active:scale-98"
            >
              <UserCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>হাজিরা এন্ট্রি</span>
            </button>
            <button
              onClick={() => onNavigate?.("breakfastBoard")}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm hover:scale-102 active:scale-98"
            >
              <span>চার্ট বোর্ড ওপেন করুন</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Rule reminder notification strip */}
        <div className="bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-slate-50 p-3.5 rounded-2xl border border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-950 font-bold">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>অফিস নিয়ম:</strong> সকাল {lateThreshold} AM এর পরে আসলে লেট • দৈনিক নাস্তা: ৳{breakfastAllowanceAmount} • দেরি হলে কর্তন: {deductBreakfastOnLate ? "সক্রিয় (কাটা যাবে)" : "নিষ্ক্রিয়"}
            </span>
          </div>
          <div className="text-[11px] font-mono font-bold text-slate-500 shrink-0">
            তারিখ: {format(new Date(), "dd MMMM yyyy")}
          </div>
        </div>

        {/* 5 KPI Stat summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Card 1: Total Staff */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/60 space-y-1">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">মোট কর্মী</span>
            <div className="text-xl font-black text-slate-900 font-mono">
              {breakfastSummaryStats.totalStaff} <span className="text-xs font-semibold text-slate-500">জন</span>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">সক্রিয় তালিকাভুক্ত</p>
          </div>

          {/* Card 2: Eligible */}
          <div className="bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-200/60 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider block">নাস্তা পাবে (অন-টাইম)</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-700 font-mono">
              {breakfastSummaryStats.eligibleCount} <span className="text-xs font-semibold text-emerald-600">জন</span>
            </div>
            <p className="text-[9px] text-emerald-700 font-bold font-mono">বরাদ্দ: ৳{breakfastSummaryStats.totalBreakfastPayable}</p>
          </div>

          {/* Card 3: Deducted Late */}
          <div className="bg-rose-50/50 p-3.5 rounded-2xl border border-rose-200/60 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-rose-800 uppercase tracking-wider block">নাস্তার টাকা কর্তন</span>
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-xl font-black text-rose-600 font-mono">
              {breakfastSummaryStats.lateDeductedCount} <span className="text-xs font-semibold text-rose-500">জন</span>
            </div>
            <p className="text-[9px] text-rose-600 font-bold font-mono">কর্তন: ৳{breakfastSummaryStats.totalBreakfastSaved}</p>
          </div>

          {/* Card 4: Late Count */}
          <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/60 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-amber-800 uppercase tracking-wider block">দেরিতে আসা স্টাফ</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xl font-black text-amber-700 font-mono">
              {breakfastSummaryStats.lateCount} <span className="text-xs font-semibold text-amber-600">জন</span>
            </div>
            <p className="text-[9px] text-amber-600 font-bold">{lateThreshold} AM এর পরে</p>
          </div>

          {/* Card 5: Net Payable */}
          <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 space-y-1 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider block">আজকের নাস্তার খরচ</span>
              <Coffee className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              ৳{breakfastSummaryStats.totalBreakfastPayable}
            </div>
            <p className="text-[9px] text-slate-400 font-bold">মোট সাশ্রয়: ৳{breakfastSummaryStats.totalBreakfastSaved}</p>
          </div>
        </div>

        {/* Filter Pills & Search Input */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setBreakfastFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border",
                breakfastFilter === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              )}
            >
              সব কর্মী ({breakfastSummaryStats.totalStaff})
            </button>

            <button
              onClick={() => setBreakfastFilter("eligible")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1",
                breakfastFilter === "eligible"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/50"
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>নাস্তা পাবে ({breakfastSummaryStats.eligibleCount}) 🥪</span>
            </button>

            <button
              onClick={() => setBreakfastFilter("late_deducted")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1",
                breakfastFilter === "late_deducted"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/50"
              )}
            >
              <AlertCircle className="w-3 h-3" />
              <span>নাস্তার টাকা কর্তন ({breakfastSummaryStats.lateDeductedCount}) ❌</span>
            </button>

            <button
              onClick={() => setBreakfastFilter("late_only")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1",
                breakfastFilter === "late_only"
                  ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/50"
              )}
            >
              <Clock className="w-3 h-3" />
              <span>দেরিতে আসা ({breakfastSummaryStats.lateCount}) ⏰</span>
            </button>

            <button
              onClick={() => setBreakfastFilter("absent")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-1",
                breakfastFilter === "absent"
                  ? "bg-slate-700 text-white border-slate-700 shadow-xs"
                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
              )}
            >
              <XCircle className="w-3 h-3" />
              <span>অনুপস্থিত ({breakfastSummaryStats.absentCount})</span>
            </button>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="নাম বা পদবী দিয়ে খুঁজুন..."
              value={breakfastSearch}
              onChange={e => setBreakfastSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* The Attendance & Breakfast List Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">কর্মী ও পদবী</th>
                <th className="px-4 py-3.5 text-center">আজকের আগমন সময়</th>
                <th className="px-4 py-3.5 text-center">দেরির সময়</th>
                <th className="px-5 py-3.5 text-center">নাস্তার স্ট্যাটাস</th>
                <th className="px-5 py-3.5 text-right">নাস্তা ভাতা</th>
                <th className="px-4 py-3.5 text-center">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredBreakfastList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 font-medium">
                    কোনো কর্মীর তথ্য পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filteredBreakfastList.map(({ emp, rec, bStatus }) => {
                  const photo = getEmployeePhoto(emp);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee Info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            {photo ? (
                              <img
                                src={photo}
                                alt={emp.name}
                                className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-xs"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                                {emp.name?.charAt(0) || "E"}
                              </div>
                            )}
                            <span 
                              className={cn(
                                "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white",
                                rec?.status === "present" ? "bg-emerald-500" :
                                rec?.status === "late" ? "bg-amber-500" :
                                rec?.status === "absent" ? "bg-rose-500" : "bg-slate-300"
                              )}
                            />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <span>{emp.name}</span>
                              {emp.employeeId && (
                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {emp.employeeId}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-semibold">
                              {emp.role || "Staff"} {emp.department ? `• ${emp.department}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Check-In Time */}
                      <td className="px-4 py-3.5 text-center">
                        {rec?.checkIn ? (
                          <span className="font-mono font-bold text-slate-800 text-xs inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {formatTime12(rec.checkIn)}
                          </span>
                        ) : rec?.status === "absent" ? (
                          <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">
                            অনুপস্থিত
                          </span>
                        ) : rec?.status === "leave" ? (
                          <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                            ছুটি
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            হাজিরা বাকি
                          </span>
                        )}
                      </td>

                      {/* Late Duration */}
                      <td className="px-4 py-3.5 text-center">
                        {bStatus.lateInfo.isLate ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[11px] animate-pulse">
                            <Clock className="w-3 h-3 text-rose-500" />
                            {bStatus.lateInfo.formattedDuration}
                          </span>
                        ) : rec?.checkIn ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-[11px]">
                            অন-টাইম (০ মি.)
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>

                      {/* Breakfast Status */}
                      <td className="px-5 py-3.5 text-center">
                        {bStatus.category === "eligible" ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-black text-xs shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            নাস্তা পাবে 🥪
                          </span>
                        ) : bStatus.category === "late_deducted" ? (
                          <span 
                            className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-black text-xs shadow-2xs"
                            title={bStatus.reason}
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            নাস্তার টাকা কর্তন ❌
                          </span>
                        ) : bStatus.category === "absent" ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full font-black text-xs">
                            <XCircle className="w-3.5 h-3.5 text-slate-400" />
                            পাবে না (অনুপস্থিত)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-xs">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            হাজিরা বাকি
                          </span>
                        )}
                      </td>

                      {/* Allowance Amount */}
                      <td className="px-5 py-3.5 text-right font-mono font-black text-sm">
                        {bStatus.eligible ? (
                          <span className="text-emerald-700">+৳{bStatus.amount}</span>
                        ) : (
                          <span className="text-slate-400">৳০</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => onNavigate?.("breakfastBoard")}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                          title="চার্ট বোর্ডে বিস্তারিত দেখুন"
                        >
                          <span>বিস্তারিত</span>
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
        </>
      )}

      {/* ================= IN-APP COUNTER SALE DELETE CONFIRMATION MODAL ================= */}
      {saleToDeleteInDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-gray-900">
                কাউন্টার সেল মুছে ফেলবেন?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                সেল আইডি <strong className="text-gray-900 font-mono">{saleToDeleteInDashboard.saleId}</strong> (তারিখ: {saleToDeleteInDashboard.date}, মোট: ৳{(saleToDeleteInDashboard.totalSlipsAmount || 0).toLocaleString()}) স্থায়ীভাবে মুছে ফেলতে চান?
              </p>
            </div>

            <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100 text-[11px] text-rose-800 space-y-1">
              <p className="font-bold">• ড্যাশবোর্ডের মোট সেল ও ক্যাশ ক্যালকুলেশন থেকে এটি তাৎক্ষণিকভাবে বাদ যাবে।</p>
              <p>• সংশ্লিষ্ট ট্রানজ্যাকশন এবং কাস্টমার বাকি খাতা থেকে হিসাব সমন্বয় হয়ে যাবে।</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingSaleInDashboard}
                onClick={() => handleDeleteCounterSaleFromDashboard(saleToDeleteInDashboard)}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeletingSaleInDashboard ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>মুছে ফেলা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>হ্যাঁ, ডিলিট করুন</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isDeletingSaleInDashboard}
                onClick={() => setSaleToDeleteInDashboard(null)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
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
      "bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/60 shadow-xs hover:shadow-lg transition-all duration-300 group hover:-translate-y-0.5 flex flex-col justify-between",
      (isCount || printHidden) ? "print:hidden" : "",
      style.glow
    )}>
      <div>
        <div className="flex items-start justify-between mb-2.5 sm:mb-3.5">
          <div className={cn("p-2 sm:p-2.5 rounded-lg sm:rounded-xl border transition-transform duration-300 group-hover:scale-105", style.bg)}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className={cn(
            "text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-md border",
            scope === "Today" ? "bg-orange-55 text-orange-600 border-orange-105" :
            scope === "Total" ? "bg-indigo-55 text-indigo-600 border-indigo-105" :
            "bg-slate-50 text-slate-500 border-slate-100"
          )}>
            {t(scope)}
          </span>
        </div>
        <div>
          <p className="text-[10px] sm:text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1 truncate" title={t(title)}>{t(title)}</p>
          <p className="text-sm sm:text-xl font-black text-slate-900 tracking-tight font-mono">
            {isCount ? formatNumber(value) : formatCurrency(value)}
          </p>
        </div>
      </div>
      <p className="text-[8.5px] sm:text-[9px] font-bold text-slate-400 mt-2 flex items-center gap-1 border-t border-slate-50 pt-1.5 sm:pt-2 truncate hidden sm:flex" title={t(description)}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse shrink-0" />
        {t(description)}
      </p>
    </div>
  );
}
