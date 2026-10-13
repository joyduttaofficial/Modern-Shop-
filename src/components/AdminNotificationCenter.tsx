import React, { useState, useEffect, useRef } from "react";
import { 
  Bell, 
  Check, 
  Trash2, 
  Eye, 
  PlusCircle, 
  Edit3, 
  AlertTriangle, 
  Volume2, 
  VolumeX, 
  X, 
  ExternalLink, 
  Search, 
  Filter, 
  Clock, 
  User, 
  ShieldCheck, 
  Layers, 
  RefreshCw,
  Sparkles,
  Download,
  FileSpreadsheet
} from "lucide-react";
import { ActivityAction, ActivityNotification, UserRole } from "../types";
import { 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteActivityNotification, 
  clearAllActivityNotifications,
  playNotificationChime,
  isSuperAdminUser 
} from "../lib/activityLogger";
import { subscribeToSupabaseTable } from "../lib/supabaseDb";
import { cn } from "../lib/utils";
import { formatDistanceToNow, format } from "date-fns";

interface AdminNotificationCenterProps {
  currentUserId: string;
  userRole: UserRole;
  onNavigateMenu?: (menuId: string) => void;
}

export default function AdminNotificationCenter({
  currentUserId,
  userRole,
  onNavigateMenu
}: AdminNotificationCenterProps) {
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | ActivityAction>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_notification_sound");
      return saved !== null ? saved === "true" : false;
    }
    return false;
  });

  // Recent toast notification state for immediate alert popup
  const [latestToast, setLatestToast] = useState<ActivityNotification | null>(null);
  const isInitialMount = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Real-time Supabase subscription to activity_notifications
  useEffect(() => {
    const handleItems = (items: ActivityNotification[]) => {
      // Detect newly arrived notification for toast alert (only from other users)
      if (!isInitialMount.current && items.length > 0) {
        const newest = items[0];
        const notifTime = new Date(newest.timestamp).getTime();
        const now = Date.now();
        const isFromOtherUser = !isSuperAdminUser(newest.userRole, newest.userEmail);

        if (isFromOtherUser && now - notifTime < 25000 && (!newest.readBy || !newest.readBy.includes(currentUserId))) {
          setLatestToast(newest);
          if (soundEnabled) {
            playNotificationChime();
          }
          // Auto hide toast after 6 seconds
          const timer = setTimeout(() => {
            setLatestToast(prev => (prev?.id === newest.id ? null : prev));
          }, 6000);
          return () => clearTimeout(timer);
        }
      } else {
        isInitialMount.current = false;
      }

      setNotifications(items);
    };

    const unsubscribe = subscribeToSupabaseTable<ActivityNotification>(
      "activity_notifications",
      handleItems,
      { limit: 100, orderBy: "timestamp", orderDir: "desc", pollIntervalMs: 5000 }
    );

    const handleLocalCreated = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        const item = custom.detail as ActivityNotification;
        if (!isSuperAdminUser(item.userRole, item.userEmail)) {
          setNotifications(prev => [item, ...prev.filter(p => p.id !== item.id)]);
          setLatestToast(item);
          if (soundEnabled) playNotificationChime();
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("activity-notification-created", handleLocalCreated);
    }

    return () => {
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("activity-notification-created", handleLocalCreated);
      }
    };
  }, [currentUserId, soundEnabled]);

  // Toggle sound setting
  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem("admin_notification_sound", String(next));
      if (next) playNotificationChime();
      return next;
    });
  };

  // Only consider notifications created by other users (exclude Super Admin self-actions)
  const otherUsersNotifications = notifications.filter(
    n => !isSuperAdminUser(n.userRole, n.userEmail)
  );

  // Calculate unread count strictly for other users' actions
  const unreadCount = otherUsersNotifications.filter(
    n => !n.readBy || !n.readBy.includes(currentUserId)
  ).length;

  // Filtered list
  const filteredNotifications = otherUsersNotifications.filter(n => {
    if (activeFilter !== "all" && n.action !== activeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = n.userName?.toLowerCase().includes(q);
      const matchEmail = n.userEmail?.toLowerCase().includes(q);
      const matchMenu = n.menuLabel?.toLowerCase().includes(q);
      const matchNote = n.note?.toLowerCase().includes(q);
      const matchTitle = n.title?.toLowerCase().includes(q);
      return matchName || matchEmail || matchMenu || matchNote || matchTitle;
    }
    return true;
  });

  const getActionBadge = (action: ActivityAction) => {
    switch (action) {
      case "create":
        return {
          label: "তৈরি / যোগ",
          enLabel: "CREATE",
          color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
          icon: PlusCircle
        };
      case "edit":
        return {
          label: "সম্পাদনা",
          enLabel: "EDIT",
          color: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400",
          icon: Edit3
        };
      case "delete":
        return {
          label: "মুছে ফেলা",
          enLabel: "DELETE",
          color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
          icon: Trash2
        };
      case "view":
        return {
          label: "পরিদর্শন",
          enLabel: "VIEW",
          color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
          icon: Eye
        };
      default:
        return {
          label: "কার্যক্রম",
          enLabel: "ACTION",
          color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-slate-300",
          icon: Clock
        };
    }
  };

  const handleExportCSV = () => {
    if (notifications.length === 0) return;
    const headers = ["Timestamp", "User Name", "Email", "Role", "Menu", "Action", "Title", "Note"];
    const rows = notifications.map(n => [
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
    link.download = `super_admin_audit_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Only render for admin / superadmin
  const isAdmin = userRole === "admin" || userRole === "superadmin";
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="relative inline-block" ref={panelRef}>
      {/* Top Header Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          "relative p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center border",
          isOpen
            ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20"
            : unreadCount > 0
            ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 shadow-xs"
            : "bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-zinc-900 dark:text-slate-300 border-slate-200 dark:border-zinc-800"
        )}
        title={unreadCount > 0 ? `${unreadCount} টি নতুন অ্যাক্টিভিটি নোটিফিকেশন` : "অ্যাক্টিভিটি নোটিফিকেশন"}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 px-1 items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-black shadow-xs ring-2 ring-white dark:ring-zinc-900 animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Instant Toast Alert for New Events */}
      {latestToast && !isOpen && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-full bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-2xl p-4 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden shrink-0 border border-slate-200">
                <img
                  src={latestToast.userPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(latestToast.userName)}`}
                  alt={latestToast.userName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {latestToast.userName}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {latestToast.userRole}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border",
                    getActionBadge(latestToast.action).color
                  )}>
                    {getActionBadge(latestToast.action).label}
                  </span>
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {latestToast.menuLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-2">
                  {latestToast.note || latestToast.title}
                </p>
                <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  ✓ সেন্টারে সংরক্ষিত • পরে চেক করতে পারবেন
                </p>
              </div>
            </div>
            <button
              onClick={() => setLatestToast(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {onNavigateMenu && latestToast.menuId && (
            <button
              onClick={() => {
                onNavigateMenu(latestToast.menuId);
                setLatestToast(null);
              }}
              className="mt-3 w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              এই মেনু ওপেন করুন
            </button>
          )}
        </div>
      )}

      {/* Main Notification Dropdown / Panel */}
      {isOpen && (
        <div className="fixed sm:absolute top-16 sm:top-full right-2 sm:right-0 mt-2 z-50 w-[94vw] sm:w-[460px] max-w-[480px] bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-slate-950 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    অন্যান্য ইউজারদের অ্যাক্টিভিটি
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
                        {unreadCount} নতুন
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    অন্যান্য ইউজাররা ব্যবহার করলে নোটিফিকেশন এখানে জমা থাকে (পরে চেক করার জন্য)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Audio chime toggle */}
                <button
                  type="button"
                  onClick={toggleSound}
                  className={cn(
                    "p-1.5 rounded-lg border transition-all cursor-pointer text-xs",
                    soundEnabled
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"
                  )}
                  title={soundEnabled ? "সাউন্ড অন আছে (ক্লিক করে মিউট করুন)" : "সাউন্ড মিউট আছে (ক্লিক করে অন করুন)"}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mt-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ইউজার, মেনু বা কাজের বিবরণ খুঁজুন..."
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 mt-3 overflow-x-auto scrollbar-none pb-0.5">
              {[
                { id: "all", label: "সবগুলো" },
                { id: "create", label: "তৈরি/যোগ", color: "text-emerald-700" },
                { id: "edit", label: "সম্পাদনা", color: "text-indigo-700" },
                { id: "delete", label: "মুছে ফেলা", color: "text-rose-700" },
                { id: "view", label: "ভিউ/ভিজিট", color: "text-amber-700" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id as any)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer",
                    activeFilter === tab.id
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-800/40 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-[11px] font-bold text-slate-500">
              {filteredNotifications.length} টি রেকর্ড পাওয়া গেছে
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsAsRead(notifications, currentUserId)}
                  className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" /> সবগুলো পঠিত করুন
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  title="CSV ফাইল হিসেবে ডাউনলোড করুন"
                >
                  <Download className="w-3 h-3" /> এক্সপোর্ট
                </button>
              )}
            </div>
          </div>

          {/* List of Notification Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80 p-1">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center mx-auto">
                  <Bell className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {searchQuery || activeFilter !== "all"
                    ? "এই ফিল্টারে কোনো নোটিফিকেশন পাওয়া যায়নি"
                    : "এখনো কোনো কার্যক্রমের নোটিফিকেশন নেই"}
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  সিস্টেমে কোনো ইউজার নতুন ডাটা এন্ট্রি করলে, এডিট করলে, ডিলিট করলে বা কোনো মেনু দেখলে তাৎক্ষণিক এখানে নোটিফিকেশন আসবে।
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isUnread = !notif.readBy || !notif.readBy.includes(currentUserId);
                const badge = getActionBadge(notif.action);
                const BadgeIcon = badge.icon;

                let relativeTime = "Just now";
                try {
                  relativeTime = formatDistanceToNow(new Date(notif.timestamp), { addSuffix: true });
                } catch (e) {
                  relativeTime = notif.timestamp;
                }

                return (
                  <div
                    key={notif.id}
                    onClick={() => notif.id && markNotificationAsRead(notif.id, currentUserId)}
                    className={cn(
                      "p-3.5 rounded-2xl transition-all flex items-start gap-3 relative group cursor-pointer",
                      isUnread
                        ? "bg-slate-50/80 dark:bg-zinc-800/40 hover:bg-slate-100 dark:hover:bg-zinc-800/70"
                        : "hover:bg-slate-50/50 dark:hover:bg-zinc-800/20"
                    )}
                  >
                    {/* Unread dot indicator */}
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-4 left-2 shrink-0 animate-pulse" />
                    )}

                    {/* User Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 overflow-hidden shrink-0 mt-0.5 shadow-xs">
                      <img
                        src={notif.userPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(notif.userName)}`}
                        alt={notif.userName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Top Row: User & Role & Badge */}
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {notif.userName}
                          </span>
                          <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-zinc-700 text-slate-700 dark:text-slate-200">
                            {notif.userRole}
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-400 font-medium shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {relativeTime}
                        </span>
                      </div>

                      {/* Action & Menu badge */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border",
                          badge.color
                        )}>
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>

                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-zinc-700/60 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-slate-400" />
                          {notif.menuLabel}
                        </span>
                      </div>

                      {/* Title & Note Note */}
                      <div className="pt-0.5 space-y-0.5">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                          {notif.title}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed bg-white/60 dark:bg-zinc-900/60 p-2 rounded-xl border border-slate-150/60 dark:border-zinc-800/60">
                          {notif.note}
                        </p>
                      </div>

                      {/* Bottom actions row */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[9.5px] text-slate-400 font-mono">
                          {format(new Date(notif.timestamp), "dd MMM yyyy, hh:mm a")}
                        </span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onNavigateMenu && notif.menuId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigateMenu(notif.menuId);
                                setIsOpen(false);
                              }}
                              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> মেনু দেখুন
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (notif.id) deleteActivityNotification(notif.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 bg-slate-50 dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  if (confirm("আপনি কি নিশ্চিত যে সকল নোটিফিকেশন মুছে ফেলতে চান?")) {
                    clearAllActivityNotifications(notifications);
                  }
                }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" /> সমস্ত নোটিফিকেশন ক্লিয়ার করুন
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                বন্ধ করুন
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
