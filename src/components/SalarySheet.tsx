import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, query, where, deleteDoc, doc, writeBatch, increment } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Employee, Bank, Transaction, UserRole } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  FileText, 
  Calendar, 
  Trash2, 
  UserCircle, 
  CheckCircle, 
  AlertTriangle, 
  ArrowUpRight, 
  Activity, 
  History, 
  TrendingDown, 
  Users, 
  CreditCard,
  Search,
  Filter,
  FileDown,
  Download
} from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function SalarySheet({ user, role }: { user: User; role: UserRole }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  // Month-Year Selection
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM")); // e.g. "2026-05"
  const [employeeSearch, setEmployeeSearch] = useState("");

  // Deletion Confirmation State
  const [payoutToDelete, setPayoutToDelete] = useState<Transaction | null>(null);

  useEffect(() => {
    // Snap employees
    const unsubEmps = onSnapshot(collection(db, "employees"), (snap) => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      emps.sort((a, b) => {
        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(emps);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    // Snap transactions focused on Staff Salary and Employee Advance
    const unsubTx = onSnapshot(collection(db, "transactions"), (snap) => {
      const allTx = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      const payTx = allTx.filter(t => t.category === "Staff Salary" || t.category === "Employee Advance");
      setTransactions(payTx);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    // Snap banks for safe reversion of deleted payouts
    const unsubBanks = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    return () => { unsubEmps(); unsubTx(); unsubBanks(); };
  }, []);

  const confirmDeletePayout = async () => {
    if (!payoutToDelete) return;
    const tx = payoutToDelete;
    setPayoutToDelete(null);
    try {
      if (!tx.id) return;
      const batch = writeBatch(db);
      batch.delete(doc(db, "transactions", tx.id));

      if (tx.paymentMethod && tx.paymentMethod !== "Cash") {
        const bank = banks.find(b => b.name === tx.paymentMethod);
        if (bank?.id) {
          batch.update(doc(db, "banks", bank.id), {
            balance: increment(tx.amount), // Revert subtraction
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, "transactions");
    }
  };

  // Helper: calculate salaries paid in the selected period
  const getSelectedMonthDates = () => {
    try {
      const year = parseInt(selectedMonth.split("-")[0]);
      const month = parseInt(selectedMonth.split("-")[1]) - 1;
      const start = startOfMonth(new Date(year, month, 1));
      const end = endOfMonth(new Date(year, month, 1));
      return { start, end };
    } catch {
      const today = new Date();
      return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const { start, end } = getSelectedMonthDates();

  // Filter transactions within selected month
  const monthTransactions = transactions.filter(tx => {
    try {
      const txDate = parseISO(tx.date);
      return isWithinInterval(txDate, { start, end });
    } catch {
      return false;
    }
  });

  // Calculate Employee Stats for selection
  const employeeBalances = employees.map(emp => {
    const empTxs = monthTransactions.filter(tx => tx.employeeId === emp.id);
    const salaryPaid = empTxs
      .filter(tx => tx.category === "Staff Salary")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const advanceGiven = empTxs
      .filter(tx => tx.category === "Employee Advance")
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    // Status
    let status: "unpaid" | "partial" | "paid" = "unpaid";
    if (salaryPaid >= emp.salary) {
      status = "paid";
    } else if (salaryPaid > 0) {
      status = "partial";
    }

    return {
      ...emp,
      salaryPaid,
      advanceGiven,
      status
    };
  });

  // Filter by search query
  const filteredEmployeeBalances = employeeBalances.filter(emp => 
    emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    emp.role.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    (emp.department && emp.department.toLowerCase().includes(employeeSearch.toLowerCase()))
  );

  // General Aggregates for Selected Month
  const activeStaff = employees.filter(e => e.status === "active");
  const totalBasePayroll = activeStaff.reduce((sum, e) => sum + e.salary, 0);
  const totalPaidSalary = monthTransactions
    .filter(tx => tx.category === "Staff Salary")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalDisbursedAdvance = monthTransactions
    .filter(tx => tx.category === "Employee Advance")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const netDisbursement = totalPaidSalary + totalDisbursedAdvance;

  // Render Month labels
  const monthLabelStr = format(start, "MMMM yyyy");

  // Multi-option Month Select Items
  const generateMonthsDropdown = () => {
    const list = [];
    const date = new Date();
    // Generate past 24 months
    for (let i = 0; i < 24; i++) {
      const optionMonth = new Date(date.getFullYear(), date.getMonth() - i, 1);
      list.push({
        value: format(optionMonth, "yyyy-MM"),
        label: format(optionMonth, "MMMM yyyy")
      });
    }
    return list;
  };

  const exportToPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    
    // Header Banner
    doc.setFillColor(15, 23, 42); // slate-900 bg
    doc.rect(0, 0, 210, 38, "F");
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("MONTHLY PAYROLL RECONCILIATION", 15, 16);
    
    // Subtext info
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text(`Billing Period: ${monthLabelStr}`, 15, 23);
    doc.text(`Generated On: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 15, 28);
    
    // Accent Line
    doc.setFillColor(14, 165, 233); // sky-500 line
    doc.rect(0, 38, 210, 2, "F");
    
    // Summary Cards (Title)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99); // gray-600
    doc.text("PAYROLL METRICS SUMMARY", 15, 49);
    
    const kpis = [
      { label: "Base Payroll", value: role === "admin" ? `BDT ${totalBasePayroll.toLocaleString()}` : "***" },
      { label: "Paid Salaries", value: role === "admin" ? `BDT ${totalPaidSalary.toLocaleString()}` : "***" },
      { label: "Net Cash Outflow", value: role === "admin" ? `BDT ${netDisbursement.toLocaleString()}` : "***" }
    ];
    
    let kpiX = 15;
    kpis.forEach((kpi) => {
      // Box
      doc.setFillColor(249, 250, 251); // Gray-50
      doc.setDrawColor(229, 231, 235); // Gray-200
      doc.rect(kpiX, 53, 42, 20, "FD");
      
      // Top orange accent for box
      doc.setFillColor(51, 65, 85);
      doc.rect(kpiX, 53, 42, 1, "F");
      
      // Label
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(kpi.label.toUpperCase(), kpiX + 3, 59);
      
      // Value
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(kpi.value, kpiX + 3, 67);
      
      kpiX += 45;
    });

    // Employee List Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text("STAFF BALANCES & STATS", 15, 82);
    
    const tableData = filteredEmployeeBalances.map((emp) => [
      emp.name,
      emp.role + (emp.department ? ` (${emp.department})` : ""),
      role === "admin" ? `BDT ${emp.salary.toLocaleString()}` : "***",
      role === "admin" ? `BDT ${emp.salaryPaid.toLocaleString()}` : "***",
      role === "admin" ? `BDT ${emp.advanceGiven.toLocaleString()}` : "***",
      emp.status.toUpperCase()
    ]);
    
    autoTable(doc, {
      startY: 85,
      head: [["Employee Name", "Role / Department", "Basic Salary", "Paid to Date", "Advance Given", "Status"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: "bold",
        halign: "left"
      },
      bodyStyles: {
        fontSize: 8,
        halign: "left",
        textColor: [55, 65, 81]
      },
      columnStyles: {
        2: { halign: "right", fontStyle: "bold" },
        3: { halign: "right", fontStyle: "bold" },
        4: { halign: "right", fontStyle: "bold" },
        5: { halign: "center", fontStyle: "bold" }
      },
      styles: {
        font: "helvetica",
        cellPadding: 3.5
      }
    });
    
    // Ledger List (next section)
    const nextY = (doc as any).lastAutoTable.finalY + 12;
    if (nextY > 200) {
      doc.addPage();
      drawLedgerSection(doc, 20);
    } else {
      drawLedgerSection(doc, nextY);
    }
    
    function drawLedgerSection(pdfDoc: jsPDF, yCoord: number) {
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(75, 85, 99);
      pdfDoc.text("RECENT PAYROLL LEDGER TRANSACTION JOURNAL", 15, yCoord);
      
      const ledgerData = monthTransactions
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((tx) => [
          format(parseISO(tx.date), "dd MMM yyyy"),
          tx.subCategory,
          tx.category === "Staff Salary" ? "Salary Payment" : "Advance Disbursement",
          tx.paymentMethod,
          role === "admin" ? `BDT ${tx.amount.toLocaleString()}` : "***",
          tx.notes || "-"
        ]);
        
      autoTable(pdfDoc, {
        startY: yCoord + 4,
        head: [["Date", "Employee Target", "Category", "Payment Method", "Amount Paid", "Reference Notes"]],
        body: ledgerData,
        theme: "striped",
        headStyles: {
          fillColor: [71, 85, 105], // Slate gray
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          halign: "left"
        },
        bodyStyles: {
          fontSize: 7.5,
          halign: "left",
          textColor: [75, 85, 99]
        },
        columnStyles: {
          4: { halign: "right", fontStyle: "bold" }
        },
        styles: {
          font: "helvetica",
          cellPadding: 3
        }
      });
      
      const lastY = (pdfDoc as any).lastAutoTable.finalY + 12;
      if (lastY < 280) {
        pdfDoc.setFontSize(7.5);
        pdfDoc.setTextColor(156, 163, 175);
        pdfDoc.setFont("helvetica", "italic");
        pdfDoc.text("Generated via Smart Payroll Management Ledger Client. Standard audit trails preserved.", 15, lastY);
      }
    }
    
    doc.save(`Salary_Sheet_${selectedMonth}.pdf`);
  };

  const exportToCSV = () => {
    // CSV headers
    const headers = ["Employee Name", "Role", "Department", "Basic Salary (BDT)", "Paid Amount (BDT)", "Advance Paid (BDT)", "Reconciliation Status"];
    
      // CSV rows
      const rows = filteredEmployeeBalances.map((emp) => [
        `"${emp.name.replace(/"/g, '""')}"`,
        `"${(emp.role || "").replace(/"/g, '""')}"`,
        `"${(emp.department || "").replace(/"/g, '""')}"`,
        role === "admin" ? emp.salary : "***",
        role === "admin" ? emp.salaryPaid : "***",
        role === "admin" ? emp.advanceGiven : "***",
        emp.status.toUpperCase()
      ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Salary_Sheet_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="py-20 text-center text-gray-400 font-medium">Drafting payroll analysis...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight mb-2 text-gray-950">Salary Sheet</h2>
          <p className="text-gray-500 font-medium italic">Track employee payouts, monthly breakdowns, and due reconciliations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-4 bg-white p-2.5 rounded-[24px] shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 px-3 text-gray-400">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Month:</span>
            </div>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="pr-8 pl-1 py-1.5 bg-transparent border-none focus:ring-0 font-bold text-gray-900 outline-none cursor-pointer"
            >
              {generateMonthsDropdown().map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Export Options */}
          <div className="flex items-center gap-2 bg-white p-2 rounded-[24px] shadow-sm border border-gray-100">
            <button
              onClick={exportToPDF}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-[16px] text-xs font-bold transition-all cursor-pointer shadow-sm"
              title="Download detailed payroll PDF report"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-[16px] text-xs font-bold transition-all cursor-pointer border border-slate-200"
              title="Export reconciliations to spreadsheet (CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Base Payroll */}
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md/40 transition-all flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Base Payroll</p>
            <h3 className="text-xl font-bold text-gray-900 font-mono tracking-tight">
              {role === "admin" ? formatCurrency(totalBasePayroll) : "***"}
            </h3>
            <span className="text-[9px] text-gray-400 font-semibold">{activeStaff.length} active employees</span>
          </div>
        </div>

        {/* Paid This Month */}
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md/40 transition-all flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Paid Salaries</p>
            <h3 className="text-xl font-bold text-emerald-600 font-mono tracking-tight">
              {role === "admin" ? formatCurrency(totalPaidSalary) : "***"}
            </h3>
            <span className="text-[9px] text-[#2D7BBF] font-semibold">{monthTransactions.filter(t=>t.category==="Staff Salary").length} payments made</span>
          </div>
        </div>

        {/* Advances Given This Month */}
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md/40 transition-all flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Disbursed Advances</p>
            <h3 className="text-xl font-bold text-orange-600 font-mono tracking-tight">
              {role === "admin" ? formatCurrency(totalDisbursedAdvance) : "***"}
            </h3>
            <span className="text-[9px] text-gray-400 font-semibold">To address quick fund shortages</span>
          </div>
        </div>

        {/* Net Monthly Outflow */}
        <div className="bg-gray-950 p-5 rounded-[24px] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-white/10 text-white rounded-2xl flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-gray-200" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Net Cash Expense</p>
            <h3 className="text-xl font-bold text-white font-mono tracking-tight">
              {role === "admin" ? formatCurrency(netDisbursement) : "***"}
            </h3>
            <span className="text-[9px] text-gray-400 font-medium">Both Salary & Advances in {monthLabelStr}</span>
          </div>
        </div>
      </div>

      {/* Main Breakdown Section */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Employee Payroll Reconciliation</h3>
            <p className="text-xs text-gray-500">Status matches basic monthly salary vs recorded payments for {monthLabelStr}</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search staff..."
              value={employeeSearch}
              onChange={e => setEmployeeSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 hover:bg-gray-100/50 rounded-xl border-none outline-none font-semibold text-xs placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Monthly Basic</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Paid Amount ({monthLabelStr})</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Advance ({monthLabelStr})</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredEmployeeBalances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 italic font-medium">No records found matching filter.</td>
                </tr>
              ) : (
                filteredEmployeeBalances.map(emp => {
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-gray-500 overflow-hidden shrink-0">
                            {emp.documents?.find(d => d.type.startsWith('image/')) ? (
                              <img src={emp.documents.find(d => d.type.startsWith('image/'))?.data} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserCircle className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm leading-none mb-1">{emp.name}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{emp.role} {emp.department ? `• ${emp.department}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-gray-900 text-sm">
                          {role === "admin" ? formatCurrency(emp.salary) : "***"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-emerald-600 text-sm">
                          {role === "admin" ? formatCurrency(emp.salaryPaid) : "***"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-orange-600 text-sm">
                          {role === "admin" ? formatCurrency(emp.advanceGiven) : "***"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {emp.status === "paid" ? (
                          <span className="px-2.5 py-1.5 bg-green-50 text-green-700 rounded-full font-bold text-[9px] uppercase tracking-wider">
                            Fully Paid
                          </span>
                        ) : emp.status === "partial" ? (
                          <span className="px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-full font-bold text-[9px] uppercase tracking-wider">
                            Partially Paid
                          </span>
                        ) : (
                          <span className="px-2.5 py-1.5 bg-red-50 text-red-700 rounded-full font-bold text-[9px] uppercase tracking-wider">
                            Unpaid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Payout Log Audit table */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Recent Payroll Ledger Log</h3>
          <p className="text-xs text-gray-500">Recorded salary and advance payouts in the transactions journal</p>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee Target</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">ledger Category</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Method</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Amount Paid</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Notes</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 italic font-medium">No recorded entries this month.</td>
                </tr>
              ) : (
                monthTransactions
                  .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 font-bold text-xs text-gray-600">
                        {format(parseISO(tx.date), "dd MMM yyyy")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <UserCircle className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-gray-900 text-sm">{tx.subCategory}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[9px] font-bold tracking-wide uppercase",
                          tx.category === "Staff Salary" ? "bg-green-50 text-green-700 border border-green-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                        )}>
                          {tx.category === "Staff Salary" ? "Salary Paid" : "Advance Given"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500">
                        {tx.paymentMethod}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-gray-950 text-sm">
                        {role === "admin" ? formatCurrency(tx.amount) : "***"}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 max-w-xs truncate" title={tx.notes}>
                        {tx.notes || "-"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setPayoutToDelete(tx)}
                          className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-xl transition-all border border-transparent hover:border-red-100 inline-flex items-center justify-center cursor-pointer"
                          title="Delete and revert bank ledger balance"
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

      {/* Custom Payout Delete Modal */}
      {payoutToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Payment?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this payment of <strong className="text-gray-900">{role === "admin" ? formatCurrency(payoutToDelete.amount) : "***"}</strong> recorded for <strong className="text-gray-900">{payoutToDelete.subCategory}</strong>?
              <br /><br />
              This will safely credit the amount back to the payment account.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPayoutToDelete(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePayout}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
