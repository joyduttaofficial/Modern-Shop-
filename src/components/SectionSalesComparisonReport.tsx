import React, { useState, useMemo, useEffect } from "react";
import { Transaction, Employee } from "@/src/types";
import { useLanguage } from "../contexts/LanguageContext";
import { format, subDays, startOfMonth, endOfMonth, subMonths, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { 
  TrendingUp, 
  TrendingDown, 
  Award, 
  Calendar, 
  Download, 
  Printer, 
  Filter, 
  Users, 
  BarChart3, 
  LineChart as LineChartIcon,
  ChevronDown, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  Sparkles,
  Info,
  CheckCircle2,
  SlidersHorizontal,
  Layers,
  ArrowRightLeft
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  LineChart, 
  Line,
  Cell
} from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/src/lib/utils";

export type SectionType = "mens" | "ladies" | "other";

export interface MonthlySectionStats {
  monthKey: string; // "2026-09"
  displayMonth: string; // "Sep 2026"
  fullMonthName: string; // "September 2026"
  year: number;
  monthNum: number;
  mensSales: number;
  ladiesSales: number;
  totalSales: number;
  mensCount: number;
  ladiesCount: number;
  winner: "mens" | "ladies" | "tie";
  diffAmount: number;
  diffPercent: number; // diff as % of monthly total
  mensLeadOverLadies: number; // positive if mens led, negative if ladies led
  mensMomPercent: number | null; // Month-over-month growth % for Mens
  ladiesMomPercent: number | null; // Month-over-month growth % for Ladies
  totalMomPercent: number | null; // Combined growth %
  mensStaffSales: Record<string, number>;
  ladiesStaffSales: Record<string, number>;
  transactions: Transaction[];
}

export function detectSalesSection(
  tx: Transaction,
  employees: Employee[],
  customEmployeeSectionMap?: Record<string, SectionType>
): SectionType {
  // 1. Explicit override if user assigned this staff member
  if (tx.employeeId && customEmployeeSectionMap && customEmployeeSectionMap[tx.employeeId]) {
    return customEmployeeSectionMap[tx.employeeId];
  }

  // 2. Lookup employee profile
  if (tx.employeeId) {
    const emp = employees.find(e => e.id === tx.employeeId);
    if (emp) {
      const dept = (emp.department || "").toLowerCase().trim();
      const role = (emp.role || "").toLowerCase().trim();
      const name = (emp.name || "").toLowerCase().trim();

      // Check Men's Section keywords
      const isMens = 
        dept === "men's section" || dept === "mens section" ||
        dept === "sales men's section" || dept === "sales mens section" ||
        dept.includes("men's") || dept.includes("mens") ||
        /\b(men|mens|gents|gent)\b/i.test(dept) ||
        role.includes("men's") || role.includes("mens") ||
        /\b(men|mens|gents|gent)\b/i.test(role) ||
        name.includes("men's") || name.includes("mens") ||
        /\b(men|mens|gents|gent)\b/i.test(name);

      if (isMens) return "mens";

      // Check Ladies' Section keywords
      const isLadies = 
        dept === "ladies' section" || dept === "ladies section" ||
        dept === "sales ladies' section" || dept === "sales ladies section" ||
        dept.includes("ladies") || dept.includes("lady") || dept.includes("women") || dept.includes("woman") ||
        /\b(ladies|lady|women|woman|girls|girl|all-ladies)\b/i.test(dept) ||
        role.includes("ladies") || role.includes("lady") || role.includes("women") ||
        /\b(ladies|lady|women|woman|girls|girl)\b/i.test(role) ||
        name.includes("ladies") || name.includes("lady") || name.includes("women") ||
        /\b(ladies|lady|women|woman|girls|girl)\b/i.test(name);

      if (isLadies) return "ladies";
    }
  }

  // 3. Fallback to transaction fields (category, subCategory, notes)
  const cat = (tx.category || "").toLowerCase();
  const subCat = (tx.subCategory || "").toLowerCase();
  const notes = (tx.notes || "").toLowerCase();

  const isMensText = 
    cat.includes("men's section") || cat.includes("mens section") ||
    cat.includes("sales men's") || cat.includes("sales mens") ||
    subCat.includes("men's section") || subCat.includes("mens section") ||
    subCat.includes("sales men's") || subCat.includes("sales mens") ||
    notes.includes("men's section") || notes.includes("mens section") ||
    notes.includes("sales men's") || notes.includes("sales mens") ||
    /\b(men's|mens|gents)\b/i.test(cat) ||
    /\b(men's|mens|gents)\b/i.test(subCat) ||
    /\b(men's|mens|gents)\b/i.test(notes);

  if (isMensText) return "mens";

  const isLadiesText = 
    cat.includes("ladies' section") || cat.includes("ladies section") ||
    cat.includes("sales ladies'") || cat.includes("sales ladies") ||
    subCat.includes("ladies' section") || subCat.includes("ladies section") ||
    subCat.includes("sales ladies'") || subCat.includes("sales ladies") ||
    notes.includes("ladies' section") || notes.includes("ladies section") ||
    notes.includes("sales ladies'") || notes.includes("sales ladies") ||
    /\b(ladies'|ladies|lady|women|girls)\b/i.test(cat) ||
    /\b(ladies'|ladies|lady|women|girls)\b/i.test(subCat) ||
    /\b(ladies'|ladies|lady|women|girls)\b/i.test(notes);

  if (isLadiesText) return "ladies";

  return "other";
}

interface SectionSalesComparisonReportProps {
  transactions: Transaction[];
  employees: Employee[];
  companyName: string;
  companyTagline?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  formatCurrency: (val: number) => string;
  globalLedgerTotals?: any;
  onRegisterExporter?: (exportFn: () => void) => void;
}

export default function SectionSalesComparisonReport({
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
}: SectionSalesComparisonReportProps) {
  const { language } = useLanguage();
  const isBn = language === "bn";

  // Persistent custom section assignments for staff if needed
  const [customStaffMap, setCustomStaffMap] = useState<Record<string, SectionType>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("report_section_staff_map");
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn("Failed reading staff section map:", e);
      }
    }
    return {};
  });

  const handleUpdateStaffSection = (empId: string, section: SectionType) => {
    setCustomStaffMap(prev => {
      const updated = { ...prev, [empId]: section };
      try {
        localStorage.setItem("report_section_staff_map", JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed saving staff section map:", e);
      }
      return updated;
    });
  };

  // Filter States
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sectionFilter, setSectionFilter] = useState<"all" | "mens" | "ladies">("all");
  const [activeChartTab, setActiveChartTab] = useState<"bar" | "line" | "growth">("bar");
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [showStaffConfig, setShowStaffConfig] = useState(false);

  // Toggle month row expansion
  const toggleMonth = (mKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [mKey]: !prev[mKey]
    }));
  };

  // Helper date parsing
  const getDateStr = (dt: any): string => {
    if (!dt) return "";
    if (typeof dt === "string") return dt.split("T")[0];
    if (dt && typeof dt === "object" && "seconds" in dt) {
      try {
        return new Date(dt.seconds * 1000).toISOString().split("T")[0];
      } catch {
        return "";
      }
    }
    if (dt instanceof Date) return dt.toISOString().split("T")[0];
    return "";
  };

  // Filter all sales transactions
  const allSales = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.type !== "income") return false;
      const cat = (tx.category || "").trim();
      return (
        cat === "Employee Sales" ||
        cat === "Wholesale Sales" ||
        cat === "Product Sales" ||
        cat === "Retail Sales" ||
        cat === "Total Deposit" ||
        cat.toLowerCase().includes("sale") ||
        (tx.employeeId && tx.amount > 0)
      );
    });
  }, [transactions]);

  // Extract available years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    allSales.forEach(tx => {
      const dStr = getDateStr(tx.date);
      if (dStr && dStr.length >= 4) {
        yearsSet.add(dStr.substring(0, 4));
      }
    });
    const currentYr = new Date().getFullYear().toString();
    yearsSet.add(currentYr);
    return Array.from(yearsSet).sort().reverse();
  }, [allSales]);

  // Quick Range Presets
  const setPresetRange = (preset: "thisYear" | "last6Months" | "last12Months" | "allTime") => {
    const now = new Date();
    if (preset === "thisYear") {
      setSelectedYear(now.getFullYear().toString());
      setStartDate(`${now.getFullYear()}-01-01`);
      setEndDate(format(now, "yyyy-MM-dd"));
    } else if (preset === "last6Months") {
      setSelectedYear("All");
      setStartDate(format(startOfMonth(subMonths(now, 5)), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(now), "yyyy-MM-dd"));
    } else if (preset === "last12Months") {
      setSelectedYear("All");
      setStartDate(format(startOfMonth(subMonths(now, 11)), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(now), "yyyy-MM-dd"));
    } else {
      setSelectedYear("All");
      setStartDate("");
      setEndDate("");
    }
  };

  // Tag every sales transaction with section and month
  const taggedSales = useMemo(() => {
    return allSales.map(tx => {
      const section = detectSalesSection(tx, employees, customStaffMap);
      const dStr = getDateStr(tx.date);
      const monthKey = dStr && dStr.length >= 7 ? dStr.substring(0, 7) : "";
      return {
        tx,
        section,
        dateStr: dStr,
        monthKey,
        amount: tx.amount || 0
      };
    });
  }, [allSales, employees, customStaffMap]);

  // Apply User Filtration
  const filteredTaggedSales = useMemo(() => {
    return taggedSales.filter(item => {
      if (!item.dateStr) return false;

      // Year Filter
      if (selectedYear !== "All") {
        if (!item.dateStr.startsWith(selectedYear)) return false;
      }

      // Date Range
      if (startDate && item.dateStr < startDate) return false;
      if (endDate && item.dateStr > endDate) return false;

      return true;
    });
  }, [taggedSales, selectedYear, startDate, endDate]);

  // Aggregate Month-by-Month Statistics
  const monthlyStats = useMemo(() => {
    const monthGroups: Record<string, {
      mensSales: number;
      ladiesSales: number;
      mensCount: number;
      ladiesCount: number;
      mensStaffSales: Record<string, number>;
      ladiesStaffSales: Record<string, number>;
      transactions: Transaction[];
    }> = {};

    filteredTaggedSales.forEach(item => {
      if (!item.monthKey) return;
      if (!monthGroups[item.monthKey]) {
        monthGroups[item.monthKey] = {
          mensSales: 0,
          ladiesSales: 0,
          mensCount: 0,
          ladiesCount: 0,
          mensStaffSales: {},
          ladiesStaffSales: {},
          transactions: []
        };
      }

      const g = monthGroups[item.monthKey];
      g.transactions.push(item.tx);

      // Find staff name
      const staffName = item.tx.employeeId
        ? (employees.find(e => e.id === item.tx.employeeId)?.name || item.tx.subCategory || "Staff")
        : (item.tx.subCategory || item.tx.notes || "Direct");

      if (item.section === "mens") {
        g.mensSales += item.amount;
        g.mensCount += 1;
        g.mensStaffSales[staffName] = (g.mensStaffSales[staffName] || 0) + item.amount;
      } else if (item.section === "ladies") {
        g.ladiesSales += item.amount;
        g.ladiesCount += 1;
        g.ladiesStaffSales[staffName] = (g.ladiesStaffSales[staffName] || 0) + item.amount;
      }
    });

    // Sort chronologically ascending to compute Month-over-Month percentages accurately
    const sortedKeys = Object.keys(monthGroups).sort();

    const chronologicalList: MonthlySectionStats[] = [];

    sortedKeys.forEach((mKey, idx) => {
      const data = monthGroups[mKey];
      const [yStr, mStr] = mKey.split("-");
      const year = parseInt(yStr, 10);
      const monthNum = parseInt(mStr, 10);

      const dateObj = new Date(year, monthNum - 1, 1);
      const displayMonth = format(dateObj, "MMM yyyy");
      const fullMonthName = format(dateObj, "MMMM yyyy");

      const mensSales = data.mensSales;
      const ladiesSales = data.ladiesSales;
      const totalSales = mensSales + ladiesSales;

      let winner: "mens" | "ladies" | "tie" = "tie";
      if (mensSales > ladiesSales) winner = "mens";
      else if (ladiesSales > mensSales) winner = "ladies";

      const diffAmount = Math.abs(mensSales - ladiesSales);
      const diffPercent = totalSales > 0 ? (diffAmount / totalSales) * 100 : 0;
      const mensLeadOverLadies = mensSales - ladiesSales;

      // Compute Month-over-Month (MoM) Growth Rate
      let mensMomPercent: number | null = null;
      let ladiesMomPercent: number | null = null;
      let totalMomPercent: number | null = null;

      if (idx > 0) {
        const prev = chronologicalList[idx - 1];
        if (prev.mensSales > 0) {
          mensMomPercent = ((mensSales - prev.mensSales) / prev.mensSales) * 100;
        } else if (mensSales > 0) {
          mensMomPercent = 100; // From zero to positive
        }

        if (prev.ladiesSales > 0) {
          ladiesMomPercent = ((ladiesSales - prev.ladiesSales) / prev.ladiesSales) * 100;
        } else if (ladiesSales > 0) {
          ladiesMomPercent = 100;
        }

        if (prev.totalSales > 0) {
          totalMomPercent = ((totalSales - prev.totalSales) / prev.totalSales) * 100;
        }
      }

      chronologicalList.push({
        monthKey: mKey,
        displayMonth,
        fullMonthName,
        year,
        monthNum,
        mensSales,
        ladiesSales,
        totalSales,
        mensCount: data.mensCount,
        ladiesCount: data.ladiesCount,
        winner,
        diffAmount,
        diffPercent,
        mensLeadOverLadies,
        mensMomPercent,
        ladiesMomPercent,
        totalMomPercent,
        mensStaffSales: data.mensStaffSales,
        ladiesStaffSales: data.ladiesStaffSales,
        transactions: data.transactions
      });
    });

    return chronologicalList;
  }, [filteredTaggedSales, employees]);

  // Overall Period Aggregations & High-Level KPIs
  const overallKPIs = useMemo(() => {
    let totalMens = 0;
    let totalLadies = 0;
    let totalMensInvoices = 0;
    let totalLadiesInvoices = 0;
    let mensMonthsWon = 0;
    let ladiesMonthsWon = 0;

    monthlyStats.forEach(m => {
      totalMens += m.mensSales;
      totalLadies += m.ladiesSales;
      totalMensInvoices += m.mensCount;
      totalLadiesInvoices += m.ladiesCount;

      if (m.winner === "mens") mensMonthsWon += 1;
      else if (m.winner === "ladies") ladiesMonthsWon += 1;
    });

    const combinedTotal = totalMens + totalLadies;
    const diff = Math.abs(totalMens - totalLadies);
    const overallWinner: "mens" | "ladies" | "tie" = 
      totalMens > totalLadies ? "mens" : totalLadies > totalMens ? "ladies" : "tie";

    const mensShare = combinedTotal > 0 ? (totalMens / combinedTotal) * 100 : 0;
    const ladiesShare = combinedTotal > 0 ? (totalLadies / combinedTotal) * 100 : 0;
    const leadMarginPercent = combinedTotal > 0 ? (diff / combinedTotal) * 100 : 0;

    const monthCount = monthlyStats.length || 1;
    const avgMonthlyMens = totalMens / monthCount;
    const avgMonthlyLadies = totalLadies / monthCount;

    // Latest month stats
    const latestMonth = monthlyStats.length > 0 ? monthlyStats[monthlyStats.length - 1] : null;

    return {
      totalMens,
      totalLadies,
      combinedTotal,
      diff,
      overallWinner,
      mensShare,
      ladiesShare,
      leadMarginPercent,
      totalMensInvoices,
      totalLadiesInvoices,
      mensMonthsWon,
      ladiesMonthsWon,
      totalMonths: monthlyStats.length,
      avgMonthlyMens,
      avgMonthlyLadies,
      latestMonth
    };
  }, [monthlyStats]);

  // Prepare Chart Data
  const chartData = useMemo(() => {
    return monthlyStats.map(m => {
      let bdtDisplayMonth = m.displayMonth;
      if (isBn) {
        const bnMonths: Record<string, string> = {
          "Jan": "জানু", "Feb": "ফেব্রু", "Mar": "মার্চ", "Apr": "এপ্রিল",
          "May": "মে", "Jun": "জুন", "Jul": "জুলাই", "Aug": "আগস্ট",
          "Sep": "সেপ্টে", "Oct": "অক্টো", "Nov": "নভে", "Dec": "ডিসে"
        };
        const parts = m.displayMonth.split(" ");
        if (parts.length === 2 && bnMonths[parts[0]]) {
          bdtDisplayMonth = `${bnMonths[parts[0]]} ${parts[1]}`;
        }
      }

      return {
        monthKey: m.monthKey,
        name: bdtDisplayMonth,
        mensSales: m.mensSales,
        ladiesSales: m.ladiesSales,
        totalSales: m.totalSales,
        diff: m.diffAmount,
        winner: m.winner,
        mensMom: m.mensMomPercent !== null ? Number(m.mensMomPercent.toFixed(1)) : 0,
        ladiesMom: m.ladiesMomPercent !== null ? Number(m.ladiesMomPercent.toFixed(1)) : 0,
      };
    });
  }, [monthlyStats, isBn]);

  // CSV Exporter
  const exportToCSV = React.useCallback(() => {
    let csv = "\uFEFF"; // UTF-8 BOM
    csv += `SALES MENS SECTION VS SALES LADIES SECTION COMPARATIVE AUDIT\n`;
    csv += `Company: ${companyName}\n`;
    csv += `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}\n`;
    csv += `Filter Period: ${startDate || "Start"} to ${endDate || "Present"} (Year: ${selectedYear})\n\n`;

    csv += `SUMMARY METRICS\n`;
    csv += `Sales Mens Section Total (BDT),${overallKPIs.totalMens.toFixed(2)},${overallKPIs.mensShare.toFixed(1)}%\n`;
    csv += `Sales Ladies Section Total (BDT),${overallKPIs.totalLadies.toFixed(2)},${overallKPIs.ladiesShare.toFixed(1)}%\n`;
    csv += `Lead Section,${overallKPIs.overallWinner === "mens" ? "Sales Mens Section" : "Sales Ladies Section"},Difference BDT ${overallKPIs.diff.toFixed(2)}\n`;
    csv += `Months Won by Mens,${overallKPIs.mensMonthsWon}/${overallKPIs.totalMonths}\n`;
    csv += `Months Won by Ladies,${overallKPIs.ladiesMonthsWon}/${overallKPIs.totalMonths}\n\n`;

    csv += `MONTH-BY-MONTH COMPARATIVE BREAKDOWN\n`;
    csv += `"Month","Sales Mens Section (BDT)","Mens MoM Growth %","Sales Ladies Section (BDT)","Ladies MoM Growth %","Leading Section","Gap / Difference (BDT)","Combined Month Total (BDT)"\n`;

    monthlyStats.forEach(m => {
      const mensGrowth = m.mensMomPercent !== null ? `${m.mensMomPercent > 0 ? "+" : ""}${m.mensMomPercent.toFixed(1)}%` : "Base Month";
      const ladiesGrowth = m.ladiesMomPercent !== null ? `${m.ladiesMomPercent > 0 ? "+" : ""}${m.ladiesMomPercent.toFixed(1)}%` : "Base Month";
      const winLabel = m.winner === "mens" ? "Sales Mens Section" : m.winner === "ladies" ? "Sales Ladies Section" : "Equal Tie";

      csv += `"${m.fullMonthName}",${m.mensSales.toFixed(2)},"${mensGrowth}",${m.ladiesSales.toFixed(2)},"${ladiesGrowth}","${winLabel}",${m.diffAmount.toFixed(2)},${m.totalSales.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Section_Sales_Comparison_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [companyName, startDate, endDate, selectedYear, overallKPIs, monthlyStats]);

  // Register with parent if provided
  useEffect(() => {
    if (onRegisterExporter) {
      onRegisterExporter(exportToCSV);
    }
  }, [onRegisterExporter, exportToCSV]);

  // PDF Exporter
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Dark elegant header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 42, "F");

    // Company Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(companyName.toUpperCase(), 14, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(companyTagline || "Modern POS Enterprise Analytics", 14, 22);
    doc.text(`${companyAddress || "Dhaka, Bangladesh"}  |  Tel: ${companyPhone || "+880 1234 567890"}`, 14, 27);
    doc.text(`Official Section Sales Comparative Audit Statement`, 14, 32);

    // Right banner badge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(244, 63, 94); // rose-500
    doc.text("MENS VS LADIES SECTION", pageWidth - 14, 16, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - 14, 22, { align: "right" });
    doc.text(`Period: ${selectedYear !== "All" ? `Year ${selectedYear}` : "All Time Records"}`, pageWidth - 14, 27, { align: "right" });

    // Executive Summary Bento Boxes on PDF
    let curY = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("1. EXECUTIVE SECTION PERFORMANCE SUMMARY", 14, curY);

    const winnerName = overallKPIs.overallWinner === "mens" 
      ? "Sales Mens Section (Leading)" 
      : overallKPIs.overallWinner === "ladies" 
        ? "Sales Ladies Section (Leading)" 
        : "Equal Tie";

    autoTable(doc, {
      startY: curY + 4,
      head: [["METRIC CATEGORY", "SALES MENS SECTION", "SALES LADIES SECTION", "AUDITED VARIANCE & LEADER"]],
      body: [
        [
          "Gross Section Revenue",
          `BDT ${overallKPIs.totalMens.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `BDT ${overallKPIs.totalLadies.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `${winnerName} by BDT ${overallKPIs.diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${overallKPIs.leadMarginPercent.toFixed(1)}%)`
        ],
        [
          "Market Revenue Share %",
          `${overallKPIs.mensShare.toFixed(1)}% of total sales`,
          `${overallKPIs.ladiesShare.toFixed(1)}% of total sales`,
          overallKPIs.overallWinner === "mens" ? "+ Mens Outperformed" : "+ Ladies Outperformed"
        ],
        [
          "Average Monthly Sales",
          `BDT ${overallKPIs.avgMonthlyMens.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `BDT ${overallKPIs.avgMonthlyLadies.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `Computed over ${overallKPIs.totalMonths} recorded months`
        ],
        [
          "Winning Months Count",
          `${overallKPIs.mensMonthsWon} Months (${((overallKPIs.mensMonthsWon / (overallKPIs.totalMonths || 1)) * 100).toFixed(0)}%)`,
          `${overallKPIs.ladiesMonthsWon} Months (${((overallKPIs.ladiesMonthsWon / (overallKPIs.totalMonths || 1)) * 100).toFixed(0)}%)`,
          `${overallKPIs.overallWinner === "mens" ? "Mens won more months" : "Ladies won more months"}`
        ]
      ],
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 85]
      },
      styles: {
        cellPadding: 3.5
      }
    });

    const nextY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("2. CHRONOLOGICAL MONTH-OVER-MONTH GROWTH & VARIANCE TABLE", 14, nextY);

    const tableRows = monthlyStats.map(m => {
      const mensGrowth = m.mensMomPercent !== null 
        ? `${m.mensMomPercent > 0 ? "+" : ""}${m.mensMomPercent.toFixed(1)}%` 
        : "Base";
      const ladiesGrowth = m.ladiesMomPercent !== null 
        ? `${m.ladiesMomPercent > 0 ? "+" : ""}${m.ladiesMomPercent.toFixed(1)}%` 
        : "Base";
      const leader = m.winner === "mens" 
        ? "MENS" 
        : m.winner === "ladies" 
          ? "LADIES" 
          : "TIE";

      return [
        m.fullMonthName,
        `BDT ${m.mensSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        mensGrowth,
        `BDT ${m.ladiesSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ladiesGrowth,
        leader,
        `BDT ${m.diffAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `BDT ${m.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ];
    });

    autoTable(doc, {
      startY: nextY + 4,
      head: [[
        "Month & Year",
        "Mens Sales",
        "Mens MoM %",
        "Ladies Sales",
        "Ladies MoM %",
        "Leader",
        "Difference",
        "Combined Total"
      ]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [79, 70, 229], // Indigo
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold"
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 41, 59]
      },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "center", fontStyle: "bold" },
        3: { halign: "right" },
        4: { halign: "center", fontStyle: "bold" },
        5: { halign: "center", fontStyle: "bold" },
        6: { halign: "right" },
        7: { halign: "right", fontStyle: "bold" }
      },
      styles: {
        cellPadding: 2.8
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text(`Official Modern Pro Audit Document. All records timestamp-verified on ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}.`, 14, finalY);

    doc.save(`Mens_vs_Ladies_Section_Sales_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  // Staff listing for section assignment
  const activeStaff = useMemo(() => {
    return employees.filter(e => e.status !== "inactive");
  }, [employees]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* TOP HEADER & ACTION BANNER */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-2 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
            <span className="text-xs font-bold text-rose-600 uppercase tracking-widest">
              {isBn ? "সেকশন বিক্রয় তুলনামূলক অ্যানালিটিক্স" : "Section Revenue Velocity & MoM Analytics"}
            </span>
          </div>
          <h2 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <span>{isBn ? "সেলস মেনস বনাম লেডিস সেকশন রিপোর্ট" : "Sales Mens vs Ladies Section Report"}</span>
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {isBn 
              ? "উভয় সেকশনের মধ্যে কোন সেকশনে সেল বেশি বা কম হচ্ছে এবং প্রতিমাসে শতকরা কত পার্সেন্ট বৃদ্ধি বা হ্রাস পাচ্ছে তার পরিপূর্ণ মাসিক চিত্র।" 
              : "Comprehensive monthly breakdown of highest and lowest selling sections with month-over-month % growth analysis."
            }
          </p>
        </div>

        {/* TOP ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowStaffConfig(!showStaffConfig)}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer shadow-xs",
              showStaffConfig 
                ? "bg-slate-900 text-white border-slate-900" 
                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{isBn ? "স্টাফ সেকশন ম্যাপিং" : "Staff Section Mapping"}</span>
          </button>

          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-97 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>{isBn ? "এক্সেল / CSV" : "Export CSV"}</span>
          </button>

          <button
            onClick={exportToPDF}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-700 hover:to-rose-700 text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 active:scale-97 cursor-pointer shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isBn ? "পিডিএফ রিপোর্ট" : "Print PDF"}</span>
          </button>
        </div>
      </div>

      {/* OPTIONAL STAFF SECTION MAPPING DRAWER */}
      {showStaffConfig && (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-700" />
              <h4 className="text-sm font-extrabold text-slate-900">
                {isBn ? "বিক্রয় প্রতিনিধির সেকশন নির্ধারণ (Staff Section Assignment)" : "Assign Employees to Sales Sections"}
              </h4>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              {isBn 
                ? "স্বয়ংক্রিয়ভাবে সনাক্ত না হলে এখানে ম্যানুয়ালি মেনস বা লেডিস সেকশন নির্বাচন করতে পারেন" 
                : "Easily tag staff to Mens or Ladies Section if their department is generic"
              }
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeStaff.map(emp => {
              const currentSection = customStaffMap[emp.id!] || detectSalesSection({ type: "income", category: "Employee Sales", employeeId: emp.id, amount: 1, date: new Date().toISOString(), paymentMethod: "Cash", createdBy: "" }, employees);

              return (
                <div key={emp.id} className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col justify-between gap-2 shadow-xs">
                  <div>
                    <span className="text-xs font-black text-slate-800 block truncate">{emp.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium block truncate">
                      {emp.department || "Sales"} • {emp.role || "Staff"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleUpdateStaffSection(emp.id!, "mens")}
                      className={cn(
                        "flex-1 py-1 px-2 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer text-center",
                        currentSection === "mens" 
                          ? "bg-indigo-600 text-white shadow-xs" 
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      👔 {isBn ? "মেনস" : "Mens"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStaffSection(emp.id!, "ladies")}
                      className={cn(
                        "flex-1 py-1 px-2 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer text-center",
                        currentSection === "ladies" 
                          ? "bg-rose-600 text-white shadow-xs" 
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      👗 {isBn ? "লেডিস" : "Ladies"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTER & PERIOD SELECTOR BENTO */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-600">
              {isBn ? "তারিখ ও সময়কাল ফিল্টার" : "Timeframe & Range Filters"}
            </h4>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setPresetRange("thisYear")}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              {isBn ? "চলতি বছর" : "This Year"}
            </button>
            <button
              onClick={() => setPresetRange("last6Months")}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              {isBn ? "বিগত ৬ মাস" : "Last 6 Months"}
            </button>
            <button
              onClick={() => setPresetRange("last12Months")}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              {isBn ? "বিগত ১২ মাস" : "Last 12 Months"}
            </button>
            <button
              onClick={() => setPresetRange("allTime")}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              {isBn ? "প্রথম থেকে শেষ" : "All Time"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Year Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {isBn ? "নির্দিষ্ট বছর নির্বাচন" : "Select Year"}
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs h-[38px] cursor-pointer outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-900"
            >
              <option value="All">{isBn ? "সকল বছর (All Years)" : "All Recorded Years"}</option>
              {availableYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {isBn ? "শুরু তারিখ" : "Start Date"}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-900"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {isBn ? "শেষ তারিখ" : "End Date"}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-900"
            />
          </div>

          {/* Section View Focus */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {isBn ? "সেকশন ফোকাস" : "Section Focus"}
            </label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs h-[38px] cursor-pointer outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-900"
            >
              <option value="all">{isBn ? "উভয় সেকশন (যৌথ তুলনা)" : "Both Sections (Comparison)"}</option>
              <option value="mens">{isBn ? "শুধুমাত্র মেনস সেকশন" : "Sales Mens Section Only"}</option>
              <option value="ladies">{isBn ? "শুধুমাত্র লেডিস সেকশন" : "Sales Ladies Section Only"}</option>
            </select>
          </div>
        </div>
      </div>

      {/* EXECUTIVE KPI SUMMARY CARDS - HIGH FIDELITY BENTO */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* CARD 1: OVERALL LEADING / HIGHEST SELLING SECTION */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#d4af37] flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-[#d4af37]" />
                {isBn ? "সর্বাধিক বিক্রিত শীর্ষ সেকশন" : "Leading Revenue Section"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                {overallKPIs.totalMonths} {isBn ? "মাস" : "Months"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                {overallKPIs.overallWinner === "mens" ? (
                  <>
                    <span>👔</span>
                    <span className="text-indigo-300">{isBn ? "সেলস মেনস সেকশন" : "Sales Mens"}</span>
                  </>
                ) : overallKPIs.overallWinner === "ladies" ? (
                  <>
                    <span>👗</span>
                    <span className="text-rose-300">{isBn ? "সেলস লেডিস সেকশন" : "Sales Ladies"}</span>
                  </>
                ) : (
                  <span>{isBn ? "উভয় সেকশন সমান" : "Evenly Matched"}</span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium pt-1">
                {isBn ? "ব্যবধানে এগিয়ে:" : "Lead Margin:"}{" "}
                <span className="font-mono font-bold text-white">{formatCurrency(overallKPIs.diff)}</span>{" "}
                <span className="text-emerald-400 font-bold">({overallKPIs.leadMarginPercent.toFixed(1)}%)</span>
              </p>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300">
            <span>
              {isBn ? "জয়ী মাস সংখ্যা:" : "Won Months:"}{" "}
              <strong className="text-white">
                {overallKPIs.overallWinner === "mens" ? overallKPIs.mensMonthsWon : overallKPIs.ladiesMonthsWon}/{overallKPIs.totalMonths}
              </strong>
            </span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {overallKPIs.overallWinner === "mens" ? "Top Performer" : "Leading Market"}
            </span>
          </div>
        </div>

        {/* CARD 2: SALES MENS SECTION AGGREGATE */}
        <div className="bg-white border border-slate-200/90 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                {isBn ? "সেলস মেনস সেকশন" : "Sales Mens Section"}
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {overallKPIs.totalMensInvoices} {isBn ? "চালান" : "invoices"}
              </span>
            </div>

            <div className="text-3xl font-black text-slate-900 font-mono">
              {formatCurrency(overallKPIs.totalMens)}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{isBn ? "মার্কেট শেয়ার:" : "Revenue Share:"}</span>
              <span className="font-bold text-indigo-700 font-mono">{overallKPIs.mensShare.toFixed(1)}%</span>
            </div>

            <div className="w-full bg-slate-100 h-2 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.max(0, overallKPIs.mensShare))}%` }}
              />
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isBn ? "মাসিক গড় বিক্রয়:" : "Monthly Avg:"}</span>
            <span className="font-mono font-bold text-slate-800">{formatCurrency(overallKPIs.avgMonthlyMens)}</span>
          </div>
        </div>

        {/* CARD 3: SALES LADIES SECTION AGGREGATE */}
        <div className="bg-white border border-slate-200/90 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600" />
                {isBn ? "সেলস লেডিস সেকশন" : "Sales Ladies Section"}
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {overallKPIs.totalLadiesInvoices} {isBn ? "চালান" : "invoices"}
              </span>
            </div>

            <div className="text-3xl font-black text-slate-900 font-mono">
              {formatCurrency(overallKPIs.totalLadies)}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{isBn ? "মার্কেট শেয়ার:" : "Revenue Share:"}</span>
              <span className="font-bold text-rose-700 font-mono">{overallKPIs.ladiesShare.toFixed(1)}%</span>
            </div>

            <div className="w-full bg-slate-100 h-2 rounded-full mt-1.5 overflow-hidden">
              <div 
                className="bg-rose-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.max(0, overallKPIs.ladiesShare))}%` }}
              />
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isBn ? "মাসিক গড় বিক্রয়:" : "Monthly Avg:"}</span>
            <span className="font-mono font-bold text-slate-800">{formatCurrency(overallKPIs.avgMonthlyLadies)}</span>
          </div>
        </div>

        {/* CARD 4: LATEST MONTH MOM PERFORMANCE SNAPSHOT */}
        <div className="bg-white border border-slate-200/90 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                {isBn ? "চলতি/সর্বশেষ মাসের প্রবৃদ্ধি" : "Latest Month Trajectory"}
              </span>
              <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full">
                {overallKPIs.latestMonth ? overallKPIs.latestMonth.displayMonth : "N/A"}
              </span>
            </div>

            {overallKPIs.latestMonth ? (
              <div className="space-y-2 mt-1">
                {/* Mens latest month MoM */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-indigo-50/60 border border-indigo-100/60">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                    👔 {isBn ? "মেনস" : "Mens"}
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-slate-900 block">
                      {formatCurrency(overallKPIs.latestMonth.mensSales)}
                    </span>
                    {overallKPIs.latestMonth.mensMomPercent !== null ? (
                      <span className={cn(
                        "text-[10px] font-extrabold flex items-center justify-end gap-0.5",
                        overallKPIs.latestMonth.mensMomPercent >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {overallKPIs.latestMonth.mensMomPercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {overallKPIs.latestMonth.mensMomPercent > 0 ? "+" : ""}{overallKPIs.latestMonth.mensMomPercent.toFixed(1)}% {isBn ? "MoM" : "MoM"}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-semibold">{isBn ? "বেস মাস" : "Base Month"}</span>
                    )}
                  </div>
                </div>

                {/* Ladies latest month MoM */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50/60 border border-rose-100/60">
                  <span className="text-xs font-bold text-rose-900 flex items-center gap-1">
                    👗 {isBn ? "লেডিস" : "Ladies"}
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-slate-900 block">
                      {formatCurrency(overallKPIs.latestMonth.ladiesSales)}
                    </span>
                    {overallKPIs.latestMonth.ladiesMomPercent !== null ? (
                      <span className={cn(
                        "text-[10px] font-extrabold flex items-center justify-end gap-0.5",
                        overallKPIs.latestMonth.ladiesMomPercent >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {overallKPIs.latestMonth.ladiesMomPercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {overallKPIs.latestMonth.ladiesMomPercent > 0 ? "+" : ""}{overallKPIs.latestMonth.ladiesMomPercent.toFixed(1)}% {isBn ? "MoM" : "MoM"}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-semibold">{isBn ? "বেস মাস" : "Base Month"}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-4">{isBn ? "কোন তথ্য পাওয়া যায়নি" : "No records in period"}</p>
            )}
          </div>

          <div className="pt-2 text-[10px] text-slate-400 font-medium">
            {isBn 
              ? "* MoM নির্দেশ করে পূর্ববর্তী মাসের তুলনায় শতকরা পরিবর্তন" 
              : "* MoM represents Month-over-Month percentage change"
            }
          </div>
        </div>
      </div>

      {/* INTERACTIVE COMPARISON CHARTS SECTION */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>{isBn ? "মাসিক বিক্রয় ও প্রবৃদ্ধি চার্ট ভিজ্যুয়ালাইজেশন" : "Comparative Section Velocity & Trajectory Chart"}</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isBn 
                ? "মেনস সেকশন (নীল/ইন্ডিগো) এবং লেডিস সেকশন (গোলাপী/রোজ) এর পাশাপাশি মাসিক তুলনা ও প্রবৃদ্ধি" 
                : "Side-by-side monthly revenue velocity with month-over-month growth curves"
              }
            </p>
          </div>

          {/* Chart View Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200">
            <button
              onClick={() => setActiveChartTab("bar")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                activeChartTab === "bar" 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {isBn ? "বার চার্ট (টাকা)" : "Bar Chart (Revenue)"}
            </button>
            <button
              onClick={() => setActiveChartTab("line")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                activeChartTab === "line" 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {isBn ? "ট্রেন্ড লাইন" : "Trend Lines"}
            </button>
            <button
              onClick={() => setActiveChartTab("growth")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                activeChartTab === "growth" 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {isBn ? "প্রবৃদ্ধি হার (% MoM)" : "MoM Growth (%)"}
            </button>
          </div>
        </div>

        {/* RECHARTS CONTAINER */}
        <div className="h-[360px] w-full pt-2">
          {chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Info className="w-8 h-8 mb-2 stroke-1" />
              <p className="text-sm font-medium">{isBn ? "বাছাইকৃত সময়কালের জন্য কোন বিক্রয় তথ্য নেই।" : "No sales data found for the selected interval."}</p>
            </div>
          ) : activeChartTab === "bar" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val) => `৳${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: any, name: any) => {
                    const num = typeof value === "number" ? value : 0;
                    const label = name === "mensSales" 
                      ? (isBn ? "সেলস মেনস সেকশন" : "Sales Mens Section") 
                      : (isBn ? "সেলস লেডিস সেকশন" : "Sales Ladies Section");
                    return [`৳${num.toLocaleString()}`, label];
                  }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "16px",
                    color: "#ffffff",
                    fontSize: "12px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
                  }}
                  itemStyle={{ padding: "3px 0" }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: 15 }}
                  formatter={(value) => {
                    if (value === "mensSales") return isBn ? "সেলস মেনস সেকশন" : "Sales Mens Section";
                    if (value === "ladiesSales") return isBn ? "সেলস লেডিস সেকশন" : "Sales Ladies Section";
                    return value;
                  }}
                />
                {(sectionFilter === "all" || sectionFilter === "mens") && (
                  <Bar 
                    dataKey="mensSales" 
                    name="mensSales" 
                    fill="#4f46e5" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={45} 
                  />
                )}
                {(sectionFilter === "all" || sectionFilter === "ladies") && (
                  <Bar 
                    dataKey="ladiesSales" 
                    name="ladiesSales" 
                    fill="#e11d48" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={45} 
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : activeChartTab === "line" ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val) => `৳${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: any, name: any) => {
                    const num = typeof value === "number" ? value : 0;
                    const label = name === "mensSales" 
                      ? (isBn ? "সেলস মেনস সেকশন" : "Sales Mens Section") 
                      : (isBn ? "সেলস লেডিস সেকশন" : "Sales Ladies Section");
                    return [`৳${num.toLocaleString()}`, label];
                  }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "16px",
                    color: "#ffffff",
                    fontSize: "12px"
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: 15 }}
                  formatter={(value) => {
                    if (value === "mensSales") return isBn ? "সেলস মেনস সেকশন" : "Sales Mens Section";
                    if (value === "ladiesSales") return isBn ? "সেলস লেডিস সেকশন" : "Sales Ladies Section";
                    return value;
                  }}
                />
                {(sectionFilter === "all" || sectionFilter === "mens") && (
                  <Line 
                    type="monotone" 
                    dataKey="mensSales" 
                    name="mensSales" 
                    stroke="#4f46e5" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: "#4f46e5" }}
                    activeDot={{ r: 7 }} 
                  />
                )}
                {(sectionFilter === "all" || sectionFilter === "ladies") && (
                  <Line 
                    type="monotone" 
                    dataKey="ladiesSales" 
                    name="ladiesSales" 
                    stroke="#e11d48" 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: "#e11d48" }}
                    activeDot={{ r: 7 }} 
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val) => `${val > 0 ? "+" : ""}${val}%`}
                />
                <Tooltip 
                  formatter={(value: any, name: any) => {
                    const num = typeof value === "number" ? value : 0;
                    const label = name === "mensMom" 
                      ? (isBn ? "মেনস মাসিক প্রবৃদ্ধি" : "Mens MoM Growth") 
                      : (isBn ? "লেডিস মাসিক প্রবৃদ্ধি" : "Ladies MoM Growth");
                    return [`${num > 0 ? "+" : ""}${num}%`, label];
                  }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "16px",
                    color: "#ffffff",
                    fontSize: "12px"
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: 15 }}
                  formatter={(value) => {
                    if (value === "mensMom") return isBn ? "মেনস সেকশন প্রবৃদ্ধি (%)" : "Mens Section Growth (%)";
                    if (value === "ladiesMom") return isBn ? "লেডিস সেকশন প্রবৃদ্ধি (%)" : "Ladies Section Growth (%)";
                    return value;
                  }}
                />
                <Bar 
                  dataKey="mensMom" 
                  name="mensMom" 
                  fill="#6366f1" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={30} 
                />
                <Bar 
                  dataKey="ladiesMom" 
                  name="ladiesMom" 
                  fill="#f43f5e" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={30} 
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* DETAILED MONTH-BY-MONTH AUDIT TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>{isBn ? "প্রতিমাসের বিস্তারিত বিক্রয় ও প্রবৃদ্ধি শতকরা খতিয়ান" : "Detailed Monthly Section Performance & MoM Velocity Ledger"}</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isBn 
                ? "প্রতিমাসে কোন সেকশন এগিয়ে ছিল, কত টাকা বেশি হয়েছে এবং গত মাসের তুলনায় কত পার্সেন্ট বেড়েছে বা কমেছে" 
                : "Audited month-by-month records showing which section won, lead margin, and MoM growth rate"
              }
            </p>
          </div>

          <div className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
            {monthlyStats.length} {isBn ? "টি রেকর্ডকৃত মাস" : "Recorded Months"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4 w-10"></th>
                <th className="py-3.5 px-4">{isBn ? "মাস ও বছর" : "Month & Year"}</th>
                <th className="py-3.5 px-4 text-right text-indigo-700">
                  {isBn ? "মেনস সেকশন বিক্রয়" : "Mens Section Sales"}
                </th>
                <th className="py-3.5 px-4 text-center">
                  {isBn ? "মেনস প্রবৃদ্ধি (%)" : "Mens MoM %"}
                </th>
                <th className="py-3.5 px-4 text-right text-rose-700">
                  {isBn ? "লেডিস সেকশন বিক্রয়" : "Ladies Section Sales"}
                </th>
                <th className="py-3.5 px-4 text-center">
                  {isBn ? "লেডিস প্রবৃদ্ধি (%)" : "Ladies MoM %"}
                </th>
                <th className="py-3.5 px-4 text-center">
                  {isBn ? "শীর্ষ সেকশন" : "Leading Section"}
                </th>
                <th className="py-3.5 px-4 text-right">
                  {isBn ? "পার্থক্য / ব্যবধান" : "Gap / Variance"}
                </th>
                <th className="py-3.5 px-4 text-right text-slate-900 font-black">
                  {isBn ? "যৌথ মোট বিক্রয়" : "Combined Total"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {monthlyStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    {isBn ? "এই ফিল্টারের জন্য কোন বিক্রয় তথ্য পাওয়া যায়নি।" : "No monthly sales records found matching the applied filter criteria."}
                  </td>
                </tr>
              ) : (
                monthlyStats.map((m, idx) => {
                  const isExpanded = !!expandedMonths[m.monthKey];

                  return (
                    <React.Fragment key={m.monthKey}>
                      <tr 
                        onClick={() => toggleMonth(m.monthKey)}
                        className={cn(
                          "hover:bg-slate-50/70 transition-colors cursor-pointer group",
                          isExpanded && "bg-slate-50/80"
                        )}
                      >
                        {/* Expand Icon */}
                        <td className="py-3.5 px-4 text-slate-400 group-hover:text-slate-700">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        {/* Month Name */}
                        <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                          {m.fullMonthName}
                        </td>

                        {/* Mens Sales */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                          {formatCurrency(m.mensSales)}
                        </td>

                        {/* Mens MoM Growth % */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {m.mensMomPercent === null ? (
                            <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                              {isBn ? "বেস মাস" : "Base"}
                            </span>
                          ) : m.mensMomPercent > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <TrendingUp className="w-2.5 h-2.5" />
                              +{m.mensMomPercent.toFixed(1)}%
                            </span>
                          ) : m.mensMomPercent < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              <TrendingDown className="w-2.5 h-2.5" />
                              {m.mensMomPercent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              0.0%
                            </span>
                          )}
                        </td>

                        {/* Ladies Sales */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                          {formatCurrency(m.ladiesSales)}
                        </td>

                        {/* Ladies MoM Growth % */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {m.ladiesMomPercent === null ? (
                            <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                              {isBn ? "বেস মাস" : "Base"}
                            </span>
                          ) : m.ladiesMomPercent > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <TrendingUp className="w-2.5 h-2.5" />
                              +{m.ladiesMomPercent.toFixed(1)}%
                            </span>
                          ) : m.ladiesMomPercent < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              <TrendingDown className="w-2.5 h-2.5" />
                              {m.ladiesMomPercent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              0.0%
                            </span>
                          )}
                        </td>

                        {/* Monthly Winner Badge */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {m.winner === "mens" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                              🏆 {isBn ? "মেনস এগিয়ে" : "Mens Lead"}
                            </span>
                          ) : m.winner === "ladies" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                              🏆 {isBn ? "লেডিস এগিয়ে" : "Ladies Lead"}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {isBn ? "সমান" : "Tie"}
                            </span>
                          )}
                        </td>

                        {/* Difference Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-600 whitespace-nowrap">
                          {formatCurrency(m.diffAmount)}
                        </td>

                        {/* Combined Month Total */}
                        <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 whitespace-nowrap bg-slate-50/40">
                          {formatCurrency(m.totalSales)}
                        </td>
                      </tr>

                      {/* EXPANDED ROW: STAFF CONTRIBUTION FOR THIS MONTH */}
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={9} className="p-4 pl-12 border-b border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Mens staff contribution */}
                              <div className="bg-white p-3.5 rounded-2xl border border-indigo-100">
                                <span className="text-[11px] font-black text-indigo-900 uppercase tracking-wider block mb-2">
                                  👔 {isBn ? "মেনস সেকশন স্টাফ বিক্রয় অবদান" : "Mens Section Staff Contributors"} ({formatCurrency(m.mensSales)})
                                </span>
                                {Object.keys(m.mensStaffSales).length === 0 ? (
                                  <p className="text-[11px] text-slate-400 italic">{isBn ? "কোন স্টাফ রেকর্ড নেই" : "No staff breakdowns"}</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {Object.entries(m.mensStaffSales).map(([sName, sAmt]) => (
                                      <div key={sName} className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-slate-700">{sName}</span>
                                        <span className="font-mono font-bold text-indigo-700">{formatCurrency(Number(sAmt))}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Ladies staff contribution */}
                              <div className="bg-white p-3.5 rounded-2xl border border-rose-100">
                                <span className="text-[11px] font-black text-rose-900 uppercase tracking-wider block mb-2">
                                  👗 {isBn ? "লেডিস সেকশন স্টাফ বিক্রয় অবদান" : "Ladies Section Staff Contributors"} ({formatCurrency(m.ladiesSales)})
                                </span>
                                {Object.keys(m.ladiesStaffSales).length === 0 ? (
                                  <p className="text-[11px] text-slate-400 italic">{isBn ? "কোন স্টাফ রেকর্ড নেই" : "No staff breakdowns"}</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {Object.entries(m.ladiesStaffSales).map(([sName, sAmt]) => (
                                      <div key={sName} className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-slate-700">{sName}</span>
                                        <span className="font-mono font-bold text-rose-700">{formatCurrency(Number(sAmt))}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {monthlyStats.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white font-extrabold text-xs">
                  <td colSpan={2} className="py-4 px-4 uppercase tracking-wider">
                    {isBn ? "সর্বমোট যৌথ খতিয়ান" : "Grand Combined Totals"}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-indigo-300">
                    {formatCurrency(overallKPIs.totalMens)}
                  </td>
                  <td className="py-4 px-4 text-center text-slate-400">
                    {overallKPIs.mensShare.toFixed(1)}% {isBn ? "শেয়ার" : "Share"}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-rose-300">
                    {formatCurrency(overallKPIs.totalLadies)}
                  </td>
                  <td className="py-4 px-4 text-center text-slate-400">
                    {overallKPIs.ladiesShare.toFixed(1)}% {isBn ? "শেয়ার" : "Share"}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="text-amber-400 font-black">
                      {overallKPIs.overallWinner === "mens" ? "🏆 Mens" : "🏆 Ladies"}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-slate-300">
                    {formatCurrency(overallKPIs.diff)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-white font-black text-sm">
                    {formatCurrency(overallKPIs.combinedTotal)}
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
