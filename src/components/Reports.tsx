import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, getDocs, orderBy, doc, onSnapshot } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Transaction, UserRole, Bank, Employee, Supplier, SupplierTransaction } from "@/src/types";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrency, cn } from "@/src/lib/utils";
import { format, startOfDay, endOfDay, subDays, isWithinInterval, isBefore, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear } from "date-fns";
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
  ShoppingBag,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plane,
  ArrowLeft,
  CalendarDays
} from "lucide-react";
import { motion } from "motion/react";

type ReportTab = "daily" | "attendance" | "salary" | "transactions" | "purchasing";

export default function Reports({ user, role }: { user: User; role: UserRole }) {
  const { language, t, formatCurrency, formatDate, formatNumber, translateValue } = useLanguage();
  const [activeTab, setActiveTab] = useState<ReportTab>("daily");

  // Dynamic company settings context
  const [companyName, setCompanyName] = useState("Modern Shop");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyPhone, setCompanyPhone] = useState("+880 1234 567890");
  const [companyEmail, setCompanyEmail] = useState("info@modernmanager.com");
  const [companyAddress, setCompanyAddress] = useState("Dhaka, Bangladesh");

  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Shop");
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
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [csvStartDate, setCsvStartDate] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [csvEndDate, setCsvEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Month selection for other reports
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));

  // Stats for the selected day
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

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
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

      const supTxSnap = await getDocs(collection(db, "supplierTransactions"));
      setSupplierTransactions(supTxSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupplierTransaction)));

      setLoading(false);
    }
    fetchData();
  }, []);

  useEffect(() => {
    const dayStart = startOfDay(new Date(selectedDate));
    const dayEnd = endOfDay(new Date(selectedDate));

    const todayTxs = transactions.filter(tx => 
      isWithinInterval(new Date(tx.date), { start: dayStart, end: dayEnd })
    );

    // 1. Calculate Opening Balance
    // Check if there is a manual "Opening Balance" or "Previous Cash" entry for today
    const manualOpening = todayTxs.find(tx => tx.category === "Opening Balance" || tx.category === "Previous Cash");
    
    let openingBalance = 0;
    if (manualOpening) {
      openingBalance = manualOpening.amount;
    } else {
      // Fallback: Calculate previous cash (sum of all cash transactions before today)
      openingBalance = transactions
        .filter(tx => isBefore(new Date(tx.date), dayStart) && tx.paymentMethod === "Cash")
        .reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0);
    }

    // 2. Merge Sales (Retail + Wholesale) exactly as calculated in SalesList to show "new sales grand total"
    const salesListTxsForDay = todayTxs.filter(tx => 
      tx.type === "income" && 
      (tx.category === "Employee Sales" || 
       tx.category === "Wholesale Sales" || 
       tx.category === "Total Deposit" ||
       tx.category.toLowerCase().includes("sale") || 
       tx.category === "Product Sales" ||
       tx.category === "Retail Sales")
    );

    let totalEmployeeSales = 0;
    let totalWholesaleSales = 0;
    let totalDeposit = 0;

    salesListTxsForDay.forEach(tx => {
      if (tx.category === "Employee Sales") {
        totalEmployeeSales += tx.amount;
      } else if (tx.category === "Wholesale Sales" || tx.category.toLowerCase().includes("wholesale")) {
        totalWholesaleSales += tx.amount;
      } else if (tx.category === "Total Deposit" || tx.category.toLowerCase() === "deposit") {
        totalDeposit += tx.amount;
      } else {
        totalEmployeeSales += tx.amount;
      }
    });

    const todaySales = totalEmployeeSales + totalWholesaleSales - totalDeposit;

    const otherIncome = todayTxs
      .filter(tx => {
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
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const bankExpenses = todayTxs
      .filter(tx => {
        if (tx.type === "expense" && tx.category !== "Bank Credit") {
          return tx.paymentMethod !== "Cash";
        }
        if (tx.type === "income" && tx.category === "Bank Deposit") {
          return true;
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
    const totalExpense = bankExpenses + generalExpenses;
    const netCash = openingBalance + totalIncome - totalExpense;

    setDayStats({
      openingBalance,
      todaySales,
      otherIncome,
      bankExpenses,
      generalExpenses,
      totalIncome,
      totalExpense,
      netCash
    });
  }, [selectedDate, transactions]);

  const exportToCSV = (type: ReportTab) => {
    let csvContent = "";
    const bom = "\uFEFF";
    let fileName = `report_${type}_${format(new Date(), "yyyyMMdd")}.csv`;

    if (type === "daily") {
      const start = startOfDay(new Date(csvStartDate));
      const end = endOfDay(new Date(csvEndDate));
      const rangeTxs = transactions.filter(tx => 
        isWithinInterval(new Date(tx.date), { start, end })
      );
      
      if (language === "bn") {
        csvContent = bom + "তারিখ,ক্যাটাগরি,সাব-ক্যাটাগরি,প্রকার,লেনদেনের মাধ্যম,পরিমাণ,মন্তব্য\n";
        rangeTxs.forEach(tx => {
          csvContent += `"${formatDate(tx.date)}","${translateValue(tx.category)}","${tx.subCategory ? translateValue(tx.subCategory) : ""}","${translateValue(tx.type)}","${translateValue(tx.paymentMethod)}","${formatNumber(tx.amount)}","${tx.notes || ""}"\n`;
        });
        csvContent += `\nপ্রতিবেদন তৈরির সময়: "${formatDate(new Date())}"\n`;
        fileName = `দৈনিক_বিবরণী_${csvStartDate}_থেকে_${csvEndDate}.csv`;
      } else {
        csvContent = "Date,Category,Sub-Category,Type,Payment Method,Amount,Notes\n";
        rangeTxs.forEach(tx => {
          csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${tx.category}","${tx.subCategory || ""}","${tx.type}","${tx.paymentMethod}",${tx.amount},"${tx.notes || ""}"\n`;
        });
        csvContent += `\nReport Generated on: "${format(new Date(), "yyyy-MM-dd HH:mm")}"\n`;
        fileName = `daily_statement_${csvStartDate}_to_${csvEndDate}.csv`;
      }
    } 
    else if (type === "attendance") {
      if (language === "bn") {
        csvContent = bom + "তারিখ,কর্মচারী,ভূমিকা,উপস্থিতি অবস্থা,প্রবেশ সময়,লাঞ্চ বিরতি প্রস্থান,লাঞ্চ বিরতি প্রবেশ\n";
        attendance.forEach(att => {
          const emp = employees.find(e => e.id === att.employeeId);
          csvContent += `"${formatDate(att.date)}","${emp?.name || "অজানা"}","${emp?.role ? translateValue(emp.role) : ""}","${translateValue(att.status)}","${att.checkIn || ""}","${att.lunchOut || ""}","${att.lunchIn || ""}"\n`;
        });
        csvContent += `\nপ্রতিবেদন তৈরির সময়: "${formatDate(new Date())}"\n`;
        fileName = `উপস্থিতি_বিবরণী_${format(new Date(), "yyyyMMdd")}.csv`;
      } else {
        csvContent = "Date,Employee,Role,Status,Check In,Lunch Out,Lunch In\n";
        attendance.forEach(att => {
          const emp = employees.find(e => e.id === att.employeeId);
          csvContent += `${format(new Date(att.date), "yyyy-MM-dd")},"${emp?.name || "Unknown"}","${emp?.role || ""}","${att.status}","${att.checkIn || ""}","${att.lunchOut || ""}","${att.lunchIn || ""}"\n`;
        });
        csvContent += `\nReport Generated on: "${format(new Date(), "yyyy-MM-dd HH:mm")}"\n`;
        fileName = `attendance_report_${format(new Date(), "yyyyMMdd")}.csv`;
      }
    }
    else if (type === "salary") {
      if (language === "bn") {
        csvContent = bom + "তারিখ,কর্মচারী,বেতন পরিমাণ,পেমেন্ট পদ্ধতি,মন্তব্য\n";
        const salaryTxs = transactions.filter(tx => tx.category === "Salary");
        salaryTxs.forEach(tx => {
          const emp = employees.find(e => e.id === tx.employeeId);
          csvContent += `"${formatDate(tx.date)}","${emp?.name || "অজানা"}","${formatNumber(tx.amount)}","${translateValue(tx.paymentMethod)}","${tx.notes || ""}"\n`;
        });
        csvContent += `\nপ্রতিবেদন তৈরির সময়: "${formatDate(new Date())}"\n`;
        fileName = `বেতন_খতিয়ান_${format(new Date(), "yyyyMMdd")}.csv`;
      } else {
        csvContent = "Date,Employee,Amount,Method,Notes\n";
        const salaryTxs = transactions.filter(tx => tx.category === "Salary");
        salaryTxs.forEach(tx => {
          const emp = employees.find(e => e.id === tx.employeeId);
          csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${emp?.name || "Unknown"}",${tx.amount},"${tx.paymentMethod}","${tx.notes || ""}"\n`;
        });
        csvContent += `\nReport Generated on: "${format(new Date(), "yyyy-MM-dd HH:mm")}"\n`;
        fileName = `salary_report_${format(new Date(), "yyyyMMdd")}.csv`;
      }
    }
    else if (type === "purchasing") {
      if (language === "bn") {
        csvContent = bom + "তারিখ,সরবরাহকারী,ধরণ,চালান নং,মোট পরিমাণ,পরিশোধিত পরিমাণ,বকেয়া পরিমাণ\n";
        supplierTransactions.forEach(tx => {
          const sup = suppliers.find(s => s.id === tx.supplierId);
          csvContent += `"${formatDate(tx.date)}","${sup?.name || "অজানা"}","${translateValue(tx.type)}","${tx.refNo}","${formatNumber(tx.totalAmount)}","${tx.paidAmount ? formatNumber(tx.paidAmount) : "০"}","${tx.dueAmount ? formatNumber(tx.dueAmount) : "০"}"\n`;
        });
        csvContent += `\nপ্রতিবেদন তৈরির সময়: "${formatDate(new Date())}"\n`;
        fileName = `সরবরাহকারী_ক্রয়_খতিয়ান_${format(new Date(), "yyyyMMdd")}.csv`;
      } else {
        csvContent = "Date,Supplier,Type,Invoice Ref,Total Amount,Paid Amount,Due Amount\n";
        supplierTransactions.forEach(tx => {
          const sup = suppliers.find(s => s.id === tx.supplierId);
          csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${sup?.name || "Unknown"}","${tx.type}","${tx.refNo}",${tx.totalAmount},${tx.paidAmount || 0},${tx.dueAmount || 0}\n`;
        });
        csvContent += `\nReport Generated on: "${format(new Date(), "yyyy-MM-dd HH:mm")}"\n`;
        fileName = `supplier_purchasing_report_${format(new Date(), "yyyyMMdd")}.csv`;
      }
    }
    else if (type === "transactions") {
      if (language === "bn") {
        csvContent = bom + "তারিখ,ক্যাটাগরি,প্রকার,পেমেন্ট পদ্ধতি,পরিমাণ,রেফারেন্স মন্তব্য\n";
        transactions.forEach(tx => {
          csvContent += `"${formatDate(tx.date)}","${translateValue(tx.category)}","${translateValue(tx.type)}","${translateValue(tx.paymentMethod)}","${formatNumber(tx.amount)}","${tx.notes || ""}"\n`;
        });
        csvContent += `\nপ্রতিবেদন তৈরির সময়: "${formatDate(new Date())}"\n`;
        fileName = `লেনদেন_খতিয়ান_${format(new Date(), "yyyyMMdd")}.csv`;
      } else {
        csvContent = "Date,Category,Type,Payment Method,Amount,Reference\n";
        transactions.forEach(tx => {
          csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${tx.category}","${tx.type}","${tx.paymentMethod}",${tx.amount},"${tx.notes || ""}"\n`;
        });
        csvContent += `\nReport Generated on: "${format(new Date(), "yyyy-MM-dd HH:mm")}"\n`;
        fileName = `transactions_ledger_${format(new Date(), "yyyyMMdd")}.csv`;
      }
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
    const confirmMessage = language === "bn"
      ? "আপনি কি নিশ্চিতভাবে এই দৈনিক রিপোর্ট পিডিএফ ডাউনলোড বা প্রিন্ট করতে চান?"
      : "Are you sure you want to download or print the Daily Report PDF?";
    if (!window.confirm(confirmMessage)) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Dynamic Corporate Branding Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900

    const companyTitleStr = companyName.toUpperCase();
    const companyTitleWidth = doc.getTextWidth(companyTitleStr);
    doc.text(companyTitleStr, pageWidth/2 - (companyTitleWidth/2), 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    const companyTaglineStr = `${companyTagline} • Phone: ${companyPhone} • Address: ${companyAddress}`;
    const taglineWidth = doc.getTextWidth(companyTaglineStr);
    doc.text(companyTaglineStr, pageWidth/2 - (taglineWidth/2), 22);
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);

    // TOP BOX GRID
    const boxY = 30;
    doc.setFillColor(243, 244, 246);
    doc.rect(14, boxY, pageWidth - 28, 20, "F");
    doc.rect(14, boxY, pageWidth - 28, 20);
    doc.line(pageWidth/2, boxY, pageWidth/2, boxY + 20);
    doc.line(14, boxY + 10, pageWidth - 28 + 14, boxY + 10);

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(language === "bn" ? "Previous Cash (পূর্বের ক্যাশ):" : "Previous Cash:", 18, boxY + 7);
    doc.text(formatCurrency(dayStats.openingBalance), pageWidth/2 - 5, boxY + 7, { align: "right" });
    
    doc.text(language === "bn" ? "Today's Sales (আজকের বিক্রি):" : "Today's Total Sales:", 18, boxY + 17);
    doc.text(formatCurrency(dayStats.todaySales), pageWidth/2 - 5, boxY + 17, { align: "right" });

    doc.text(language === "bn" ? "Date (তারিখ):" : "Date:", pageWidth/2 + 5, boxY + 7);
    doc.text(language === "bn" ? formatDate(new Date(selectedDate)) : format(new Date(selectedDate), "dd/MM/yyyy"), pageWidth - 18, boxY + 7, { align: "right" });

    doc.text(`${companyName} || ${new Date().getFullYear()}`, pageWidth/2 + 5, boxY + 17);
    doc.text(language === "bn" ? "Status: Verified (যাচাইকৃত)" : "Status: Verified", pageWidth - 18, boxY + 17, { align: "right" });

    // COLUMNS HEADERS
    const colY = 55;
    const colWidth = (pageWidth - 28 - 4) / 2;
    
    // Left Column Header (Blue)
    doc.setFillColor(30, 58, 138);
    doc.rect(14, colY, colWidth, 8, "F");
    doc.setTextColor(255);
    doc.text("INCOME DETAILS", 14 + colWidth/2, colY + 5.5, { align: "center" });

    // Right Column Header (Red)
    doc.setFillColor(220, 38, 38);
    doc.rect(pageWidth - 14 - colWidth, colY, colWidth, 8, "F");
    doc.setTextColor(255);
    doc.text("EXPENSE DETAILS", pageWidth - 14 - colWidth/2, colY + 5.5, { align: "center" });

    // Table Data
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
      if (tx.type === "income" && tx.category === "Bank Deposit") {
        return true;
      }
      return false;
    });
    
    // Fetch employee names for report
    const empSnap = await getDocs(collection(db, "employees"));
    const empMap = new Map(empSnap.docs.map(d => [d.id, d.data().name]));

    autoTable(doc, {
      startY: colY + 8,
      margin: { left: 14, right: pageWidth/2 + 2 },
      head: [["Source", "Amount"]],
      body: [
        ["Combined Sales", formatCurrency(dayStats.todaySales)],
        ...pdfIncomeTxs.map(tx => {
          let nameStr = tx.category;
          if (tx.category === "Bank Credit" && tx.paymentMethod) {
            nameStr = `Bank Credit (${tx.paymentMethod})`;
          } else if (tx.subCategory) {
            nameStr += ` (${tx.subCategory})`;
          }
          return [nameStr, formatCurrency(tx.amount)];
        }),
        [{ content: "TOTAL DEPOSIT", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }, 
         { content: formatCurrency(dayStats.totalIncome), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }]
      ],
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    autoTable(doc, {
      startY: colY + 8,
      margin: { left: pageWidth/2 + 2, right: 14 },
      head: [["Category", "Amount"]],
      body: [
        ...pdfExpenseTxs.map(tx => {
          let nameStr = tx.category;
          if (tx.category === "Bank Deposit" && tx.paymentMethod) {
            nameStr = `Bank Deposit (${tx.paymentMethod})`;
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
        [{ content: "TOTAL EXPENSE", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }, 
         { content: formatCurrency(dayStats.totalExpense), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }]
      ],
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] }
    });

    // BOTTOM SUMMARY
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setDrawColor(200);
    doc.line(14, finalY, pageWidth - 14, finalY);
    
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text(
      language === "bn"
        ? `মোট সংগৃহীত জমা (Total Deposit): ${formatCurrency(dayStats.totalIncome)}`
        : `Total Deposit: ${formatCurrency(dayStats.totalIncome)}`,
      14,
      finalY + 10
    );
    doc.text(
      language === "bn"
        ? `মোট সাধারণ খরচ (Total Expense): ${formatCurrency(dayStats.totalExpense)}`
        : `Total Expense: ${formatCurrency(dayStats.totalExpense)}`,
      pageWidth - 14,
      finalY + 10,
      { align: "right" }
    );

    doc.setFillColor(30, 58, 138);
    doc.rect(14, finalY + 15, pageWidth - 28, 10, "F");
    doc.setTextColor(255);
    doc.setFontSize(13);
    doc.text(
      language === "bn"
        ? `সর্বমোট ক্যাশ ব্যালেন্স (TOTAL CASH IN HAND): ${formatCurrency(dayStats.netCash)}`
        : `TOTAL CASH IN HAND: ${formatCurrency(dayStats.netCash)}`,
      pageWidth/2,
      finalY + 22,
      { align: "center" }
    );

    // Print timestamp in local language
    doc.setFontSize(8);
    doc.setTextColor(120);
    const downloadTimeStr = language === "bn" 
      ? `ডাউনলোড সময় (Download Time): ${formatDate(new Date())}`
      : `Download Time: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`;
    doc.text(downloadTimeStr, 14, finalY + 34);

    const pdfFilename = language === "bn" ? `Daily_Report_${selectedDate}.pdf` : `Shop_Daily_Report_${selectedDate}.pdf`;
    doc.save(pdfFilename);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter mb-2">{t("Business Intelligence")}</h2>
          <p className="text-gray-500 font-medium italic">{t("Deep dive into your shop's performance, attendance and finance history.")}</p>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex bg-white p-1.5 rounded-3xl shadow-sm border border-gray-100 overflow-x-auto no-scrollbar">
            {(["daily", "attendance", "salary", "transactions", "purchasing"] as ReportTab[])
              .filter(tab => tab !== "salary" || role === "admin")
              .map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shrink-0",
                  activeTab === tab ? "bg-gray-900 text-white shadow-xl scale-105" : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                {t(tab)}
              </button>
            ))}
          </div>
          
          <button 
            type="button"
            onClick={() => exportToCSV(activeTab)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" /> {language === "bn" ? `${t(activeTab)} ${t("রপ্তানি করুন (CSV)")}` : `Export ${activeTab} CSV`}
          </button>
        </div>
      </header>

      {activeTab === "daily" && (
        <div className="space-y-8">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-gray-900">Report Controls</h3>
              <p className="text-gray-500 font-medium italic">Select a date for the preview, or a range for CSV export.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Preview Date</p>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-6 py-3 bg-gray-50 border-none rounded-2xl font-black text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="w-px h-12 bg-gray-100 hidden md:block" />

              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">CSV Start</p>
                  <input 
                    type="date" 
                    value={csvStartDate}
                    onChange={(e) => setCsvStartDate(e.target.value)}
                    className="px-4 py-3 bg-gray-50 border-none rounded-2xl font-black text-xs"
                  />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 mt-4" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">CSV End</p>
                  <input 
                    type="date" 
                    value={csvEndDate}
                    onChange={(e) => setCsvEndDate(e.target.value)}
                    className="px-4 py-3 bg-gray-50 border-none rounded-2xl font-black text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={exportDailyPDF}
                  className="bg-gray-900 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-3 hover:bg-gray-800 transition-all shadow-xl active:scale-95 text-xs uppercase tracking-widest"
                >
                  <Printer className="w-4 h-4" />
                  PDF Preview
                </button>
              </div>
            </div>
          </div>

          {/* Modern Report Preview */}
          <div className="max-w-4xl mx-auto bg-white rounded-[40px] shadow-2xl border border-gray-50 overflow-hidden font-mono">
            {/* Header */}
            <div className="p-10 text-center border-b border-gray-50">
               <h1 className="text-6xl font-black italic tracking-tighter">
                <span className="text-red-600">M</span>
                <span className="text-blue-900">odern</span>
               </h1>
            </div>

            {/* Top Info Grid */}
            <div className="grid grid-cols-2 border-b-4 border-gray-900">
               <div className="border-r border-gray-900">
                 <div className="flex justify-between p-6 border-b border-gray-200">
                   <span className="font-bold uppercase tracking-tighter text-sm">Previous Cash:</span>
                   <span className="bg-gray-100 px-3 py-1 rounded font-black text-lg">{formatCurrency(dayStats.openingBalance)}</span>
                 </div>
                 <div className="flex justify-between p-6 bg-orange-50/50">
                   <span className="font-bold uppercase tracking-tighter text-sm">Today's Sales:</span>
                   <span className="bg-white px-3 py-1 rounded border border-orange-200 font-black text-lg">{formatCurrency(dayStats.todaySales)}</span>
                 </div>
               </div>
               <div>
                 <div className="flex justify-between p-6 border-b border-gray-200">
                   <span className="font-bold text-sm uppercase tracking-tighter">Date:</span>
                   <span className="bg-gray-100 px-3 py-1 rounded font-black text-lg">{format(new Date(selectedDate), "dd/MM/yyyy")}</span>
                 </div>
                 <div className="flex justify-between p-6">
                   <span className="font-bold text-gray-400 text-xs">MCS || 2026</span>
                   <span className="text-xs text-green-500 font-black uppercase mt-1">Verified System</span>
                 </div>
               </div>
            </div>

            {/* Main Content Columns */}
            <div className="flex flex-col md:flex-row min-h-[600px] divide-x-0 md:divide-x-4 divide-gray-900">
              {/* Income Column */}
              <div className="flex-1">
                <div className="bg-blue-900 text-white flex justify-between p-4 border-b-2 border-gray-900">
                  <span className="font-bold text-xs tracking-widest uppercase">Income Details</span>
                  <span className="font-bold text-xs uppercase">Amount</span>
                </div>
                
                <div className="divide-y divide-blue-100 italic font-medium text-blue-900">
                  <div className="flex justify-between p-6 bg-blue-50/30">
                    <span>Today's Total Sales</span>
                    <span className="font-black text-lg">{formatCurrency(dayStats.todaySales)}</span>
                  </div>
                  {/* Dynamic Other Income */}
                  {transactions
                    .filter(tx => {
                      const isSameDay = isWithinInterval(new Date(tx.date), { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) });
                      if (!isSameDay) return false;

                      // Normal income, excluding Bank Deposit
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

                      // Include Bank Credit
                      if (tx.type === "expense" && tx.category === "Bank Credit") {
                        return true;
                      }

                      return false;
                    })
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between p-6">
                        <span>
                          {tx.category === "Bank Credit" && tx.paymentMethod ? `Bank Credit (${tx.paymentMethod})` : tx.category}
                          {tx.subCategory && <span className="block text-xs text-blue-400 not-italic font-bold uppercase">{tx.subCategory}</span>}
                        </span>
                        <span className="font-black text-lg">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))
                  }
                  {/* Padding rows to match aesthetic */}
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 border-b border-blue-50/50" />
                  ))}
                </div>

                <div className="mt-auto bg-blue-900 text-white flex justify-between p-6 border-t-4 border-gray-900">
                   <span className="font-bold text-xl">TOTAL DEPOSIT</span>
                   <span className="font-bold text-2xl">{formatCurrency(dayStats.totalIncome)}</span>
                </div>
              </div>

              {/* Expense Column */}
              <div className="flex-1 bg-white">
                <div className="bg-red-600 text-white flex justify-between p-4 border-b-2 border-gray-900">
                  <span className="font-bold text-xs tracking-widest uppercase">EXPENSE DETAILS</span>
                  <span className="font-bold text-xs uppercase">AMOUNT</span>
                </div>

                <div className="divide-y divide-red-100 italic font-medium text-red-900">
                  {/* Expenses */}
                  {transactions
                    .filter(tx => {
                      const isSameDay = isWithinInterval(new Date(tx.date), { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) });
                      if (!isSameDay) return false;

                      // Normal expense, excluding Bank Credit
                      if (tx.type === "expense") {
                        return tx.category !== "Bank Credit";
                      }

                      // Include Bank Deposit
                      if (tx.type === "income" && tx.category === "Bank Deposit") {
                        return true;
                      }

                      return false;
                    })
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between p-6 group">
                        <span>
                          {tx.category === "Bank Deposit" && tx.paymentMethod ? `Bank Deposit (${tx.paymentMethod})` : tx.category}
                          {tx.category !== "Bank Deposit" && tx.paymentMethod !== "Cash" && " (Bank)"}
                          {tx.employeeId && (
                            <span className="block text-xs text-blue-600 not-italic font-bold uppercase">
                              {employees.find(e => e.id === tx.employeeId)?.name || "Linked Staff"}
                            </span>
                          )}
                          {tx.subCategory && <span className="block text-xs text-red-400 not-italic font-bold uppercase">{tx.subCategory}</span>}
                        </span>
                        <span className="font-bold text-lg">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))
                  }
                  {/* Padding rows */}
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 border-b border-red-50/50" />
                  ))}
                </div>

                <div className="mt-auto bg-red-600 text-white flex justify-between p-6 border-t-4 border-gray-900">
                   <span className="font-bold uppercase tracking-tighter text-xl">Total Expense</span>
                   <span className="font-bold text-2xl">{formatCurrency(dayStats.totalExpense)}</span>
                </div>
              </div>
            </div>

            {/* Footer Sums */}
            <div className="bg-orange-400 border-b-4 border-gray-900 grid grid-cols-2">
              <div className="p-6 border-r-4 border-gray-900 flex justify-between items-center">
                <span className="font-bold text-sm uppercase">TOTAL DEPOSIT:</span>
                <span className="text-2xl font-black">{formatCurrency(dayStats.totalIncome)}</span>
              </div>
              <div className="p-6 flex justify-between items-center">
                <span className="font-bold text-sm uppercase">TOTAL EXPENSE:</span>
                <span className="text-2xl font-black">{formatCurrency(dayStats.totalExpense)}</span>
              </div>
            </div>

            <div className="bg-blue-600 text-white p-10 text-center">
              <span className="text-lg font-bold opacity-60 uppercase tracking-widest mr-4">Closing Balance:</span>
              <span className="text-6xl font-black italic">{formatCurrency(dayStats.netCash)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "attendance" && (
        <AttendanceReport employees={employees} attendance={attendance} />
      )}

      {activeTab === "salary" && (
        <SalaryReport employees={employees} transactions={transactions} />
      )}

      {activeTab === "transactions" && (
        <TransactionsReport transactions={transactions} />
      )}

      {activeTab === "purchasing" && (
        <PurchasingReport suppliers={suppliers} supplierTransactions={supplierTransactions} />
      )}
    </div>
  );
}

