import React, { useState, useMemo } from "react";
import { Transaction, Employee } from "@/src/types";
import { useLanguage } from "../contexts/LanguageContext";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Flame, 
  ShieldAlert, 
  CheckCircle, 
  HelpCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity, 
  Target, 
  Lightbulb, 
  Filter, 
  Sparkles,
  Layers,
  BarChart2,
  Calendar,
  Eye
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { detectSalesSection, SectionType } from "./SectionSalesComparisonReport";

export type HeatmapMetricMode = "revenue" | "growth" | "share";

export interface SectionHeatmapRow {
  sectionId: string;
  nameEn: string;
  nameBn: string;
  icon: string;
  themeColor: "indigo" | "rose" | "amber" | "emerald" | "slate";
  monthlyData: Record<string, {
    revenue: number;
    count: number;
    sharePercent: number;
    momGrowthPercent: number | null;
  }>;
  totalRevenue: number;
  totalCount: number;
  avgMonthlyRevenue: number;
  overallSharePercent: number;
  healthScore: number; // 0 - 100
  focusPriority: "critical" | "warning" | "optimal" | "thriving";
  focusReasonBn: string;
  focusReasonEn: string;
  actionRecommendationBn: string;
  actionRecommendationEn: string;
}

interface SectionHeatmapDashboardProps {
  transactions: Transaction[];
  employees: Employee[];
  formatCurrency: (val: number) => string;
  customStaffMap?: Record<string, SectionType>;
}

