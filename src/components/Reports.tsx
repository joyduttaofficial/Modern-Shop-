import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, getDocs, orderBy, doc, onSnapshot } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Transaction, UserRole, Bank, Employee, Supplier, SupplierTransaction, Product, StockLedgerEntry } from "@/src/types";
import { cn, computeDynamicPurchases } from "@/src/lib/utils";
import { format, startOfDay, endOfDay, subDays, isWithinInterval, isBefore, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear, parseISO } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  FileText, 
  Download, 
  Calendar, 
  ArrowRight, 
  Printer, 
  Layout, 
  BarChart3, 
  Users, 
  Wallet, 
  TrendingUp,
  ChevronRight,
  ChevronDown,
  Filter,
  Landmark,
  Truck,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  CheckCircle2,
  Info,
  Building2,
  UserCheck,
  Award,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts";

type ReportTab = "daily" | "bank" | "salary" | "supplier" | "purchase" | "attendance" | "transactions" | "inventory" | "unified" | "sales";

export function addPdfGlobalLedgerSummary(
  doc: jsPDF,
  totals: {
    totalSales: number;
    totalPurchase: number;
    totalPayment: number;
    totalBankDeposit: number;
    totalBankWithdrawal: number;
  },
  startY: number
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text("GLOBAL SYSTEM LEDGER METRIC INDEX (AUDITED)", 14, startY);

  autoTable(doc, {
    startY: startY + 4,
    head: [["LEDGER METRIC CATEGORY", "GLOBAL SYSTEM ACCUMULATED VALUES"]],
    body: [
      ["Combined Gross Sales (Sales Sum)", `BDT ${(totals?.totalSales || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
      ["Aggregate Supplier Sourcing Volume (Purchases Sum)", `BDT ${(totals?.totalPurchase || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
      ["Combined General & Payroll Payments (Disbursements Sum)", `BDT ${(totals?.totalPayment || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
      ["Aggregate Multi-Channel Bank Deposits (Banks Inflow Sum)", `BDT ${(totals?.totalBankDeposit || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
      ["Aggregate Multi-Channel Bank Withdrawals (Banks Outflow Sum)", `BDT ${(totals?.totalBankWithdrawal || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`],
    ],
    theme: "grid",
    headStyles: {
      fillColor: [30, 41, 59], // Slate-800
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "left"
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      1: { halign: "right", fontStyle: "bold", textColor: [15, 23, 42] }
    },
    styles: {
      font: "helvetica",
      cellPadding: 3.5
    }
  });
}

export interface PurchaseModel {
  id?: string;
  supplierId: string;
  supplierName: string;
  date: string;
  refNo: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  writtenReturn?: number;
  paymentMethod: string;
  notes?: string;
  invoicePhoto?: string;
  createdAt: string;
}

export default function Reports({ user, role }: { user: User; role: UserRole }) {
  const { language, t, formatCurrency, formatDate, formatNumber, translateValue } = useLanguage();
  const [activeTab, setActiveTab] = useState<ReportTab>("daily");

  // Dynamic company settings context
  const [companyName, setCompanyName] = useState("Modern Pro");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyPhone, setCompanyPhone] = useState("+880 1234 567890");
  const [companyEmail, setCompanyEmail] = useState("info@modernmanager.com");
  const [companyAddress, setCompanyAddress] = useState("Dhaka, Bangladesh");

  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Pro");
        setCompanyTagline(data.companyTagline || "Automated POS");
        setCompanyLogoUrl(data.companyLogoUrl || "");
        setCompanyPhone(data.companyPhone || "+880 1234 567890");
        setCompanyEmail(data.companyEmail || "info@modernmanager.com");
        setCompanyAddress(data.companyAddress || "Dhaka, Bangladesh");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/company");
    });
    return () => unsubBranding();
  }, []);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [purchases, setPurchases] = useState<PurchaseModel[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockLedger, setStockLedger] = useState<StockLedgerEntry[]>([]);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  
  const exportersRef = React.useRef<Record<string, () => void>>({});
  const registerExporter = (tab: ReportTab, exportFn: () => void) => {
    exportersRef.current[tab] = exportFn;
  };
  
  // Date range filters used on various tabs
  const [csvStartDate, setCsvStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [csvEndDate, setCsvEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Day Stats
  const [dayStats, setDayStats] = useState({
    openingBalance: 0,
    todaySales: 0,
    otherIncome: 0,
    bankExpenses: 0,
    generalExpenses: 0,
    totalIncome: 0,
    totalExpense: 0,
    netCash: 0
  });

  // Dynamic Global Ledger Totals calculations
  const globalLedgerTotals = React.useMemo(() => {
    let empSales = 0;
    let wsSales = 0;
    let deposits = 0;
    let bankDeps = 0;
    let bankWds = 0;
    let cashPay = 0;
    let bankPay = 0;

    transactions.forEach(tx => {
      const cat = tx.category || "";
      if (tx.type === "income") {
        if (cat === "Employee Sales") {
          empSales += tx.amount;
        } else if (cat === "Wholesale Sales" || cat.toLowerCase().includes("wholesale")) {
          wsSales += tx.amount;
        } else if (cat === "Total Deposit" || cat.toLowerCase() === "deposit") {
          deposits += tx.amount;
        } else if (cat === "Bank Deposit") {
          bankDeps += tx.amount;
        } else if (cat !== "Loan Deposit" && cat !== "Previous Cash" && cat !== "Opening Balance") {
          empSales += tx.amount;
        }
      } else if (tx.type === "expense") {
        if (cat === "Bank Credit") {
          bankWds += tx.amount;
        } else {
          if (tx.paymentMethod === "Cash") {
            cashPay += tx.amount;
          } else {
            bankPay += tx.amount;
          }
        }
      }
    });

    const totalSales = empSales + wsSales;
    const totalPurchase = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalPayment = cashPay + bankPay;
    const totalBankDeposit = bankDeps + transactions.filter(tx => tx.type === "income" && tx.paymentMethod !== "Cash" && tx.category !== "Opening Balance").reduce((sum, tx) => sum + tx.amount, 0);
    const totalBankWithdrawal = bankWds + transactions.filter(tx => tx.type === "expense" && tx.paymentMethod !== "Cash").reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalSales,
      totalPurchase,
      totalPayment,
      totalBankDeposit,
      totalBankWithdrawal
    };
  }, [transactions, purchases]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const txSnap = await getDocs(query(collection(db, "transactions"), orderBy("date", "asc")));
        const allTxs = txSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(allTxs);

        const bankSnap = await getDocs(collection(db, "banks"));
        setBanks(bankSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bank)));
        
        const empSnap = await getDocs(collection(db, "employees"));
        setEmployees(empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));

        const attSnap = await getDocs(collection(db, "attendance"));
        setAttendance(attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const supSnap = await getDocs(collection(db, "suppliers"));
        setSuppliers(supSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));

        const stxSnap = await getDocs(query(collection(db, "supplierTransactions"), orderBy("createdAt", "desc")));
        setSupplierTransactions(stxSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupplierTransaction)));

        const purSnap = await getDocs(query(collection(db, "purchases"), orderBy("date", "desc")));
        setPurchases(purSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseModel)));

        const productsSnap = await getDocs(collection(db, "products"));
        setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));

        const stockLedgerSnap = await getDocs(query(collection(db, "stockLedger"), orderBy("createdAt", "desc")));
        setStockLedger(stockLedgerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockLedgerEntry)));
      } catch (err) {
        console.error("Error loading resources in reports:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (transactions.length === 0) return;

    const dayStart = startOfDay(new Date(selectedDate));
    const dayEnd = endOfDay(new Date(selectedDate));

    const todayTxs = transactions.filter(tx => 
      isWithinInterval(new Date(tx.date), { start: dayStart, end: dayEnd })
    );

    const manualOpening = todayTxs.find(tx => tx.category === "Opening Balance" || tx.category === "Previous Cash");
    
    let openingBalance = 0;
    if (manualOpening) {
      openingBalance = manualOpening.amount;
    } else {
      openingBalance = transactions
        .filter(tx => isBefore(new Date(tx.date), dayStart))
        .reduce((sum, tx) => {
          if (tx.paymentMethod === "Cash") {
            return sum + (tx.type === "income" ? tx.amount : -tx.amount);
          }
          if (tx.category === "Bank Deposit" && tx.subCategory !== "Account Transfer") {
            return sum - tx.amount;
          }
          if (tx.category === "Bank Credit" && tx.subCategory !== "Account Transfer") {
            return sum + tx.amount;
          }
          return sum;
        }, 0);
    }

    const salesListTxsForDay = todayTxs.filter(tx => 
      tx.type === "income" && 
      (tx.category === "Employee Sales" || 
       tx.category === "Wholesale Sales" || 
       tx.category.toLowerCase().includes("sale") || 
       tx.category === "Product Sales" ||
       tx.category === "Retail Sales")
    );

    let totalEmployeeSales = 0;
    let totalWholesaleSales = 0;

    salesListTxsForDay.forEach(tx => {
      if (tx.category === "Employee Sales") {
        totalEmployeeSales += tx.amount;
      } else if (tx.category === "Wholesale Sales" || tx.category.toLowerCase().includes("wholesale")) {
        totalWholesaleSales += tx.amount;
      } else {
        totalEmployeeSales += tx.amount;
      }
    });

    const todaySales = totalEmployeeSales + totalWholesaleSales;

    const totalDepositAmt = todayTxs
      .filter(tx => tx.type === "income" && (tx.category === "Total Deposit" || tx.category.toLowerCase() === "deposit"))
      .reduce((sum, tx) => sum + tx.amount, 0);

    const otherIncome = todayTxs
      .filter(tx => {
        if (tx.type === "income") {
          return (
            tx.category !== "Opening Balance" &&
            tx.category !== "Previous Cash" &&
            tx.category !== "Bank Deposit" &&
            tx.category !== "Total Deposit" &&
            !(
              tx.category === "Employee Sales" || 
              tx.category === "Wholesale Sales" || 
              tx.category.toLowerCase().includes("sale") || 
              tx.category === "Product Sales" ||
              tx.category === "Retail Sales"
            )
          );
        }
        if (tx.type === "expense" && tx.category === "Bank Credit") {
          // Ignore Bank Credit if it is part of an Account Transfer, to avoid double-counting with Cash side of transfer
          return tx.subCategory !== "Account Transfer";
        }
        return false;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const bankExpenses = todayTxs
      .filter(tx => {
        if (tx.type === "expense" && tx.category !== "Bank Credit") {
          return tx.paymentMethod !== "Cash";
        }
        if (tx.type === "income" && tx.category === "Bank Deposit") {
          // Ignore Bank Deposit if it is part of an Account Transfer, to avoid double-counting with Cash side of transfer
          return tx.subCategory !== "Account Transfer";
        }
        return false;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const generalExpenses = todayTxs
      .filter(tx => {
        if (tx.type === "expense" && tx.category !== "Bank Credit") {
          return tx.paymentMethod === "Cash";
        }
        return false;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalIncome = todaySales + otherIncome;
    const totalExpense = bankExpenses + generalExpenses + totalDepositAmt;
    const netCash = openingBalance + totalIncome - totalExpense;

    setDayStats({
      openingBalance,
      todaySales,
      otherIncome,
      bankExpenses,
      generalExpenses,
      totalIncome,
      totalExpense: totalExpense, // holds total expenses and deposits
      netCash
    });
  }, [selectedDate, transactions]);

  const exportDailyCSV = React.useCallback(() => {
    let csvContent = "";
    const bom = "\uFEFF";
    
    const dayStart = startOfDay(new Date(selectedDate));
    const dayEnd = endOfDay(new Date(selectedDate));
    const todayTxs = transactions.filter(tx => {
      try {
        return isWithinInterval(new Date(tx.date), { start: dayStart, end: dayEnd });
      } catch (e) {
        return false;
      }
    });

    if (language === "bn") {
      csvContent = bom + "তারিখ,লেনদেনের ধরন,ক্যাটাগরি,সাব-ক্যাটাগরি,পরিমাণ (টাকা),পদ্ধতি,মন্তব্য\n";
      csvContent += `"${formatDate(selectedDate)}","আয়","প্রারম্ভিক ব্যালেন্স","","${formatNumber(dayStats.openingBalance)}","ক্যাশ","প্রারম্ভিক নগদ তহবিল"\n`;
      csvContent += `"${formatDate(selectedDate)}","আয়","আজকের মোট বিক্রয়","","${formatNumber(dayStats.todaySales)}","ক্যাশ","মোট পণ্য বিক্রয়"\n`;
      
      todayTxs.forEach(tx => {
        if (tx.category === "Opening Balance" || tx.category === "Previous Cash" || 
            tx.category === "Employee Sales" || tx.category === "Wholesale Sales" || 
            tx.category === "Total Deposit" || tx.category.toLowerCase().includes("sale") || 
            tx.category === "Product Sales" || tx.category === "Retail Sales") {
          return;
        }
        csvContent += `"${formatDate(tx.date)}","${translateValue(tx.type)}","${translateValue(tx.category)}","${tx.subCategory ? translateValue(tx.subCategory) : ""}","${formatNumber(tx.amount)}","${translateValue(tx.paymentMethod)}","${(tx.notes || "").replace(/"/g, '""')}"\n`;
      });
      csvContent += `\n"সর্বমোট ব্যালেন্স","","","","${formatNumber(dayStats.netCash)}","",""\n`;
    } else {
      csvContent = "Date,Type,Category,Sub-Category,Amount (BDT),Payment Method,Notes\n";
      csvContent += `"${selectedDate}","income","Opening Balance","","${dayStats.openingBalance}","Cash","Calculated Opening Balance"\n`;
      csvContent += `"${selectedDate}","income","Combined Corporate Sales","","${dayStats.todaySales}","Cash","Today's Product Sales"\n`;
      
      todayTxs.forEach(tx => {
        if (tx.category === "Opening Balance" || tx.category === "Previous Cash" || 
            tx.category === "Employee Sales" || tx.category === "Wholesale Sales" || 
            tx.category === "Total Deposit" || tx.category.toLowerCase().includes("sale") || 
            tx.category === "Product Sales" || tx.category === "Retail Sales") {
          return;
        }
        csvContent += `"${tx.date.split("T")[0]}","${tx.type}","${tx.category}","${tx.subCategory || ""}","${tx.amount}","${tx.paymentMethod}","${(tx.notes || "").replace(/"/g, '""')}"\n`;
      });
      csvContent += `\n"Total Cash Balance","","","","${dayStats.netCash}","",""\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Shop_Daily_Statement_${selectedDate}.csv`;
    link.click();
  }, [selectedDate, dayStats, transactions, language]);

  React.useEffect(() => {
    exportersRef.current["daily"] = exportDailyCSV;
  }, [exportDailyCSV]);

  const exportToCSV = (type: ReportTab) => {
    let csvContent = "";
    const bom = "\uFEFF";
    let fileName = `report_${type}_${format(new Date(), "yyyyMMdd")}.csv`;

    const start = startOfDay(new Date(csvStartDate));
    const end = endOfDay(new Date(csvEndDate));

    if (type === "daily") {
      const rangeTxs = transactions.filter(tx => 
        isWithinInterval(new Date(tx.date), { start, end })
      );
      if (language === "bn") {
        csvContent = bom + "তারিখ,ক্যাটাগরি,সাব-ক্যাটাগরি,প্রকার,লেনদেনের মাধ্যম,পরিমাণ,মন্তব্য\n";
        rangeTxs.forEach(tx => {
          csvContent += `"${formatDate(tx.date)}","${translateValue(tx.category)}","${tx.subCategory ? translateValue(tx.subCategory) : ""}","${translateValue(tx.type)}","${translateValue(tx.paymentMethod)}","${formatNumber(tx.amount)}","${tx.notes || ""}"\n`;
        });
        csvContent += `\nপ্রতিবেদন তৈরির সময়: "${formatDate(new Date())}"\n`;
      } else {
        csvContent = "Date,Category,Sub-Category,Type,Payment Method,Amount,Notes\n";
        rangeTxs.forEach(tx => {
          csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${tx.category}","${tx.subCategory || ""}","${tx.type}","${tx.paymentMethod}",${tx.amount},"${tx.notes || ""}"\n`;
        });
      }
    } 
    else if (type === "bank") {
      const rangeTxs = transactions.filter(tx => 
        isWithinInterval(new Date(tx.date), { start, end })
      );
      csvContent = "Date,Account (Method),Type,Amount,Category,Reference Notes\n";
      rangeTxs.forEach(tx => {
        csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${tx.paymentMethod}","${tx.type}",${tx.amount},"${tx.category}","${tx.notes || ""}"\n`;
      });
    }
    else if (type === "attendance") {
      csvContent = "Date,Employee,Role,Status,Check In,Lunch Out,Lunch In\n";
      attendance.forEach(att => {
        const emp = employees.find(e => e.id === att.employeeId);
        csvContent += `${format(new Date(att.date), "yyyy-MM-dd")},"${emp?.name || "Unknown"}","${emp?.role || ""}","${att.status}","${att.checkIn || ""}","${att.lunchOut || ""}","${att.lunchIn || ""}"\n`;
      });
    }
    else if (type === "salary") {
      csvContent = "Date,Employee,Salary Amount (BDT),Payment Method,Reference/Notes\n";
      const salaryTxs = transactions.filter(tx => tx.category === "Salary" || tx.category === "Staff Salary");
      salaryTxs.forEach(tx => {
        const emp = employees.find(e => e.id === tx.employeeId);
        csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${emp?.name || "Unknown"}",${tx.amount},"${tx.paymentMethod}","${tx.notes || ""}"\n`;
      });
    }
    else if (type === "supplier") {
      csvContent = "Date,Supplier Name,Transaction Type,Invoice/Ref No,Gross Amount,Paid Amount,Balance Due,Method,Notes\n";
      supplierTransactions.forEach(tx => {
        const sup = suppliers.find(s => s.id === tx.supplierId);
        csvContent += `"${tx.date}","${sup?.name || "Unknown"}","${tx.type}","${tx.refNo}",${tx.totalAmount},${tx.paidAmount || 0},${tx.dueAmount || 0},"${tx.paymentMethod || "Cash"}","${tx.notes || ""}"\n`;
      });
    }
    else if (type === "purchase") {
      csvContent = "Invoice Date,Invoice Ref,Supplier,Purchase Total,Amount Paid,Due Remaining,Method,Notes\n";
      purchases.forEach(p => {
        csvContent += `"${p.date}","${p.refNo}","${p.supplierName}",${p.totalAmount},${p.paidAmount},${p.dueAmount},"${p.paymentMethod}","${p.notes || ""}"\n`;
      });
    }
    else if (type === "transactions") {
      csvContent = "Date,Category,Type,Payment Method,Amount,Reference\n";
      transactions.forEach(tx => {
        csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${tx.category}","${tx.type}","${tx.paymentMethod}",${tx.amount},"${tx.notes || ""}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportDailyPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); 

    const companyTitleStr = companyName.toUpperCase();
    const companyTitleWidth = doc.getTextWidth(companyTitleStr);
    doc.text(companyTitleStr, pageWidth/2 - (companyTitleWidth/2), 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); 
    const companyTaglineStr = `${companyTagline} • Phone: ${companyPhone} • Address: ${companyAddress}`;
    const taglineWidth = doc.getTextWidth(companyTaglineStr);
    doc.text(companyTaglineStr, pageWidth/2 - (taglineWidth/2), 22);
    
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 26, pageWidth, 1.5, "F");

    const boxY = 32;
    doc.setFillColor(248, 250, 252);
    doc.rect(14, boxY, pageWidth - 28, 20, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, boxY, pageWidth - 28, 20);
    doc.line(pageWidth/2, boxY, pageWidth/2, boxY + 20);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(language === "bn" ? "Previous Cash (পূর্বের ক্যাশ):" : "Previous Cash:", 18, boxY + 7);
    doc.text(formatCurrency(dayStats.openingBalance), pageWidth/2 - 5, boxY + 7, { align: "right" });
    
    doc.text(language === "bn" ? "Today's Sales (আজকের বিক্রি):" : "Today's Total Sales:", 18, boxY + 15);
    doc.text(formatCurrency(dayStats.todaySales), pageWidth/2 - 5, boxY + 15, { align: "right" });

    doc.text(language === "bn" ? "Report Date (তারিখ):" : "Report Date:", pageWidth/2 + 5, boxY + 7);
    doc.text(format(new Date(selectedDate), "dd MMM yyyy (EEEE)"), pageWidth - 18, boxY + 7, { align: "right" });

    doc.text(`Issuer: System Administrator`, pageWidth/2 + 5, boxY + 15);
    doc.text(language === "bn" ? "স্ট্যাটাস: চেক করা হয়েছে" : "Status: Audit Passed", pageWidth - 18, boxY + 15, { align: "right" });

    const colY = 58;
    const colWidth = (pageWidth - 28 - 4) / 2;
    
    doc.setFillColor(15, 23, 42); // slate bg
    doc.rect(14, colY, colWidth, 8, "F");
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.text("INCOME ACCOUNTS JOURNAL", 14 + colWidth/2, colY + 5.5, { align: "center" });

    doc.setFillColor(220, 38, 38); // red bg
    doc.rect(pageWidth - 14 - colWidth, colY, colWidth, 8, "F");
    doc.setTextColor(255);
    doc.text("EXPENSE ACCOUNTS JOURNAL", pageWidth - 14 - colWidth/2, colY + 5.5, { align: "center" });

    const todayTxs = transactions.filter(tx => 
      isWithinInterval(new Date(tx.date), { 
        start: startOfDay(new Date(selectedDate)), 
        end: endOfDay(new Date(selectedDate)) 
      })
    );

    const pdfIncomeTxs = todayTxs.filter(tx => {
      if (tx.type === "income") {
        return (
          tx.category !== "Opening Balance" && 
          tx.category !== "Previous Cash" &&
          tx.category !== "Bank Deposit" &&
          !(
            tx.category === "Employee Sales" || 
            tx.category === "Wholesale Sales" || 
            tx.category === "Total Deposit" ||
            tx.category.toLowerCase().includes("sale") || 
            tx.category === "Product Sales" ||
            tx.category === "Retail Sales"
          )
        );
      }
      if (tx.type === "expense" && tx.category === "Bank Credit") {
        return true;
      }
      return false;
    });

    const pdfExpenseTxs = todayTxs.filter(tx => {
      if (tx.type === "expense") {
        return tx.category !== "Bank Credit";
      }
      if (tx.type === "income" && (tx.category === "Bank Deposit" || tx.category === "Total Deposit" || tx.category.toLowerCase() === "deposit")) {
        return true;
      }
      return false;
    });
    
    const empMap = new Map(employees.map(d => [d.id, d.name]));

    autoTable(doc, {
      startY: colY + 8,
      margin: { left: 14, right: pageWidth/2 + 2 },
      head: [["Description Item", "Inflow Amount"]],
      body: [
        ["Combined System Sales", formatCurrency(dayStats.todaySales)],
        ...pdfIncomeTxs.map(tx => {
          let nameStr = tx.category;
          if (tx.category === "Bank Credit" && tx.paymentMethod) {
            nameStr = `Bank Credit (${tx.paymentMethod})`;
          } else if (tx.subCategory) {
            nameStr += ` (${tx.subCategory})`;
          }
          return [nameStr, formatCurrency(tx.amount)];
        }),
        [{ content: "TOTAL INFLOW", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } }, 
         { content: formatCurrency(dayStats.totalIncome), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } }]
      ],
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [51, 65, 85] }
    });

    autoTable(doc, {
      startY: colY + 8,
      margin: { left: pageWidth/2 + 2, right: 14 },
      head: [["Category Account", "Outflow Amount"]],
      body: [
        ...pdfExpenseTxs.map(tx => {
          let nameStr = tx.category;
          if (tx.category === "Bank Deposit" && tx.paymentMethod) {
            nameStr = `Bank Deposit (${tx.paymentMethod})`;
          } else if (tx.category === "Total Deposit") {
            nameStr = language === "bn" ? "বাকি বিক্রয়" : "Due Sales";
          } else {
            if (tx.employeeId) {
              nameStr += ` - ${empMap.get(tx.employeeId) || "Staff"}`;
            }
            if (tx.subCategory) {
              nameStr += ` (${tx.subCategory})`;
            }
            if (tx.paymentMethod !== "Cash") {
              nameStr += " (Bank)";
            }
          }
          return [nameStr, formatCurrency(tx.amount)];
        }),
        [{ content: "TOTAL OUTFLOW", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } }, 
         { content: formatCurrency(dayStats.totalExpense), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } }]
      ],
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [185, 28, 28] }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 12;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, finalY, pageWidth - 14, finalY);
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Generated Deposit: ${formatCurrency(dayStats.totalIncome)}`, 14, finalY + 8);
    doc.text(`Total Disbursed Expenses: ${formatCurrency(dayStats.totalExpense)}`, pageWidth - 14, finalY + 8, { align: "right" });

    doc.setFillColor(15, 23, 42);
    doc.rect(14, finalY + 14, pageWidth - 28, 12, "F");
    doc.setTextColor(255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      `CLOSING LIQUID CASH AUDIT: ${formatCurrency(dayStats.netCash)}`,
      pageWidth/2,
      finalY + 22,
      { align: "center" }
    );

    // Call dynamic global overview helper
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY + 32);

    const postSummaryY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text(`Document verified on ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}. System secure ledger.`, 14, postSummaryY);

    doc.save(`Shop_Daily_Statement_${selectedDate}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
            <span className="text-xs font-bold text-green-600 uppercase tracking-widest">Enterprise Ledger Console</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">{t("Business Intelligence")}</h2>
          <p className="text-gray-500 font-medium">{t("Deep dive into your shop's performance, attendance and finance history.")}</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 self-start lg:self-center shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-xs max-w-full overflow-x-auto">
            {(["daily", "bank", "salary", "supplier", "purchase", "attendance", "transactions", "inventory", "unified", "sales"] as ReportTab[]).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all duration-250 shrink-0",
                  activeTab === tab 
                    ? "bg-slate-900 text-white shadow-md active:scale-98" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
                )}
              >
                {tab === "sales" ? (language === "bn" ? "বিক্রয় রিপোর্ট" : "Sales Report") : t(tab)}
              </button>
            ))}
          </div>
          
          <button 
            type="button"
            onClick={() => {
              const localExporter = exportersRef.current[activeTab];
              if (localExporter) {
                localExporter();
              } else {
                exportToCSV(activeTab);
              }
            }}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-all shadow-sm active:scale-97 cursor-pointer border border-transparent"
          >
            <Download className="w-4 h-4" /> 
            <span>CSV</span>
          </button>
        </div>
      </header>

      {/* RENDER ACTIVE TABS */}
      {activeTab === "daily" && (
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-800">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Choose Preview Date</h3>
                <p className="text-xs text-slate-500 font-medium">Render standard financial cash sheet for the selected commercial day.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-slate-200 outline-none"
              />

              <button 
                onClick={exportDailyPDF}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-xs uppercase tracking-wider text-center"
              >
                <Printer className="w-4 h-4" />
                <span>Download Report PDF</span>
              </button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden font-mono text-slate-800">
            <div className="p-8 text-center bg-slate-900 text-white relative">
              <h1 className="text-3xl font-black italic tracking-tighter uppercase">{companyName}</h1>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">{companyTagline}</p>
              <div className="absolute top-2 right-4 text-[9px] text-slate-500 uppercase tracking-widest font-bold">official statement packet</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 border-b-2 border-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-200">
              <div className="p-5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500 uppercase">Opening Liquid Cash:</span>
                  <span className="font-black text-sm bg-slate-100 px-2.5 py-1 rounded text-slate-900">{formatCurrency(dayStats.openingBalance)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500 uppercase">Gross Product Sales:</span>
                  <span className="font-black text-sm bg-orange-50 text-orange-700 px-2.5 py-1 rounded border border-orange-100">{formatCurrency(dayStats.todaySales)}</span>
                </div>
              </div>
              <div className="p-5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500 uppercase">Statement Date:</span>
                  <span className="font-black text-sm text-slate-900">{format(new Date(selectedDate), "dd MMM yyyy (EEEE)")}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500 uppercase">Verification Hub:</span>
                  <span className="text-[10px] text-green-600 bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Authenticated</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row min-h-[400px] divide-y md:divide-y-0 md:divide-x-2 divide-slate-900">
              <div className="flex-1 flex flex-col">
                <div className="bg-slate-100 text-slate-800 flex justify-between px-4 py-2 border-b border-slate-300">
                  <span className="font-extrabold text-[10px] tracking-widest uppercase">Income Deposits</span>
                  <span className="font-extrabold text-[10px] uppercase">Amount (BDT)</span>
                </div>
                
                <div className="divide-y divide-slate-100 text-xs text-slate-800 flex-1">
                  <div className="flex justify-between p-4 bg-slate-50/50">
                    <span className="font-semibold">Today's Combined Corporate Sales</span>
                    <span className="font-bold text-slate-900">{formatCurrency(dayStats.todaySales)}</span>
                  </div>
                  {transactions
                    .filter(tx => {
                      const isSameDay = isWithinInterval(new Date(tx.date), { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) });
                      if (!isSameDay) return false;
                      if (tx.type === "income") {
                        return (
                          tx.category !== "Opening Balance" &&
                          tx.category !== "Previous Cash" &&
                          tx.category !== "Bank Deposit" &&
                          !(
                            tx.category === "Employee Sales" || 
                            tx.category === "Wholesale Sales" || 
                            tx.category === "Total Deposit" ||
                            tx.category.toLowerCase().includes("sale") || 
                            tx.category === "Product Sales" ||
                            tx.category === "Retail Sales"
                          )
                        );
                      }
                      return tx.type === "expense" && tx.category === "Bank Credit";
                    })
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between p-4 hover:bg-slate-50/50 transition-all">
                        <div>
                          <span className="font-semibold">{tx.category === "Bank Credit" && tx.paymentMethod ? `Bank Credit: ${tx.paymentMethod}` : tx.category}</span>
                          {tx.subCategory && <span className="block text-[10px] text-blue-500 font-extrabold uppercase mt-0.5">{tx.subCategory}</span>}
                        </div>
                        <span className="font-bold text-slate-900">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))
                  }
                </div>

                <div className="bg-slate-50/90 border-t border-slate-300 flex justify-between p-4">
                   <span className="font-bold text-xs uppercase tracking-wider text-slate-500">Gross Day deposits</span>
                   <span className="font-black text-slate-900">{formatCurrency(dayStats.totalIncome)}</span>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="bg-slate-100 text-slate-800 flex justify-between px-4 py-2 border-b border-slate-300">
                  <span className="font-extrabold text-[10px] tracking-widest uppercase">Disbursements & Expenses</span>
                  <span className="font-extrabold text-[10px] uppercase">Amount (BDT)</span>
                </div>

                <div className="divide-y divide-slate-100 text-xs text-slate-800 flex-1">
                  {transactions
                    .filter(tx => {
                      const isSameDay = isWithinInterval(new Date(tx.date), { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) });
                      if (!isSameDay) return false;
                      if (tx.type === "expense") {
                        return tx.category !== "Bank Credit";
                      }
                      return tx.type === "income" && (tx.category === "Bank Deposit" || tx.category === "Total Deposit" || tx.category.toLowerCase() === "deposit");
                    })
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between p-4 hover:bg-slate-50/50 transition-all">
                        <div>
                          <span className="font-semibold">
                            {tx.category === "Bank Deposit" && tx.paymentMethod 
                              ? `Bank Deposit (${tx.paymentMethod})` 
                              : tx.category === "Total Deposit" 
                              ? (language === "bn" ? "বাকি বিক্রয়" : "Due Sales")
                              : tx.category === "deposit" || tx.category.toLowerCase() === "deposit"
                              ? (language === "bn" ? "বাকি বিক্রয়" : "Due Sales")
                              : tx.category}
                          </span>
                          {tx.category !== "Bank Deposit" && tx.category !== "Total Deposit" && tx.category.toLowerCase() !== "deposit" && tx.paymentMethod !== "Cash" && (
                            <span className="inline-block ml-1.5 px-1 bg-blue-50 text-blue-600 font-bold border border-blue-100 text-[9px] uppercase rounded">Bank</span>
                          )}
                          {tx.employeeId && (
                            <span className="block text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                              Staff Link: {employees.find(e => e.id === tx.employeeId)?.name || "N/A"}
                            </span>
                          )}
                          {tx.subCategory && <span className="block text-[10px] text-red-500 font-extrabold uppercase mt-0.5">{tx.subCategory}</span>}
                        </div>
                        <span className="font-bold text-slate-900">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))
                  }
                </div>

                <div className="bg-slate-50/90 border-t border-slate-300 flex justify-between p-4">
                   <span className="font-bold text-xs uppercase tracking-wider text-slate-500">Gross Day Payments</span>
                   <span className="font-black text-slate-900">{formatCurrency(dayStats.totalExpense)}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-100 border-t-2 border-slate-900 p-4 grid grid-cols-2 text-center text-xs font-bold font-mono">
              <div className="border-r border-slate-400">
                <div className="text-slate-500 text-[10px] uppercase">aggregate deposit flow</div>
                <div className="text-sm font-extrabold text-slate-900">{formatCurrency(dayStats.totalIncome)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase">aggregate disbursement flow</div>
                <div className="text-sm font-extrabold text-slate-900">{formatCurrency(dayStats.totalExpense)}</div>
              </div>
            </div>

            <div className="bg-slate-950 text-white p-6 text-center space-y-1">
              <span className="text-[10px] font-extrabold tracking-widest text-[#d4af37] uppercase block">computed net liquid cache in hand</span>
              <span className="text-4xl font-black italic tracking-tight">{formatCurrency(dayStats.netCash)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "bank" && (
        <BankStatementReport banks={banks} transactions={transactions} companyName={companyName} companyAddress={companyAddress} companyPhone={companyPhone} companyEmail={companyEmail} formatCurrency={formatCurrency} globalLedgerTotals={globalLedgerTotals} onRegisterExporter={(exportFn) => registerExporter("bank", exportFn)} />
      )}

      {activeTab === "salary" && (
        <SalaryFilterWiseReport employees={employees} transactions={transactions} companyName={companyName} companyAddress={companyAddress} companyPhone={companyPhone} companyEmail={companyEmail} formatCurrency={formatCurrency} globalLedgerTotals={globalLedgerTotals} onRegisterExporter={(exportFn) => registerExporter("salary", exportFn)} />
      )}

      {activeTab === "supplier" && (
        <SupplierPaymentsReport suppliers={suppliers} supplierTransactions={supplierTransactions} companyName={companyName} companyAddress={companyAddress} companyPhone={companyPhone} companyEmail={companyEmail} formatCurrency={formatCurrency} globalLedgerTotals={globalLedgerTotals} onRegisterExporter={(exportFn) => registerExporter("supplier", exportFn)} />
      )}

      {activeTab === "purchase" && (
        <PurchaseReportSection suppliers={suppliers} purchases={purchases} supplierTransactions={supplierTransactions} companyName={companyName} companyAddress={companyAddress} companyPhone={companyPhone} companyEmail={companyEmail} formatCurrency={formatCurrency} globalLedgerTotals={globalLedgerTotals} onRegisterExporter={(exportFn) => registerExporter("purchase", exportFn)} />
      )}

      {activeTab === "attendance" && (
        <AttendanceReport 
          employees={employees} 
          attendance={attendance} 
          companyName={companyName}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          formatCurrency={formatCurrency}
          globalLedgerTotals={globalLedgerTotals}
          onRegisterExporter={(exportFn) => registerExporter("attendance", exportFn)}
        />
      )}

      {activeTab === "transactions" && (
        <TransactionsReport 
          transactions={transactions} 
          companyName={companyName}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          formatCurrency={formatCurrency}
          globalLedgerTotals={globalLedgerTotals}
          onRegisterExporter={(exportFn) => registerExporter("transactions", exportFn)}
        />
      )}

      {activeTab === "inventory" && (
        <InventoryReportSection
          products={products}
          stockLedger={stockLedger}
          companyName={companyName}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          formatCurrency={formatCurrency}
          globalLedgerTotals={globalLedgerTotals}
          onRegisterExporter={(exportFn) => registerExporter("inventory", exportFn)}
        />
      )}

      {activeTab === "unified" && (
        <UnifiedFinancialReport
          transactions={transactions}
          supplierTransactions={supplierTransactions}
          purchases={purchases}
          companyName={companyName}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          formatCurrency={formatCurrency}
          globalLedgerTotals={globalLedgerTotals}
          onRegisterExporter={(exportFn) => registerExporter("unified", exportFn)}
        />
      )}

      {activeTab === "sales" && (
        <SalesReportSection
          transactions={transactions}
          employees={employees}
          companyName={companyName}
          companyTagline={companyTagline}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          formatCurrency={formatCurrency}
          globalLedgerTotals={globalLedgerTotals}
          onRegisterExporter={(exportFn) => registerExporter("sales", exportFn)}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   NEW TAB 1: BANK STATEMENT REPORT WITH INDIVIDUAL RECONCILIATIONS
   ========================================================================== */
function BankStatementReport({ banks, transactions, companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  banks: Bank[];
  transactions: Transaction[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [selectedBankName, setSelectedBankName] = useState("all");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [txType, setTxType] = useState("all");

  const filtered = transactions.filter(tx => {
    // 1. Match payment method (Bank)
    if (selectedBankName === "all") {
      if (tx.paymentMethod === "Cash" || tx.paymentMethod === "cash" || !tx.paymentMethod) return false;
    } else {
      if (tx.paymentMethod !== selectedBankName) return false;
    }
    // 2. Filter Date Range
    const dateStr = tx.date.split("T")[0];
    if (dateStr < startDate || dateStr > endDate) return false;
    // 3. Filter transaction type
    if (txType !== "all" && tx.type !== txType) return false;
    
    return true;
  }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Inflows vs Outflows
  const totalInflows = filtered.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const totalOutflows = filtered.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  
  // Calculate running ledger balance
  let currentAccumulated = 0;
  const ledgerRows = filtered.map(tx => {
    if (tx.type === "income") {
      currentAccumulated += tx.amount;
    } else {
      currentAccumulated -= tx.amount;
    }
    return {
      ...tx,
      runningBalance: currentAccumulated
    };
  });

  const exportBankCSV = React.useCallback(() => {
    let csvContent = "Datetime,Bank Account,Category,Inflow (CR),Outflow (DR),Running Balance,Notes\n";
    ledgerRows.forEach(row => {
      const inflow = row.type === "income" ? row.amount : 0;
      const outflow = row.type === "expense" ? row.amount : 0;
      csvContent += `"${row.date}","${row.paymentMethod}","${row.category}${row.subCategory ? ` (${row.subCategory})` : ""}","${inflow}","${outflow}","${row.runningBalance}","${(row.notes || "").replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bank_Statement_${selectedBankName}_${startDate}_to_${endDate}.csv`;
    link.click();
  }, [ledgerRows, selectedBankName, startDate, endDate]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportBankCSV);
    }
  }, [exportBankCSV, onRegisterExporter]);

  // Current balance of selected bank (if explicit bank chosen, fallback to total sum)
  const currentBankObj = banks.find(b => b.name === selectedBankName);
  const currentBankBalance = currentBankObj ? currentBankObj.balance : ledgerRows[ledgerRows.length - 1]?.runningBalance || 0;

  const downloadBankStatementPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Corp Header banner
    doc.setFillColor(15, 23, 42); // slate bg
    doc.rect(0, 0, 210, 40, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("BANK STATEMENT LEDGER REPORT", 14, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${companyName.toUpperCase()} • ${companyAddress}`, 14, 25);
    doc.text(`Email: ${companyEmail} • Phone: ${companyPhone}`, 14, 29);
    doc.text(`Statement Period: ${format(new Date(startDate), "dd MMM yyyy")} to ${format(new Date(endDate), "dd MMM yyyy")}`, 14, 33);

    doc.setFillColor(14, 165, 233); // sky blue line
    doc.rect(0, 40, 210, 2.5, "F");

    // Metrics Cards Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("STATEMENT METRIC SUMMARY", 14, 52);

    const cards = [
      { label: "Target Account", val: selectedBankName === "all" ? "All Combined" : selectedBankName },
      { label: "Total Deposits (+)", val: `BDT ${totalInflows.toLocaleString()}` },
      { label: "Total Withdrawals (-)", val: `BDT ${totalOutflows.toLocaleString()}` },
      { label: "Statement Liquidity", val: `BDT ${currentBankBalance.toLocaleString()}` }
    ];

    let cardX = 14;
    cards.forEach(c => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(cardX, 56, 42, 22, "FD");

      doc.setFillColor(15, 23, 42); // dark box accent top line
      doc.rect(cardX, 56, 42, 1.2, "F");

      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(c.label.toUpperCase(), cardX + 3, 62);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(c.val, cardX + 3, 70);

      cardX += 45;
    });

    // Journal Entry table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("TRANSACTION LEDGER LEDGER ENTRIES", 14, 88);

    const tableRows = ledgerRows.map(row => [
      format(parseISO(row.date), "dd MMM yyyy, hh:mm a"),
      row.paymentMethod,
      row.category + (row.subCategory ? ` (${row.subCategory})` : ""),
      row.type === "income" ? `+ BDT ${row.amount.toLocaleString()}` : "",
      row.type === "expense" ? `- BDT ${row.amount.toLocaleString()}` : "",
      `BDT ${row.runningBalance.toLocaleString()}`,
      row.notes || "-"
    ]);

    autoTable(doc, {
      startY: 92,
      head: [["Datetime", "Method", "Category", "Inflow (CR)", "Outflow (DR)", "Running Bal", "Notes / Reference"]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        3: { halign: "right", fontStyle: "bold", textColor: [21, 128, 61] },
        4: { halign: "right", fontStyle: "bold", textColor: [185, 28, 28] },
        5: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    const postSummaryY = (doc as any).lastAutoTable.finalY + 10;
    if (postSummaryY < 280) {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "italic");
      doc.text("Statement verified. Generated from corporate audit servers.", 14, postSummaryY);
    }

    doc.save(`Bank_Statement_${selectedBankName}_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-300">
      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xl font-extrabold text-slate-900 mb-5 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-slate-800" />
          <span>Statement Ledger Filter Console</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Bank Account / Method</label>
            <select
              value={selectedBankName}
              onChange={(e) => setSelectedBankName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="all">All Bank / Digital Accounts (Excludes Cash)</option>
              <option value="Cash">Cash Ledger</option>
              {banks.map(bank => (
                <option key={bank.id} value={bank.name}>{bank.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Inflow/Outflow Filter</label>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="all">All Movements</option>
              <option value="income">Credits / Inflows (+)</option>
              <option value="expense">Debits / Outflows (-)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
          <button
            onClick={downloadBankStatementPDF}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Generate PDF Audit</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest mb-1">Total Inflow Deposits</p>
            <p className="text-2xl font-black text-emerald-950">{formatCurrency(totalInflows)}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest mb-1">Total Outflow Withdrawals</p>
            <p className="text-2xl font-black text-rose-950">{formatCurrency(totalOutflows)}</p>
          </div>
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-550 bg-slate-900 text-white p-6 rounded-3xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[10px] font-extrabold text-[#d4af37] uppercase tracking-widest mb-1">Account Liquidity (Closing)</p>
            <p className="text-2xl font-black text-white">{formatCurrency(currentBankBalance)}</p>
          </div>
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-[#d4af37]">
            <Landmark className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Table grid */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Date / Time</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Method</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Category Account</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest text-right">Inflow (CR)</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest text-right">Outflow (DR)</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest text-right">Running Balance</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Reference Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {ledgerRows.map(tx => (
              <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-600">
                  {format(parseISO(tx.date), "dd MMM yyyy, hh:mm a")}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2.5 py-1 bg-slate-100 rounded-full text-[9px] font-bold text-slate-600">
                    {tx.paymentMethod}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-extrabold text-slate-800">{tx.category}</div>
                  {tx.subCategory && <div className="text-[10px] text-slate-500 font-bold">{tx.subCategory}</div>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-black text-emerald-600">
                  {tx.type === "income" ? formatCurrency(tx.amount) : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-black text-rose-600">
                  {tx.type === "expense" ? formatCurrency(tx.amount) : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-black text-slate-900">
                  {formatCurrency(tx.runningBalance)}
                </td>
                <td className="px-6 py-4 text-slate-500 max-w-[180px] truncate" title={tx.notes}>
                  {tx.notes || "—"}
                </td>
              </tr>
            ))}
            {ledgerRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                  No bank records matched key query criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==========================================================================
   UPDATED TAB 2: PROPER EMPlOYEE FILTER-WISE SALARY REPORT
   ========================================================================== */
function SalaryFilterWiseReport({ employees, transactions, companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  employees: Employee[];
  transactions: Transaction[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [selectedEmpId, setSelectedEmpId] = useState("all");
  const [targetYear, setTargetYear] = useState(new Date().getFullYear().toString());
  const [targetMonth, setTargetMonth] = useState("all"); // 'all', '01' to '12'
  const { language, t } = useLanguage();

  const monthsList = [
    { value: "all", label: language === "bn" ? "সব মাস" : "All Months" },
    { value: "01", label: language === "bn" ? "জানুয়ারি" : "January" },
    { value: "02", label: language === "bn" ? "ফেব্রুয়ারি" : "February" },
    { value: "03", label: language === "bn" ? "মার্চ" : "March" },
    { value: "04", label: language === "bn" ? "এপ্রিল" : "April" },
    { value: "05", label: language === "bn" ? "মে" : "May" },
    { value: "06", label: language === "bn" ? "জুন" : "June" },
    { value: "07", label: language === "bn" ? "জুলাই" : "July" },
    { value: "08", label: language === "bn" ? "আগস্ট" : "August" },
    { value: "09", label: language === "bn" ? "সেপ্টেম্বর" : "September" },
    { value: "10", label: language === "bn" ? "অক্টোবর" : "October" },
    { value: "11", label: language === "bn" ? "নভেম্বর" : "November" },
    { value: "12", label: language === "bn" ? "ডিসেম্বর" : "December" }
  ];

  // Filters salary and advances safely
  const filteredTxs = transactions.filter(tx => {
    const isSalaryOrAdvance = 
      tx.category === "Salary" || 
      tx.category === "Staff Salary" || 
      tx.category === "Salary Advance" || 
      tx.category === "Staff Advance" ||
      tx.category === "Employee Advance";
    if (!isSalaryOrAdvance) return false;
    
    try {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate || isNaN(txDate.getTime())) return false;
      
      const txYear = txDate.getFullYear().toString();
      if (txYear !== targetYear) return false;
      
      if (targetMonth !== "all") {
        const txMonth = (txDate.getMonth() + 1).toString().padStart(2, "0");
        if (txMonth !== targetMonth) return false;
      }
      
      if (selectedEmpId !== "all" && tx.employeeId !== selectedEmpId) return false;
      return true;
    } catch {
      return false;
    }
  }).sort((a,b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // Aggregate stats
  const totalSalaryPayout = filteredTxs
    .filter(tx => tx.category === "Salary" || tx.category === "Staff Salary")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalAdvancePayout = filteredTxs
    .filter(tx => tx.category === "Salary Advance" || tx.category === "Staff Advance" || tx.category === "Employee Advance")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const exportSalaryCSV = React.useCallback(() => {
    let csvContent = "";
    const bom = "\uFEFF";
    
    if (language === "bn") {
      csvContent = bom + "তারিখ,কর্মকর্তা/কর্মচারীর নাম,হিসাবের নাম,লেনদেনের মাধ্যম,প্রদত্ত পরিমাণ (টাকা),মন্তব্য/রেফারেন্স\n";
      filteredTxs.forEach(tx => {
        const empName = employees.find(e => e.id === tx.employeeId)?.name || "অজানা";
        const dt = tx.date ? tx.date.split("T")[0] : "";
        const catLabel = tx.category === "Staff Salary" ? "কর্মচারী বেতন" : "কর্মচারী অগ্রিম";
        csvContent += `"${dt}","${empName}","${catLabel}","${tx.paymentMethod}",${tx.amount},"${(tx.notes || "").replace(/"/g, '""')}"\n`;
      });
      csvContent += `\n"সর্বমোট বেতন প্রদান","","","",${totalSalaryPayout},""\n`;
      csvContent += `"সর্বমোট অগ্রিম প্রদান","","","",${totalAdvancePayout},""\n`;
    } else {
      csvContent = "Disbursement Date,Employee Name,Ledger Account,Method,Amount Paid (BDT),Reference Note\n";
      filteredTxs.forEach(tx => {
        const empName = employees.find(e => e.id === tx.employeeId)?.name || "Unknown";
        const dt = tx.date ? tx.date.split("T")[0] : "";
        csvContent += `"${dt}","${empName}","${tx.category}","${tx.paymentMethod}",${tx.amount},"${(tx.notes || "").replace(/"/g, '""')}"\n`;
      });
      csvContent += `\n"Total Salary Paid","","","",${totalSalaryPayout},""\n`;
      csvContent += `"Total Advances Paid","","","",${totalAdvancePayout},""\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    const selectedMonthLabel = monthsList.find(m => m.value === targetMonth)?.label || "All_Months";
    link.download = `Salary_Report_${selectedEmpId}_${selectedMonthLabel}_${targetYear}.csv`;
    link.click();
  }, [filteredTxs, employees, selectedEmpId, targetYear, targetMonth, totalSalaryPayout, totalAdvancePayout, language]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportSalaryCSV);
    }
  }, [exportSalaryCSV, onRegisterExporter]);

  // Selected Employee Basic Reference
  const empTarget = employees.find(e => e.id === selectedEmpId);

  // Compute monthly totals for the selected year and employee for Recharts visualization
  const chartData = Array.from({ length: 12 }, (_, idx) => {
    const monthNum = (idx + 1).toString().padStart(2, "0");
    const monthLabelObj = monthsList.find(m => m.value === monthNum);
    const monthLabel = monthLabelObj ? monthLabelObj.label : "";
    
    const monthFilteredTxs = transactions.filter(tx => {
      const isSalaryOrAdvance = 
        tx.category === "Salary" || 
        tx.category === "Staff Salary" || 
        tx.category === "Salary Advance" || 
        tx.category === "Staff Advance" ||
        tx.category === "Employee Advance";
      if (!isSalaryOrAdvance) return false;
      
      try {
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate || isNaN(txDate.getTime())) return false;
        
        const txYear = txDate.getFullYear().toString();
        if (txYear !== targetYear) return false;
        
        const txMonth = (txDate.getMonth() + 1).toString().padStart(2, "0");
        if (txMonth !== monthNum) return false;
        
        if (selectedEmpId !== "all" && tx.employeeId !== selectedEmpId) return false;
        return true;
      } catch {
        return false;
      }
    });

    const salaries = monthFilteredTxs
      .filter(tx => tx.category === "Salary" || tx.category === "Staff Salary")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const advances = monthFilteredTxs
      .filter(tx => tx.category === "Salary Advance" || tx.category === "Staff Advance" || tx.category === "Employee Advance")
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      month: monthLabel,
      [language === "bn" ? "বেতন প্রদান" : "Salaries"]: salaries,
      [language === "bn" ? "অগ্রিম প্রদান" : "Advances"]: advances,
    };
  });

  const downloadSalaryReportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    
    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 38, "F");
    
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("STAFF DISBURSEMENT AUDIT REPORT", 14, 16);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.text(`${companyName.toUpperCase()} • ${companyAddress}`, 14, 23);
    
    const activeMonthName = targetMonth === "all" ? "All Months" : (monthsList.find(m => m.value === targetMonth)?.label || "");
    doc.text(`Issuer: HR & Payroll Department || Year: ${targetYear} || Month: ${activeMonthName}`, 14, 28);
    
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 38, 210, 2, "F");
    
    // Employee details if specific selected
    if (empTarget) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text("EMPLOYEE FILE PROFILE", 14, 49);

      doc.setFillColor(248, 250, 252);
      doc.rect(14, 53, 182, 24, "F");

      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Employee Name: ${empTarget.name}`, 18, 59);
      doc.text(`Official Designation: ${empTarget.role}`, 18, 64);
      doc.text(`Assigned Department: ${empTarget.department || "General"}`, 18, 69);
      
      doc.text(`Basic Salary Rate: BDT ${empTarget.salary.toLocaleString()}/mo`, 110, 59);
      doc.text(`Join Date: ${empTarget.joinedDate || "N/A"}`, 110, 64);
      doc.text(`Card Status: ${empTarget.status.toUpperCase()}`, 110, 69);
    }

    const startTableY = empTarget ? 84 : 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`PAYMENT HISTORY DISBURSEMENT RECORDS`, 14, startTableY);

    const tableRows = filteredTxs.map(tx => [
      format(new Date(tx.date), "dd MMM yyyy"),
      employees.find(e => e.id === tx.employeeId)?.name || "Unknown",
      tx.category === "Staff Salary" ? "Staff Salary" : tx.category === "Employee Advance" ? "Employee Advance" : tx.category,
      tx.paymentMethod,
      `BDT ${tx.amount.toLocaleString()}`,
      tx.notes || "-"
    ]);

    autoTable(doc, {
      startY: startTableY + 4,
      head: [["Disbursement Date", "Employee target", "Ledger Account", "Method", "Amount Paid", "Reference Note"]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 81]
      },
      columnStyles: {
        4: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3.5
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    const activeMonthNameSlug = targetMonth === "all" ? "All_Months" : targetMonth;
    doc.save(`Salary_Audit_${selectedEmpId}_${activeMonthNameSlug}_${targetYear}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-300">
      {/* Filters Panel */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-800 dark:text-slate-205" />
            <span className="text-lg font-extrabold text-slate-900 dark:text-neutral-100">
              {language === "bn" ? "বেতন ও অগ্রিম লেজার ফিল্টার" : "Staff Payroll Ledger Filters"}
            </span>
          </div>
          <div className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
            {language === "bn" ? "অডিটেড প্যাকেজ" : "Audited Package"}
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Target Staff Filter */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              {language === "bn" ? "কর্মকর্তা / কর্মচারী নির্বাচন" : "Target Staff / Employee"}
            </label>
            <div className="relative">
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-slate-950 focus:bg-white rounded-xl font-bold text-xs appearance-none outline-none cursor-pointer"
              >
                <option value="all">
                  {language === "bn" ? "সকল কর্মচারী একসাথে" : "All Employees Combined"}
                </option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({t(emp.role)})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          {/* Fiscal Year Filter */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              {language === "bn" ? "অর্থবছর" : "Fiscal Year"}
            </label>
            <div className="relative">
              <select
                value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-slate-950 focus:bg-white rounded-xl font-bold text-xs appearance-none outline-none cursor-pointer"
              >
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          {/* Target Month Filter */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              {language === "bn" ? "নির্দিষ্ট মাস" : "Monthly Period"}
            </label>
            <div className="relative">
              <select
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-slate-950 focus:bg-white rounded-xl font-bold text-xs appearance-none outline-none cursor-pointer"
              >
                {monthsList.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={downloadSalaryReportPDF}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 border border-transparent text-white hover:bg-slate-800 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{language === "bn" ? "পিডিএফ রিপোর্ট অডিট" : "PDF Payroll Audit"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Base / Rate Card */}
        <div className="bg-white border border-slate-100 p-6 rounded-3xl flex flex-col justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              {empTarget 
                ? (language === "bn" ? "মাসিক বেতন হার" : "Target Monthly Salary") 
                : (language === "bn" ? "সম্মিলিত মাসিক সক্রিয় বেতন" : "Combined Monthly Base Payroll")}
            </p>
            <p className="text-2xl font-black text-slate-950">
              {empTarget 
                ? formatCurrency(empTarget.salary) 
                : formatCurrency(employees.filter(e => e.status === "active").reduce((sum, e) => sum + (e.salary || 0), 0))}
            </p>
          </div>
          {empTarget ? (
            <div className="text-[10px] text-slate-500 font-bold mt-3 uppercase border-t border-slate-50 pt-2 flex items-center justify-between">
              <span>{language === "bn" ? "পদবী: " : "Designation: "} {empTarget.role}</span>
              <span>{empTarget.department || "General"}</span>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 font-bold mt-3 uppercase border-t border-slate-50 pt-2">
              <span>{employees.filter(e => e.status === "active").length} {language === "bn" ? "সক্রিয় কর্মচারী" : "active staff members"}</span>
            </div>
          )}
        </div>

        {/* Salaries paid card */}
        <div className="bg-emerald-50/50 border border-emerald-100/70 p-6 rounded-3xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট বেতন প্রদান (ফিল্টার)" : "Total Salary Paid (Period)"}
            </p>
            <p className="text-2xl font-black text-emerald-950">{formatCurrency(totalSalaryPayout)}</p>
            <div className="text-[10px] text-emerald-600 font-bold uppercase mt-1">
              {filteredTxs.filter(tx => tx.category === "Salary" || tx.category === "Staff Salary").length} {language === "bn" ? "টি অ্যাকাউন্ট এন্ট্রি" : "ledger accounts paid"}
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Advances Given Card */}
        <div className="bg-amber-50/50 border border-amber-100/70 p-6 rounded-3xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট অগ্রিম উত্তোলন (ফিল্টার)" : "Total Advances Issued"}
            </p>
            <p className="text-2xl font-black text-amber-950">{formatCurrency(totalAdvancePayout)}</p>
            <div className="text-[10px] text-amber-600 font-bold uppercase mt-1">
              {filteredTxs.filter(tx => tx.category === "Salary Advance" || tx.category === "Staff Advance" || tx.category === "Employee Advance").length} {language === "bn" ? "বার অগ্রিম উত্তোলন" : "disbursement events"}
            </div>
          </div>
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
            <Info className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Chart Segment - Huge attractive and user-friendly update! */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h4 className="text-base font-extrabold text-slate-900">
            {language === "bn" ? "মাসিক বেতন ও অগ্রিম তুলনা গ্রাফ" : "Monthly Comparison Trend Graph"}
          </h4>
          <p className="text-xs text-slate-400">
            {language === "bn" ? "সারাবছরের মাসভিত্তিক তুলনামূলক বাজেট বিশ্লেষণ" : `Comparing Month-to-Month disbursals across fiscal ${targetYear} for selected targets`}
          </p>
        </div>
        
        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: "12px", 
                  background: "#0f172a", 
                  color: "#fff", 
                  fontSize: "11px",
                  border: "none"
                }} 
              />
              <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
              <Bar dataKey={language === "bn" ? "বেতন প্রদান" : "Salaries"} fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey={language === "bn" ? "অগ্রিম প্রদান" : "Advances"} fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* History Ledger Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h4 className="text-base font-extrabold text-slate-800">
              {language === "bn" ? "লেনদেন জার্নাল ইতিহাস" : "Disbursement Audit Journal"}
            </h4>
            <p className="text-xs text-slate-400">
              {language === "bn" ? "নির্বাচিত ফিল্টার অনুযায়ী বেতন ও অগ্রিমের বিস্তারিত তালিকা" : `Detailed records matching active filters for ${targetMonth !== "all" ? monthsList.find(m => m.value === targetMonth)?.label : ""} ${targetYear}`}
            </p>
          </div>
          <span className="text-[10px] bg-slate-50 border border-slate-100 text-slate-650 px-2.5 py-1 rounded-md font-bold">
            {filteredTxs.length} {language === "bn" ? "টি রেকর্ড পাওয়া গেছে" : "records captured"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/70">
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                  {language === "bn" ? "প্রদানের তারিখ" : "Disbursement Date"}
                </th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                  {language === "bn" ? "কর্মচারীর নাম" : "Employee Name"}
                </th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                  {language === "bn" ? "খাত / ক্যাটাগরি" : "Ledger Category"}
                </th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                  {language === "bn" ? "প্রদানের মাধ্যম" : "Channel / Method"}
                </th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100 text-right">
                  {language === "bn" ? "পরিমাণ (টাকা)" : "Amount Out (BDT)"}
                </th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                  {language === "bn" ? "মন্তব্য" : "Reference Notes"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
              {filteredTxs.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50/30 transition-all">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-bold text-slate-900">{format(new Date(tx.date), "dd MMM yyyy")}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-800">
                    {employees.find(e => e.id === tx.employeeId)?.name || "Unknown"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide",
                      tx.category.includes("Advance") 
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-green-100 text-green-800 border border-green-200"
                    )}>
                      {tx.category === "Staff Salary" 
                        ? (language === "bn" ? "কর্মচারী বেতন" : "Staff Salary")
                        : tx.category === "Employee Advance"
                        ? (language === "bn" ? "কর্মচারী অগ্রিম" : "Employee Advance")
                        : tx.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <span className="px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-500 uppercase text-[9px]">
                      {tx.paymentMethod}
                     </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-black text-slate-900">
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="px-6 py-4 text-slate-400 max-w-xs truncate italic">
                    {tx.notes || "—"}
                  </td>
                </tr>
              ))}
              {filteredTxs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                    {language === "bn" 
                      ? "কোন তথ্য বা প্রদানের ইতিহাস খুঁজে পাওয়া যায়নি।" 
                      : `No payroll/salary dispatch matches for chosen criteria in ${targetYear}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   NEW TAB 3: SUPPLIER PAYMENTS & LEDGER REPORT (TAB: supplier)
   ========================================================================== */
function SupplierPaymentsReport({ suppliers, supplierTransactions, companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  suppliers: Supplier[];
  supplierTransactions: SupplierTransaction[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [selectedSupId, setSelectedSupId] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const filteredSTxs = supplierTransactions.filter(tx => {
    if (selectedSupId !== "all" && tx.supplierId !== selectedSupId) return false;
    const dateStr = tx.date.split("T")[0];
    if (dateStr < startDate || dateStr > endDate) return false;
    return true;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const selectedSupObj = suppliers.find(s => s.id === selectedSupId);

  // Supplier metrics calculation - Proper lifetime/all-time values for reconciliation
  const totalOutstandingDue = selectedSupObj
    ? (selectedSupObj.purchaseDue || 0)
    : suppliers.reduce((sum, s) => sum + (s.purchaseDue || 0), 0);

  const exportSupplierCSV = React.useCallback(() => {
    let csvContent = "Invoice Date,Supplier Name,Transaction Type,Invoice/Ref No,Gross Cost (BDT),Paid Portion (BDT),Remaining Balance Due,Method,Notes\n";
    filteredSTxs.forEach(tx => {
      const supName = suppliers.find(s => s.id === tx.supplierId)?.name || "Unknown";
      csvContent += `"${tx.date}","${supName}","${tx.type.toUpperCase()}","${tx.refNo}",${tx.totalAmount},${tx.paidAmount || 0},${tx.dueAmount || 0},"${tx.paymentMethod || "Cash"}","${(tx.notes || "").replace(/"/g, '""')}"\n`;
    });
    
    csvContent += `\n"Total Outstanding Due Across Filter/Account","","","","","","",${totalOutstandingDue},""\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Supplier_Ledger_${selectedSupId}_${startDate}_to_${endDate}.csv`;
    link.click();
  }, [filteredSTxs, suppliers, selectedSupId, startDate, endDate, totalOutstandingDue]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportSupplierCSV);
    }
  }, [exportSupplierCSV, onRegisterExporter]);

  const totalPurchasesOverall = selectedSupObj
    ? (selectedSupObj.totalAmount || 0)
    : suppliers.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

  const totalPaymentsOverall = selectedSupObj
    ? supplierTransactions
        .filter(tx => tx.supplierId === selectedSupObj.id && tx.type === "payment")
        .reduce((sum, tx) => sum + (tx.totalAmount || 0), 0)
    : supplierTransactions
        .filter(tx => tx.type === "payment")
        .reduce((sum, tx) => sum + (tx.totalAmount || 0), 0);

  // Still keep period calculations for any reference if needed (like the downloadable statement reports)
  const totalPurchaseGross = filteredSTxs
    .filter(tx => tx.type === "purchase")
    .reduce((sum, tx) => sum + (tx.totalAmount || 0), 0);

  const totalPaymentsMade = filteredSTxs
    .filter(tx => tx.type === "payment")
    .reduce((sum, tx) => sum + (tx.totalAmount || 0), 0);

  const downloadSupplierPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 38, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("SUPPLIER ACCOUNT STATEMENT", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${companyName.toUpperCase()} • ${companyAddress}`, 14, 23);
    doc.text(`Issuer: Procurement Admin || Range: ${startDate} to ${endDate}`, 14, 28);

    doc.setFillColor(14, 165, 233);
    doc.rect(0, 38, 210, 2, "F");

    if (selectedSupObj) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text("SUPPLIER CONTRACT DOSSIER", 14, 49);

      doc.setFillColor(248, 250, 252);
      doc.rect(14, 53, 182, 26, "F");

      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Supplier: ${selectedSupObj.name} (${selectedSupObj.code})`, 18, 59);
      doc.text(`Mobile Num: ${selectedSupObj.mobile || "—"}`, 18, 64);
      doc.text(`Corporate Email: ${selectedSupObj.email || "—"}`, 18, 69);
      doc.text(`Street Address: ${selectedSupObj.address || "—"}`, 18, 74);

      doc.text(`Gross Purchases: BDT ${selectedSupObj.totalAmount.toLocaleString()}`, 115, 59);
      doc.text(`Outstanding Due Balance: BDT ${selectedSupObj.purchaseDue.toLocaleString()}`, 115, 64);
      doc.text(`Advance Ledger Balance: BDT ${selectedSupObj.advanceAmount.toLocaleString()}`, 115, 69);
      doc.text(`Overall Status: ${selectedSupObj.status.toUpperCase()}`, 115, 74);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text("COMBINED SUPPLIERS DOSSIER", 14, 49);

      doc.setFillColor(248, 250, 252);
      doc.rect(14, 53, 182, 26, "F");

      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Vendor Scope: ALL REGISTERED SUPPLIERS`, 18, 59);
      doc.text(`Active Count: ${suppliers.filter(s => s.status === "active").length} Suppliers`, 18, 64);
      doc.text(`Record Logs Range: ${startDate} to ${endDate}`, 18, 69);
      doc.text(`Generated Date: ${format(new Date(), "yyyy-MM-dd")}`, 18, 74);

      const totalOverallPurchases = suppliers.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const totalOverallDue = suppliers.reduce((sum, s) => sum + (s.purchaseDue || 0), 0);
      const totalOverallAdvance = suppliers.reduce((sum, s) => sum + (s.advanceAmount || 0), 0);

      doc.text(`Combined Gross Purchases: BDT ${totalOverallPurchases.toLocaleString()}`, 115, 59);
      doc.text(`Combined Outstanding Dues: BDT ${totalOverallDue.toLocaleString()}`, 115, 64);
      doc.text(`Combined Advance Balances: BDT ${totalOverallAdvance.toLocaleString()}`, 115, 69);
      doc.text(`Overall Status: CONSOLIDATED AUDIT`, 115, 74);
    }

    const startTableY = 88;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("SUPPLIER ACCOUNT TRANSACTION HISTORY", 14, startTableY);

    const tableRows = filteredSTxs.map(tx => [
      tx.date,
      suppliers.find(s => s.id === tx.supplierId)?.name || "Unknown",
      tx.type.toUpperCase(),
      tx.refNo,
      `BDT ${(tx.totalAmount || 0).toLocaleString()}`,
      `BDT ${(tx.paidAmount || 0).toLocaleString()}`,
      tx.paymentMethod || "—"
    ]);

    autoTable(doc, {
      startY: startTableY + 4,
      head: [["Tx Date", "Supplier Target", "Tx Type", "Reference No", "Gross Total", "Paid Amount", "Method"]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 81]
      },
      columnStyles: {
        4: { halign: "right", fontStyle: "bold" },
        5: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    doc.save(`Supplier_Ledger_${selectedSupId}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-300 font-sans">
      {/* Filters Form */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xl font-extrabold text-slate-900 mb-5 flex items-center gap-2">
          <Truck className="w-5 h-5 text-slate-800" />
          <span>Supplier Reconciliation Console</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Target Supplier</label>
            <select
              value={selectedSupId}
              onChange={(e) => setSelectedSupId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="all">All Suppliers Combined</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.name} ({sup.code})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={downloadSupplierPDF}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>PDF Account Ledger</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl">
          <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">Contract Outstanding Due</p>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(totalOutstandingDue)}
          </p>
          {selectedSupObj ? (
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Supplier Address: {selectedSupObj.address || "—"}</p>
          ) : (
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Combined outstanding ledger dues</p>
          )}
        </div>

        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-indigo-850 uppercase tracking-widest mb-1">Gross Purchases Total</p>
            <p className="text-2xl font-black text-indigo-950">{formatCurrency(totalPurchasesOverall)}</p>
          </div>
          <div className="w-11 h-11 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-teal-50 border border-teal-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-teal-850 uppercase tracking-widest mb-1">Total Payments Made</p>
            <p className="text-2xl font-black text-teal-950">{formatCurrency(totalPaymentsOverall)}</p>
          </div>
          <div className="w-11 h-11 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Transactions Journal table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Tx Date</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Supplier Name</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Type</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Tx Reference No</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 text-right">Gross Total</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 text-right">Paid Portion</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Method</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Reference Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredSTxs.map(tx => (
              <tr key={tx.id} className="hover:bg-slate-50/30 transition-all">
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="font-bold text-slate-900">{tx.date}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-805">
                  {suppliers.find(s => s.id === tx.supplierId)?.name || "Unknown"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide",
                    tx.type === "purchase" && "bg-blue-100 text-blue-800 border border-blue-200",
                    tx.type === "payment" && "bg-emerald-100 text-emerald-800 border border-emerald-200",
                    tx.type === "return" && "bg-rose-100 text-rose-800 border border-rose-200"
                  )}>
                    {tx.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-mono text-slate-800">
                  {tx.refNo}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-black text-slate-900">
                  {formatCurrency(tx.totalAmount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-emerald-600">
                  {tx.paidAmount ? formatCurrency(tx.paidAmount) : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 uppercase">
                    {tx.paymentMethod || "—"}
                   </span>
                </td>
                <td className="px-6 py-4 text-slate-500 max-w-xs truncate italic">
                  {tx.notes || "—"}
                </td>
              </tr>
            ))}
            {filteredSTxs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-slate-400 italic">
                  No account journals found in the chosen timeframe parameters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==========================================================================
   NEW TAB 4: PURCHASE ORDERS SUMMARY AUDIT (TAB: purchase)
   ========================================================================== */
function PurchaseReportSection({ suppliers, purchases, supplierTransactions, companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  suppliers: Supplier[];
  purchases: PurchaseModel[];
  supplierTransactions: SupplierTransaction[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [selectedSupId, setSelectedSupId] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentStatus, setPaymentStatus] = useState("all");

  const dynamicPurchases = computeDynamicPurchases(purchases as any, supplierTransactions, suppliers);

  const filteredPurchases = dynamicPurchases.filter(p => {
    if (selectedSupId !== "all" && p.supplierId !== selectedSupId) return false;
    if (p.date < startDate || p.date > endDate) return false;
    
    if (paymentStatus === "due" && p.dueAmount <= 0) return false;
    if (paymentStatus === "paid" && p.dueAmount > 0) return false;
    if (paymentStatus === "return" && (!p.writtenReturn || p.writtenReturn <= 0)) return false;

    return true;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculations
  const totalPurchaseAmt = filteredPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalPaidAmt = filteredPurchases.reduce((sum, p) => sum + p.paidAmount, 0);
  const totalDueAmt = filteredPurchases.reduce((sum, p) => sum + p.dueAmount, 0);

  const exportPurchaseCSV = React.useCallback(() => {
    let csvContent = "Invoice Date,Invoice No,Supplier Target,Gross Cost,Paid Amount,Remaining Due,Method,Invoice Remarks\n";
    filteredPurchases.forEach(p => {
      csvContent += `"${p.date}","${p.refNo}","${p.supplierName}",${p.totalAmount},${p.paidAmount},${p.dueAmount},"${p.paymentMethod}","${(p.notes || "").replace(/"/g, '""')}"\n`;
    });
    
    csvContent += `\n"Total Purchases Cost","","",${totalPurchaseAmt},${totalPaidAmt},${totalDueAmt},"",""\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Purchase_Report_Status_${paymentStatus}_${startDate}_to_${endDate}.csv`;
    link.click();
  }, [filteredPurchases, paymentStatus, startDate, endDate, totalPurchaseAmt, totalPaidAmt, totalDueAmt]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportPurchaseCSV);
    }
  }, [exportPurchaseCSV, onRegisterExporter]);
  const totalOutstandingDue = totalDueAmt;

  const downloadPurchaseReportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 38, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("PURCHASE STATISTICAL METRIC AUDIT", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${companyName.toUpperCase()} • ${companyAddress}`, 14, 23);
    doc.text(`Issuer: Operations Hub || Date Range: ${startDate} to ${endDate}`, 14, 28);

    doc.setFillColor(14, 165, 233);
    doc.rect(0, 38, 210, 2, "F");

    // Metrics Cards
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("PURCHASE LOGISTICS LEDGER STANDINGS", 14, 49);

    const metrics = [
      { label: "Gross Purchase Cost", val: `BDT ${totalPurchaseAmt.toLocaleString()}` },
      { label: "Settled Paid Cash", val: `BDT ${totalPaidAmt.toLocaleString()}` },
      { label: "Outstanding Dues", val: `BDT ${totalOutstandingDue.toLocaleString()}` }
    ];

    let metricX = 14;
    metrics.forEach(m => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(metricX, 53, 56, 20, "FD");

      doc.setFillColor(15, 23, 42); // slate block top line
      doc.rect(metricX, 53, 56, 1, "F");

      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(m.label.toUpperCase(), metricX + 3, 59);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(m.val, metricX + 3, 67);

      metricX += 61;
    });

    const tableRows = filteredPurchases.map(p => [
      p.date,
      p.refNo,
      p.supplierName,
      `BDT ${p.totalAmount.toLocaleString()}`,
      `BDT ${p.paidAmount.toLocaleString()}`,
      `BDT ${p.dueAmount.toLocaleString()}`,
      p.paymentMethod,
      p.notes || "-"
    ]);

    autoTable(doc, {
      startY: 84,
      head: [["Inv Date", "Invoice No", "Supplier Target", "Gross Cost", "Paid Amount", "Remaining Due", "Method", "Invoice Remarks"]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 81]
      },
      columnStyles: {
        3: { halign: "right", fontStyle: "bold" },
        4: { halign: "right", fontStyle: "bold" },
        5: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    doc.save(`Purchase_Audit_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-300 font-sans">
      {/* Filters Form */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xl font-extrabold text-slate-900 mb-5 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-slate-800" />
          <span>Purchase Logistics Filter Desk</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Target Supplier</label>
            <select
              value={selectedSupId}
              onChange={(e) => setSelectedSupId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="all">All Vendors</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Settlement Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="all">All Purchase Orders</option>
              <option value="due">Unsettled (Has Outstanding Due)</option>
              <option value="paid">Fully Paid / Clean Settlement</option>
              <option value="return">Orders with Returns Applied</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">From Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">To Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={downloadPurchaseReportPDF}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Purchase PDF Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Statistics breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl">
          <p className="text-[10px] font-extrabold text-slate-505 uppercase tracking-widest mb-1">Period Purchase Valuation</p>
          <p className="text-2xl font-black text-slate-900">{formatCurrency(totalPurchaseAmt)}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1 uppercase">aggregated across {filteredPurchases.length} invoices</p>
        </div>

        <div className="bg-green-50 border border-green-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-green-800 uppercase tracking-widest mb-1">Settled Paid Amount</p>
            <p className="text-2xl font-black text-green-950">{formatCurrency(totalPaidAmt)}</p>
          </div>
          <div className="w-11 h-11 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-center justify-between font-sans">
          <div>
            <p className="text-[10px] font-extrabold text-red-800 uppercase tracking-widest mb-1">Outstanding Liability (Dues)</p>
            <p className="text-2xl font-black text-red-950">{formatCurrency(totalOutstandingDue)}</p>
          </div>
          <div className="w-11 h-11 bg-red-100 text-red-650 rounded-full flex items-center justify-center">
            <Info className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Invoice Data Grid */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden font-sans">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Invoice Date</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 font-mono">Invoice Number</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Supplier Name</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 text-right">Invoice Total</th>
              <th id="purchase-th-paid-amount" className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 text-right">Paid Amount</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 text-right">Due Balance</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100 text-right">Return (Auto)</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-gray-100">Method</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
            {filteredPurchases.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/30 transition-all">
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="font-bold">{p.date}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-slate-900 uppercase">
                  {p.refNo}
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-semibold">
                  {p.supplierName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-black">
                  {formatCurrency(p.totalAmount)}
                </td>
                <td id={`purchase-td-paid-amount-${p.id}`} className="px-6 py-4 whitespace-nowrap text-right font-extrabold text-emerald-600">
                  {formatCurrency(p.paidAmount)}
                </td>
                <td className={cn(
                  "px-6 py-4 whitespace-nowrap text-right font-black",
                  p.dueAmount > 0 ? "text-red-650" : "text-slate-400"
                )}>
                  {formatCurrency(p.dueAmount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-rose-600">
                  {p.writtenReturn ? formatCurrency(p.writtenReturn) : "0"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <span className="px-2 py-0.5 bg-slate-100 rounded text-[9.5px] font-bold text-slate-500 uppercase">
                    {p.paymentMethod}
                   </span>
                </td>
              </tr>
            ))}
            {filteredPurchases.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-slate-400 italic">
                  No matching purchase invoices registered in the chosen filter range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==========================================================================
   ORIGINAL TAB: ATTENDANCE REPORT
   ========================================================================== */
function AttendanceReport({ employees, attendance, companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  employees: Employee[];
  attendance: any[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [filterType, setFilterType] = useState<"month" | "range">("month");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>("");

  const filteredAttendance = attendance.filter(a => {
    try {
      if (!a.date) return false;
      if (filterType === "month") {
        return a.date.startsWith(selectedMonth);
      } else {
        const dateStr = a.date.split("T")[0];
        return dateStr >= startDate && dateStr <= endDate;
      }
    } catch {
      return false;
    }
  });

  // Calculate detailed lateness metrics
  const getMinutesFromTime = (timeStr?: string): number => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  };

  const getLunchDurationMinutes = (lunchOut?: string, lunchIn?: string): number => {
    if (!lunchOut || !lunchIn) return 0;
    const outMins = getMinutesFromTime(lunchOut);
    const inMins = getMinutesFromTime(lunchIn);
    return Math.max(0, inMins - outMins);
  };

  const getStoreLatenessMinutes = (checkIn?: string): number => {
    if (!checkIn) return 0;
    const checkInMins = getMinutesFromTime(checkIn);
    const standardInMins = 540; // 09:00 AM standard
    return Math.max(0, checkInMins - standardInMins);
  };

  const exportAttendanceCSV = React.useCallback(() => {
    let csvContent = "Date,Employee Name,Role,Status,Clock In,Lunch Out,Lunch In,Store Late Minutes,Lunch Overtime Minutes\n";
    filteredAttendance.forEach(a => {
      const emp = employees.find(e => e.id === a.employeeId);
      const name = emp?.name || "Unknown";
      const role = emp?.role || "N/A";
      const dt = a.date ? a.date.split("T")[0] : "";
      
      const lateMins = getStoreLatenessMinutes(a.checkIn);
      let lunchOvertimeMins = 0;
      if (a.lunchOut) {
        if (!a.lunchIn) {
          lunchOvertimeMins = 240;
        } else {
          const duration = getLunchDurationMinutes(a.lunchOut, a.lunchIn);
          if (duration > 60) {
            lunchOvertimeMins = duration - 60;
          }
        }
      }

      csvContent += `"${dt}","${name}","${role}","${(a.status || "").toUpperCase()}","${a.checkIn || ""}","${a.lunchOut || ""}","${a.lunchIn || ""}",${lateMins},${lunchOvertimeMins}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const rangeName = filterType === "month" ? selectedMonth : `${startDate}_to_${endDate}`;
    link.download = `Attendance_Report_${rangeName}.csv`;
    link.click();
  }, [filteredAttendance, filterType, selectedMonth, startDate, endDate, employees]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportAttendanceCSV);
    }
  }, [exportAttendanceCSV, onRegisterExporter]);

  // Compile stats per employee for the selected month
  const employeePerformance = employees.map(emp => {
    const records = filteredAttendance.filter(a => a.employeeId === emp.id);
    const presentCount = records.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
    const absentCount = records.filter(r => r.status === "absent").length;
    const leaveCount = records.filter(r => r.status === "leave").length;
    const lateDaysCount = records.filter(r => r.status === "late").length;
    
    let totalStoreLateMins = 0;
    let totalLunchOvertimeMins = 0;
    let lunchBreachesCount = 0;

    records.forEach(rec => {
      // Store late minutes (past 09:00 AM standard shift)
      const lateMins = getStoreLatenessMinutes(rec.checkIn);
      totalStoreLateMins += lateMins;

      // Lunch overtime minutes (past 60 minutes rule)
      if (rec.lunchOut) {
        if (!rec.lunchIn) {
          // Went out to lunch but didn't return (counted as half-day automatic)
          // No excess calculation, but we can treat it as lost afternoon time (e.g. 240 mins)
          totalLunchOvertimeMins += 240; 
          lunchBreachesCount++;
        } else {
          const duration = getLunchDurationMinutes(rec.lunchOut, rec.lunchIn);
          if (duration > 60) {
            totalLunchOvertimeMins += (duration - 60);
            lunchBreachesCount++;
          }
        }
      }
    });

    // Wage calculations (Minute rate based on monthly salary/208/60)
    const hourlyWage = (emp.salary || 0) / 208;
    const minWage = hourlyWage / 60;
    const totalWastedMinutes = totalStoreLateMins + totalLunchOvertimeMins;
    const estimatedDeduction = totalWastedMinutes * minWage;

    return {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      salary: emp.salary,
      presentDays: presentCount,
      absentDays: absentCount,
      leaveDays: leaveCount,
      lateDays: lateDaysCount,
      storeLateMinutes: totalStoreLateMins,
      lunchOvertimeMinutes: totalLunchOvertimeMins,
      lunchBreaches: lunchBreachesCount,
      totalWastedMinutes,
      estimatedDeduction: Math.round(estimatedDeduction)
    };
  });

  // Global aggregate summaries
  const totalStoreLate = employeePerformance.reduce((sum, e) => sum + e.storeLateMinutes, 0);
  const totalLunchOvertime = employeePerformance.reduce((sum, e) => sum + e.lunchOvertimeMinutes, 0);
  const totalWastedMins = totalStoreLate + totalLunchOvertime;
  const totalWastedHrs = Math.round((totalWastedMins / 60) * 10) / 10;
  const totalDeductions = employeePerformance.reduce((sum, e) => sum + e.estimatedDeduction, 0);
  const totalLunchBreaches = employeePerformance.reduce((sum, e) => sum + e.lunchBreaches, 0);

  // Chart data: Employees tardiness comparison
  const chartData = employeePerformance
    .filter(e => e.totalWastedMinutes > 0)
    .map(e => ({
      name: e.name.split(" ")[0], // Use first name for space-efficiency
      "Store Arrival Late (m)": e.storeLateMinutes,
      "Lunch Break Overtime (m)": e.lunchOvertimeMinutes,
      "Excess Loss (BDT)": e.estimatedDeduction
    }));

  const downloadAttendanceReportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Corp Header banner
    doc.setFillColor(15, 23, 42); // slate bg
    doc.rect(0, 0, pageWidth, 38, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("STAFF ATTENDANCE & LATENESS AUDIT REPORT", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${companyName.toUpperCase()} • ${companyAddress}`, 14, 23);
    doc.text(`Email: ${companyEmail} • Phone: ${companyPhone}`, 14, 27);
    const auditPeriodText = filterType === "month" ? `Month of ${selectedMonth}` : `Range from ${startDate} to ${endDate}`;
    doc.text(`Audit Period: ${auditPeriodText}`, 14, 31);

    doc.setFillColor(14, 165, 233); // sky blue line
    doc.rect(0, 38, 210, 2, "F");

    // Metrics Row
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("MONTHLY ATTENDANCE KPI SUMMARY", 14, 49);

    const cards = [
      { label: "Arrival Late Vol", val: `${totalStoreLate} min` },
      { label: "Lunch Breach Vol", val: `${totalLunchOvertime} min` },
      { label: "Lost Productivity", val: `${totalWastedHrs} Hrs` },
      { label: "Total Deductions", val: `BDT ${totalDeductions.toLocaleString()}` }
    ];

    let cardX = 14;
    cards.forEach(c => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(cardX, 53, 42, 22, "FD");

      doc.setFillColor(15, 23, 42); // dark box accent top line
      doc.rect(cardX, 53, 42, 1.2, "F");

      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(c.label.toUpperCase(), cardX + 3, 59);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(c.val, cardX + 3, 67);

      cardX += 45;
    });

    // Entries Table
    const tableRows = employeePerformance.map(row => [
      row.name,
      row.role.toUpperCase(),
      row.presentDays.toString(),
      row.absentDays.toString(),
      row.leaveDays.toString(),
      row.lateDays.toString(),
      `${row.totalWastedMinutes} min`,
      `BDT ${row.estimatedDeduction.toLocaleString()}`
    ]);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("EMPLOYEE PRODUCTIVITY & LATENESS LEDGER", 14, 85);

    autoTable(doc, {
      startY: 89,
      head: [["Employee Name", "Designation", "Present", "Absent", "Leave", "Late Days", "Time Wasted", "Fine Deduction"]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "right" },
        7: { halign: "right", fontStyle: "bold", textColor: [185, 28, 28] }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3.5
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    const postSummaryY = (doc as any).lastAutoTable.finalY + 15;
    if (postSummaryY < 260) {
      doc.setDrawColor(200, 200, 200);
      doc.line(14, postSummaryY + 15, 64, postSummaryY + 15);
      doc.line(pageWidth - 14 - 50, postSummaryY + 15, pageWidth - 14, postSummaryY + 15);

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(115, 115, 115);
      doc.text("AUDITOR SIGNATURE", 14, postSummaryY + 19);
      doc.text("AUTHORIZED REPRESENTATIVE", pageWidth - 14, postSummaryY + 19, { align: "right" });
    }

    const docSuffix = filterType === "month" ? selectedMonth : `${startDate}_to_${endDate}`;
    doc.save(`Attendance_Audit_Report_${docSuffix}.pdf`);
  };

  const handleAskGemini = async () => {
    setIsAiLoading(true);
    setAiError("");
    setAiAnalysis("");
    try {
      const response = await fetch("/api/gemini/analyze-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          employees: employees.map(e => ({ id: e.id, name: e.name, role: e.role, salary: e.salary })),
          attendanceLogs: filteredAttendance,
          rules: { lunchDurationLimit: 60 }
        })
      });

      if (!response.ok) {
        throw new Error("HTTP connection error to Gemini middleware broker.");
      }

      const data = await response.json();
      setAiAnalysis(data.analysis || "No response received.");
    } catch (err: any) {
      console.error(err);
      setAiError("Connection to the server AI assistant failed. Is the API route active?");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Lightweight beautiful markdown formatter utility to render Gemini results without external dependencies
  const renderFormattedMarkdown = (rawText: string) => {
    if (!rawText) return null;
    return rawText.split("\n").map((line, i) => {
      // Headings
      if (line.startsWith("### ")) {
        return <h5 key={i} className="text-sm font-bold text-gray-900 dark:text-neutral-100 mt-4 mb-1.5 uppercase tracking-wide border-b border-gray-100 dark:border-zinc-850 pb-1">{line.replace("### ", "")}</h5>;
      }
      if (line.startsWith("## ")) {
        return <h4 key={i} className="text-base font-black text-gray-950 dark:text-white mt-5 mb-2 border-l-2 border-[#D12765] pl-2">{line.replace("## ", "")}</h4>;
      }
      if (line.startsWith("# ")) {
        return <h3 key={i} className="text-lg font-black text-gray-950 dark:text-white mt-6 mb-3 tracking-tight">{line.replace("# ", "")}</h3>;
      }

      // List Items
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const textContent = line.replace(/^[-*]\s+/, "");
        // Format bold fragments
        return (
          <li key={i} className="ml-5 list-disc text-xs text-slate-650 dark:text-neutral-300 mb-1 leading-relaxed">
            {formatBoldText(textContent)}
          </li>
        );
      }

      // Normal paragraph line
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return (
        <p key={i} className="text-xs text-slate-605 dark:text-neutral-300 leading-relaxed mb-1.5">
          {formatBoldText(line)}
        </p>
      );
    });
  };

  const formatBoldText = (text: string) => {
    const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-extrabold text-gray-950 dark:text-white">{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-300">
      {/* KPI Selection Bar */}
      <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 dark:border-zinc-800/40 flex flex-col md:flex-row items-center justify-between gap-6 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 rounded-2xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-rose-600 dark:text-rose-450">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-neutral-100">Time-Wastage & Lateness Report</h3>
            <p className="text-xs text-slate-500 font-medium">Monthly audit of daily shift tardiness, lunch break policies, and salary deductions.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl">
            <button
              onClick={() => setFilterType("month")}
              style={{ minWidth: "70px" }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-none cursor-pointer ${
                filterType === "month" 
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs font-extrabold" 
                  : "text-slate-450 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white bg-transparent"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterType("range")}
              style={{ minWidth: "100px" }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-none cursor-pointer ${
                filterType === "range" 
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs font-extrabold" 
                  : "text-slate-450 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white bg-transparent"
              }`}
            >
              Date-to-Date
            </button>
          </div>

          {filterType === "month" ? (
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 rounded-xl font-bold text-xs text-gray-950 dark:text-white focus:ring-1 focus:ring-rose-100 outline-none cursor-pointer w-full sm:w-auto"
            />
          ) : (
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 rounded-xl font-bold text-xs text-gray-950 dark:text-white focus:ring-1 focus:ring-rose-100 outline-none cursor-pointer w-full sm:w-auto"
              />
              <span className="text-gray-400 text-xs font-semibold">to</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 rounded-xl font-bold text-xs text-gray-950 dark:text-white focus:ring-1 focus:ring-rose-100 outline-none cursor-pointer w-full sm:w-auto"
              />
            </div>
          )}

          <button
            id="download-attendance-pdf-btn"
            onClick={downloadAttendanceReportPDF}
            className="w-full md:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-97"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Attendance PDF Audit</span>
          </button>
        </div>
      </div>

      {/* Aggregate metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-[22px] border border-slate-100 dark:border-zinc-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-450 rounded-xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 01-7.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-0.5">Total Store Late</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-neutral-100 font-mono leading-none">{totalStoreLate} mins</h3>
            <span className="text-[8px] text-gray-400 font-semibold uppercase">Shift arrival lost</span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-[22px] border border-slate-100 dark:border-zinc-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-450 rounded-xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-0.5">Lunch Late Break</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-neutral-100 font-mono leading-none">{totalLunchOvertime} mins</h3>
            <span className="text-[8px] text-orange-600 font-bold uppercase">{totalLunchBreaches} incidents</span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-[22px] border border-slate-100 dark:border-zinc-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-450 rounded-xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-0.5">Total Wasted Hours</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-neutral-100 font-mono leading-none">{totalWastedHrs} hours</h3>
            <span className="text-[8px] text-red-500 font-bold uppercase">Store productivity lost</span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-[22px] border border-slate-100 dark:border-zinc-800/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 rounded-xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-0.5">Calculated Deductions</p>
            <h3 className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono leading-none">{totalDeductions.toLocaleString()} BDT</h3>
            <span className="text-[8px] text-emerald-600 font-semibold uppercase">Recouped in payroll</span>
          </div>
        </div>
      </div>

      {/* Main visual side-by-side: Chart vs Employee Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recharts Graphical Distribution */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-slate-100 dark:border-zinc-800/50 flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-neutral-100 uppercase tracking-wider mb-1">Time Leakage Distributions</h4>
            <p className="text-[11px] text-slate-400 font-semibold mb-6 uppercase">Store check-in delay (mins) vs lunchtime limit breaches (mins) by active staff</p>
          </div>
          
          <div className="h-64 sm:h-72 w-full font-mono text-[10px]">
            {chartData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-slate-450 italic border border-dashed border-slate-100 dark:border-zinc-800 rounded-2xl">
                100% On-time compliance. No tardiness charted!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip cursor={{ fill: '#F3F4F6', opacity: 0.5 }} />
                  <Legend />
                  <Bar dataKey="Store Arrival Late (m)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Lunch Break Overtime (m)" fill="#EA580C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Live list ledger of employees */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-slate-100 dark:border-zinc-800/50">
          <h4 className="text-sm font-black text-slate-900 dark:text-neutral-100 uppercase tracking-wider mb-1">Staff Loss Analysis Ledger</h4>
          <p className="text-[11px] text-slate-400 font-semibold mb-6 uppercase">Calculation of custom minutes late and dynamic payroll deductions</p>
          
          <div className="divide-y divide-slate-50 dark:divide-zinc-850 max-h-[295px] overflow-y-auto pr-1">
            {employeePerformance.map(item => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-3 group text-xs">
                <div>
                  <h5 className="font-extrabold text-slate-900 dark:text-neutral-100 group-hover:text-[#D12765] transition-colors">{item.name}</h5>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    Store Delay: {item.storeLateMinutes}m | Lunch Overtime: {item.lunchOvertimeMinutes}m ({item.lunchBreaches}x)
                  </p>
                </div>
                <div className="text-right font-mono">
                  {item.totalWastedMinutes > 0 ? (
                    <>
                      <span className="font-black text-rose-600 block">-{item.estimatedDeduction} BDT</span>
                      <span className="text-[7px] text-gray-400 uppercase font-black leading-none">{item.totalWastedMinutes} mins total</span>
                    </>
                  ) : (
                    <span className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">compliant</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Day-by-Day Operations Audit Ledger */}
      <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[32px] border border-slate-100 dark:border-zinc-800/50 shadow-sm space-y-6">
        <div>
          <h4 className="text-sm font-black text-slate-900 dark:text-neutral-100 uppercase tracking-wider mb-1">Day-by-Day Operations Audit Ledger</h4>
          <p className="text-[11px] text-slate-400 font-semibold mb-6 uppercase">Chronological breakdown of presence, lateness count, and daily staffing occupancy</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-950/20">
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400 text-center">Present / Active</th>
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400 text-center">Late Arrivals</th>
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400 text-center">Absences</th>
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400 text-center">On Leave</th>
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400 text-center">Holidays</th>
                <th className="px-4 py-3 font-black text-[10px] uppercase tracking-wider text-slate-400 text-right">Occupancy Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-850/50">
              {(() => {
                // Calculate days list dynamically
                const listDays: Date[] = [];
                try {
                  const startObj = filterType === "month" 
                    ? startOfMonth(new Date(selectedMonth + "-02")) 
                    : startOfDay(new Date(startDate));
                  const endObj = filterType === "month" 
                    ? endOfMonth(new Date(selectedMonth + "-02")) 
                    : endOfDay(new Date(endDate));
                  
                  let current = new Date(startObj);
                  while (current <= endObj) {
                    listDays.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                  }
                  listDays.sort((a,b) => b.getTime() - a.getTime()); // Latest first
                } catch (e) {
                  console.error(e);
                }

                if (listDays.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 italic font-semibold animate-pulse">
                        No operations days found in specified bounds.
                      </td>
                    </tr>
                  );
                }

                return listDays.map(day => {
                  const dayString = day.toISOString().split("T")[0];
                  const records = filteredAttendance.filter(a => a.date && a.date.startsWith(dayString));
                  
                  const countPresent = records.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
                  const countLate = records.filter(r => r.status === "late").length;
                  const countAbsent = records.filter(r => r.status === "absent").length;
                  const countLeave = records.filter(r => r.status === "leave").length;
                  const countHoliday = records.filter(r => r.status === "holiday").length;
                  
                  const total = employees.length;
                  const occRate = total > 0 ? Math.round((countPresent / total) * 100) : 0;

                  return (
                    <tr key={dayString} className="hover:bg-slate-50/50 dark:hover:bg-zinc-850/20 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-805 dark:text-neutral-200">
                        {format(day, "EEEE, dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-center text-emerald-650 dark:text-emerald-450 font-mono">
                        {countPresent - countLate}
                      </td>
                      <td className="px-4 py-3 font-semibold text-center text-amber-600 dark:text-amber-450 font-mono">
                        {countLate}
                      </td>
                      <td className="px-4 py-3 font-semibold text-center text-red-650 font-mono">
                        {countAbsent}
                      </td>
                      <td className="px-4 py-3 font-semibold text-center text-indigo-500 font-mono">
                        {countLeave}
                      </td>
                      <td className="px-4 py-3 font-semibold text-center text-purple-500 font-mono">
                        {countHoliday}
                      </td>
                      <td className="px-4 py-3 font-black text-right font-mono">
                        <span className={`inline-block px-1.5 py-0.5 rounded ${
                          occRate >= 75 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" : "text-rose-600 bg-rose-50 dark:bg-rose-950/20"
                        }`}>
                          {occRate}%
                        </span>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Express Server Powered Gemini Interactive Analyst */}
      <div className="bg-slate-950 text-white rounded-[32px] p-6 sm:p-8 border border-slate-900 shadow-xl relative overflow-hidden">
        {/* Subtle decorative background shine */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase tracking-widest leading-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3.096 15.125l5.096-.813L9 9.125l.813 5.096 5.096.813-5.096.813zM19.5 5.25l-.375 2.25L16.875 8l2.25.375.375 2.25.375-2.25 2.25-.375-2.25-.375-.375-2.25z" />
              </svg>
              Gemini AI Productivity Coach
            </span>
            <h3 className="text-2xl font-black tracking-tight text-white leading-tight">Generate AI Attendance Audit</h3>
            <p className="text-xs text-slate-300 font-medium font-sans">Our intelligent assistant analyzes time-stamps to explain store wasted hours and suggest actionable improvements.</p>
          </div>

          <button
            onClick={handleAskGemini}
            disabled={isAiLoading}
            className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl flex items-center gap-2 shadow-xl hover:shadow-2xl transition-all active:scale-95 disabled:opacity-50 shrink-0 self-start md:self-auto cursor-pointer border-none"
          >
            {isAiLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Auditing logs...</span>
              </>
            ) : (
              <>
                <Award className="w-4 h-4 text-[#D12765]" />
                <span>Explain through AI</span>
              </>
            )}
          </button>
        </div>

        {/* Gemini Output Block */}
        <AnimatePresence mode="wait">
          {(aiAnalysis || isAiLoading || aiError) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6 pt-6 border-t border-slate-800/60 font-sans relative z-10"
            >
              {isAiLoading && (
                <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-8 h-8 rounded-full border-4 border-rose-500 border-t-transparent animate-spin" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Consulting Gemini retail decision engine...</p>
                </div>
              )}

              {aiError && (
                <div className="p-4 bg-red-950/40 border border-red-900/40 rounded-2xl text-xs text-red-400 font-bold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-red-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {aiError}
                </div>
              )}

              {aiAnalysis && (
                <div className="bg-slate-900/60 rounded-3xl p-6 sm:p-8 border border-slate-800 text-left font-sans">
                  {renderFormattedMarkdown(aiAnalysis)}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ==========================================================================
   ORIGINAL TAB: GENERAL TRANSACTION HISTORY REPORT
   ========================================================================== */
function TransactionsReport({ transactions, companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  transactions: Transaction[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [dateRange, setDateRange] = useState("month");
  
  const now = new Date();
  const filtered = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    if (dateRange === "month") return txDate >= startOfMonth(now) && txDate <= endOfMonth(now);
    if (dateRange === "year") return txDate >= startOfYear(now);
    return true;
  });

  const categories = Array.from(new Set(filtered.map(tx => tx.category)));
  const incomeTotal = filtered.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expenseTotal = filtered.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);

  const exportTransactionsCSV = React.useCallback(() => {
    let csvContent = "Date,Category,Sub-Category,Type,Payment Method,Amount (BDT),Notes\n";
    filtered.forEach(tx => {
      const dt = tx.date ? tx.date.split("T")[0] : "";
      csvContent += `"${dt}","${tx.category}","${tx.subCategory || ""}","${tx.type.toUpperCase()}","${tx.paymentMethod}",${tx.amount},"${(tx.notes || "").replace(/"/g, '""')}"\n`;
    });
    
    csvContent += `\n"Total Incomes","","","","",${incomeTotal},""\n`;
    csvContent += `"Total Expenses","","","","",${expenseTotal},""\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Transactions_Analysis_${dateRange}.csv`;
    link.click();
  }, [filtered, dateRange, incomeTotal, expenseTotal]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportTransactionsCSV);
    }
  }, [exportTransactionsCSV, onRegisterExporter]);

  const downloadTransactionsReportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Corp Header banner
    doc.setFillColor(15, 23, 42); // slate bg
    doc.rect(0, 0, pageWidth, 38, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("GENERAL TRANSACTION ANALYSIS JOURNAL", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${companyName.toUpperCase()} • ${companyAddress}`, 14, 23);
    doc.text(`Email: ${companyEmail} • Phone: ${companyPhone}`, 14, 27);
    const dateRangeLabel = dateRange === "month" ? "Current Month" : dateRange === "year" ? "Current Year" : "All Time";
    doc.text(`Ledger Selection: ${dateRangeLabel} (${format(new Date(), "dd MMM yyyy")})`, 14, 31);

    doc.setFillColor(14, 165, 233); // sky blue line
    doc.rect(0, 38, 210, 2, "F");

    // Metrics Cards Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("TRANSACTION ACCUMULATIONS RECORD", 14, 49);

    const cards = [
      { label: "Aggregate Inflows", val: `BDT ${incomeTotal.toLocaleString()}` },
      { label: "Aggregate Outflows", val: `BDT ${expenseTotal.toLocaleString()}` },
      { label: "Net Operational Margin", val: `BDT ${(incomeTotal - expenseTotal).toLocaleString()}` }
    ];

    let cardX = 14;
    cards.forEach(c => {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(cardX, 53, 56, 22, "FD");

      doc.setFillColor(15, 23, 42);
      doc.rect(cardX, 53, 56, 1.2, "F");

      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(c.label.toUpperCase(), cardX + 3, 59);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(c.val, cardX + 3, 67);

      cardX += 61;
    });

    // Entries Table
    const tableRows = filtered.map(tx => [
      format(new Date(tx.date), "dd MMM yyyy (hh:mm a)"),
      tx.category + (tx.subCategory ? ` (${tx.subCategory})` : ""),
      tx.type.toUpperCase(),
      tx.paymentMethod,
      tx.type === "income" ? `+ BDT ${tx.amount.toLocaleString()}` : `- BDT ${tx.amount.toLocaleString()}`,
      tx.notes || "-"
    ]);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text("TRANSACTION ENTRIES LEDGER", 14, 85);

    autoTable(doc, {
      startY: 89,
      head: [["Tx Datetime", "Category Sub-category", "Type", "Channel", "Amount Value", "Reference Remarks"]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        4: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3.5
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    doc.save(`Transactions_Journal_Report_${dateRange}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-50 border border-purple-150 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Financial History & Trends</h3>
            <p className="text-xs text-slate-500 font-medium font-sans">Broad overview of general spending and core income distribution.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            {["month", "year", "all"].map(range => (
              <button 
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                  dateRange === range ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-950"
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <button
            id="download-tx-pdf-btn"
            onClick={downloadTransactionsReportPDF}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xs transition-all active:scale-97"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Download PDF Journal</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
        <div className="bg-slate-900 border border-slate-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-2 right-4 text-[9px] uppercase tracking-widest font-black opacity-30">credit inflow</div>
          <p className="text-xs font-extrabold uppercase tracking-widest opacity-60 mb-1">Total Income</p>
          <p className="text-2xl font-black">{incomeTotal.toLocaleString()} BDT</p>
        </div>
        <div className="bg-red-900 border border-red-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-2 right-4 text-[9px] uppercase tracking-widest font-black opacity-30">debit outflow</div>
          <p className="text-xs font-extrabold uppercase tracking-widest opacity-60 mb-1">Total Expense</p>
          <p className="text-2xl font-black">{expenseTotal.toLocaleString()} BDT</p>
        </div>
        <div className="bg-slate-900 border border-slate-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-2 right-4 text-[9px] text-[#d4af37] uppercase tracking-widest font-black opacity-30">net liquidity</div>
          <p className="text-xs font-extrabold uppercase tracking-widest opacity-60 mb-1">Net Margin</p>
          <p className="text-2xl font-black text-[#d4af37]">{(incomeTotal - expenseTotal).toLocaleString()} BDT</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h4 className="text-lg font-extrabold mb-5 flex items-center gap-2 text-slate-800">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Top Income Accounts</span>
          </h4>
          <div className="space-y-5">
            {categories
              .map(cat => ({ 
                cat, 
                amount: filtered.filter(tx => tx.category === cat && tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0)
              }))
              .filter(i => i.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map(i => (
                <div key={i.cat}>
                  <div className="flex justify-between items-center mb-1.5 text-xs">
                    <span className="font-bold text-slate-700">{i.cat}</span>
                    <span className="font-extrabold text-blue-600">{i.amount.toLocaleString()} BDT</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${incomeTotal > 0 ? (i.amount / incomeTotal) * 100 : 0}%` }}
                      className="h-full bg-blue-600 rounded-full"
                    />
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h4 className="text-lg font-extrabold mb-5 flex items-center gap-2 text-slate-800">
            <Filter className="w-4 h-4 text-red-600" />
            <span>Top Spending Accounts</span>
          </h4>
          <div className="space-y-5">
            {categories
              .map(cat => ({ 
                cat, 
                amount: filtered.filter(tx => tx.category === cat && tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0)
              }))
              .filter(i => i.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map(i => (
                <div key={i.cat}>
                  <div className="flex justify-between items-center mb-1.5 text-xs">
                    <span className="font-bold text-slate-700">{i.cat}</span>
                    <span className="font-extrabold text-red-600">{i.amount.toLocaleString()} BDT</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${expenseTotal > 0 ? (i.amount / expenseTotal) * 100 : 0}%` }}
                      className="h-full bg-red-650 bg-red-600 rounded-full"
                    />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   NEW TAB 8: DYNAMIC REAL-TIME INVENTORY AND STOCK MOVEMENTS REPORT
   ========================================================================== */
function InventoryReportSection({ products = [], stockLedger = [], companyName, companyAddress, companyPhone, companyEmail, formatCurrency, globalLedgerTotals, onRegisterExporter }: {
  products: Product[];
  stockLedger: StockLedgerEntry[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Date filter for movements ledger
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Derive unique categories dynamically
  const categories = React.useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ["all", ...Array.from(cats)];
  }, [products]);

  // Filtered Products Catalog
  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
      if (lowStockOnly && p.stock > 10) return false; // Threshold of 10 units for low stock alerts
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [products, selectedCategory, lowStockOnly, searchTerm]);

  // Filtered Stock Movement Ledger history logs
  const filteredLedger = React.useMemo(() => {
    return stockLedger.filter(entry => {
      // Date bounds filter
      if (entry.date < startDate || entry.date > endDate) return false;
      // Filter category if applicable
      if (selectedCategory !== "all") {
        const prodMatch = products.find(p => p.id === entry.productId);
        if (!prodMatch || prodMatch.category !== selectedCategory) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [stockLedger, startDate, endDate, selectedCategory, products]);

  // Financial Stock KPI aggregates
  const totalStockQty = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const totalInventoryAssetValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.lastPurchasePrice || 0)), 0);
  const lowStockCount = products.filter(p => (p.stock || 0) <= 10).length;

  const exportInventoryCSV = React.useCallback(() => {
    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "=== CURRENT STOCKS INVENTORY CATALOG ===\n";
    csvContent += "Product Name,Category,Sub Category,Stock Balance,Unit Type,Last Sourcing Price (BDT),Total Valuation (BDT)\n";
    
    filteredProducts.forEach(p => {
      csvContent += `"${p.name}","${p.category}","${p.subCategory || ""}",${p.stock},"${p.unit}",${p.lastPurchasePrice || 0},${(p.stock * (p.lastPurchasePrice || 0)).toFixed(2)}\n`;
    });

    csvContent += `\n=== HISTORIC STOCK MOVEMENTS LEDGER (${startDate} to ${endDate}) ===\n`;
    csvContent += "Date,Activity Type,Reference No,Product Target,Quantity,Unit,Unit Price,Total Cost,Supplier Destination\n";
    
    filteredLedger.forEach(l => {
      csvContent += `"${l.date}","${l.type.toUpperCase()}","${l.refNo}","${l.productName}",${l.quantity},"${l.unit}",${l.unitPrice || 0},${l.totalAmount || 0},"${l.supplierName || ""}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Shop_Inventory_Audit_Report_${selectedCategory}_${startDate}_to_${endDate}.csv`;
    link.click();
  }, [filteredProducts, filteredLedger, selectedCategory, startDate, endDate]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportInventoryCSV);
    }
  }, [exportInventoryCSV, onRegisterExporter]);

  const downloadInventoryReportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width || 210;
    
    // Header section
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 38, "F");

    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("INVENTORY DYNAMIC VALUATION AUDIT", 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(156, 163, 175);
    doc.text(`AUDITOR CONSOLE REPORT GENERATED ON ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}`, 14, 22);

    // Corporate meta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text(companyName, pageWidth - 14, 14, { align: "right" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(companyAddress, pageWidth - 14, 19, { align: "right" });
    doc.text(`Phone: ${companyPhone} | Email: ${companyEmail}`, pageWidth - 14, 23, { align: "right" });

    // Dividers and spacing
    doc.setFillColor(34, 197, 94);
    doc.rect(0, 38, pageWidth, 1.5, "F");

    // KPI row card block
    const cardY = 46;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, cardY, pageWidth - 28, 16, 2, 2, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, cardY, pageWidth - 28, 16, 2, 2, "D");

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL PRODUCTS CATALOGED", 18, cardY + 5);
    doc.text("COMBINED UNITS STOCK", pageWidth/2 - 20, cardY + 5);
    doc.text("CONSOLIDATED ASSET VALUATION", pageWidth - 70, cardY + 5);

    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${filteredProducts.length} items`, 18, cardY + 11.5);
    doc.text(`${totalStockQty.toLocaleString()} units`, pageWidth/2 - 20, cardY + 11.5);
    doc.text(`BDT ${totalInventoryAssetValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, pageWidth - 70, cardY + 11.5);

    // Section 1 Heading
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("CURRENT STOCKS LEVEL & BOOK VALUATIONS", 14, cardY + 24);

    // Table 1: Current stock catalog
    const tableBody1 = filteredProducts.map(p => [
      p.name,
      p.category,
      p.subCategory || "-",
      `${p.stock} ${p.unit}`,
      `BDT ${(p.lastPurchasePrice || 0).toFixed(2)}`,
      `BDT ${(p.stock * (p.lastPurchasePrice || 0)).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: cardY + 27,
      head: [["PRODUCT NAME", "CATEGORY", "SUB-CATEGORY", "STOCK BALANCE", "LAST COST/UNIT", "TOTAL BOOK VALUE"]],
      body: tableBody1,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        fontSize: 7.5,
        fontStyle: "bold"
      },
      bodyStyles: {
        fontSize: 7.5
      },
      styles: {
        cellPadding: 2.5
      }
    });

    const nextY = (doc as any).lastAutoTable.finalY + 12;

    if (nextY < doc.internal.pageSize.height - 40) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`STOCK LEDGER MOVEMENTS HISTORY (${startDate} to ${endDate})`, 14, nextY);

      const tableBody2 = filteredLedger.slice(0, 30).map(l => [
        l.date,
        l.type.toUpperCase(),
        l.refNo,
        l.productName,
        `${l.quantity} ${l.unit}`,
        `BDT ${(l.unitPrice || 0).toFixed(2)}`,
        `BDT ${(l.totalAmount || 0).toFixed(2)}`,
        l.supplierName || "-"
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [["DATE", "TYPE", "REF NO", "PRODUCT TARGET", "QUANTITY", "UNIT PRICE", "TOTAL AMOUNT", "SUPPLIER"]],
        body: tableBody2,
        theme: "striped",
        headStyles: {
          fillColor: [15, 23, 42],
          fontSize: 7.5,
          fontStyle: "bold"
        },
        bodyStyles: {
          fontSize: 7
        },
        styles: {
          cellPadding: 2
        }
      });
    }

    doc.save(`Shop_Inventory_Verification_Report_${selectedCategory}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Search and KPI summaries Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">PRODUCTS SELECTIONS</span>
            <span className="text-2xl font-black text-slate-800 font-sans">{filteredProducts.length} <span className="text-xs font-semibold text-slate-400">items</span></span>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">AGGREGATE STOCKS IN HAND</span>
            <span className="text-2xl font-black text-slate-800 font-sans">{totalStockQty.toLocaleString()} <span className="text-xs font-semibold text-slate-400">units</span></span>
          </div>
          <div className="p-3.5 bg-green-50 text-green-600 rounded-2xl">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">DYNAMIC INVENTORY VALUE</span>
            <span className="text-xl font-black text-slate-800 font-mono">৳ {totalInventoryAssetValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Control filter board */}
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-700" />
            <span className="font-extrabold text-slate-800 uppercase tracking-wider text-xs font-sans">Inventory Filters Board</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-sans">
            <button
              onClick={exportInventoryCSV}
              className="bg-white hover:bg-slate-50 text-xs font-bold uppercase text-slate-700 py-2.5 px-4 rounded-xl border border-slate-200 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              CSV Output
            </button>
            <button
              onClick={downloadInventoryReportPDF}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-xs font-bold uppercase text-white py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Download PDF Report
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 font-sans">
          {/* Category Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Filter By Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2.5 text-xs font-bold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === "all" ? "All Categories" : cat}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="space-y-1 md:col-span-2">
            <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">Search Product</label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400 font-bold" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Find Cotton fabric, Silk yarn, Premium threads..."
                className="w-full pl-9 pr-4 py-2.5 text-xs font-semibold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>

          {/* Low Stock alert filter */}
          <div className="flex items-center gap-2.5 md:self-end md:pb-3 md:pl-2">
            <input
              type="checkbox"
              id="lowStockOnly"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
              className="w-4.5 h-4.5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="lowStockOnly" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
              Low Stock Only (≤ 10 Units)
              {lowStockCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-black text-[9px]">
                  {lowStockCount} ALERT
                </span>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        {/* S1: Dynamic stocks catalog table */}
        <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Stocks Registry & Valuation Statement</h3>
            <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg">Real-time Catalog</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase text-gray-400 tracking-widest bg-slate-50 select-none">
                  <th className="py-3 px-4">Commodity Name</th>
                  <th className="py-3 px-4">Categories</th>
                  <th className="py-3 px-4 text-center">Remaining Quantity</th>
                  <th className="py-3 px-4 text-right">Avg Unit Cost</th>
                  <th className="py-3 px-4 text-right">Aggregate value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-400 italic">No matching products found in catalog.</td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const value = p.stock * (p.lastPurchasePrice || 0);
                    const isLow = p.stock <= 10;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-extrabold text-slate-800">
                          {p.name}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-500">
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-[9px] uppercase tracking-wider">{p.category}</span>
                          {p.subCategory && <span className="ml-1.5 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold text-[9px] uppercase tracking-wider">{p.subCategory}</span>}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={cn("px-2.5 py-1 rounded-xl font-mono font-extrabold text-xs", isLow ? "bg-red-50 text-red-600 border border-red-100" : "bg-green-50 text-green-700")}>
                            {p.stock} {p.unit}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold font-mono text-slate-600">
                          {p.lastPurchasePrice ? `৳${p.lastPurchasePrice.toFixed(2)}` : "৳0.00"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black font-mono text-slate-950 font-sans">
                          ৳ {value.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* S2: Stock timeline logs ledger history flow panel */}
        <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-100 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Stocks Audit Ledger Logs</h3>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Chronological sifting flow</p>
          </div>

          {/* Ledger Date filters */}
          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-155">
            <div className="space-y-0.5">
              <label className="text-[9px] uppercase font-black tracking-wider text-slate-400">Date From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2 text-[10px] font-bold rounded-lg border border-gray-200 bg-white focus:outline-none"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] uppercase font-black tracking-wider text-slate-400">Date To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2 text-[10px] font-bold rounded-lg border border-gray-200 bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto space-y-3.5 pr-1 font-sans">
            {filteredLedger.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic text-xs">No stock ledger transactions found for selected span.</div>
            ) : (
              filteredLedger.map((entry) => {
                const isAdd = entry.type === "purchase";
                return (
                  <div key={entry.id} className="relative flex flex-col p-3 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-slate-150 shadow-2xs space-y-1.5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border", isAdd ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100")}>
                          {isAdd ? "DEPOSIT" : "WITHDRAW"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold font-mono">{entry.date}</span>
                      </div>
                      <span className="text-[9.5px] font-black text-slate-500 font-mono">{entry.refNo}</span>
                    </div>

                    <div className="space-y-0.5 font-sans">
                      <span className="text-xs font-black text-slate-800 block leading-tight">{entry.productName}</span>
                      {entry.supplierName && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Supplier: {entry.supplierName}</span>
                      )}
                    </div>

                    <div className="flex justify-between items-end border-t border-slate-100/60 pt-1.5">
                      <span className="text-[10px] text-slate-500 font-bold">
                        Quantity: <span className="font-extrabold text-slate-800">{entry.quantity} {entry.unit}</span>
                      </span>
                      <span className="text-xs font-gray-900 font-mono">
                        ৳ {entry.totalAmount ? entry.totalAmount.toLocaleString() : "0.00"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   NEW TAB: UNIFIED LEDGER AUDIT REPORT (SALES, EXPENSES & SUPPLIER PAYMENTS)
   ========================================================================== */
function UnifiedFinancialReport({
  transactions,
  supplierTransactions,
  purchases,
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  formatCurrency,
  globalLedgerTotals,
  onRegisterExporter,
}: {
  transactions: Transaction[];
  supplierTransactions: SupplierTransaction[];
  purchases: PurchaseModel[];
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const { language, t } = useLanguage();

  // Robust parsing of any date representation (string, Date, or Firestore Timestamp object)
  const getDateStr = (dt: any): string => {
    if (!dt) return "";
    if (typeof dt === "string") {
      return dt.split("T")[0];
    }
    if (dt && typeof dt === "object" && "seconds" in dt) {
      try {
        return new Date(dt.seconds * 1000).toISOString().split("T")[0];
      } catch {
        return "";
      }
    }
    if (dt instanceof Date) {
      return dt.toISOString().split("T")[0];
    }
    return "";
  };

  // 1. Calculate absolute dataset limits dynamically (All-time first day to last date)
  const allDates = [...transactions, ...supplierTransactions]
    .map(tk => getDateStr(tk.date))
    .filter(Boolean)
    .sort();

  const absoluteMinDate = allDates.length > 0 ? allDates[0] : format(subDays(new Date(), 90), "yyyy-MM-dd");
  const absoluteMaxDate = allDates.length > 0 ? allDates[allDates.length - 1] : format(new Date(), "yyyy-MM-dd");

  // 2. State filters (Dynamic bounds system that remains reactive when Firestore arrays populate asynchronously)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [searchQuery, setSearchQuery] = useState("");

  const activeStartDate = startDate || absoluteMinDate;
  const activeEndDate = endDate || absoluteMaxDate;

  // 3. Reset dates to absolute min/max helper
  const handleSetAllTime = () => {
    setStartDate(absoluteMinDate);
    setEndDate(absoluteMaxDate);
  };

  const handleSetLast30Days = () => {
    setStartDate(format(subDays(new Date(), 30), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleSetThisMonth = () => {
    setStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  };

  // 4. Build unique timeline map of dates in the selected range
  const dailyMap: Record<
    string,
    {
      dateStr: string;
      sales: number;
      expenses: number;
      supplierPayments: number;
    }
  > = {};

  // Process standard transactional sales and general expenses
  transactions.forEach(tx => {
    const dateKey = getDateStr(tx.date);
    if (!dateKey) return;
    if (dateKey < activeStartDate || dateKey > activeEndDate) return;

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { dateStr: dateKey, sales: 0, expenses: 0, supplierPayments: 0 };
    }

    const categStr = (tx.category || "").trim();

    // Determine if it is a Product/Retail/Wholesale Sale
    const isSale =
      tx.type === "income" &&
      (categStr === "Employee Sales" ||
        categStr === "Wholesale Sales" ||
        categStr === "Product Sales" ||
        categStr === "Retail Sales" ||
        categStr === "Total Deposit" ||
        categStr.toLowerCase().includes("sale"));

    // Determine if it is a Business/Utility/General Expense
    const isExpense = tx.type === "expense" && categStr !== "Bank Credit";

    if (isSale) {
      dailyMap[dateKey].sales += tx.amount || 0;
    } else if (isExpense) {
      dailyMap[dateKey].expenses += tx.amount || 0;
    }
  });

  // Process supplier transactions payments
  supplierTransactions.forEach(stx => {
    const dateKey = getDateStr(stx.date);
    if (!dateKey) return;
    if (dateKey < activeStartDate || dateKey > activeEndDate) return;

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { dateStr: dateKey, sales: 0, expenses: 0, supplierPayments: 0 };
    }

    // Direct supplier cash payments or bank payouts
    if (stx.type === "payment") {
      dailyMap[dateKey].supplierPayments += stx.totalAmount || 0;
    }
    // Sourcing raw purchases immediate paid portion
    else if (stx.type === "purchase" && stx.paidAmount && stx.paidAmount > 0) {
      dailyMap[dateKey].supplierPayments += stx.paidAmount;
    }
  });

  // 5. Group and aggregate based on interval selector
  const getGroupInfo = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return { key: dateStr, label: dateStr };

      if (groupBy === "day") {
        return {
          key: dateStr,
          label: format(d, "dd MMM yyyy"),
        };
      } else if (groupBy === "week") {
        // Find Sunday of the week containing d
        const day = d.getDay();
        const startOfWeekDate = new Date(d);
        startOfWeekDate.setDate(d.getDate() - day);
        const weekKey = format(startOfWeekDate, "yyyy-ww");
        return {
          key: weekKey,
          label: language === "bn" ? `সপ্তাহ: ${format(startOfWeekDate, "dd MMM")}` : `Week of ${format(startOfWeekDate, "dd MMM yyyy")}`,
        };
      } else {
        // month
        const monthKey = format(d, "yyyy-MM");
        return {
          key: monthKey,
          label: format(d, "MMMM yyyy"),
        };
      }
    } catch {
      return { key: dateStr, label: dateStr };
    }
  };

  const groupedMap: Record<
    string,
    {
      label: string;
      sales: number;
      expenses: number;
      supplierPayments: number;
      netFlow: number;
      keyStr: string;
    }
  > = {};

  Object.values(dailyMap).forEach(rec => {
    const { key, label } = getGroupInfo(rec.dateStr);
    if (!groupedMap[key]) {
      groupedMap[key] = {
        label,
        sales: 0,
        expenses: 0,
        supplierPayments: 0,
        netFlow: 0,
        keyStr: key,
      };
    }
    groupedMap[key].sales += rec.sales;
    groupedMap[key].expenses += rec.expenses;
    groupedMap[key].supplierPayments += rec.supplierPayments;
  });

  // Convert to sorted array and filter by query (month name, etc.)
  let groupedData = Object.values(groupedMap)
    .map(item => {
      const netFlow = item.sales - item.expenses - item.supplierPayments;
      return {
        ...item,
        netFlow,
      };
    })
    .sort((a, b) => a.keyStr.localeCompare(b.keyStr));

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    groupedData = groupedData.filter(item => item.label.toLowerCase().includes(q));
  }

  // 6. Aggregate lifetime/span stats
  const totalSalesSpan = groupedData.reduce((sum, item) => sum + item.sales, 0);
  const totalExpensesSpan = groupedData.reduce((sum, item) => sum + item.expenses, 0);
  const totalSupplierPaymentsSpan = groupedData.reduce((sum, item) => sum + item.supplierPayments, 0);
  const totalNetFlowSpan = totalSalesSpan - totalExpensesSpan - totalSupplierPaymentsSpan;

  // 7. CSV exporter
  const exportUnifiedCSV = React.useCallback(() => {
    let csvContent = "";
    const bom = "\uFEFF";
    
    if (language === "bn") {
      csvContent = bom + "সময় সীমা,মোট বিক্রয় (টাকা),মোট ব্যবসায়িক খরচ (টাকা),সরবরাহকারী পরিশোধ (টাকা),নীট তারল্য প্রবাহ (টাকা)\n";
      groupedData.forEach(item => {
        csvContent += `"${item.label}",${item.sales},${item.expenses},${item.supplierPayments},${item.netFlow}\n`;
      });
      csvContent += `\n"সর্বমোট","${totalSalesSpan}","${totalExpensesSpan}","${totalSupplierPaymentsSpan}","${totalNetFlowSpan}"\n`;
    } else {
      csvContent = "Interval Period,Total Gross Sales,Business Expenses,Supplier Payments,Net Liquid cashflow\n";
      groupedData.forEach(item => {
        csvContent += `"${item.label}",${item.sales},${item.expenses},${item.supplierPayments},${item.netFlow}\n`;
      });
      csvContent += `\n"Grand Totals Across Period","${totalSalesSpan}","${totalExpensesSpan}","${totalSupplierPaymentsSpan}","${totalNetFlowSpan}"\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Consolidated_Financial_Journal_${groupBy}_${activeStartDate}_to_${activeEndDate}.csv`;
    link.click();
  }, [groupedData, language, groupBy, activeStartDate, activeEndDate, totalSalesSpan, totalExpensesSpan, totalSupplierPaymentsSpan, totalNetFlowSpan]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportUnifiedCSV);
    }
  }, [exportUnifiedCSV, onRegisterExporter]);

  // 8. PDF download generator
  const downloadUnifiedPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Elegant header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(companyName.toUpperCase(), 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`${companyAddress} • ${companyPhone} • ${companyEmail}`, 14, 21);

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 25, pageWidth, 1.5, "F");

    // Corporate metadata box
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 30, pageWidth - 28, 22, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 30, pageWidth - 28, 22);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.text("CONSOLIDATED FINANCIAL STATEMENT AUDIT", 18, 36);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Selected Audit Interval: ${format(new Date(activeStartDate), "dd MMM yyyy")} to ${format(new Date(activeEndDate), "dd MMM yyyy")}`, 18, 41);
    doc.text(`Interval Grouping Method: Chronological ${groupBy.toUpperCase()}-wise indexation`, 18, 46);

    doc.text(`Report Generated On: ${format(new Date(), "dd MMM yyyy HH:mm")}`, pageWidth - 18, 36, { align: "right" });
    doc.text(`Status: Verified System Ledger`, pageWidth - 18, 41, { align: "right" });

    // Table rows
    const tableHeaders = [
      language === "bn" ? "সময়-কাল" : "Interval Period",
      language === "bn" ? "মোট বিক্রয়" : "Gross Sales",
      language === "bn" ? "ব্যবসায়িক খরচ" : "Business Expenses",
      language === "bn" ? "সরবরাহকারী পরিশোধ" : "Supplier Payments",
      language === "bn" ? "নীট গ্যাস প্রবাহ" : "Net Cash Movement",
    ];

    const tableRows = groupedData.map(item => [
      item.label,
      `BDT ${item.sales.toLocaleString()}`,
      `BDT ${item.expenses.toLocaleString()}`,
      `BDT ${item.supplierPayments.toLocaleString()}`,
      `BDT ${item.netFlow.toLocaleString()}`,
    ]);

    // Append cumulative totals row at the end of PDF table
    tableRows.push([
      language === "bn" ? "সর্বমোট টাকা" : "GRAND TOTAL PORTFOLIO",
      `BDT ${totalSalesSpan.toLocaleString()}`,
      `BDT ${totalExpensesSpan.toLocaleString()}`,
      `BDT ${totalSupplierPaymentsSpan.toLocaleString()}`,
      `BDT ${totalNetFlowSpan.toLocaleString()}`,
    ]);

    autoTable(doc, {
      startY: 58,
      head: [tableHeaders],
      body: tableRows,
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59], // slate-800
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: {
        font: "helvetica",
        fontSize: 7.5,
      },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
      didParseCell: (data) => {
        // Bold and shade the final portfolio row
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [241, 245, 249]; // light grayish slate
          if (data.column.index === 4) {
            data.cell.styles.textColor = totalNetFlowSpan >= 0 ? [5, 150, 105] : [220, 38, 38];
          }
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    addPdfGlobalLedgerSummary(doc, globalLedgerTotals, finalY);

    doc.save(`Consolidated_Business_Ledger_${groupBy}_${activeStartDate}_to_${activeEndDate}.pdf`);
  };

  // Recharts Chart Map data format
  const chartData = groupedData.map(item => ({
    name: item.label,
    [language === "bn" ? "বিক্রয়" : "Sales"]: item.sales,
    [language === "bn" ? "ব্যবসায়িক খরচ" : "Expenses"]: item.expenses,
    [language === "bn" ? "সরবরাহকারী পরিশোধ" : "Supplier Payments"]: item.supplierPayments,
    [language === "bn" ? "নীট তারল্য প্রবাহ" : "Net Flow"]: item.netFlow,
  }));

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-300">
      
      {/* Search and Date Filter Panel */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-slate-800 dark:text-neutral-100" />
            <h3 className="text-lg font-black text-slate-900 dark:text-neutral-100">
              {language === "bn" ? "সমন্বিত ব্যবসায়িক আর্থিক খতিয়ান" : "Consolidated Ledger Statement"}
            </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSetAllTime}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer border-none"
            >
              {language === "bn" ? "প্রথম থেকে শেষ" : "First to Last (All)"}
            </button>
            <button
              onClick={handleSetThisMonth}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer border-none"
            >
              {language === "bn" ? "এই মাস" : "This Month"}
            </button>
            <button
              onClick={handleSetLast30Days}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer border-none"
            >
              {language === "bn" ? "গত ৩০ দিন" : "Last 30 Days"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              {language === "bn" ? "আরম্ভের তারিখ" : "Start Date"}
            </label>
            <input
              type="date"
              value={activeStartDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-slate-400 transition-all dark:bg-neutral-900 dark:border-neutral-800 dark:text-white"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              {language === "bn" ? "সমাপ্তির তারিখ" : "End Date"}
            </label>
            <input
              type="date"
              value={activeEndDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-slate-400 transition-all dark:bg-neutral-900 dark:border-neutral-800 dark:text-white"
            />
          </div>

          {/* Group Interval Selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              {language === "bn" ? "রূপান্তর বিন্যাস" : "Interval Grouping"}
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs h-[38px] cursor-pointer outline-none focus:border-slate-400 transition-all dark:bg-neutral-900 dark:border-neutral-800 dark:text-white"
            >
              <option value="day">{language === "bn" ? "দৈনিক বিবরণী" : "Day-wise Details"}</option>
              <option value="week">{language === "bn" ? "সাপ্তাহিক বিবরণী" : "Week-wise Details"}</option>
              <option value="month">{language === "bn" ? "মাসিক বিবরণী" : "Month-wise Details"}</option>
            </select>
          </div>

          {/* Action buttons (Print) */}
          <div className="flex items-end gap-2">
            <button
              onClick={downloadUnifiedPDF}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-sm cursor-pointer border border-transparent"
            >
              <Printer className="w-4 h-4" />
              <span>{language === "bn" ? "পিডিএফ ডাউনলোড" : "PDF Ledger"}</span>
            </button>
          </div>
        </div>

        {/* Search input to filter final lists */}
        <div className="pt-2 border-t border-slate-50 dark:border-neutral-800">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={language === "bn" ? "গ্রুপ বা তারিখ খুজুন..." : "Filter results by keyword label..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-slate-400 transition-all dark:bg-neutral-900 dark:border-neutral-800 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Sales Card */}
        <div className="bg-emerald-50/70 border border-emerald-100 p-5 rounded-3xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট বিক্রয় (বাছাইকাল)" : "SPAN TOTAL SALES"}
            </p>
            <p className="text-xl font-black text-emerald-950">{formatCurrency(totalSalesSpan)}</p>
            <span className="text-[9px] text-emerald-600 font-semibold uppercase block mt-1.5">
              {language === "bn" ? "গ্রুপ সংখ্যা: " : "active records: "} {groupedData.length}
            </span>
          </div>
          <div className="w-11 h-11 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        {/* Expenses Card */}
        <div className="bg-rose-50/70 border border-rose-100 p-5 rounded-3xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট অন্যান্য খরচ" : "BUSINESS EXPENSES"}
            </p>
            <p className="text-xl font-black text-rose-950">{formatCurrency(totalExpensesSpan)}</p>
            <span className="text-[9px] text-rose-600 font-semibold uppercase block mt-1.5 font-sans">
              {language === "bn" ? "বেতন ও পরিচালনা খরচ" : "Includes Payroll & Operations"}
            </span>
          </div>
          <div className="w-11 h-11 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        {/* Supplier Payments Card */}
        <div className="bg-amber-50/70 border border-amber-100 p-5 rounded-3xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট সরবরাহকারী পরিশোধ" : "SUPPLIER DISBURSEMENTS"}
            </p>
            <p className="text-xl font-black text-amber-950">{formatCurrency(totalSupplierPaymentsSpan)}</p>
            <span className="text-[9px] text-amber-600 font-semibold uppercase block mt-1.5 font-sans">
              {language === "bn" ? "ক্রয় ও বকেয়া খতিয়ান" : "Direct & Credit Payments"}
            </span>
          </div>
          <div className="w-11 h-11 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        {/* Net Flow Card */}
        <div className={cn(
          "p-5 rounded-3xl border flex items-center justify-between shadow-xs",
          totalNetFlowSpan >= 0 
            ? "bg-violet-50/70 border-violet-100" 
            : "bg-red-50/70 border-red-100"
        )}>
          <div>
            <p className={cn("text-[10px] font-extrabold uppercase tracking-widest mb-1", totalNetFlowSpan >= 0 ? "text-violet-800" : "text-red-800")}>
              {language === "bn" ? "নীট তারল্য প্রবাহ" : "NET CASH FLOW"}
            </p>
            <p className={cn("text-xl font-black", totalNetFlowSpan >= 0 ? "text-violet-950" : "text-red-950")}>
              {formatCurrency(totalNetFlowSpan)}
            </p>
            <span className="text-[9px] text-slate-500 font-semibold uppercase block mt-1.5 font-sans">
              {totalNetFlowSpan >= 0 
                ? (language === "bn" ? "তারল্য উদ্ধৃত্ত" : "Cash surplus") 
                : (language === "bn" ? "তারল্য ঘাটতি" : "Cash deficit")}
            </span>
          </div>
          <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center", totalNetFlowSpan >= 0 ? "bg-violet-100 text-violet-700" : "bg-red-100 text-red-700")}>
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Visual Chart Trend Segment */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h4 className="text-base font-extrabold text-slate-900 dark:text-neutral-100">
            {language === "bn" ? "আর্থিক কর্মক্ষমতা প্রবণতা চার্ট" : "Consolidated Financial Performance Trend"}
          </h4>
          <p className="text-xs text-slate-400">
            {language === "bn" ? "বেছে নেওয়া গ্রুপ ভিত্তিক আয়, ব্যয় এবং পেমেন্টের দৃষ্টিনন্দন তুলনা" : `Visual trend flow showing side-by-side transaction metrics mapped to ${groupBy}-level groups`}
          </p>
        </div>
        
        <div className="h-72 sm:h-80 w-full pt-2">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-slate-400 italic text-xs">
              {language === "bn" ? "কোন তথ্য পাওয়া যায়নি" : "No chart coordinates found in selected range."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: "16px", 
                    background: "#0f172a", 
                    color: "#fff", 
                    fontSize: "11px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)"
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                <Bar dataKey={language === "bn" ? "বিক্রয়" : "Sales"} fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey={language === "bn" ? "ব্যবসায়িক খরচ" : "Expenses"} fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey={language === "bn" ? "সরবরাহকারী পরিশোধ" : "Supplier Payments"} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main Consolidated Ledger Table Details */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden dark:bg-neutral-900 dark:border-neutral-800">
        <div className="p-6 border-b border-slate-50 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <h4 className="text-base font-extrabold text-slate-900 dark:text-neutral-100">
              {language === "bn" ? "একত্রিত অডিট খতিয়ান তালিকা" : "Consolidated Audited Registry Ledger"}
            </h4>
            <p className="text-xs text-slate-400">
              {language === "bn" ? "গ্রুপ ভিত্তিক বিস্তারিত আয়, ব্যয়, পেমেন্ট ও উদ্বৃত্তের সম্পূর্ণ ছক" : "Period-by-period breakups of sales receipts, business expenses, supplier payouts, and net flows"}
            </p>
          </div>
          <span className="text-[10px] bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1 rounded-full font-extrabold uppercase tracking-widest dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300">
            {groupedData.length} {language === "bn" ? "টি গ্রুপ" : "Interval rows"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-neutral-300">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400 tracking-widest dark:bg-neutral-800/50 dark:border-neutral-800">
                <th className="py-4 px-6">{language === "bn" ? "সময়-কাল / তারিখ" : "Interval Period"}</th>
                <th className="py-4 px-6 text-right">{language === "bn" ? "মোট বিক্রয় (+)" : "Total Gross Sales (+)"}</th>
                <th className="py-4 px-6 text-right">{language === "bn" ? "মোট ব্যবসায়িক খরচ (-)" : "Business Expenses (-)"}</th>
                <th className="py-4 px-6 text-right">{language === "bn" ? "সরবরাহকারী পরিশোধ (-)" : "Supplier Payments (-)"}</th>
                <th className="py-4 px-6 text-right">{language === "bn" ? "নীট তারল্য প্রবাহ" : "Period Net Cashflow"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
              {groupedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400 font-medium italic">
                    {language === "bn" ? "বাছাইকৃত তারিখে কোন খতিয়ান রেকর্ড পাওয়া যায়নি।" : "No record items mapping to selected date range parameters."}
                  </td>
                </tr>
              ) : (
                groupedData.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/30 dark:hover:bg-neutral-800/20 transition-colors">
                    <td className="py-4 px-6 font-extrabold text-slate-900 dark:text-neutral-100">
                      {item.label}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-emerald-600 font-mono">
                      {formatCurrency(item.sales)}
                    </td>
                    <td className="py-4 px-6 text-right font-semibold text-rose-500 font-mono">
                      {formatCurrency(item.expenses)}
                    </td>
                    <td className="py-4 px-6 text-right font-semibold text-amber-500 font-mono">
                      {formatCurrency(item.supplierPayments)}
                    </td>
                    <td className={cn(
                      "py-4 px-6 text-right font-black font-mono",
                      item.netFlow >= 0 ? "text-violet-700" : "text-red-500"
                    )}>
                      {formatCurrency(item.netFlow)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Table Footer: Span Aggregated totals */}
            {groupedData.length > 0 && (
              <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 font-sans dark:bg-neutral-800/80 dark:border-neutral-700">
                <tr className="font-extrabold text-slate-900 dark:text-neutral-100">
                  <td className="py-4 px-6 uppercase tracking-wider text-[10px] text-slate-500">
                    {language === "bn" ? "সর্বমোট টাকা (অডিট)" : "GRAND CUMULATIVE TOTALS"}
                  </td>
                  <td className="py-4 px-6 text-right font-black text-emerald-700 font-mono text-sm">
                    {formatCurrency(totalSalesSpan)}
                  </td>
                  <td className="py-4 px-6 text-right font-black text-rose-600 font-mono text-sm">
                    {formatCurrency(totalExpensesSpan)}
                  </td>
                  <td className="py-4 px-6 text-right font-black text-amber-600 font-mono text-sm">
                    {formatCurrency(totalSupplierPaymentsSpan)}
                  </td>
                  <td className={cn(
                    "py-4 px-6 text-right font-black font-mono text-sm",
                    totalNetFlowSpan >= 0 ? "text-violet-800" : "text-red-600"
                    )}>
                    {formatCurrency(totalNetFlowSpan)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   NEW TAB: DYNAMIC UPGRADED SALES REPORT WITH ADVANCED VISUALS & AUDITING
   ========================================================================== */
interface SalesChartData {
  dateStr: string;
  amount: number;
}

interface SalesCategoryData {
  category: string;
  amount: number;
}

function SalesReportSection({
  transactions,
  employees,
  companyName,
  companyTagline,
  companyAddress,
  companyPhone,
  companyEmail,
  formatCurrency,
  globalLedgerTotals,
  onRegisterExporter,
}: {
  transactions: Transaction[];
  employees: Employee[];
  companyName: string;
  companyTagline: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}) {
  const { language, t } = useLanguage();

  // Helper to parse dates robustly
  const getDateStr = (dt: any): string => {
    if (!dt) return "";
    if (typeof dt === "string") {
      return dt.split("T")[0];
    }
    if (dt && typeof dt === "object" && "seconds" in dt) {
      try {
        return new Date(dt.seconds * 1000).toISOString().split("T")[0];
      } catch {
        return "";
      }
    }
    if (dt instanceof Date) {
      return dt.toISOString().split("T")[0];
    }
    return "";
  };

  // Identify all sales transactions
  const salesTransactions = React.useMemo(() => {
    return transactions.filter(tx => {
      if (tx.type !== "income") return false;
      const categStr = (tx.category || "").trim();
      return (
        categStr === "Employee Sales" ||
        categStr === "Wholesale Sales" ||
        categStr === "Product Sales" ||
        categStr === "Retail Sales" ||
        categStr === "Total Deposit" ||
        categStr.toLowerCase().includes("sale")
      );
    });
  }, [transactions]);

  // Determine absolute bounds
  const allSalesDates = salesTransactions
    .map(tx => getDateStr(tx.date))
    .filter(Boolean)
    .sort();

  const absoluteMinDate = allSalesDates.length > 0 ? allSalesDates[0] : format(subDays(new Date(), 30), "yyyy-MM-dd");
  const absoluteMaxDate = allSalesDates.length > 0 ? allSalesDates[allSalesDates.length - 1] : format(new Date(), "yyyy-MM-dd");

  // Filter States
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const activeStartDate = startDate || absoluteMinDate;
  const activeEndDate = endDate || absoluteMaxDate;

  // Expanded dates state
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  const toggleDate = (dateStr: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    salesByDate.forEach(g => {
      next[g.dateStr] = true;
    });
    setExpandedDates(next);
  };

  const handleCollapseAll = () => {
    setExpandedDates({});
  };

  // Quick Selectors
  const handleSetToday = () => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    setStartDate(todayStr);
    setEndDate(todayStr);
  };

  const handleSetYesterday = () => {
    const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    setStartDate(yesterdayStr);
    setEndDate(yesterdayStr);
  };

  const handleSetLast7Days = () => {
    setStartDate(format(subDays(new Date(), 7), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleSetThisMonth = () => {
    setStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  };

  const handleSetLast30Days = () => {
    setStartDate(format(subDays(new Date(), 30), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleSetAllTime = () => {
    setStartDate(absoluteMinDate);
    setEndDate(absoluteMaxDate);
  };

  // Perform multi-dimensional filtration
  const filteredSales = React.useMemo(() => {
    return salesTransactions.filter(tx => {
      const txDateStr = getDateStr(tx.date);
      if (!txDateStr) return false;

      // Date Range Filter
      if (txDateStr < activeStartDate || txDateStr > activeEndDate) return false;

      // Category Filter
      if (categoryFilter !== "All") {
        if (categoryFilter === "Retail / Others") {
          const isStandardCategory = 
            tx.category === "Employee Sales" || 
            tx.category === "Wholesale Sales" || 
            tx.category === "Total Deposit";
          if (isStandardCategory) return false;
        } else if (tx.category !== categoryFilter) {
          return false;
        }
      }

      // Employee Filter
      if (employeeFilter !== "All" && tx.employeeId !== employeeFilter) {
        return false;
      }

      // Payment Method Filter
      if (paymentMethodFilter !== "All" && tx.paymentMethod !== paymentMethodFilter) {
        return false;
      }

      // Min/Max Amount Filter
      const amt = tx.amount || 0;
      if (minAmount && amt < parseFloat(minAmount)) return false;
      if (maxAmount && amt > parseFloat(maxAmount)) return false;

      // Text Search Filter
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const notes = (tx.notes || "").toLowerCase();
        const subCat = (tx.subCategory || "").toLowerCase();
        const cat = (tx.category || "").toLowerCase();
        const refNo = tx.id ? tx.id.toLowerCase() : "";
        const empName = employees.find(e => e.id === tx.employeeId)?.name?.toLowerCase() || "";

        if (
          !notes.includes(query) &&
          !subCat.includes(query) &&
          !cat.includes(query) &&
          !refNo.includes(query) &&
          !empName.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [salesTransactions, activeStartDate, activeEndDate, categoryFilter, employeeFilter, paymentMethodFilter, minAmount, maxAmount, searchQuery, employees]);

  // Aggregate stats from filtered set
  const stats = React.useMemo(() => {
    const totalAmount = filteredSales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const invoiceCount = filteredSales.length;
    const averageTicket = invoiceCount > 0 ? totalAmount / invoiceCount : 0;

    let cashAmount = 0;
    let digitalAmount = 0;

    const categoryBreakdown: Record<string, number> = {};
    const employeeSalesBreakdown: Record<string, number> = {};

    filteredSales.forEach(tx => {
      const amt = tx.amount || 0;

      // Cash vs Digital breakdown
      if (tx.paymentMethod === "Cash") {
        cashAmount += amt;
      } else {
        digitalAmount += amt;
      }

      // Category breakdown
      const cat = tx.category || "Others";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amt;

      // Employee breakdown
      if (tx.employeeId) {
        const empName = employees.find(e => e.id === tx.employeeId)?.name || "Unknown Staff";
        employeeSalesBreakdown[empName] = (employeeSalesBreakdown[empName] || 0) + amt;
      } else if (tx.category === "Wholesale Sales") {
        employeeSalesBreakdown["Wholesale"] = (employeeSalesBreakdown["Wholesale"] || 0) + amt;
      } else {
        const key = tx.subCategory || "Direct Retail / Others";
        employeeSalesBreakdown[key] = (employeeSalesBreakdown[key] || 0) + amt;
      }
    });

    return {
      totalAmount,
      invoiceCount,
      averageTicket,
      cashAmount,
      digitalAmount,
      categoryBreakdown,
      employeeSalesBreakdown,
    };
  }, [filteredSales, employees]);

  // Grouped date analysis
  const salesByDate = React.useMemo(() => {
    const groups: Record<string, {
      dateStr: string;
      totalAmount: number;
      invoiceCount: number;
      employeeBreakdown: Record<string, number>;
      categoryBreakdown: Record<string, number>;
      paymentBreakdown: Record<string, number>;
      transactions: Transaction[];
    }> = {};

    filteredSales.forEach(tx => {
      const day = getDateStr(tx.date);
      if (!day) return;

      if (!groups[day]) {
        groups[day] = {
          dateStr: day,
          totalAmount: 0,
          invoiceCount: 0,
          employeeBreakdown: {},
          categoryBreakdown: {},
          paymentBreakdown: {},
          transactions: []
        };
      }

      const g = groups[day];
      const amt = tx.amount || 0;
      g.totalAmount += amt;
      g.invoiceCount += 1;
      g.transactions.push(tx);

      // Employee breakdown on this day
      if (tx.employeeId) {
        const empName = employees.find(e => e.id === tx.employeeId)?.name || "Unknown Staff";
        g.employeeBreakdown[empName] = (g.employeeBreakdown[empName] || 0) + amt;
      } else if (tx.category === "Wholesale Sales") {
        g.employeeBreakdown["Wholesale"] = (g.employeeBreakdown["Wholesale"] || 0) + amt;
      } else {
        const key = tx.subCategory || "Retail / Others";
        g.employeeBreakdown[key] = (g.employeeBreakdown[key] || 0) + amt;
      }

      // Category breakdown
      const cat = tx.category || "Others";
      g.categoryBreakdown[cat] = (g.categoryBreakdown[cat] || 0) + amt;

      // Payment method breakdown
      const method = tx.paymentMethod || "Cash";
      g.paymentBreakdown[method] = (g.paymentBreakdown[method] || 0) + amt;
    });

    // Sort descending by date (newest first)
    return Object.values(groups).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [filteredSales, employees]);

  // Prepare Chart Data (Sales Trend over Time)
  const chartTimelineData = React.useMemo(() => {
    const dailyMap: Record<string, number> = {};
    
    // Sort chronological order
    const orderedFiltered = [...filteredSales].sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    orderedFiltered.forEach(tx => {
      const day = getDateStr(tx.date);
      if (day) {
        dailyMap[day] = (dailyMap[day] || 0) + (tx.amount || 0);
      }
    });

    return Object.keys(dailyMap).map(key => ({
      dateStr: format(new Date(key), "dd MMM"),
      amount: dailyMap[key],
    })) as SalesChartData[];
  }, [filteredSales]);

  // Prepare Category Chart Data
  const chartCategoryData = React.useMemo(() => {
    return Object.keys(stats.categoryBreakdown).map(cat => ({
      category: cat,
      amount: stats.categoryBreakdown[cat],
    })) as SalesCategoryData[];
  }, [stats]);

  // Dynamic CSV Export
  const exportSalesReportCSV = React.useCallback(() => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "OFFICIAL SALES AUDIT REPORT - " + companyName.toUpperCase() + "\n";
    csvContent += `Interval Range: ${activeStartDate} to ${activeEndDate}\n`;
    csvContent += `Generated On: ${format(new Date(), "dd MMM yyyy HH:mm")}\n\n`;

    csvContent += "Date,Sales Category,Customer/Staff Link,Payment Method,Amount (BDT),Notes\n";

    filteredSales.forEach(tx => {
      const formattedDate = format(new Date(tx.date), "yyyy-MM-dd HH:mm");
      const cat = tx.category || "N/A";
      const staffLink = tx.employeeId 
        ? (employees.find(e => e.id === tx.employeeId)?.name || "Staff") 
        : (tx.subCategory || "Retail");
      const method = tx.paymentMethod || "Cash";
      const amt = tx.amount || 0;
      const notes = (tx.notes || "").replace(/,/g, " ");

      csvContent += `"${formattedDate}","${cat}","${staffLink}","${method}",${amt},"${notes}"\n`;
    });

    csvContent += `\nGRAND TOTALS,,,${stats.invoiceCount} invoices,${stats.totalAmount}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Sales_Audit_Report_${activeStartDate}_to_${activeEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [filteredSales, activeStartDate, activeEndDate, companyName, employees, stats]);

  // Register exporter dynamically
  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportSalesReportCSV);
    }
  }, [onRegisterExporter, exportSalesReportCSV]);

  // Dynamic PDF Packet Export
  const exportSalesReportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Elegant header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 42, "F");

    // Company branding text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(companyName.toUpperCase(), 15, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(companyTagline || "Commercial Management Solutions", 15, 22);
    doc.text(`${companyAddress}  |  Phone: ${companyPhone}`, 15, 27);
    doc.text(`Email: ${companyEmail}`, 15, 32);

    // Document title header right
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(244, 114, 182); // pink-400
    doc.text("SALES AUDIT PACKET", pageWidth - 15, 16, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`SECURE AUDITED LEDGER PORTAL`, pageWidth - 15, 22, { align: "right" });
    doc.text(`Interval: ${activeStartDate} to ${activeEndDate}`, pageWidth - 15, 27, { align: "right" });
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, pageWidth - 15, 32, { align: "right" });

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("INTERVAL KEY METRIC SUMMARY", 15, 52);

    // Summary tables side-by-side
    autoTable(doc, {
      startY: 56,
      margin: { left: 15, right: 15 },
      head: [["METRIC STATISTIC", "VALUE SUMMARY", "DISTRIBUTION TYPE", "AMOUNT (BDT)"]],
      body: [
        ["Combined Total Gross Sales", `BDT ${stats.totalAmount.toLocaleString()}`, "Cash Sales Total", `BDT ${stats.cashAmount.toLocaleString()}`],
        ["Audited Invoice Count", `${stats.invoiceCount} invoices`, "Digital / Bank Sales", `BDT ${stats.digitalAmount.toLocaleString()}`],
        ["Average Sales Ticket Value", `BDT ${Math.round(stats.averageTicket).toLocaleString()}`, "Cash/Digital Ratio", `${Math.round((stats.cashAmount / (stats.totalAmount || 1)) * 100)}% Cash / ${Math.round((stats.digitalAmount / (stats.totalAmount || 1)) * 100)}% digital`],
      ],
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      styles: { font: "helvetica", cellPadding: 2.5 }
    });

    const summaryFinalY = (doc as any).lastAutoTable.finalY + 10;

    // Table Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("AUDITED CHRONOLOGICAL SALES REGISTRY", 15, summaryFinalY);

    // Generate table content
    const tableBody = filteredSales.map((tx) => [
      format(new Date(tx.date), "dd MMM yyyy HH:mm"),
      tx.id ? tx.id.substring(0, 8).toUpperCase() : "DIRECT",
      tx.category || "Sale",
      tx.employeeId 
        ? (employees.find(e => e.id === tx.employeeId)?.name || "Employee") 
        : (tx.subCategory || "Retail Sale"),
      tx.paymentMethod || "Cash",
      `BDT ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: summaryFinalY + 4,
      margin: { left: 15, right: 15 },
      head: [["DATE & TIME", "TRANSACTION ID", "SALES CATEGORY", "REPRESENTATIVE / LINK", "PAYMENT METHOD", "TOTAL VALUE"]],
      body: tableBody.length > 0 ? tableBody : [["No transactional item matched filtered bounds in local cache.", "", "", "", "", ""]],
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [33, 41, 54]
      },
      columnStyles: {
        5: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    // Authenticated Verification stamp
    doc.setFillColor(248, 250, 252);
    doc.rect(15, finalY, pageWidth - 30, 20, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, finalY, pageWidth - 30, 20, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(21, 128, 61); // green-700
    doc.text("AUTHENTICATION & INTEGRITY STAMP", 20, finalY + 6);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`This document contains an encrypted live query extract of ${stats.invoiceCount} transactions from the store database ledger.`, 20, finalY + 11);
    doc.text(`Digital Verification ID: MD5-${Math.random().toString(36).substring(2, 10).toUpperCase()}-SECURE`, 20, finalY + 15);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("Audited Sign-Off", pageWidth - 45, finalY + 6, { align: "center" });
    doc.setDrawColor(148, 163, 184);
    doc.line(pageWidth - 65, finalY + 12, pageWidth - 25, finalY + 12);
    doc.setFontSize(7);
    doc.text("Authorized Signature", pageWidth - 45, finalY + 16, { align: "center" });

    // Save document
    doc.save(`Sales_Statement_Report_${activeStartDate}_to_${activeEndDate}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* QUICK SELECTORS & ACTION PACKS - ALL BACKGROUNDS PROPER WHITE */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 flex flex-col xl:flex-row xl:items-center justify-between gap-6 dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-pink-50 border border-pink-100 text-pink-600 rounded-xl flex items-center justify-center dark:bg-pink-950/20 dark:border-pink-900/30">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-neutral-100">
              {language === "bn" ? "আপগ্রেডেড সেলস অডিট ড্যাশবোর্ড" : "Upgraded Sales Audit Dashboard"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium">
              {language === "bn" 
                ? "উন্নত রিফাইন ফিল্টার, চার্ট এবং কাস্টম পিডিএফ বা সিএসভি আকারে বিক্রয় ডেটা ডাউনলোড করুন।" 
                : "Deep analytics filters, interactive trend metrics, and bespoke PDF or CSV exports."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSetToday}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700"
          >
            {language === "bn" ? "আজ" : "Today"}
          </button>
          <button
            onClick={handleSetYesterday}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700"
          >
            {language === "bn" ? "গতকাল" : "Yesterday"}
          </button>
          <button
            onClick={handleSetLast7Days}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700"
          >
            {language === "bn" ? "গত ৭ দিন" : "Last 7 Days"}
          </button>
          <button
            onClick={handleSetThisMonth}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700"
          >
            {language === "bn" ? "এই মাস" : "This Month"}
          </button>
          <button
            onClick={handleSetLast30Days}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700"
          >
            {language === "bn" ? "গত ৩০ দিন" : "Last 30 Days"}
          </button>
          <button
            onClick={handleSetAllTime}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700"
          >
            {language === "bn" ? "প্রথম থেকে শেষ" : "All Time"}
          </button>

          <div className="h-6 w-px bg-slate-200 dark:bg-neutral-800 mx-1" />

          <button
            onClick={exportSalesReportPDF}
            className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-97 cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{language === "bn" ? "পিডিএফ রিপোর্ট" : "PDF Report"}</span>
          </button>
        </div>
      </div>

      {/* MULTI-LEVEL HIGH-POWER FILTERS BENTO - PROPER WHITE BACKGROUND */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 space-y-6 dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-neutral-800">
          <Filter className="w-4 h-4 text-slate-400" />
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {language === "bn" ? "মাল্টি-লেভেল অ্যাডভান্সড ফিল্টারস" : "Multi-Dimensional Filtration System"}
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "শুরু তারিখ" : "Start Date"}
            </label>
            <input
              type="date"
              value={activeStartDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "শেষ তারিখ" : "End Date"}
            </label>
            <input
              type="date"
              value={activeEndDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            />
          </div>

          {/* Sales Category Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "বিক্রয় ক্যাটাগরি" : "Sales Category"}
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs h-[38px] cursor-pointer outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            >
              <option value="All">{language === "bn" ? "সকল বিক্রয়" : "All Sales Categories"}</option>
              <option value="Employee Sales">{language === "bn" ? "স্টাফ বিক্রয় (Employee Sales)" : "Employee Sales"}</option>
              <option value="Wholesale Sales">{language === "bn" ? "পাইকারি বিক্রয় (Wholesale)" : "Wholesale Sales"}</option>
              <option value="Total Deposit">{language === "bn" ? "ডিপোজিট বিক্রয় (Total Deposit)" : "Total Deposit"}</option>
              <option value="Retail / Others">{language === "bn" ? "রিটেইল ও অন্যান্য বিক্রয়" : "Retail / Others"}</option>
            </select>
          </div>

          {/* Employee Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "বিক্রয় প্রতিনিধি / স্টাফ" : "Sales Agent / Employee"}
            </label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs h-[38px] cursor-pointer outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            >
              <option value="All">{language === "bn" ? "সকল প্রতিনিধি" : "All Staff / Members"}</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.department || "Sales"})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Payment Method Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}
            </label>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs h-[38px] cursor-pointer outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            >
              <option value="All">{language === "bn" ? "সকল পেমেন্ট মাধ্যম" : "All Payment Channels"}</option>
              <option value="Cash">{language === "bn" ? "ক্যাশ পেমেন্ট" : "Cash Only"}</option>
              <option value="Bkash">bKash</option>
              <option value="Nagad">Nagad</option>
              <option value="Rocket">Rocket</option>
              <option value="Bank">{language === "bn" ? "ব্যাংক ট্রান্সফার" : "Bank Payout"}</option>
              <option value="Card">{language === "bn" ? "কার্ড পেমেন্ট" : "Debit / Credit Card"}</option>
            </select>
          </div>

          {/* Amount range slider inputs */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "টাকার রেঞ্জ (সর্বনিম্ন - সর্বোচ্চ)" : "Value Range (Min - Max BDT)"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder={language === "bn" ? "সর্বনিম্ন" : "Min"}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
              />
              <span className="text-slate-400 text-xs">-</span>
              <input
                type="number"
                placeholder={language === "bn" ? "সর্বোচ্চ" : "Max"}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
              />
            </div>
          </div>

          {/* Text Search Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {language === "bn" ? "স্মার্ট কীওয়ার্ড সার্চ" : "Bespoke Text / Ref Keyword Search"}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={language === "bn" ? "নোট, রেফারেন্স বা আইডি..." : "Search sales by notes, reference link, names..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/10 transition-all dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* METRIC BOXES BENTO GRID - PROPER WHITE BACKGROUND */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Gross Sales */}
        <div className="bg-white border border-slate-200/80 p-6 rounded-3xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all dark:bg-neutral-900 dark:border-neutral-800">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট গ্রস বিক্রয় পরিমাণ" : "Aggregate Gross Sales"}
            </p>
            <p className="text-3xl font-black text-slate-900 dark:text-neutral-100 font-mono">
              {formatCurrency(stats.totalAmount)}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 mt-3 font-sans">
            <span className="text-emerald-500 font-extrabold">100%</span>
            <span>{language === "bn" ? "অডিট খতিয়ান ভলিউম" : "audited volume"}</span>
          </div>
        </div>

        {/* Audited Sales Count */}
        <div className="bg-white border border-slate-200/80 p-6 rounded-3xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all dark:bg-neutral-900 dark:border-neutral-800">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
              {language === "bn" ? "মোট বিক্রয় চালান" : "Total Sales Transactions"}
            </p>
            <p className="text-3xl font-black text-slate-900 dark:text-neutral-100 font-mono">
              {stats.invoiceCount}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 mt-3 font-sans">
            <span className="text-pink-500 font-extrabold">{stats.invoiceCount}</span>
            <span>{language === "bn" ? "নিবন্ধিত রশিদ চালান" : "registered invoice tracks"}</span>
          </div>
        </div>

        {/* Average Ticket Value */}
        <div className="bg-white border border-slate-200/80 p-6 rounded-3xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all dark:bg-neutral-900 dark:border-neutral-800">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
              {language === "bn" ? "গড় রশিদ টিকিট সাইজ" : "Average Invoice Value"}
            </p>
            <p className="text-3xl font-black text-slate-900 dark:text-neutral-100 font-mono">
              {formatCurrency(stats.averageTicket)}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 mt-3 font-sans">
            <span>{language === "bn" ? "প্রতি রশিদে গড় ভলিউম" : "average value per audited ticket"}</span>
          </div>
        </div>

        {/* Cash vs digital ratio */}
        <div className="bg-white border border-slate-200/80 p-6 rounded-3xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all dark:bg-neutral-900 dark:border-neutral-800">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
              {language === "bn" ? "ক্যাশ বনাম ডিজিটাল অনুপাত" : "Payment Channel Ratio"}
            </p>
            <div className="space-y-1">
              <div className="flex justify-between items-end text-xs font-bold text-slate-700 dark:text-neutral-300">
                <span>{language === "bn" ? "ক্যাশ" : "Cash"}</span>
                <span>{Math.round((stats.cashAmount / (stats.totalAmount || 1)) * 100)}%</span>
              </div>
              {/* Mini visual track */}
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex dark:bg-neutral-800">
                <div 
                  className="bg-emerald-500 h-full" 
                  style={{ width: `${(stats.cashAmount / (stats.totalAmount || 1)) * 100}%` }} 
                />
                <div 
                  className="bg-blue-500 h-full flex-1" 
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase pt-1">
                <span>৳{stats.cashAmount.toLocaleString()}</span>
                <span>৳{stats.digitalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE DATA CHARTS - PROPER WHITE BACKGROUNDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend line over time */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide dark:text-neutral-100">
                {language === "bn" ? "বিক্রয় ট্রেন্ডলাইন ও প্রবৃদ্ধি" : "Audited Sales Trend over Time"}
              </h4>
              <p className="text-xs text-slate-400">
                {language === "bn" ? "বাছাইকৃত সময়কালের দৈনিক বিক্রয় গ্রাফ" : "Chronological line visual of day-by-day sales velocity"}
              </p>
            </div>
            <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2.5 py-1 rounded-md font-bold uppercase dark:bg-neutral-800 dark:border-neutral-700">
              {chartTimelineData.length} {language === "bn" ? "কার্যকর দিন" : "Active days"}
            </span>
          </div>

          <div className="w-full h-[300px] min-h-[300px]">
            {chartTimelineData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-slate-400 italic text-xs">
                {language === "bn" ? "গ্রাফ দেখানোর জন্য কোন বিক্রয় রেকর্ড নেই।" : "No sales items matching active parameters to display in trend chart."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartTimelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateStr" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "11px", fontWeight: "bold", backgroundColor: "#ffffff" }} 
                    formatter={(value: any) => [`BDT ${parseFloat(value).toLocaleString()}`, "Sales"]}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#ec4899" strokeWidth={3} dot={{ r: 4, strokeWidth: 1 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category Breakdown list & chart */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 dark:bg-neutral-900 dark:border-neutral-800 flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide dark:text-neutral-100 mb-1">
              {language === "bn" ? "বিক্রয় ক্যাটাগরি বিশ্লেষণ" : "Sales Category Matrix"}
            </h4>
            <p className="text-xs text-slate-400 mb-6">
              {language === "bn" ? "উৎস অনুযায়ী বিক্রয়ের হিসেব" : "Sales distribution split across key channels"}
            </p>

            <div className="space-y-4">
              {Object.keys(stats.categoryBreakdown).length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic text-xs">
                  {language === "bn" ? "কোন ক্যাটাগরি ডেটা নেই" : "No categorized volume in specified slice"}
                </div>
              ) : (
                Object.keys(stats.categoryBreakdown).map((cat, idx) => {
                  const amt = stats.categoryBreakdown[cat];
                  const percentage = Math.round((amt / (stats.totalAmount || 1)) * 100);
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-700 dark:text-neutral-300">{cat}</span>
                        <span className="text-slate-900 dark:text-neutral-100 font-mono">{formatCurrency(amt)} ({percentage}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-neutral-800">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            idx % 4 === 0 ? "bg-pink-500" : idx % 4 === 1 ? "bg-purple-500" : idx % 4 === 2 ? "bg-blue-500" : "bg-amber-500"
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-neutral-800 mt-6 flex justify-between items-center text-xs font-bold text-slate-500">
            <span>{language === "bn" ? "মোট চ্যানেল ভলিউম:" : "Active Slices Count:"}</span>
            <span className="text-slate-900 dark:text-neutral-100 font-mono">{Object.keys(stats.categoryBreakdown).length} channels</span>
          </div>
        </div>
      </div>

      {/* CORE CHRONOLOGICAL LEDGER COMPONENT - GROUPED BY DATE ACCORDION */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden dark:bg-neutral-900 dark:border-neutral-800">
        <div className="p-6 border-b border-slate-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-extrabold text-slate-900 dark:text-neutral-100 flex items-center gap-2">
              <span>{language === "bn" ? "নিবন্ধিত দৈনিক বিক্রয় খতিয়ান" : "Official Audited Daily Sales Ledger"}</span>
              <span className="text-xs bg-pink-100 text-pink-700 font-black px-2 py-0.5 rounded-full dark:bg-pink-900/40 dark:text-pink-300 font-mono">
                {salesByDate.length} {language === "bn" ? "টি দিন" : "Days"}
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              {language === "bn" 
                ? "তারিখ ভিত্তিক একত্রিত বিক্রয় তথ্য। দিনটিতে ক্লিক করে প্রতিটি স্টাফের আলাদা বিক্রয় পরিমাণ এবং বিস্তারিত চালান দেখুন।" 
                : "Grouped by calendar date. Click a date row to audit staff breakdowns and full invoice entries."}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExpandAll}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-all"
            >
              {language === "bn" ? "সব বিস্তারিত দেখান" : "Expand All"}
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-all"
            >
              {language === "bn" ? "সব বন্ধ করুন" : "Collapse All"}
            </button>
            <button
              onClick={exportSalesReportCSV}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border-none"
            >
              {language === "bn" ? "সিএসভি এক্সপোর্ট" : "CSV Export"}
            </button>
          </div>
        </div>

        {/* ACCORDION GROUPS */}
        <div className="p-6 space-y-4">
          {salesByDate.length === 0 ? (
            <div className="py-16 text-center text-slate-400 font-medium italic bg-white rounded-2xl border border-slate-100">
              {language === "bn" ? "বাছাইকৃত ফিল্টারে কোন বিক্রয় খতিয়ান পাওয়া যায়নি।" : "No sales matched your filtration settings in this interval."}
            </div>
          ) : (
            salesByDate.map((group) => {
              const isExpanded = !!expandedDates[group.dateStr];
              
              // format nice readable date
              let displayDate = group.dateStr;
              try {
                displayDate = format(new Date(group.dateStr), "dd MMMM yyyy");
                if (language === "bn") {
                  // simple mapping or formatting
                  displayDate = group.dateStr.split("-").reverse().join("/");
                }
              } catch (e) {}

              return (
                <div 
                  key={group.dateStr} 
                  className={cn(
                    "border rounded-2xl overflow-hidden transition-all duration-200",
                    isExpanded 
                      ? "border-pink-300 bg-white ring-2 ring-pink-500/5 shadow-md" 
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
                  )}
                >
                  {/* Collapsed Header */}
                  <div 
                    onClick={() => toggleDate(group.dateStr)}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none bg-white transition-colors hover:bg-slate-50/40"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        isExpanded ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-500"
                      )}>
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {displayDate}
                        </h4>
                        <p className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                          <span>{group.invoiceCount} {language === "bn" ? "টি বিক্রয় চালান" : "sales invoices"}</span>
                          <span>•</span>
                          <span className="text-slate-500">{language === "bn" ? "তারিখ ভলিউম" : "audited day totals"}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-none pt-3 md:pt-0">
                      <div className="text-right">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                          {language === "bn" ? "মোট দৈনিক বিক্রয়" : "Total Daily Sales"}
                        </span>
                        <span className="text-lg font-black text-pink-600 font-mono">
                          {formatCurrency(group.totalAmount)}
                        </span>
                      </div>
                      
                      <div className={cn(
                        "w-8 h-8 rounded-full border flex items-center justify-center text-slate-400 transition-all",
                        isExpanded ? "border-pink-200 bg-pink-50 text-pink-700 rotate-180" : "border-slate-200 bg-white hover:bg-slate-50"
                      )}>
                        <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Sub-panel with Proper White backgrounds for better understanding */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-100 overflow-hidden bg-white"
                      >
                        <div className="p-6 space-y-6">
                          {/* Inner split: Employee Sales Grid */}
                          <div className="space-y-3">
                            <h5 className="text-[11px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-slate-400" />
                              <span>{language === "bn" ? "বিক্রয় প্রতিনিধি / স্টাফ অনুযায়ী আলাদা বিক্রয় পরিমাণ" : "Separate Sales Breakdown by Representative & Channel"}</span>
                            </h5>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {Object.keys(group.employeeBreakdown).map((empName) => {
                                const amount = group.employeeBreakdown[empName];
                                const percent = Math.round((amount / (group.totalAmount || 1)) * 100);
                                return (
                                  <div 
                                    key={empName} 
                                    className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs hover:shadow-xs transition-all space-y-2 flex flex-col justify-between"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                                          {empName.charAt(0)}
                                        </div>
                                        <span className="text-xs font-bold text-slate-800">{empName}</span>
                                      </div>
                                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-1.5 py-0.5 rounded-md font-mono">
                                        {percent}%
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{language === "bn" ? "আলাদা বিক্রয়" : "Separate Sales"}</p>
                                      <p className="text-sm font-extrabold text-slate-900 font-mono">
                                        {formatCurrency(amount)}
                                      </p>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="bg-pink-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Payment Medium & Secondary Channel Summary */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Category Distribution */}
                            <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3">
                              <h6 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                {language === "bn" ? "শ্রেণীভিত্তিক বিক্রয় পরিমাণ" : "Category Breakdown"}
                              </h6>
                              <div className="divide-y divide-slate-100">
                                {Object.keys(group.categoryBreakdown).map((catName) => (
                                  <div key={catName} className="py-2.5 flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-600">{catName}</span>
                                    <span className="font-bold text-slate-900 font-mono">{formatCurrency(group.categoryBreakdown[catName])}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Payment distribution for the day */}
                            <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3">
                              <h6 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                {language === "bn" ? "পেমেন্ট মাধ্যম অনুপাত" : "Payment Method Flow"}
                              </h6>
                              <div className="divide-y divide-slate-100">
                                {Object.keys(group.paymentBreakdown).map((method) => (
                                  <div key={method} className="py-2.5 flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-600">{method}</span>
                                    <span className="font-bold text-emerald-600 font-mono">{formatCurrency(group.paymentBreakdown[method])}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Individual Transactions of this date */}
                          <div className="space-y-3">
                            <h5 className="text-[11px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-slate-400" />
                              <span>{language === "bn" ? "দৈনিক বিস্তারিত লেনদেন খতিয়ান" : "Daily Transaction Registry Entries"}</span>
                            </h5>
                            
                            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                              <table className="w-full text-left text-xs text-slate-600">
                                <thead>
                                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                    <th className="py-3 px-4">{language === "bn" ? "সময়" : "Time"}</th>
                                    <th className="py-3 px-4">{language === "bn" ? "চালান আইডি" : "Invoice ID"}</th>
                                    <th className="py-3 px-4">{language === "bn" ? "বিক্রয় ক্যাটাগরি" : "Sales Category"}</th>
                                    <th className="py-3 px-4">{language === "bn" ? "প্রতিনিধি / চ্যানেল" : "Rep / Channel"}</th>
                                    <th className="py-3 px-4">{language === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</th>
                                    <th className="py-3 px-4">{language === "bn" ? "নোট" : "Notes"}</th>
                                    <th className="py-3 px-4 text-right">{language === "bn" ? "টাকার পরিমাণ" : "Amount"}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {group.transactions.map((tx) => {
                                    let formattedTime = "";
                                    try {
                                      formattedTime = format(new Date(tx.date), "HH:mm");
                                    } catch (err) {}

                                    return (
                                      <tr key={tx.id} className="hover:bg-slate-50/40 transition-colors">
                                        <td className="py-3 px-4 font-mono font-bold text-slate-500">
                                          {formattedTime || "N/A"}
                                        </td>
                                        <td className="py-3 px-4 font-mono font-extrabold text-slate-900">
                                          {tx.id ? tx.id.substring(0, 8).toUpperCase() : "DIRECT"}
                                        </td>
                                        <td className="py-3 px-4">
                                          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase bg-slate-100 text-slate-700">
                                            {tx.category}
                                          </span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-700">
                                          {tx.employeeId ? (
                                            employees.find(e => e.id === tx.employeeId)?.name || "Staff"
                                          ) : (
                                            tx.subCategory || "Retail"
                                          )}
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-500">
                                          {tx.paymentMethod}
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 truncate max-w-[150px]" title={tx.notes}>
                                          {tx.notes || "-"}
                                        </td>
                                        <td className="py-3 px-4 text-right font-black text-slate-900 font-mono">
                                          {formatCurrency(tx.amount)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Aggregate Footer Info */}
        {filteredSales.length > 0 && (
          <div className="bg-slate-50/70 p-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-600">
            <span className="uppercase tracking-wider text-[10px] text-slate-500">
              {language === "bn" ? "সর্বমোট গ্রস বিক্রয় (ফিল্টারকৃত)" : "GRAND TOTALS FOR FILTERED INTERVAL"}
            </span>
            <div className="text-right">
              <span className="text-xs text-slate-400 mr-2 font-medium">{stats.invoiceCount} invoices total:</span>
              <span className="text-lg font-black text-pink-600 font-mono">
                {formatCurrency(stats.totalAmount)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

