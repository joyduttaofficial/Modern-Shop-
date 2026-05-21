import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Transaction, UserRole, Bank, Employee } from "@/src/types";
import { formatCurrency, cn } from "@/src/lib/utils";
import { format, startOfDay, endOfDay, subDays, isWithinInterval, isBefore, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  Filter
} from "lucide-react";
import { motion } from "motion/react";

type ReportTab = "daily" | "attendance" | "salary" | "transactions";

export default function Reports({ user, role }: { user: User; role: UserRole }) {
  const [activeTab, setActiveTab] = useState<ReportTab>("daily");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
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
      .filter(tx => 
        tx.type === "income" && 
        tx.category !== "Opening Balance" &&
        tx.category !== "Previous Cash" &&
        !(
          tx.category === "Employee Sales" || 
          tx.category === "Wholesale Sales" || 
          tx.category === "Total Deposit" ||
          tx.category.toLowerCase().includes("sale") || 
          tx.category === "Product Sales" ||
          tx.category === "Retail Sales"
        )
      )
      .reduce((sum, tx) => sum + tx.amount, 0);

    const bankExpenses = todayTxs
      .filter(tx => tx.type === "expense" && tx.paymentMethod !== "Cash")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const generalExpenses = todayTxs
      .filter(tx => tx.type === "expense" && tx.paymentMethod === "Cash")
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
    let fileName = `report_${type}_${format(new Date(), "yyyyMMdd")}.csv`;

    if (type === "daily") {
      const start = startOfDay(new Date(csvStartDate));
      const end = endOfDay(new Date(csvEndDate));
      const rangeTxs = transactions.filter(tx => 
        isWithinInterval(new Date(tx.date), { start, end })
      );
      
      csvContent = "Date,Category,Sub-Category,Type,Payment Method,Amount,Notes\n";
      rangeTxs.forEach(tx => {
        csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${tx.category}","${tx.subCategory || ""}","${tx.type}","${tx.paymentMethod}",${tx.amount},"${tx.notes || ""}"\n`;
      });
      fileName = `daily_statement_${csvStartDate}_to_${csvEndDate}.csv`;
    } 
    else if (type === "attendance") {
      csvContent = "Date,Employee,Role,Status,Check In,Lunch Out,Lunch In\n";
      attendance.forEach(att => {
        const emp = employees.find(e => e.id === att.employeeId);
        csvContent += `${format(new Date(att.date), "yyyy-MM-dd")},"${emp?.name || "Unknown"}","${emp?.role || ""}","${att.status}","${att.checkIn || ""}","${att.lunchOut || ""}","${att.lunchIn || ""}"\n`;
      });
    }
    else if (type === "salary") {
      csvContent = "Date,Employee,Amount,Method,Notes\n";
      const salaryTxs = transactions.filter(tx => tx.category === "Salary");
      salaryTxs.forEach(tx => {
        const emp = employees.find(e => e.id === tx.employeeId);
        csvContent += `${format(new Date(tx.date), "yyyy-MM-dd")},"${emp?.name || "Unknown"}",${tx.amount},"${tx.paymentMethod}","${tx.notes || ""}"\n`;
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
    
    // Logo / Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(220, 38, 38); // Red
    doc.text("M", pageWidth/2 - 15, 20);
    doc.setTextColor(30, 58, 138); // Blue
    doc.text("odern", pageWidth/2 - 5, 20);
    
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
    doc.text("Previous Cash:", 18, boxY + 7);
    doc.text(formatCurrency(dayStats.openingBalance), pageWidth/2 - 5, boxY + 7, { align: "right" });
    
    doc.text("Today's Total Sales:", 18, boxY + 17);
    doc.text(formatCurrency(dayStats.todaySales), pageWidth/2 - 5, boxY + 17, { align: "right" });

    doc.text("Date:", pageWidth/2 + 5, boxY + 7);
    doc.text(format(new Date(selectedDate), "dd/MM/yyyy"), pageWidth - 18, boxY + 7, { align: "right" });

    doc.text("MCS || 2026", pageWidth/2 + 5, boxY + 17);
    doc.text("Status: Verified", pageWidth - 18, boxY + 17, { align: "right" });

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

    const incomeTxs = todayTxs.filter(tx => 
      tx.type === "income" && 
      tx.category !== "Opening Balance" && 
      tx.category !== "Previous Cash"
    );
    const expenseTxs = todayTxs.filter(tx => tx.type === "expense");
    
    // Fetch employee names for report
    const empSnap = await getDocs(collection(db, "employees"));
    const empMap = new Map(empSnap.docs.map(d => [d.id, d.data().name]));

    autoTable(doc, {
      startY: colY + 8,
      margin: { left: 14, right: pageWidth/2 + 2 },
      head: [["Source", "Amount"]],
      body: [
        ["Combined Sales", formatCurrency(dayStats.todaySales)],
        ...incomeTxs
          .filter(tx => 
            !(
              tx.category === "Employee Sales" || 
              tx.category === "Wholesale Sales" || 
              tx.category === "Total Deposit" ||
              tx.category.toLowerCase().includes("sale") || 
              tx.category === "Product Sales" ||
              tx.category === "Retail Sales"
            )
          )
          .map(tx => [tx.category + (tx.subCategory ? ` (${tx.subCategory})` : ""), formatCurrency(tx.amount)]),
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
        ...expenseTxs.map(tx => [
          tx.category + 
          (tx.employeeId ? ` - ${empMap.get(tx.employeeId) || "Staff"}` : "") +
          (tx.subCategory ? ` (${tx.subCategory})` : "") + 
          (tx.paymentMethod !== "Cash" ? " (Bank)" : ""), 
          formatCurrency(tx.amount)
        ]),
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
    doc.setFontSize(12);
    doc.text(`Total Deposit: ${formatCurrency(dayStats.totalIncome)}`, 14, finalY + 10);
    doc.text(`Total Expense: ${formatCurrency(dayStats.totalExpense)}`, pageWidth - 14, finalY + 10, { align: "right" });

    doc.setFillColor(30, 58, 138);
    doc.rect(14, finalY + 15, pageWidth - 28, 10, "F");
    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.text(`TOTAL CASH IN HAND: ${formatCurrency(dayStats.netCash)}`, pageWidth/2, finalY + 22, { align: "center" });

    doc.save(`Shop_Daily_Report_${selectedDate}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter mb-2">Business Intelligence</h2>
          <p className="text-gray-500 font-medium italic">Deep dive into your shop's performance, attendance and finance history.</p>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex bg-white p-1.5 rounded-3xl shadow-sm border border-gray-100 overflow-x-auto no-scrollbar">
            {(["daily", "attendance", "salary", "transactions"] as ReportTab[]).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shrink-0",
                  activeTab === tab ? "bg-gray-900 text-white shadow-xl scale-105" : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <button 
            onClick={() => exportToCSV(activeTab)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95"
          >
            <Download className="w-4 h-4" /> Export {activeTab} CSV
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
                    .filter(tx => 
                      tx.type === "income" && 
                      tx.category !== "Opening Balance" &&
                      tx.category !== "Previous Cash" &&
                      !(
                        tx.category === "Employee Sales" || 
                        tx.category === "Wholesale Sales" || 
                        tx.category === "Total Deposit" ||
                        tx.category.toLowerCase().includes("sale") || 
                        tx.category === "Product Sales" ||
                        tx.category === "Retail Sales"
                      ) &&
                      isWithinInterval(new Date(tx.date), { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) })
                    )
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between p-6">
                        <span>
                          {tx.category}
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
                    .filter(tx => tx.type === "expense" && isWithinInterval(new Date(tx.date), { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) }))
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between p-6 group">
                        <span>
                          {tx.category} {tx.paymentMethod !== "Cash" && "(Bank)"}
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
    </div>
  );
}

function AttendanceReport({ employees, attendance }: { employees: Employee[]; attendance: any[] }) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  
  const filteredAttendance = attendance.filter(a => a.date.startsWith(selectedMonth));
  
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">Attendance Analytics</h3>
            <p className="text-gray-500 font-medium italic">Comprehensive view of staff performance and punctuality.</p>
          </div>
        </div>
        <input 
          type="month" 
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-8 py-4 bg-gray-50 border-none rounded-2xl font-black text-lg focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {employees.map(emp => {
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
                  <span className="text-xs font-bold text-blue-600">Present</span>
                  <span className="font-black text-blue-900">{present}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-orange-50 rounded-xl">
                  <span className="text-xs font-bold text-orange-600">Late</span>
                  <span className="font-black text-orange-900">{late}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-xl">
                  <span className="text-xs font-bold text-indigo-600">Leaves</span>
                  <span className="font-black text-indigo-900">{leave}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl">
                  <span className="text-xs font-bold text-red-600">Absent</span>
                  <span className="font-black text-red-900">{absent}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