export default function SectionHeatmapDashboard({
  transactions,
  employees,
  formatCurrency,
  customStaffMap,
}: SectionHeatmapDashboardProps) {
  const { language } = useLanguage();
  const isBn = language === "bn";

  // Filter States
  const [metricMode, setMetricMode] = useState<HeatmapMetricMode>("revenue");
  const [timeWindow, setTimeWindow] = useState<"6months" | "12months" | "all">("6months");
  const [selectedSectionDetail, setSelectedSectionDetail] = useState<string | null>(null);

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

  // Filter all income/sales transactions
  const salesTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.type !== "income") return false;
      const cat = (tx.category || "").trim().toLowerCase();
      return (
        cat === "employee sales" ||
        cat === "wholesale sales" ||
        cat === "product sales" ||
        cat === "retail sales" ||
        cat === "total deposit" ||
        cat.includes("sale") ||
        (tx.employeeId && tx.amount > 0)
      );
    });
  }, [transactions]);

  // Determine chronological months
  const allMonths = useMemo(() => {
    const monthKeys = new Set<string>();
    salesTransactions.forEach(tx => {
      const d = getDateStr(tx.date);
      if (d && d.length >= 7) {
        monthKeys.add(d.substring(0, 7));
      }
    });

    // If no months found, default to last 6 months from now
    if (monthKeys.size === 0) {
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        monthKeys.add(format(subMonths(now, i), "yyyy-MM"));
      }
    }

    const sorted = Array.from(monthKeys).sort();

    if (timeWindow === "6months") {
      return sorted.slice(-6);
    } else if (timeWindow === "12months") {
      return sorted.slice(-12);
    }
    return sorted;
  }, [salesTransactions, timeWindow]);

  // Build Comprehensive Heatmap Grid Data across 4 main business sections
  const { rows, maxMonthlyRevenue, totalBusinessRevenue, focusAlerts } = useMemo(() => {
    // 4 sections: Mens Section, Ladies Section, Wholesale Sales, Retail / Direct Sales
    const sectionsDef = [
      {
        sectionId: "mens",
        nameEn: "Sales Mens Section",
        nameBn: "সেলস মেনস সেকশন",
        icon: "👔",
        themeColor: "indigo" as const,
      },
      {
        sectionId: "ladies",
        nameEn: "Sales Ladies Section",
        nameBn: "সেলস লেডিস সেকশন",
        icon: "👗",
        themeColor: "rose" as const,
      },
      {
        sectionId: "wholesale",
        nameEn: "Wholesale Sales Section",
        nameBn: "পাইকারি বিক্রয় সেকশন",
        icon: "📦",
        themeColor: "amber" as const,
      },
      {
        sectionId: "retail",
        nameEn: "Direct Retail / Other Sales",
        nameBn: "রিটেইল ও অন্যান্য বিক্রয়",
        icon: "🏷️",
        themeColor: "slate" as const,
      }
    ];

    // Aggregation buckets: sectionId -> monthKey -> { revenue, count }
    const matrix: Record<string, Record<string, { revenue: number; count: number }>> = {
      mens: {},
      ladies: {},
      wholesale: {},
      retail: {}
    };

    allMonths.forEach(m => {
      sectionsDef.forEach(s => {
        matrix[s.sectionId][m] = { revenue: 0, count: 0 };
      });
    });

    const monthlyBusinessTotal: Record<string, number> = {};
    allMonths.forEach(m => {
      monthlyBusinessTotal[m] = 0;
    });

    // Populate data from transactions
    salesTransactions.forEach(tx => {
      const d = getDateStr(tx.date);
      if (!d || d.length < 7) return;
      const m = d.substring(0, 7);
      if (!matrix.mens[m]) return; // out of scope for current time window

      const amt = tx.amount || 0;
      monthlyBusinessTotal[m] = (monthlyBusinessTotal[m] || 0) + amt;

      const detected = detectSalesSection(tx, employees, customStaffMap);
      const cat = (tx.category || "").toLowerCase();

      if (detected === "mens") {
        matrix.mens[m].revenue += amt;
        matrix.mens[m].count += 1;
      } else if (detected === "ladies") {
        matrix.ladies[m].revenue += amt;
        matrix.ladies[m].count += 1;
      } else if (cat.includes("wholesale")) {
        matrix.wholesale[m].revenue += amt;
        matrix.wholesale[m].count += 1;
      } else {
        matrix.retail[m].revenue += amt;
        matrix.retail[m].count += 1;
      }
    });

    let overallMaxCellRevenue = 1;
    let grandBusinessTotal = 0;

    // Calculate totals and percentages
    const constructedRows: SectionHeatmapRow[] = sectionsDef.map(sec => {
      let totalRevenue = 0;
      let totalCount = 0;
      const monthlyData: Record<string, {
        revenue: number;
        count: number;
        sharePercent: number;
        momGrowthPercent: number | null;
      }> = {};

      allMonths.forEach((m, idx) => {
        const cell = matrix[sec.sectionId][m] || { revenue: 0, count: 0 };
        totalRevenue += cell.revenue;
        totalCount += cell.count;

        if (cell.revenue > overallMaxCellRevenue) {
          overallMaxCellRevenue = cell.revenue;
        }

        const mTotal = monthlyBusinessTotal[m] || 0;
        const sharePercent = mTotal > 0 ? (cell.revenue / mTotal) * 100 : 0;

        let momGrowthPercent: number | null = null;
        if (idx > 0) {
          const prevMonthKey = allMonths[idx - 1];
          const prevRev = matrix[sec.sectionId][prevMonthKey]?.revenue || 0;
          if (prevRev > 0) {
            momGrowthPercent = ((cell.revenue - prevRev) / prevRev) * 100;
          } else if (cell.revenue > 0) {
            momGrowthPercent = 100;
          }
        }

        monthlyData[m] = {
          revenue: cell.revenue,
          count: cell.count,
          sharePercent,
          momGrowthPercent
        };
      });

      grandBusinessTotal += totalRevenue;
      const monthCount = allMonths.length || 1;
      const avgMonthlyRevenue = totalRevenue / monthCount;

      // Health Score Calculation (0 to 100)
      // Evaluates: Consistency, latest month MoM velocity, and volume contribution
      let healthScore = 50;

      // Check latest month MoM
      const latestMonthKey = allMonths[allMonths.length - 1];
      const latestData = monthlyData[latestMonthKey];
      const latestMom = latestData?.momGrowthPercent;

      if (latestMom !== null && latestMom !== undefined) {
        if (latestMom >= 20) healthScore += 25;
        else if (latestMom >= 5) healthScore += 15;
        else if (latestMom >= 0) healthScore += 5;
        else if (latestMom > -15) healthScore -= 15;
        else healthScore -= 30;
      }

      // Check revenue volume factor
      if (avgMonthlyRevenue > 100000) healthScore += 20;
      else if (avgMonthlyRevenue > 50000) healthScore += 10;
      else if (avgMonthlyRevenue < 10000) healthScore -= 15;

      healthScore = Math.max(10, Math.min(99, healthScore));

      // Determine Focus Priority
      let focusPriority: "critical" | "warning" | "optimal" | "thriving" = "optimal";
      let focusReasonBn = "বিক্রয় স্বাভাবিক ও স্থিতিশীল রয়েছে।";
      let focusReasonEn = "Sales are stable within expected range.";
      let actionRecommendationBn = "বর্তমান বিক্রয় পরিকল্পনা অব্যাহত রাখুন।";
      let actionRecommendationEn = "Maintain current merchandising and sales process.";

      if (healthScore <= 35 || (latestMom !== null && latestMom !== undefined && latestMom <= -20)) {
        focusPriority = "critical";
        focusReasonBn = `সর্বশেষ মাসে বিক্রয় দ্রুত কমেছে (${latestMom !== null && latestMom !== undefined ? `${latestMom.toFixed(1)}%` : "নিম্নমুখী"})। অবিলম্বে ব্যবসায়িক নজর ও পদক্ষেপ প্রয়োজন!`;
        focusReasonEn = `Sales fell sharply in the latest period (${latestMom !== null && latestMom !== undefined ? `${latestMom.toFixed(1)}%` : "Declining"}). Immediate business attention required!`;
        actionRecommendationBn = "পণ্যের নতুন কালেকশন প্রদর্শন করুন, কাস্টমার আকর্ষণীয় অফার বা ডিসকাউন্ট দিন এবং ফ্লোর স্টাফদের বিশেষ তাগিদ দিন।";
        actionRecommendationEn = "Refresh product displays, run targeted promotional discounts, and review floor staff sales targets.";
      } else if (healthScore <= 55 || (latestMom !== null && latestMom !== undefined && latestMom < 0)) {
        focusPriority = "warning";
        focusReasonBn = "বিক্রয় কিছুটা হ্রাস পাচ্ছে অথবা গড় অর্জনের তুলনায় কম হচ্ছে। নিয়মিত পর্যবেক্ষণ প্রয়োজন।";
        focusReasonEn = "Sales are slowing down or performing below average. Regular monitoring recommended.";
        actionRecommendationBn = "জনপ্রিয় আইটেমগুলোর স্টক নিশ্চিত করুন এবং গ্রাহকদের পছন্দ বিশ্লেষণ করে ক্যাম্পেইন পরিচালনা করুন।";
        actionRecommendationEn = "Ensure top-selling products are in stock and run tailored customer engagement initiatives.";
      } else if (healthScore >= 80) {
        focusPriority = "thriving";
        focusReasonBn = `চমৎকার প্রবৃদ্ধি ও সর্বোচ্চ বিক্রয় অর্জন করছে (${latestMom !== null && latestMom !== undefined && latestMom > 0 ? `+${latestMom.toFixed(1)}% বৃদ্ধি` : "সর্বোচ্চ বিক্রয়"})!`;
        focusReasonEn = `Top-performing revenue driver with strong positive growth (${latestMom !== null && latestMom !== undefined && latestMom > 0 ? `+${latestMom.toFixed(1)}% growth` : "Market Leader"})!`;
        actionRecommendationBn = "এই সেকশনের চাহিদা মেটাতে দ্রুত পর্যাপ্ত স্টক মজুদ রাখুন এবং সফল বিক্রয় কৌশল অন্যান্য সেকশনে প্রয়োগ করুন।";
        actionRecommendationEn = "Scale inventory depth to meet heavy customer demand and replicate best practices across other departments.";
      }

      return {
        ...sec,
        monthlyData,
        totalRevenue,
        totalCount,
        avgMonthlyRevenue,
        overallSharePercent: 0, // Will compute next
        healthScore,
        focusPriority,
        focusReasonBn,
        focusReasonEn,
        actionRecommendationBn,
        actionRecommendationEn,
      };
    });

    // Populate overall share percent
    constructedRows.forEach(r => {
      r.overallSharePercent = grandBusinessTotal > 0 ? (r.totalRevenue / grandBusinessTotal) * 100 : 0;
    });

    // Identify sections that need the most business focus
    const criticalSections = constructedRows.filter(r => r.focusPriority === "critical" || r.focusPriority === "warning");
    const topPerformer = [...constructedRows].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

    return {
      rows: constructedRows,
      maxMonthlyRevenue: overallMaxCellRevenue,
      totalBusinessRevenue: grandBusinessTotal,
      focusAlerts: {
        criticalSections,
        topPerformer
      }
    };
  }, [salesTransactions, allMonths, employees, customStaffMap]);

  // Cell Color Generator for Heatmap
  const getCellClasses = (revenue: number, momPercent: number | null, sharePercent: number) => {
    if (metricMode === "growth") {
      if (momPercent === null) return "bg-slate-50 text-slate-500 font-semibold border-slate-200";
      if (momPercent >= 20) return "bg-emerald-600 text-white font-black shadow-xs";
      if (momPercent >= 5) return "bg-emerald-100 text-emerald-950 font-bold border border-emerald-300";
      if (momPercent >= 0) return "bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200";
      if (momPercent > -15) return "bg-amber-100 text-amber-950 font-bold border border-amber-300";
      return "bg-rose-600 text-white font-black shadow-xs animate-pulse";
    }

    if (metricMode === "share") {
      if (sharePercent >= 50) return "bg-indigo-600 text-white font-black";
      if (sharePercent >= 30) return "bg-indigo-200 text-indigo-950 font-bold border border-indigo-300";
      if (sharePercent >= 15) return "bg-indigo-50 text-indigo-900 font-semibold border border-indigo-200";
      if (sharePercent > 0) return "bg-slate-100 text-slate-800 font-medium";
      return "bg-slate-50 text-slate-400";
    }

    // Default: Revenue Intensity Heatmap
    if (revenue === 0) return "bg-slate-50 text-slate-400";
    const ratio = revenue / (maxMonthlyRevenue || 1);

    if (ratio >= 0.75) {
      return "bg-emerald-600 text-white font-black shadow-xs";
    } else if (ratio >= 0.50) {
      return "bg-emerald-100 text-emerald-950 font-bold border border-emerald-300";
    } else if (ratio >= 0.25) {
      return "bg-amber-100 text-amber-950 font-semibold border border-amber-300";
    } else if (ratio >= 0.10) {
      return "bg-rose-100 text-rose-950 font-semibold border border-rose-300";
    } else {
      return "bg-rose-600 text-white font-black shadow-xs ring-1 ring-rose-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* EXECUTIVE BUSINESS FOCUS SUMMARY BANNER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARD 1: IMMEDIATE BUSINESS FOCUS ALERT */}
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-6 rounded-3xl border border-slate-700 shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="absolute right-0 top-0 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                {isBn ? "ব্যবসায়িক নজরদারি অ্যালার্ট (Business Focus Diagnostic)" : "Business Focus & Velocity Diagnostic"}
              </span>
              <span className="text-xs font-semibold text-slate-400 font-mono">
                {allMonths.length} {isBn ? "মাসের ডাটা ভিত্তিক" : "Months Analyzed"}
              </span>
            </div>

            <h3 className="text-xl lg:text-2xl font-black tracking-tight text-white mb-2">
              {focusAlerts.criticalSections.length > 0 ? (
                <span className="flex items-center gap-2">
                  <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
                  <span>
                    {isBn 
                      ? `${focusAlerts.criticalSections.map(s => s.nameBn).join(" ও ")} এ জরুরি নজর দিন!`
                      : `${focusAlerts.criticalSections.map(s => s.nameEn).join(" & ")} Require Business Focus!`
                    }
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle className="w-6 h-6 shrink-0" />
                  <span>{isBn ? "সকল সেকশনের বিক্রয় ও পারফর্মেন্স সন্তোষজনক!" : "All Sections Operating at Healthy Performance!"}</span>
                </span>
              )}
            </h3>

            {/* Diagnostic Details */}
            <div className="space-y-2.5 mt-4">
              {focusAlerts.criticalSections.map(sec => (
                <div key={sec.sectionId} className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-2xl">{sec.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-white">{isBn ? sec.nameBn : sec.nameEn}</span>
                        <span className={cn(
                          "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                          sec.focusPriority === "critical" ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        )}>
                          {sec.focusPriority === "critical" 
                            ? (isBn ? "জরুরি মনোযোগ" : "High Focus Needed") 
                            : (isBn ? "সতর্কতা / নজর দিন" : "Moderate Attention")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 font-medium">
                        {isBn ? sec.focusReasonBn : sec.focusReasonEn}
                      </p>
                    </div>
                  </div>

                  {/* Recommendation action tag */}
                  <div className="bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl text-right shrink-0">
                    <span className="text-[10px] uppercase font-black text-rose-300 block mb-0.5">
                      {isBn ? "পরামর্শকৃত কৌশল:" : "Recommended Focus:"}
                    </span>
                    <span className="text-xs text-slate-200 font-semibold block max-w-xs">
                      {isBn ? sec.actionRecommendationBn : sec.actionRecommendationEn}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              {isBn 
                ? "হিটম্যাপে লাল/গোলাপী রঙের সেকশনগুলোতে বিক্রয় বাড়াতে বিশেষ উদ্যোগ নেওয়া প্রয়োজন।" 
                : "Sections shaded in red/rose on the heatmap indicate low performance and demand business attention."
              }
            </span>
          </div>
        </div>

        {/* CARD 2: STAR PERFORMING LEADER */}
        <div className="bg-white border border-slate-200/90 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-emerald-600" />
                {isBn ? "সর্বোচ্চ সফল স্টার সেকশন" : "Top Revenue Driver"}
              </span>
              <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                {focusAlerts.topPerformer ? `${focusAlerts.topPerformer.overallSharePercent.toFixed(1)}% Share` : ""}
              </span>
            </div>

            {focusAlerts.topPerformer && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{focusAlerts.topPerformer.icon}</span>
                  <div>
                    <h4 className="text-lg font-black text-slate-900">
                      {isBn ? focusAlerts.topPerformer.nameBn : focusAlerts.topPerformer.nameEn}
                    </h4>
                    <span className="text-xs font-mono font-bold text-emerald-600">
                      {formatCurrency(focusAlerts.topPerformer.totalRevenue)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-800 tracking-wider block mb-1">
                    {isBn ? "সাফল্যের কারণ ও সুপারিশ:" : "Best Practice Takeaway:"}
                  </span>
                  <p className="text-xs text-emerald-950 font-medium">
                    {isBn ? focusAlerts.topPerformer.actionRecommendationBn : focusAlerts.topPerformer.actionRecommendationEn}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>{isBn ? "মোট ব্যবসায়িক বিক্রয়:" : "Total Sales Volume:"}</span>
            <span className="font-mono font-bold text-slate-900">{formatCurrency(totalBusinessRevenue)}</span>
          </div>
        </div>
      </div>

      {/* HEATMAP CONTROL BAR & METRIC SELECTOR */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span>{isBn ? "সেকশন পারফর্মেন্স কালার-কোডেড হিটম্যাপ টেবিল" : "Color-Coded Section Performance Heatmap Matrix"}</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isBn 
                ? "সবুজ = উচ্চ সাফল্য (High Performing), হলুদ/অ্যাম্বার = স্বাভাবিক (Moderate), লাল/গোলাপী = কম বিক্রয় (Low Performing - Needs Focus)" 
                : "Green = High Performing, Yellow/Amber = Moderate, Red/Rose = Low Performing (Requires Immediate Business Focus)"
              }
            </p>
          </div>

          {/* Controls: Time window & Metric Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Window Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setTimeWindow("6months")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  timeWindow === "6months" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {isBn ? "বিগত ৬ মাস" : "Last 6 Mos"}
              </button>
              <button
                type="button"
                onClick={() => setTimeWindow("12months")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  timeWindow === "12months" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {isBn ? "বিগত ১২ মাস" : "Last 12 Mos"}
              </button>
              <button
                type="button"
                onClick={() => setTimeWindow("all")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  timeWindow === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {isBn ? "সব রেকর্ড" : "All Time"}
              </button>
            </div>

            {/* Metric Mode Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setMetricMode("revenue")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  metricMode === "revenue" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {isBn ? "বিক্রয় টাকা (Revenue)" : "Revenue (BDT)"}
              </button>
              <button
                type="button"
                onClick={() => setMetricMode("growth")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  metricMode === "growth" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {isBn ? "প্রবৃদ্ধি (% MoM Growth)" : "MoM Growth (%)"}
              </button>
              <button
                type="button"
                onClick={() => setMetricMode("share")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  metricMode === "share" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {isBn ? "মার্কেট শেয়ার (% Share)" : "Share (%)"}
              </button>
            </div>
          </div>
        </div>

        {/* COLOR KEY / HEATMAP SCALE LEGEND */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-1 border-t border-slate-100 text-xs">
          <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[10px]">
            {isBn ? "হিটম্যাপ কালার স্কেল নিদের্শক:" : "Performance Color Scale:"}
          </span>
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-white" />
              {isBn ? "উচ্চ সাফল্য (Top Tier)" : "High Performing"}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px]">
              {isBn ? "সন্তোষজনক প্রবৃদ্ধি" : "Above Average"}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px]">
              {isBn ? "গড় মান (Moderate)" : "Moderate / Watch"}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 text-[11px]">
              {isBn ? "নিম্নমুখী (Lagging)" : "Underperforming"}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black">
              ⚠️ {isBn ? "কম বিক্রয় (Needs Focus)" : "Critical Focus Needed"}
            </span>
          </div>
        </div>

        {/* THE HEATMAP TABLE */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
                <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-900 min-w-[200px]">
                  {isBn ? "বিজনেস সেকশন" : "Business Section"}
                </th>
                {allMonths.map(m => {
                  const [y, mon] = m.split("-");
                  const dObj = new Date(parseInt(y, 10), parseInt(mon, 10) - 1, 1);
                  const mLabel = format(dObj, "MMM yy");

                  return (
                    <th key={m} className="py-3.5 px-3 text-center min-w-[100px] border-l border-slate-800 font-mono">
                      {mLabel}
                    </th>
                  );
                })}
                <th className="py-3.5 px-4 text-right border-l border-slate-800 min-w-[120px]">
                  {isBn ? "মোট বিক্রয়" : "Total Revenue"}
                </th>
                <th className="py-3.5 px-4 text-center border-l border-slate-800 min-w-[130px]">
                  {isBn ? "বিজনেস ফোকাস স্ট্যাটাস" : "Business Focus Status"}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-slate-800">
              {rows.map(sec => {
                const isSelected = selectedSectionDetail === sec.sectionId;

                return (
                  <React.Fragment key={sec.sectionId}>
                    <tr 
                      onClick={() => setSelectedSectionDetail(isSelected ? null : sec.sectionId)}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors cursor-pointer group",
                        isSelected && "bg-slate-100/70"
                      )}
                    >
                      {/* Section Identification Sticky Column */}
                      <td className="py-3 px-4 font-black text-slate-900 sticky left-0 z-10 bg-white group-hover:bg-slate-50/80 border-r border-slate-200 whitespace-nowrap shadow-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{sec.icon}</span>
                          <div>
                            <span className="text-xs font-black block">{isBn ? sec.nameBn : sec.nameEn}</span>
                            <span className="text-[10px] text-slate-400 font-semibold block">
                              {sec.totalCount} {isBn ? "টি চালান" : "invoices"} • {sec.overallSharePercent.toFixed(1)}% {isBn ? "শেয়ার" : "Share"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Heatmap Month Cells */}
                      {allMonths.map(m => {
                        const cell = sec.monthlyData[m] || { revenue: 0, count: 0, sharePercent: 0, momGrowthPercent: null };
                        const cellStyle = getCellClasses(cell.revenue, cell.momGrowthPercent, cell.sharePercent);

                        return (
                          <td 
                            key={m} 
                            className={cn(
                              "py-3 px-2 text-center border-r border-slate-200/80 transition-all font-mono",
                              cellStyle
                            )}
                            title={`${sec.nameEn} - ${m}: ${formatCurrency(cell.revenue)} (${cell.count} sales)`}
                          >
                            {metricMode === "growth" ? (
                              cell.momGrowthPercent !== null ? (
                                <div className="text-[11px] leading-tight">
                                  <span>{cell.momGrowthPercent > 0 ? "+" : ""}{cell.momGrowthPercent.toFixed(1)}%</span>
                                </div>
                              ) : (
                                <span className="text-[10px] opacity-70">Base</span>
                              )
                            ) : metricMode === "share" ? (
                              <div className="text-[11px] leading-tight">
                                <span>{cell.sharePercent.toFixed(1)}%</span>
                              </div>
                            ) : (
                              <div className="text-[11px] leading-tight">
                                <span className="block">{cell.revenue > 0 ? `৳${(cell.revenue / 1000).toFixed(cell.revenue >= 100000 ? 0 : 1)}k` : "৳0"}</span>
                                {cell.momGrowthPercent !== null && (
                                  <span className={cn(
                                    "text-[9px] block opacity-90 font-sans font-bold",
                                    cell.momGrowthPercent >= 0 ? "opacity-90" : "opacity-95 underline"
                                  )}>
                                    {cell.momGrowthPercent > 0 ? "+" : ""}{cell.momGrowthPercent.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Total Revenue Column */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap bg-slate-50/50">
                        {formatCurrency(sec.totalRevenue)}
                      </td>

                      {/* Business Focus Status Badge */}
                      <td className="py-3 px-4 text-center whitespace-nowrap bg-slate-50/50">
                        {sec.focusPriority === "critical" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-full animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            {isBn ? "জরুরি ফোকাস দরকার" : "Focus Needed"}
                          </span>
                        ) : sec.focusPriority === "warning" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-full">
                            <Eye className="w-3 h-3 text-amber-600" />
                            {isBn ? "নজর রাখুন" : "Watch / Monitor"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            {isBn ? "চমৎকার পারফর্মেন্স" : "High Performer"}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* EXPANDED DIAGNOSTIC ROW */}
                    {isSelected && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={allMonths.length + 3} className="p-4 pl-8 border-b border-slate-200">
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                              <span className="text-xs font-black text-slate-900 flex items-center gap-2">
                                <Target className="w-4 h-4 text-indigo-600" />
                                {isBn ? `${sec.nameBn}-এর ব্যবসায়িক ডায়াগনস্টিক রিপোর্ট` : `Action Plan & Diagnostic for ${sec.nameEn}`}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                {isBn ? "মাসিক গড় বিক্রয়:" : "Monthly Average:"} <strong>{formatCurrency(sec.avgMonthlyRevenue)}</strong>
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">
                                  {isBn ? "বর্তমান অবস্থা ও ট্রেন্ড:" : "Status & Velocity Observation:"}
                                </span>
                                <p className="text-slate-800 font-semibold">
                                  {isBn ? sec.focusReasonBn : sec.focusReasonEn}
                                </p>
                              </div>

                              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                                <span className="font-bold text-indigo-700 uppercase text-[10px] block mb-1">
                                  {isBn ? "প্রস্তাবিত ব্যবসায়িক অ্যাকশন প্ল্যান:" : "Recommended Strategic Action:"}
                                </span>
                                <p className="text-indigo-950 font-semibold">
                                  {isBn ? sec.actionRecommendationBn : sec.actionRecommendationEn}
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
