import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  FileText, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  Clock, 
  User, 
  PlusCircle, 
  Edit3, 
  Eye, 
  Layers, 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet
} from "lucide-react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ActivityAction, ActivityNotification, UserRole } from "../types";
import { 
  deleteActivityNotification, 
  clearAllActivityNotifications,
  isSuperAdminUser 
} from "../lib/activityLogger";
import { cn } from "../lib/utils";
import { format, isToday, isWithinInterval, subDays, startOfDay, endOfDay } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface AuditTrailProps {
  currentUserId: string;
  userRole: UserRole;
  onNavigateMenu?: (menuId: string) => void;
}

export default function AuditTrail({
  currentUserId,
  userRole,
  onNavigateMenu
}: AuditTrailProps) {
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAction, setSelectedAction] = useState<"all" | ActivityAction>("all");
  const [selectedMenu, setSelectedMenu] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "activityNotifications"),
      orderBy("timestamp", "desc"),
      limit(250)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ActivityNotification));
        setNotifications(items);
        setLoading(false);
      },
      (err) => {
        console.warn("AuditTrail load error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Distinct menus for filter
  const uniqueMenus = Array.from(
    new Set(notifications.map(n => n.menuLabel).filter(Boolean))
  );

  // Filtered dataset (strictly showing other users' activities)
  const filteredLogs = notifications.filter(n => {
    if (isSuperAdminUser(n.userRole, n.userEmail)) {
      return false;
    }
    if (selectedAction !== "all" && n.action !== selectedAction) {
      return false;
    }
    if (selectedMenu !== "all" && n.menuLabel !== selectedMenu) {
      return false;
    }

    if (dateFilter !== "all") {
      const itemDate = new Date(n.timestamp);
      const now = new Date();
      if (dateFilter === "today") {
        if (!isToday(itemDate)) return false;
      } else if (dateFilter === "week") {
        const weekAgo = subDays(now, 7);
        if (itemDate < weekAgo) return false;
      } else if (dateFilter === "month") {
        const monthAgo = subDays(now, 30);
        if (itemDate < monthAgo) return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = n.userName?.toLowerCase().includes(q);
      const matchEmail = n.userEmail?.toLowerCase().includes(q);
      const matchRole = n.userRole?.toLowerCase().includes(q);
      const matchMenu = n.menuLabel?.toLowerCase().includes(q);
      const matchTitle = n.title?.toLowerCase().includes(q);
      const matchNote = n.note?.toLowerCase().includes(q);
      return matchName || matchEmail || matchRole || matchMenu || matchTitle || matchNote;
    }

    return true;
  });

  // Action badge helper
  const getActionBadge = (action: ActivityAction) => {
    switch (action) {
      case "create":
        return {
          label: "তৈরি / যোগ",
          badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
          icon: PlusCircle
        };
      case "edit":
        return {
          label: "সম্পাদনা",
          badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400",
          icon: Edit3
        };
      case "delete":
        return {
          label: "মুছে ফেলা",
          badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
          icon: Trash2
        };
      case "view":
        return {
          label: "পরিদর্শন",
          badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
          icon: Eye
        };
      default:
        return {
          label: "কার্যক্রম",
          badge: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-slate-300",
          icon: Clock
        };
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ["Timestamp", "User Name", "Email", "Role", "Menu", "Action", "Title", "Note"];
    const rows = filteredLogs.map(n => [
      `"${n.timestamp}"`,
      `"${(n.userName || "").replace(/"/g, '""')}"`,
      `"${(n.userEmail || "").replace(/"/g, '""')}"`,
      `"${(n.userRole || "").replace(/"/g, '""')}"`,
      `"${(n.menuLabel || "").replace(/"/g, '""')}"`,
      `"${n.action.toUpperCase()}"`,
      `"${(n.title || "").replace(/"/g, '""')}"`,
      `"${(n.note || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit_trail_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export PDF Report
  const handleExportPDF = () => {
    if (filteredLogs.length === 0) return;
    const doc = new jsPDF("l", "mm", "a4");

    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, doc.internal.pageSize.width, 24, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("SUPER ADMIN AUDIT TRAIL & ACTIVITY LOG", 14, 12);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(`Generated on: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")} | Total Entries: ${filteredLogs.length}`, 14, 18);

    const tableColumns = ["Timestamp", "User", "Role", "Menu", "Action", "Title", "Activity Note"];
    const tableRows = filteredLogs.map(n => [
      format(new Date(n.timestamp), "yyyy-MM-dd HH:mm"),
      n.userName || "",
      (n.userRole || "").toUpperCase(),
      n.menuLabel || "",
      n.action.toUpperCase(),
      n.title || "",
      n.note || ""
    ]);

    autoTable(doc, {
      startY: 28,
      head: [tableColumns],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold"
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 26 },
        2: { cellWidth: 18 },
        3: { cellWidth: 32 },
        4: { cellWidth: 20 },
        5: { cellWidth: 40 },
        6: { cellWidth: "auto" }
      }
    });

    doc.save(`super_admin_audit_report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  // Metrics
  const totalCount = notifications.length;
  const createCount = notifications.filter(n => n.action === "create").length;
  const editCount = notifications.filter(n => n.action === "edit").length;
  const deleteCount = notifications.filter(n => n.action === "delete").length;
  const viewCount = notifications.filter(n => n.action === "view").length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/10">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  সুপার এডমিন অডিট ট্রেইল ও নোটিফিকেশন
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Live Feed
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                সিস্টেমে যেকোনো ইউজার ডাটা যোগ, এডিট, ভিউ বা ডিলিট করলে এখানে রিয়েল-টাইমে নোটিফিকেশন ও বিস্তারিত অডিট লগ সংরক্ষিত হয়।
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end flex-wrap">
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              এক্সেল (CSV)
            </button>
            <button
              onClick={handleExportPDF}
              disabled={filteredLogs.length === 0}
              className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              PDF রিপোর্ট
            </button>
          </div>
        </div>

        {/* Quick Stats Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">মোট কার্যক্রম</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{totalCount}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">তৈরি / যোগ</p>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-0.5">{createCount}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">সম্পাদনা</p>
            <p className="text-xl font-black text-indigo-700 dark:text-indigo-400 mt-0.5">{editCount}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">মুছে ফেলা</p>
            <p className="text-xl font-black text-rose-700 dark:text-rose-400 mt-0.5">{deleteCount}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">মেনু পরিদর্শন</p>
            <p className="text-xl font-black text-amber-700 dark:text-amber-400 mt-0.5">{viewCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ইউজারের নাম, ইমেইল, মেনুর নাম বা কাজের নোট লিখে খুঁজুন..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Action Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {[
            { id: "all", label: "সবগুলো" },
            { id: "create", label: "তৈরি/যোগ" },
            { id: "edit", label: "সম্পাদনা" },
            { id: "delete", label: "মুছে ফেলা" },
            { id: "view", label: "পরিদর্শন" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedAction(tab.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                selectedAction === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date Filter */}
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
        >
          <option value="all">সব সময়</option>
          <option value="today">আজকে</option>
          <option value="week">গত ৭ দিন</option>
          <option value="month">গত ৩০ দিন</option>
        </select>
      </div>

      {/* Main Table / Cards List */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400" />
            <p className="text-xs text-slate-400 font-bold">অডিট লগ লোড হচ্ছে...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              কোনো অডিট লগ রেকর্ড পাওয়া যায়নি
            </p>
            <p className="text-xs text-slate-400">
              ফিল্টার পরিবর্তন করুন অথবা সিস্টেমে কার্যক্রম হওয়া পর্যন্ত অপেক্ষা করুন।
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-100 dark:border-zinc-800 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">ইউজার ও পদবি</th>
                  <th className="py-3.5 px-4">মেনু ও মডিউল</th>
                  <th className="py-3.5 px-4">অ্যাকশন</th>
                  <th className="py-3.5 px-4">কাজের শিরোনাম ও বিস্তারিত নোট</th>
                  <th className="py-3.5 px-4">সময়</th>
                  <th className="py-3.5 px-4 text-right">পদক্ষেপ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredLogs.map(item => {
                  const badge = getActionBadge(item.action);
                  const BadgeIcon = badge.icon;

                  return (
                    <tr 
                      key={item.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* User Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 overflow-hidden shrink-0">
                            <img
                              src={item.userPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(item.userName)}`}
                              alt={item.userName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="font-black text-slate-900 dark:text-white leading-tight">
                              {item.userName}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {item.userRole}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Menu Column */}
                      <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200/60 dark:border-zinc-700/60 text-[11px]">
                          <Layers className="w-3 h-3 text-slate-400" />
                          {item.menuLabel}
                        </span>
                      </td>

                      {/* Action Column */}
                      <td className="py-3.5 px-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border",
                          badge.badge
                        )}>
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </td>

                      {/* Note & Title */}
                      <td className="py-3.5 px-4 max-w-md">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-0.5">
                          {item.note}
                        </p>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        <div>{format(new Date(item.timestamp), "yyyy-MM-dd")}</div>
                        <div className="text-[10px] text-slate-400">{format(new Date(item.timestamp), "hh:mm:ss a")}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {onNavigateMenu && item.menuId && (
                            <button
                              type="button"
                              onClick={() => onNavigateMenu(item.menuId)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              মেনু দেখুন
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => item.id && deleteActivityNotification(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="লগ মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