function AttendanceReport({ employees, attendance }: { employees: Employee[]; attendance: any[] }) {
  const { language, t, formatDate, translateValue } = useLanguage();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [selectedDateDetails, setSelectedDateDetails] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lateThreshold, setLateThreshold] = useState("10:00");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "attendance"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLateThreshold(data.lateThreshold || "10:00");
      }
    });
    return () => unsub();
  }, []);

  // Helper: Format 24h string time (e.g., "09:30") to readable 12H with AM/PM (e.g. "09:30 AM")
  function formatTimeTo12Hour(timeStr: string): string {
    if (!timeStr) return "-";
    if (timeStr.includes("AM") || timeStr.includes("PM")) return timeStr;
    try {
      const [hrsStr, minsStr] = timeStr.split(":");
      const hrs = Number(hrsStr);
      const mins = Number(minsStr);
      if (isNaN(hrs) || isNaN(mins)) return timeStr;
      const ampm = hrs >= 12 ? "PM" : "AM";
      const displayHrs = hrs % 12 || 12;
      const displayMins = mins < 10 ? `0${mins}` : mins;
      return `${displayHrs}:${displayMins} ${ampm}`;
    } catch {
      return timeStr;
    }
  }

  // Helper: Calculate late minutes past threshold
  function calculateLateMinutes(checkIn: string, threshold: string): number {
    if (!checkIn || !threshold) return 0;
    try {
      let inStr = checkIn.trim();
      if (inStr.toLowerCase().includes("am") || inStr.toLowerCase().includes("pm")) {
        const parts = inStr.split(" ");
        const [hPart, mPart] = parts[0].split(":");
        let h = Number(hPart);
        const m = Number(mPart);
        if (inStr.toLowerCase().includes("pm") && h < 12) h += 12;
        if (inStr.toLowerCase().includes("am") && h === 12) h = 0;
        inStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      }
      
      const thStr = threshold.trim();
      const [inH, inM] = inStr.split(":").map(Number);
      const [tH, tM] = thStr.split(":").map(Number);
      if (isNaN(inH) || isNaN(inM) || isNaN(tH) || isNaN(tM)) return 0;
      
      const inTotal = inH * 60 + inM;
      const tTotal = tH * 60 + tM;
      return Math.max(0, inTotal - tTotal);
    } catch {
      return 0;
    }
  }

  // Helper: Format delay duration past threshold
  function formatLateDuration(minutes: number, lang: string): string {
    if (minutes <= 0) return lang === "bn" ? "যথাসময়ে" : "On Time";
    if (minutes < 60) {
      return lang === "bn" ? `${minutes} মিনিট বিলম্ব` : `${minutes} mins late`;
    }
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (lang === "bn") {
      return mins > 0 
        ? `${hrs} ঘণ্টা ${mins} মিনিট বিলম্ব` 
        : `${hrs} ঘণ্টা বিলম্ব`;
    }
    return mins > 0 
      ? `${hrs} hr ${mins} mins late` 
      : `${hrs} hr${hrs > 1 ? 's' : ''} late`;
  }

  // Group attendance records by YYYY-MM-DD date.
  // We use records in the selected month
  const uniqueDates = Array.from(new Set(attendance.map(a => {
    try {
      return format(new Date(a.date), "yyyy-MM-dd");
    } catch {
      return a.date.slice(0, 10);
    }
  })))
  .filter(d => d.startsWith(selectedMonth))
  .sort((a, b) => b.localeCompare(a));

  // Export CSV for a single specific day
  const exportDailyDetailedCSV = (dateStr: string) => {
    const bom = "\uFEFF";
    let csvContent = "";
    let fileName = `attendance_detail_${dateStr}.csv`;
    
    if (language === "bn") {
      csvContent = bom + "কর্মচারী,ভূমিকা,উপস্থিতি অবস্থা,প্রবেশ সময়,বিলম্বের সময়,মন্তব্য\n";
      employees.forEach(emp => {
        const record = attendance.find(a => a.employeeId === emp.id && a.date.startsWith(dateStr));
        const statusStr = record ? record.status : "absent";
        const checkInStr = record ? record.checkIn : "-";
        const delayMins = record ? calculateLateMinutes(record.checkIn, lateThreshold) : 0;
        const delayStr = record?.status === "late" || delayMins > 0 ? formatLateDuration(delayMins, "bn") : "যথাসময়ে";
        
        csvContent += `"${emp.name}","${emp.role}","${translateValue(statusStr)}","${checkInStr}","${delayStr}","${record?.notes || ""}"\n`;
      });
      fileName = `উপস্থিতি_বিস্তারিত_${dateStr}.csv`;
    } else {
      csvContent = "Employee,Role,Status,Check In,Late Duration,Notes\n";
      employees.forEach(emp => {
        const record = attendance.find(a => a.employeeId === emp.id && a.date.startsWith(dateStr));
        const statusStr = record ? record.status : "absent";
        const checkInStr = record ? record.checkIn : "-";
        const delayMins = record ? calculateLateMinutes(record.checkIn, lateThreshold) : 0;
        const delayStr = record?.status === "late" || delayMins > 0 ? formatLateDuration(delayMins, "en") : "On Time";
        
        csvContent += `"${emp.name}","${emp.role}","${statusStr}","${checkInStr}","${delayStr}","${record?.notes || ""}"\n`;
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

  // Export PDF for a single specific day
  const exportDailyDetailedPDF = (dateStr: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(language === "bn" ? "দৈনিক উপস্থিতি বিবরণী" : "DAILY ATTENDANCE DETAIL SHEET", 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    
    let displayDateText = dateStr;
    try {
      displayDateText = format(new Date(dateStr), "EEEE, d MMMM yyyy");
    } catch {}
    
    doc.text(`${language === "bn" ? "রিপোর্ট তারিখ" : "Date of Report"}: ${displayDateText}`, 14, 26);
    doc.text(`${language === "bn" ? "ডাউনলোড সময়" : "Generated on"}: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`, 14, 32);
    
    doc.setDrawColor(200);
    doc.line(14, 35, pageWidth - 14, 35);

    const matchRecs = attendance.filter(a => a.date.startsWith(dateStr));
    const presentCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return rec?.status === "present" || rec?.status === "late";
    }).length;
    const lateCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return rec?.status === "late";
    }).length;
    const absentCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return !rec || rec.status === "absent";
    }).length;
    const leaveCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return rec?.status === "leave";
    }).length;

    doc.setFillColor(248, 250, 252); // slate-50 bg
    doc.rect(14, 38, pageWidth - 28, 14, "F");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(
      language === "bn"
        ? `মোট কর্মচারী: ${employees.length}  |  উপস্থিত: ${presentCount}  |  বিলম্ব: ${lateCount}  |  অনুপস্থিত: ${absentCount}  |  ছুটি: ${leaveCount}`
        : `Total Staff Count: ${employees.length}  |  Present: ${presentCount}  |  Late: ${lateCount}  |  Absent: ${absentCount}  |  On Leave: ${leaveCount}`,
      18,
      47
    );

    const tableRows = employees.map(emp => {
      const record = matchRecs.find(a => a.employeeId === emp.id);
      const statusVal = record ? record.status : "absent";
      const checkInTime = record ? record.checkIn : "-";
      const delayMins = record ? calculateLateMinutes(record.checkIn, lateThreshold) : 0;
      const delayVal = record?.status === "late" || delayMins > 0 ? formatLateDuration(delayMins, language) : (record?.status === "present" ? (language === "bn" ? "যথাসময়ে" : "On Time") : "-");
      const lunchVal = record?.lunchOut && record?.lunchIn ? `${record.lunchOut} - ${record.lunchIn}` : "-";
      
      return [
        emp.name,
        emp.role,
        translateValue(statusVal).toUpperCase(),
        checkInTime ? formatTimeTo12Hour(checkInTime) : "-",
        delayVal,
        lunchVal,
        record?.notes || "-"
      ];
    });

    autoTable(doc, {
      startY: 56,
      head: [
        language === "bn"
          ? ["কর্মচারী", "ভূমিকা", "অবস্থা", "প্রবেশ সময়", "বিলম্বের সময়", "লাঞ্চ বিরতি", "মন্তব্য"]
          : ["Employee", "Role", "Status", "Check In", "Lateness", "Lunch break", "Notes"]
      ],
      body: tableRows,
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59] }, // Slate-800
      styles: { fontSize: 8 }
    });

    doc.save(`Attendance_Detail_Report_${dateStr}.pdf`);
  };

  // Status configuration mapping for styling
  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    present: { label: language === "bn" ? "উপস্থিত" : "Present", color: "text-emerald-600 border-emerald-100", bg: "bg-emerald-50", dot: "bg-emerald-500" },
    absent: { label: language === "bn" ? "অনুপস্থিত" : "Absent", color: "text-red-600 border-red-100", bg: "bg-red-50", dot: "bg-red-500" },
    late: { label: language === "bn" ? "বিলম্ব" : "Late", color: "text-amber-600 border-amber-100", bg: "bg-amber-50", dot: "bg-amber-500" },
    "half-day": { label: language === "bn" ? "হাফ ডে" : "Half Day", color: "text-yellow-600 border-yellow-100", bg: "bg-yellow-50", dot: "bg-yellow-500" },
    leave: { label: language === "bn" ? "ছুটি" : "On Leave", color: "text-indigo-600 border-indigo-100", bg: "bg-indigo-50", dot: "bg-indigo-500" },
    holiday: { label: language === "bn" ? "ছুটি দিন" : "Holiday", color: "text-purple-600 border-purple-100", bg: "bg-purple-50", dot: "bg-purple-500" }
  };

  if (selectedDateDetails) {
    // RENDER: Daily Detailed View
    const filteredEmployees = employees.filter(emp => {
      const queryLower = searchQuery.toLowerCase();
      return emp.name.toLowerCase().includes(queryLower) || emp.role.toLowerCase().includes(queryLower);
    });

    const matchRecs = attendance.filter(a => a.date.startsWith(selectedDateDetails));

    const totalStaff = employees.length;
    const presentCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return rec?.status === "present" || rec?.status === "late";
    }).length;
    const lateCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return rec?.status === "late";
    }).length;
    const absentCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return !rec || rec.status === "absent";
    }).length;
    const leaveCount = employees.filter(emp => {
      const rec = matchRecs.find(a => a.employeeId === emp.id);
      return rec?.status === "leave";
    }).length;

    let prettyDate = selectedDateDetails;
    try {
      prettyDate = formatDate(new Date(selectedDateDetails));
    } catch {}

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Navigation & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button 
            onClick={() => setSelectedDateDetails(null)} 
            className="flex items-center gap-2 self-start text-gray-600 hover:text-gray-900 font-black text-xs uppercase tracking-widest px-4 py-2 hover:bg-gray-150 rounded-2xl transition-all border border-transparent"
          >
            <ArrowLeft className="w-4 h-4" /> 
            {language === "bn" ? "তালিকায় ফিরে যান" : "Back to Daily list"}
          </button>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => exportDailyDetailedCSV(selectedDateDetails)} 
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button 
              onClick={() => exportDailyDetailedPDF(selectedDateDetails)} 
              className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> {language === "bn" ? "পিডিএফ ও প্রিন্ট" : "Print PDF"}
            </button>
          </div>
        </div>

        {/* Date Title Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-[40px] p-8 md:p-10 shadow-2xl">
          <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 opacity-5 shrink-0 select-none">
            <CalendarDays className="w-96 h-96" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-350 text-[10px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                {language === "bn" ? "দৈনিক উপস্থিতির হিসাব" : "DAILY RECORD SHEET"}
              </span>
              <h3 className="text-3xl md:text-5xl font-black tracking-tighter">{prettyDate}</h3>
              <p className="text-slate-400 font-medium text-xs italic">
                {language === "bn" 
                  ? "উক্ত দিনের চেক-ইন সময় ও ল্যাম্বার্ড (বিলম্ব) রিপোর্ট।" 
                  : "Check-in punctuality, presence and timing statistics specifically for this date."}
              </p>
            </div>
            
            {/* Minimal Stat Chips */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white/5 p-4 rounded-3xl border border-white/10 shrink-0 font-mono">
              <div className="px-5 py-3 text-center border-r border-white/5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{language === "bn" ? "মোট কর্মী" : "Staff"}</p>
                <p className="text-2xl font-black text-white mt-1">{totalStaff}</p>
              </div>
              <div className="px-5 py-3 text-center border-r border-white/5">
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">{language === "bn" ? "উপস্থিত" : "Present"}</p>
                <p className="text-2xl font-black text-emerald-300 mt-1">{presentCount}</p>
              </div>
              <div className="px-5 py-3 text-center border-r border-white/5">
                <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">{language === "bn" ? "বিলম্ব" : "Late"}</p>
                <p className="text-2xl font-black text-amber-300 mt-1">{lateCount}</p>
              </div>
              <div className="px-5 py-3 text-center">
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{language === "bn" ? "অনুপস্থিত" : "Absent"}</p>
                <p className="text-2xl font-black text-red-300 mt-1">{absentCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and List */}
        <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden space-y-6 p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xl font-black text-gray-900">{language === "bn" ? "কর্মচারীদের তালিকা" : "Roster Details"}</h4>
              <p className="text-gray-400 text-xs italic font-medium mt-0.5">{language === "bn" ? "ঐদিনের সকল কর্মচারীদের উপস্থিতির খতিয়ান বিবরণ।" : "Attendance ledger for all active team members for this workday."}</p>
            </div>
            
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-450" />
              <input 
                type="text" 
                placeholder={language === "bn" ? "খুঁজুন (নাম বা পদবী)..." : "Search staff or role..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border-none rounded-2xl pl-11 pr-5 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-100 transition-all font-sans"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-l-2xl border-b border-gray-50">{language === "bn" ? "কর্মচারী" : "Employee"}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">{language === "bn" ? "উপস্থিতি" : "Attendance"}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">{language === "bn" ? "প্রবেশ সময়" : "Check-In"}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">{language === "bn" ? "বিলম্ব সময়" : "Lateness"}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">{language === "bn" ? "লাঞ্চ বিরতি" : "Lunch Break"}</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-r-2xl border-b border-gray-50">{language === "bn" ? "মন্তব্য" : "Notes"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredEmployees.map(emp => {
                  const rec = matchRecs.find(a => a.employeeId === emp.id);
                  const statusVal = rec ? rec.status : "absent";
                  const conf = STATUS_CONFIG[statusVal] || STATUS_CONFIG["absent"];
                  
                  const delayMinutes = rec ? calculateLateMinutes(rec.checkIn, lateThreshold) : 0;
                  const isLateMarked = statusVal === "late" || delayMinutes > 0;
                  
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/30 transition-all group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all capitalize shadow-sm">
                            {emp.name ? emp.name.charAt(0) : "S"}
                          </div>
                          <div>
                            <h5 className="font-black text-gray-900 group-hover:text-blue-900 transition-colors">{emp.name}</h5>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{emp.role}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border", 
                          conf.bg, 
                          conf.color
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", conf.dot)} />
                          {conf.label}
                        </span>
                      </td>
                      <td className="px-6 py-5 font-mono text-xs font-bold text-gray-800">
                        {rec?.checkIn ? (
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {formatTimeTo12Hour(rec.checkIn)}
                          </span>
                        ) : (
                          <span className="text-gray-350 italic">-</span>
                        )}
                      </td>
                      <td className="px-6 py-5 font-mono text-xs">
                        {statusVal === "absent" || statusVal === "leave" ? (
                          <span className="text-gray-350 italic">-</span>
                        ) : isLateMarked ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-100 font-bold">
                            {formatLateDuration(delayMinutes > 0 ? delayMinutes : 15, language)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold">
                            {language === "bn" ? "যথাসময়ে" : "On Time"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 font-mono text-xs text-gray-600">
                        {rec?.lunchOut && rec?.lunchIn ? (
                          <span className="font-semibold block">{rec.lunchOut} &rarr; {rec.lunchIn}</span>
                        ) : (
                          <span className="text-gray-350 italic">-</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-xs text-gray-500 font-medium max-w-xs truncate" title={rec?.notes}>
                        {rec?.notes ? rec.notes : <span className="text-gray-350 italic">-</span>}
                      </td>
                    </tr>
                  );
                })}

                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-450 italic font-medium">
                      {language === "bn" ? "কোন কর্মচারী খুঁজে পাওয়া যায়নি।" : "No staff members matched your query for this date."}
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

  // RENDER: Daily ledger and monthly summaries list
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
      {/* Selector and Month Filter */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
            <button 
              onClick={() => setViewMode("daily")}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                viewMode === "daily" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-900"
              )}
            >
              {language === "bn" ? "দৈনিক শিট" : "Daily Sheets"}
            </button>
            <button 
              onClick={() => setViewMode("monthly")}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                viewMode === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-900"
              )}
            >
              {language === "bn" ? "মাসিক সারাংশ" : "Monthly Summaries"}
            </button>
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">
              {viewMode === "daily" ? (language === "bn" ? "দৈনিক বিবরণী" : "Daily Attendance sheets") : (language === "bn" ? "মাসিক উপস্থিতি" : "Attendance Analytics")}
            </h3>
            <p className="text-gray-400 text-xs italic font-medium mt-0.5">
              {viewMode === "daily" 
                ? (language === "bn" ? "পৃথক দিন অনুযায়ী প্রতিটি কর্মচারীর তথ্য দেখতে ক্লিক করুন।" : "Select any specific day to view present, late, and absent details.")
                : (language === "bn" ? "বেসিক উপস্থিতি পরিসংখ্যান ও পারফর্মেন্স রিপোর্ট।" : "Comprehensive view of staff performance and monthly punctuality metrics.")}
            </p>
          </div>
        </div>
        
        <input 
          type="month" 
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-8 py-4 bg-gray-50 border-none rounded-2xl font-black text-lg focus:ring-2 focus:ring-blue-100 outline-none"
        />
      </div>

      {viewMode === "monthly" ? (
        // Monthly Roster Renders
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {employees.map(emp => {
            const filteredAttendance = attendance.filter(a => a.date.startsWith(selectedMonth));
            const empRecords = filteredAttendance.filter(a => a.employeeId === emp.id);
            const present = empRecords.filter(r => r.status === "present").length;
            const late = empRecords.filter(r => r.status === "late").length;
            const leave = empRecords.filter(r => r.status === "leave").length;
            const absent = empRecords.filter(r => r.status === "absent").length;

            return (
              <div key={emp.id} className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center font-black text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-black text-gray-900 truncate max-w-[150px]">{emp.name}</h4>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{emp.role}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                    <span className="text-xs font-bold text-blue-600">{language === "bn" ? "উপস্থিত" : "Present"}</span>
                    <span className="font-black text-blue-900">{present}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-orange-50 rounded-xl">
                    <span className="text-xs font-bold text-orange-600">{language === "bn" ? "বিলম্ব" : "Late"}</span>
                    <span className="font-black text-orange-900">{late}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-xl">
                    <span className="text-xs font-bold text-indigo-600">{language === "bn" ? "ছুটি" : "Leaves"}</span>
                    <span className="font-black text-indigo-900">{leave}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl">
                    <span className="text-xs font-bold text-red-600">{language === "bn" ? "অনুপস্থিত" : "Absent"}</span>
                    <span className="font-black text-red-900">{absent}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // NEW: Daily Ledger View
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {uniqueDates.map(dateStr => {
            const records = attendance.filter(a => a.date.startsWith(dateStr));
            const present = records.filter(a => a.status === "present").length;
            const late = records.filter(a => a.status === "late").length;
            const absent = records.filter(a => a.status === "absent").length;
            const leave = records.filter(a => a.status === "leave").length;

            let prettyDate = dateStr;
            try {
              prettyDate = formatDate(new Date(dateStr));
            } catch {}

            return (
              <div 
                key={dateStr} 
                className="bg-white rounded-[40px] border border-gray-100 p-8 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                      <CalendarDays className="w-6 h-6" />
                    </div>
                    
                    {/* Compact pill indicators */}
                    <span className="text-[10px] font-mono font-black tracking-widest text-slate-350 uppercase">
                      {dateStr}
                    </span>
                  </div>
                  
                  <div>
                    <h4 className="text-xl font-black text-slate-900 tracking-tight group-hover:text-blue-900 transition-colors pointer-events-none">
                      {prettyDate}
                    </h4>
                  </div>

                  {/* Summary row */}
                  <div className="grid grid-cols-4 gap-2 text-center py-3 bg-slate-50/50 rounded-2xl border border-slate-50">
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{language === "bn" ? "উপস্থিত" : "Pres"}</p>
                      <p className="text-xs font-black text-emerald-600 mt-0.5">{present}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{language === "bn" ? "বিলম্ব" : "Late"}</p>
                      <p className="text-xs font-black text-amber-600 mt-0.5">{late}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{language === "bn" ? "ছুটি" : "Leave"}</p>
                      <p className="text-xs font-black text-indigo-600 mt-0.5">{leave}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{language === "bn" ? "অনুপস্থিত" : "Abs"}</p>
                      <p className="text-xs font-black text-red-600 mt-0.5">{absent}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest group-hover:text-blue-600 transition-colors">
                    {language === "bn" ? "বিস্তারিত দেখুন" : "View Details"}
                  </span>
                  <button 
                    onClick={() => setSelectedDateDetails(dateStr)}
                    className="w-10 h-10 bg-slate-50 text-slate-500 hover:text-white hover:bg-slate-900 rounded-full flex items-center justify-center transition-all cursor-pointer border border-slate-100"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {uniqueDates.length === 0 && (
            <div className="col-span-full bg-white p-16 rounded-[40px] border border-dashed border-gray-200 text-center text-gray-450 italic font-medium">
              {language === "bn" ? "এ মাসে কোন উপস্থিতির রেকর্ড পাওয়া যায়নি।" : "No attendance logs found for this month range."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SalaryReport({ employees, transactions }: { employees: Employee[]; transactions: Transaction[] }) {
  const [targetYear, setTargetYear] = useState(new Date().getFullYear().toString());
  
  const salaryTxs = transactions.filter(tx => 
    tx.category === "Salary" && 
    new Date(tx.date).getFullYear().toString() === targetYear
  );

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-green-50 rounded-3xl flex items-center justify-center">
            <Wallet className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">Salary Disbursement History</h3>
            <p className="text-gray-500 font-medium italic">Track all historical payments made to staff members.</p>
          </div>
        </div>
        <select 
          value={targetYear}
          onChange={(e) => setTargetYear(e.target.value)}
          className="px-8 py-4 bg-gray-50 border-none rounded-2xl font-black text-lg focus:ring-2 focus:ring-green-100"
        >
          {["2024", "2025", "2026"].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Date</th>
              <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee</th>
              <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Method</th>
              <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Reference</th>
              <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {salaryTxs.map(tx => (
              <tr key={tx.id} className="hover:bg-green-50/30 transition-all group">
                <td className="px-8 py-6">
                  <p className="font-bold text-gray-900">{format(new Date(tx.date), "MMMM dd, yyyy")}</p>
                </td>
                <td className="px-8 py-6">
                  <p className="font-bold text-gray-900">{employees.find(e => e.id === tx.employeeId)?.name || "Unknown"}</p>
                </td>
                <td className="px-8 py-6">
                   <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-black uppercase tracking-wider text-gray-500">
                    {tx.paymentMethod}
                   </span>
                </td>
                <td className="px-8 py-6">
                  <p className="text-sm font-medium text-gray-400 italic">{tx.notes || "Monthly Salary"}</p>
                </td>
                <td className="px-8 py-6 text-right">
                  <p className="text-lg font-black text-green-600">{formatCurrency(tx.amount)}</p>
                </td>
              </tr>
            ))}
            {salaryTxs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-gray-400 italic font-medium">
                  No salary records found for {targetYear}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionsReport({ transactions }: { transactions: Transaction[] }) {
  const [dateRange, setDateRange] = useState("month"); // month, year, custom
  
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

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-purple-50 rounded-3xl flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-purple-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">Financial History & Trends</h3>
            <p className="text-gray-500 font-medium italic">Broad overview of spending and income distribution.</p>
          </div>
        </div>
        <div className="flex bg-gray-50 p-1 rounded-2xl">
          {["month", "year", "all"].map(range => (
            <button 
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                dateRange === range ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-900"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-2xl">
          <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">Total Income</p>
          <p className="text-4xl font-black italic">{formatCurrency(incomeTotal)}</p>
        </div>
        <div className="bg-red-600 p-8 rounded-[40px] text-white shadow-2xl">
          <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">Total Expense</p>
          <p className="text-4xl font-black italic">{formatCurrency(expenseTotal)}</p>
        </div>
        <div className="bg-gray-900 p-8 rounded-[40px] text-white shadow-2xl">
          <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">Net Margin</p>
          <p className="text-4xl font-black italic">{formatCurrency(incomeTotal - expenseTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100">
          <h4 className="text-xl font-black mb-6 flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            Top Income Sources
          </h4>
          <div className="space-y-6">
            {categories
              .map(cat => ({ 
                cat, 
                amount: filtered.filter(tx => tx.category === cat && tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0)
              }))
              .filter(i => i.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map(i => (
                <div key={i.cat}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-gray-900">{i.cat}</span>
                    <span className="font-black text-blue-600">{formatCurrency(i.amount)}</span>
                  </div>
                  <div className="w-full bg-gray-50 h-3 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(i.amount / incomeTotal) * 100}%` }}
                      className="h-full bg-blue-600 rounded-full"
                    />
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100">
          <h4 className="text-xl font-black mb-6 flex items-center gap-2">
            <Filter className="w-5 h-5 text-red-600" />
            Spending Breakdown
          </h4>
          <div className="space-y-6">
            {categories
              .map(cat => ({ 
                cat, 
                amount: filtered.filter(tx => tx.category === cat && tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0)
              }))
              .filter(i => i.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map(i => (
                <div key={i.cat}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-gray-900">{i.cat}</span>
                    <span className="font-black text-red-600">{formatCurrency(i.amount)}</span>
                  </div>
                  <div className="w-full bg-gray-50 h-3 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(i.amount / expenseTotal) * 100}%` }}
                      className="h-full bg-red-600 rounded-full"
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

function PurchasingReport({ 
  suppliers, 
  supplierTransactions 
}: { 
  suppliers: Supplier[]; 
  supplierTransactions: SupplierTransaction[]; 
}) {
  const { language, t, formatCurrency, formatNumber, translateValue } = useLanguage();
  const [dateRange, setDateRange] = useState("month");

  const now = new Date();
  
  // Filter transactions of type "purchase" on date Range
  const filteredPurchases = supplierTransactions.filter(tx => {
    if (tx.type !== "purchase") return false;
    const txDate = new Date(tx.date);
    if (dateRange === "month") {
      return txDate >= startOfMonth(now) && txDate <= endOfMonth(now);
    }
    if (dateRange === "year") {
      return txDate >= startOfYear(now);
    }
    return true; // "all"
  });

  // Calculate aggregated spending by supplier
  const spendingMap: Record<string, number> = {};
  let totalPurchasedAmount = 0;
  let totalPaidAmount = 0;
  let totalCreatedDues = 0;

  filteredPurchases.forEach(tx => {
    spendingMap[tx.supplierId] = (spendingMap[tx.supplierId] || 0) + tx.totalAmount;
    totalPurchasedAmount += tx.totalAmount;
    totalPaidAmount += (tx.paidAmount || 0);
    totalCreatedDues += (tx.dueAmount || 0);
  });

  // Recharts Pie Chart Data
  const pieData = Object.entries(spendingMap).map(([id, value]) => {
    const s = suppliers.find(sup => sup.id === id);
    return {
      id,
      name: s ? s.name : (language === "bn" ? "অজানা সরবরাহকারী" : "Unknown Supplier"),
      code: s ? s.code : "",
      value,
    };
  }).filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  // Colors for Piechart Cells
  const COLORS = [
    "#4338CA", // Indigo 700
    "#0EA5E9", // Sky 500
    "#F59E0B", // Amber 500
    "#10B981", // Emerald 500
    "#EC4899", // Pink 500
    "#8B5CF6", // Violet 500
    "#F43F5E", // Rose 500
    "#14B8A6", // Teal 500
  ];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
      {/* Settings & controls Header */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">
              {language === "bn" ? "সরবরাহকারী ক্রয় ক্রিয়াকলাপ" : "Supplier Purchasing Activity"}
            </h3>
            <p className="text-gray-500 font-medium italic">
              {language === "bn" 
                ? "সরবরাহকারী ক্রয় প্রবণতা এবং ব্যয় বিশ্লেষণের বিবরণ।" 
                : "A detailed breakdown of supplier purchasing trends and spending analysis."}
            </p>
          </div>
        </div>
        <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
          {["month", "year", "all"].map(range => (
            <button 
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                dateRange === range ? "bg-white text-gray-900 shadow-sm scale-105" : "text-gray-400 hover:text-gray-900"
              )}
            >
              {language === "bn" 
                ? (range === "month" ? "চলতি মাস" : range === "year" ? "চলতি বছর" : "সব সময়") 
                : range}
            </button>
          ))}
        </div>
      </div>

      {/* Aggregate Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center font-black text-blue-600 animate-fade-in">
            {formatNumber(suppliers.length)}
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {language === "bn" ? "মোট সরবরাহকারী" : "Total Suppliers"}
            </p>
            <p className="text-lg font-black text-gray-900">
              {language === "bn" ? `${formatNumber(suppliers.length)} জন` : `${suppliers.length} Active`}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center font-black text-indigo-600 font-serif">
            ৳
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {language === "bn" ? "মোট ক্রয় পরিমাণ" : "Total Purchases"}
            </p>
            <p className="text-lg font-black text-gray-900">{formatCurrency(totalPurchasedAmount)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center font-black text-emerald-600 font-serif">
            ৳
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {language === "bn" ? "পরিশোধিত অর্থ" : "Paid Amount"}
            </p>
            <p className="text-lg font-black text-gray-900">{formatCurrency(totalPaidAmount)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center font-black text-rose-600 font-serif">
            ৳
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {language === "bn" ? "নতুন বকেয়া বন্টন" : "Outstanding Dues"}
            </p>
            <p className="text-lg font-black text-gray-900">{formatCurrency(totalCreatedDues)}</p>
          </div>
        </div>
      </div>

      {/* Main visualization Section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Piechart Card */}
        <div className="lg:col-span-3 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <h4 className="text-xl font-black text-gray-900 mb-2 flex items-center gap-2">
              {language === "bn" ? "সরবরাহকারী অনুসারে ব্যয়ের হিসাব" : "Spending Distribution by Supplier"}
            </h4>
            <p className="text-sm text-gray-500 italic mb-6">
              {language === "bn" 
                ? "চিত্রের মাধ্যমে সরবরাহকারীদের মোট ক্রয় খরচের অনুপাত।" 
                : "Visual representation of percentage of total purchases from each supplier."}
            </p>
          </div>

          <div className="h-[320px] w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ index }) => `${pieData[index].name}`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [formatCurrency(value as number), language === "bn" ? "মোট ক্রয়" : "Total Spend"]}
                    contentStyle={{ borderRadius: "16px", border: "1px solid #f1f5f9", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)" }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value, entry: any, index) => (
                      <span className="text-xs font-bold text-gray-600 uppercase">
                        {value} ({((pieData[index]?.value || 0) / totalPurchasedAmount * 100).toFixed(0)}%)
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center p-12 text-gray-400 italic w-full">
                <ShoppingBag className="w-12 h-12 stroke-1 mx-auto mb-3 opacity-40 text-gray-400 animate-pulse" />
                {language === "bn" ? "এই সময়ের মধ্যে কোনো ক্রয়ের তথ্য পাওয়া যায়নি।" : "No purchase records found for this period."}
              </div>
            )}
          </div>
        </div>

        {/* Breakdown table list card */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col h-full">
          <div>
            <h4 className="text-xl font-black text-gray-900 mb-2">
              {language === "bn" ? "শীর্ষ সরবরাহকারীদের তালিকা" : "Supplier Spending Ledger"}
            </h4>
            <p className="text-sm text-gray-500 italic mb-6">
              {language === "bn" 
                ? "মোট ক্রয়ের পরিমাণ সহ শীর্ষ সরবরাহকারীদের সংক্ষেপ।" 
                : "Ranked list of suppliers with purchase totals and share percentages."}
            </p>
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2 no-scrollbar">
            {pieData.map((item, index) => {
              const percentage = totalPurchasedAmount > 0 ? (item.value / totalPurchasedAmount) * 100 : 0;
              const color = COLORS[index % COLORS.length];
              return (
                <div key={item.id} className="flex flex-col gap-2 p-3 hover:bg-gray-50 rounded-2xl transition-all">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <div>
                        <p className="font-extrabold text-sm text-gray-900 leading-tight">{item.name}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.code || "SUP"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm text-gray-900">{formatCurrency(item.value)}</p>
                      <p className="text-xs font-bold text-gray-500 font-sans" style={{ color: color }}>{percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-50 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}

            {pieData.length === 0 && (
              <div className="text-center py-20 text-gray-400 italic">
                {language === "bn" ? "কোন তথ্য পাওয়া যায়নি" : "No aggregate details available"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Supplier Transactions lists */}
      <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <h4 className="text-xl font-black text-gray-900">
            {language === "bn" ? "সাম্প্রতিক ক্রয় লেনদেন সমূহ" : "Recent Purchase Statements"}
          </h4>
          <span className="px-3 py-1.5 bg-gray-50 rounded-xl text-[10px] font-black text-gray-500 uppercase tracking-wider border border-gray-100">
            {language === "bn" ? `মোট ${formatNumber(filteredPurchases.length)} টি চালান` : `${filteredPurchases.length} Purchase Invoices`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  {language === "bn" ? "তারিখ" : "Date"}
                </th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  {language === "bn" ? "সরবরাহকারী" : "Supplier"}
                </th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  {language === "bn" ? "চালান নং" : "Invoice Ref"}
                </th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">
                  {language === "bn" ? "মোট মূল্য" : "Total Value"}
                </th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">
                  {language === "bn" ? "পরিশোধিত" : "Paid"}
                </th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">
                  {language === "bn" ? "বকেয়া" : "Due"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPurchases.map(tx => {
                const sup = suppliers.find(s => s.id === tx.supplierId);
                return (
                  <tr key={tx.id} className="hover:bg-blue-50/10 transition-all font-mono text-sm">
                    <td className="px-8 py-5 text-gray-600 font-bold">
                      {tx.date}
                    </td>
                    <td className="px-8 py-5">
                      <p className="font-extrabold text-gray-900 font-sans">{sup?.name || "Unknown"}</p>
                      <p className="text-[10px] text-gray-400 font-sans">{sup?.code}</p>
                    </td>
                    <td className="px-8 py-5 font-bold text-gray-500 uppercase">
                      {tx.refNo}
                    </td>
                    <td className="px-8 py-5 text-right font-black text-gray-900">
                      {formatCurrency(tx.totalAmount)}
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-emerald-600">
                      {formatCurrency(tx.paidAmount || 0)}
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-rose-600">
                      {formatCurrency(tx.dueAmount || 0)}
                    </td>
                  </tr>
                );
              })}
              {filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-gray-400 italic font-medium font-sans">
                    {language === "bn" ? "কোন তথ্য পাওয়া যায়নি" : "No recent purchases recorded in this range."}
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
