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

type ReportTab = "daily" | "bank" | "salary" | "supplier" | "purchase" | "attendance" | "transactions" | "inventory";

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
            {(["daily", "bank", "salary", "supplier", "purchase", "attendance", "transactions", "inventory"] as ReportTab[]).map(tab => (
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
                {t(tab)}
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

  // Filters salary and advances
  const filteredTxs = transactions.filter(tx => {
    const isSalaryOrAdvance = tx.category === "Salary" || tx.category === "Staff Salary" || tx.category === "Salary Advance" || tx.category === "Staff Advance";
    if (!isSalaryOrAdvance) return false;
    
    if (new Date(tx.date).getFullYear().toString() !== targetYear) return false;
    
    if (selectedEmpId !== "all") {
      if (tx.employeeId !== selectedEmpId) return false;
    }
    return true;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Aggregate stats
  const totalSalaryPayout = filteredTxs
    .filter(tx => tx.category === "Salary" || tx.category === "Staff Salary")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalAdvancePayout = filteredTxs
    .filter(tx => tx.category === "Salary Advance" || tx.category === "Staff Advance")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const exportSalaryCSV = React.useCallback(() => {
    let csvContent = "Disbursement Date,Employee Name,Ledger Account,Method,Amount Paid (BDT),Reference Note\n";
    filteredTxs.forEach(tx => {
      const empName = employees.find(e => e.id === tx.employeeId)?.name || "Unknown";
      const dt = tx.date ? tx.date.split("T")[0] : "";
      csvContent += `"${dt}","${empName}","${tx.category}","${tx.paymentMethod}",${tx.amount},"${(tx.notes || "").replace(/"/g, '""')}"\n`;
    });
    
    csvContent += `\n"Total Salary Paid","","","",${totalSalaryPayout},""\n`;
    csvContent += `"Total Advances Paid","","","",${totalAdvancePayout},""\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Salary_Report_${selectedEmpId}_Year_${targetYear}.csv`;
    link.click();
  }, [filteredTxs, employees, selectedEmpId, targetYear, totalSalaryPayout, totalAdvancePayout]);

  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportSalaryCSV);
    }
  }, [exportSalaryCSV, onRegisterExporter]);

  // Selected Employee Basic Reference
  const empTarget = employees.find(e => e.id === selectedEmpId);

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
    doc.text(`Issuer: HR Department || Target Year: ${targetYear}`, 14, 28);
    
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
      tx.category,
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

    doc.save(`Salary_Audit_${selectedEmpId}_${targetYear}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-300">
      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xl font-extrabold text-slate-900 mb-5 flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-800" />
          <span>Staff Payroll Ledger Filters</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Target Staff / Employee</label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="all">All Employees Combined</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Fiscal Year</label>
            <select
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
            >
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={downloadSalaryReportPDF}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold tracking-wider uppercase transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>PDF Payroll Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl">
          <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">Target Monthly Salary</p>
          <p className="text-2xl font-black text-slate-900">
            {empTarget ? formatCurrency(empTarget.salary) : "N/A (Multiple staff)"}
          </p>
          {empTarget && (
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">department: {empTarget.department || "General"}</p>
          )}
        </div>

        <div className="bg-green-50 border border-green-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-green-850 uppercase tracking-widest mb-1">Total Salary Paid (Yearly)</p>
            <p className="text-2xl font-black text-green-950">{formatCurrency(totalSalaryPayout)}</p>
          </div>
          <div className="w-11 h-11 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-amber-850 uppercase tracking-widest mb-1">Total Advances Issued</p>
            <p className="text-2xl font-black text-amber-950">{formatCurrency(totalAdvancePayout)}</p>
          </div>
          <div className="w-11 h-11 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
            <Info className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* History Ledger Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">Disbursement Date</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">Employee Name</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">Category</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">Payment Channel</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100 text-right">Amount Out (BDT)</th>
              <th className="px-6 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest border-b border-slate-100">Comments/Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredTxs.map(tx => (
              <tr key={tx.id} className="hover:bg-slate-50/30 transition-all">
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="font-bold text-slate-900">{format(new Date(tx.date), "dd MMM yyyy")}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-800">
                  {employees.find(e => e.id === tx.employeeId)?.name || "Unknown"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide",
                    tx.category.includes("Advance") 
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-green-100 text-green-800 border border-green-200"
                  )}>
                    {tx.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <span className="px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-600 uppercase text-[9px]">
                    {tx.paymentMethod}
                   </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-black text-slate-900">
                  {formatCurrency(tx.amount)}
                </td>
                <td className="px-6 py-4 text-slate-500 max-w-xs truncate italic">
                  {tx.notes || "—"}
                </td>
              </tr>
            ))}
            {filteredTxs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-slate-400 italic font-medium">
                  No payroll/salary dispatch matches for fiscal {targetYear}.
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
