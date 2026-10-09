import React, { useState, useEffect } from "react";
import { 
  Database, 
  Copy, 
  Check, 
  Download, 
  Terminal, 
  ExternalLink, 
  Layers, 
  ShieldCheck, 
  Zap, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  FileCode,
  CheckCircle2,
  TableProperties,
  AlertCircle,
  Play,
  RefreshCw,
  UploadCloud,
  HardDrive,
  Key,
  Globe,
  Radio,
  CheckCircle
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { 
  getStoredSupabaseUrl, 
  getStoredSupabaseAnonKey, 
  saveSupabaseCredentials, 
  isSupabaseConfigured,
  testSupabaseConnection,
  getActiveDatabaseMode,
  setActiveDatabaseMode
} from "@/src/lib/supabase";
import { 
  fetchAllFirestoreData, 
  pushDataDirectlyToSupabase, 
  downloadFullDataSql,
  FullExportData 
} from "@/src/lib/supabaseMigration";
import rawSupabaseSql from "/supabase.sql?raw";

export const SUPABASE_SQL_SCHEMA = rawSupabaseSql;

export const TABLES_METADATA = [
  { name: "roles", desc: "Custom role architect with granular module permissions & actions", icon: "ShieldCheck" },
  { name: "profiles", desc: "User accounts, roles, designations, and Supabase Auth identity sync", icon: "Users" },
  { name: "departments", desc: "Corporate departments and branches registry", icon: "Layers" },
  { name: "employees", desc: "Staff registry with compensation, NID/photo attachments, and roles", icon: "Users" },
  { name: "attendance_settings", desc: "Configurable business rules for late-cuts and breakfast allowances", icon: "Settings" },
  { name: "attendance", desc: "Daily time logs with biometric status, late minutes, and deductions", icon: "Clock" },
  { name: "categories", desc: "Operational Income and Expense classification taxonomy", icon: "Tag" },
  { name: "banks", desc: "Liquid cash registers, bank accounts, and automatic balance tracking", icon: "Landmark" },
  { name: "transactions", desc: "Double-entry cash book ledger (Income & Expense) linked to employees/suppliers", icon: "DollarSign" },
  { name: "suppliers", desc: "Wholesale suppliers, credit ledger, dues, and payment histories", icon: "Truck" },
  { name: "supplier_transactions", desc: "Sourcing invoices, returns, advance settlements, and dues", icon: "FileText" },
  { name: "purchases", desc: "Itemized wholesale purchase orders and bill camera vouchers", icon: "ShoppingCart" },
  { name: "products", desc: "Inventory catalog, real-time stock balances, and valuation", icon: "Package" },
  { name: "stock_ledger", desc: "Audit log of physical stock movements (Purchase, Sale, Return, Adjustment)", icon: "Archive" },
  { name: "customers", desc: "Counter retail and wholesale customers with live balance due tracking", icon: "UserCheck" },
  { name: "counter_sales", desc: "Rapid slip-based counter sales with discount engine, cash, and credit balance", icon: "Receipt" },
  { name: "customer_payments", desc: "Payment receipt vouchers for customer credit due recovery", icon: "CheckCircle2" },
  { name: "activity_notifications", desc: "Super admin real-time activity notifications and complete audit trail", icon: "Bell" },
  { name: "company_settings", desc: "Brand identity, logos, system title, and currency configuration", icon: "Briefcase" }
];

export default function SupabaseSqlHub() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"migration" | "overview" | "guide" | "code">("migration");

  // Credentials form state
  const [url, setUrl] = useState(() => getStoredSupabaseUrl());
  const [anonKey, setAnonKey] = useState(() => getStoredSupabaseAnonKey());
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeMode, setActiveMode] = useState<"supabase" | "firebase">(() => getActiveDatabaseMode());

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationStatusText, setMigrationStatusText] = useState("");
  const [migrationSummary, setMigrationSummary] = useState<Record<string, number> | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [isFetchingDataCount, setIsFetchingDataCount] = useState(false);
  const [dataStats, setDataStats] = useState<Record<string, number>>({});

  useEffect(() => {
    // Load initial counts of existing data
    fetchExistingDataCounts();
  }, []);

  const fetchExistingDataCounts = async () => {
    setIsFetchingDataCount(true);
    try {
      const data = await fetchAllFirestoreData();
      setDataStats({
        counterSales: data.counterSales.length,
        customers: data.customers.length,
        customerPayments: data.customerPayments.length,
        transactions: data.transactions.length,
        banks: data.banks.length,
        products: data.products.length,
        suppliers: data.suppliers.length,
        employees: data.employees.length,
        categories: data.categories.length,
        departments: data.departments.length,
        roles: data.roles.length,
        activityNotifications: data.activityNotifications.length,
      });
    } catch (e) {
      console.warn("Could not fetch data counts:", e);
    } finally {
      setIsFetchingDataCount(false);
    }
  };

  const handleSaveCredentials = () => {
    if (!url.trim() || !anonKey.trim()) {
      alert("Please provide both Supabase Project URL and Anon API Key.");
      return;
    }
    saveSupabaseCredentials(url, anonKey);
    setActiveDatabaseMode("supabase");
    setActiveMode("supabase");
    setConnectionResult({
      success: true,
      message: "Credentials saved! Supabase is now set as the primary database."
    });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      // Save temporarily first so getSupabase() uses the current inputs
      saveSupabaseCredentials(url, anonKey);
      const res = await testSupabaseConnection();
      setConnectionResult(res);
      if (res.success) {
        setActiveDatabaseMode("supabase");
        setActiveMode("supabase");
      }
    } catch (err: any) {
      setConnectionResult({
        success: false,
        message: err.message || "Connection failed. Please check Project URL and API Key."
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunMigration = async () => {
    if (!isSupabaseConfigured()) {
      alert("Please enter and save your Supabase Project URL and Anon Key before migrating data.");
      return;
    }

    setIsMigrating(true);
    setMigrationError(null);
    setMigrationSummary(null);
    setMigrationProgress(5);
    setMigrationStatusText("Reading all live records from system storage...");

    try {
      const allData = await fetchAllFirestoreData();
      setMigrationProgress(15);
      setMigrationStatusText("Beginning bulk push to Supabase PostgreSQL...");

      const result = await pushDataDirectlyToSupabase(allData, (step, percent) => {
        setMigrationStatusText(step);
        setMigrationProgress(percent);
      });

      setMigrationSummary(result.summary);
      setMigrationStatusText("Complete! All system records have been saved in Supabase.");
      setActiveDatabaseMode("supabase");
      setActiveMode("supabase");
      fetchExistingDataCounts();
    } catch (err: any) {
      console.error("Migration error:", err);
      setMigrationError(err.message || "An error occurred during data migration to Supabase.");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([SUPABASE_SQL_SCHEMA], { type: "text/plain;charset=utf-8" });
    const urlBlob = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = urlBlob;
    link.download = `supabase-schema-${new Date().toISOString().split("T")[0]}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(urlBlob);
  };

  const totalRecordsCount = Object.values(dataStats).reduce<number>((a, b) => Number(a || 0) + Number(b || 0), 0);

  return (
    <section className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black tracking-tight text-white">
                    Supabase PostgreSQL Database Engine
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Primary Engine
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  সিস্টেমের মূল ডাটাবেজ হিসেবে Supabase যুক্ত করুন এবং পূর্বের সকল ডেটা এক ক্লিকে সেভ করুন।
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleCopy}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md",
                copied 
                  ? "bg-emerald-500 text-white" 
                  : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
              )}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              {copied ? "SQL Copied!" : "Copy SQL Schema"}
            </button>

            <button
              onClick={handleDownload}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
              Download .sql
            </button>
          </div>
        </div>

        {/* Database Status Ribbon */}
        <div className="mt-6 pt-6 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
            <Radio className={cn("w-5 h-5", isSupabaseConfigured() ? "text-emerald-400" : "text-amber-400")} />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Database Mode</p>
              <p className="text-xs font-black text-white">
                {isSupabaseConfigured() ? "Supabase (PostgreSQL)" : "Configuration Pending"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
            <HardDrive className="w-5 h-5 text-indigo-400" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Existing System Records</p>
              <p className="text-xs font-black text-white">
                {isFetchingDataCount ? "Counting..." : `${totalRecordsCount} Records Identified`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Table Architecture</p>
              <p className="text-xs font-black text-white">18 Tables + Triggers + RLS</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabbed Container */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab("migration")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "migration" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              1-Click Data Migration
            </button>
            <button
              onClick={() => setActiveTab("overview")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "overview" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <TableProperties className="w-3.5 h-3.5" />
              Tables & Schema ({TABLES_METADATA.length})
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "guide" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Supabase 3-Step Guide
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "code" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <Terminal className="w-3.5 h-3.5" />
              SQL Script Code
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400 font-bold hidden sm:block">
            Target: supabase.sql
          </div>
        </div>

        {/* Tab 1: Migration & Connection Hub */}
        {activeTab === "migration" && (
          <div className="p-6 md:p-8 space-y-8">
            {/* Supabase Connection Setup Box */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-sm font-black text-slate-900">
                    Supabase Project Credentials (প্রজেক্ট সংযোগ)
                  </h4>
                </div>
                <a 
                  href="https://supabase.com/dashboard" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  Open Supabase Dashboard <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                আপনার Supabase প্রজেক্টের <strong>Project Settings → API</strong> থেকে Project URL ও anon public key এখানে প্রদান করুন।
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://xyzprojectid.supabase.co"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Anon Public API Key
                  </label>
                  <input
                    type="password"
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {connectionResult && (
                <div className={cn(
                  "p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5",
                  connectionResult.success 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                    : "bg-rose-50 border-rose-200 text-rose-800"
                )}>
                  {connectionResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{connectionResult.message}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
                >
                  Save Credentials
                </button>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !url.trim() || !anonKey.trim()}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  {testingConnection ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-600" />}
                  Test Connection Live
                </button>
              </div>
            </div>

            {/* Live Data Summary & 1-Click Migration Card */}
            <div className="bg-gradient-to-br from-emerald-500/5 via-slate-50 to-indigo-500/5 rounded-3xl border border-emerald-200/60 p-6 md:p-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-emerald-600" />
                    সব ডেটা Supabase-এ সেভ / ট্রান্সফার করুন (1-Click Full Migration)
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    বর্তমান সিস্টেমে বিদ্যমান সকল বিক্রয়, ক্রেতা খাতা, ট্রানজেকশন, প্রোডাক্ট, ব্যাংক ও কর্মচারী ডেটা সরাসরি Supabase PostgreSQL-এ আপলোড ও সেভ হবে।
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadFullDataSql}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Data .sql
                  </button>
                  <button
                    onClick={handleRunMigration}
                    disabled={isMigrating}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {isMigrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    {isMigrating ? "Migrating Data..." : "Start Migration Now"}
                  </button>
                </div>
              </div>

              {/* Progress Bar if migrating */}
              {isMigrating && (
                <div className="bg-white p-5 rounded-2xl border border-emerald-200 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-2 text-emerald-700">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      {migrationStatusText}
                    </span>
                    <span>{migrationProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${migrationProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Migration Success Summary */}
              {migrationSummary && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    মাইগ্রেশন সফলভাবে সম্পন্ন হয়েছে! সকল ডেটা Supabase এ সংরক্ষিত হয়েছে।
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1">
                    {Object.entries(migrationSummary).map(([table, count]) => (
                      <div key={table} className="bg-white/80 p-2.5 rounded-xl border border-emerald-100 text-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{table}</span>
                        <p className="text-base font-black text-emerald-900">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Migration Error */}
              {migrationError && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-xs text-rose-800 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Migration Notice:</p>
                    <p>{migrationError}</p>
                    <p className="text-slate-600 pt-1">
                      টিপস: প্রথমে Supabase SQL Editor-এ <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-slate-800">supabase.sql</code> চালিয়ে টেবিলগুলো তৈরি করে নিন, তারপর মাইগ্রেশন চালান।
                    </p>
                  </div>
                </div>
              )}

              {/* Identified Data Inventory Grid */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  বর্তমান সিস্টেমে সনাক্তকৃত ডেটা তালিকা ({totalRecordsCount} মোট রেকর্ড):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Counter Sales</span>
                    <p className="text-base font-black text-slate-900">{dataStats.counterSales ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Customers</span>
                    <p className="text-base font-black text-slate-900">{dataStats.customers ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Customer Due Pays</span>
                    <p className="text-base font-black text-slate-900">{dataStats.customerPayments ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Transactions</span>
                    <p className="text-base font-black text-slate-900">{dataStats.transactions ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Banks & Accounts</span>
                    <p className="text-base font-black text-slate-900">{dataStats.banks ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Products</span>
                    <p className="text-base font-black text-slate-900">{dataStats.products ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Suppliers</span>
                    <p className="text-base font-black text-slate-900">{dataStats.suppliers ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Employees</span>
                    <p className="text-base font-black text-slate-900">{dataStats.employees ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Categories</span>
                    <p className="text-base font-black text-slate-900">{dataStats.categories ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Notifications</span>
                    <p className="text-base font-black text-slate-900">{dataStats.activityNotifications ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Roles</span>
                    <p className="text-base font-black text-slate-900">{dataStats.roles ?? 0}</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Departments</span>
                    <p className="text-base font-black text-slate-900">{dataStats.departments ?? 0}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tables & Schema Overview */}
        {activeTab === "overview" && (
          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TABLES_METADATA.map((tbl) => (
                <div 
                  key={tbl.name}
                  className="p-4 rounded-2xl border border-slate-100 hover:border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {tbl.name}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                        RLS Enabled
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed pt-1">
                      {tbl.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Step-by-Step Setup Guide */}
        {activeTab === "guide" && (
          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">
                  1
                </div>
                <h4 className="text-sm font-black text-slate-900">Create Supabase Project</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Log in to your account at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-600 font-bold underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3 inline" /></a> and create a new project. Choose a strong database password and select your closest cloud region.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">
                  2
                </div>
                <h4 className="text-sm font-black text-slate-900">Run SQL in SQL Editor</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  In your Supabase project dashboard, open the <strong>SQL Editor</strong> from the left sidebar, click <strong>New Query</strong>, paste the full SQL script from this hub, and click <strong>RUN</strong>.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">
                  3
                </div>
                <h4 className="text-sm font-black text-slate-900">Automated Setup Complete</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  The script will automatically create all 18 tables, seed default Admin/Sales roles, setup cash & bank accounts, configure RLS security policies, and register real-time customer due sync triggers.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/60 flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                  Supabase Auth & Profiles Sync
                </h5>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  The script includes an automated PostgreSQL trigger (<code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">on_auth_user_created</code>) that hooks directly into Supabase's <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">auth.users</code> table. When any new user signs up via email or OAuth, their profile is automatically inserted into <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">public.profiles</code> with active status.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: SQL Code Viewer */}
        {activeTab === "code" && (
          <div className="p-6 md:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500 font-bold">
                <Terminal className="w-4 h-4 text-slate-400" />
                supabase.sql (PostgreSQL 15+)
              </div>
              <button
                onClick={handleCopy}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>

            <div className="relative rounded-2xl bg-slate-950 p-6 overflow-hidden border border-slate-800">
              <pre className="text-xs font-mono text-emerald-400/90 overflow-x-auto max-h-[500px] leading-relaxed whitespace-pre scrollbar-thin scrollbar-thumb-slate-800">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
