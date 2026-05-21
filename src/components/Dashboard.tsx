import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Transaction, Bank, UserRole } from "@/src/types";
import { formatCurrency, cn } from "@/src/lib/utils";
import { TrendingUp, TrendingDown, Wallet, Landmark, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

export default function Dashboard({ user, role }: { user: User; role: UserRole }) {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    monthIncome: 0,
    monthExpense: 0,
    totalCash: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "transactions"),
      orderBy("date", "desc"),
      limit(6)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setRecentTransactions(txs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "banks"), (snapshot) => {
      const bks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bank));
      setBanks(bks);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchStats() {
      const today = startOfDay(new Date());
      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      // Simple fetch for summary - in production use aggregation or cloud functions
      const allSnapshot = await getDocs(collection(db, "transactions"));
      const all = allSnapshot.docs.map(doc => doc.data() as Transaction);

      let todaySales = 0;
      let monthIncome = 0;
      let monthExpense = 0;
      let totalCash = 0;

      all.forEach(tx => {
        const txDate = new Date(tx.date);
        if (txDate >= today) {
          if (tx.type === "income") todaySales += tx.amount;
        }
        if (txDate >= firstOfMonth) {
          if (tx.type === "income") monthIncome += tx.amount;
          else monthExpense += tx.amount;
        }
        if (tx.paymentMethod === "Cash") {
          totalCash += (tx.type === "income" ? tx.amount : -tx.amount);
        }
      });

      setStats({ todaySales, monthIncome, monthExpense, totalCash });

      // Generate chart data for last 7 days
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        const dayLabel = format(date, "MMM dd");
        const dayIncome = all
          .filter(tx => format(new Date(tx.date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd") && tx.type === "income")
          .reduce((sum, tx) => sum + tx.amount, 0);
        const dayExpense = all
          .filter(tx => format(new Date(tx.date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd") && tx.type === "expense")
          .reduce((sum, tx) => sum + tx.amount, 0);
        return { name: dayLabel, income: dayIncome, expense: dayExpense };
      });
      setChartData(days);
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <header className="flex flex-col gap-1.5 border-b border-slate-100 pb-5">
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Dashboard Overview</h2>
        <p className="text-sm font-medium text-slate-500">
          Welcome back, <strong className="text-slate-800">{user.displayName?.split(" ")[0]}</strong>. Here's your shop's performance.
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Today's Sales" 
          value={stats.todaySales} 
          icon={TrendingUp} 
          color="emerald" 
          description="Summed counter sales today"
        />
        <StatCard 
          title="Month Income" 
          value={stats.monthIncome} 
          icon={ArrowUpRight} 
          color="indigo" 
          description="Total inflow this month"
        />
        <StatCard 
          title="Month Expense" 
          value={stats.monthExpense} 
          icon={ArrowDownRight} 
          color="rose" 
          description="Expenditures & purchase book"
        />
        <StatCard 
          title="Total On-Hand Cash" 
          value={stats.totalCash} 
          icon={Wallet} 
          color="amber" 
          description="Active cash balance counter"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Cash Inflow vs Outflow (Trend)
            </h3>
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-slate-600">Inflow</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span className="text-slate-600">Outflow</span>
              </div>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8", fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8", fontWeight: 600 }} tickFormatter={(v) => `৳${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0F172A", border: "none", borderRadius: "16px", color: "#fff", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Area type="monotone" dataKey="income" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="expense" stroke="#FDA4AF" strokeWidth={3} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bank Balances */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30 overflow-hidden flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-indigo-500" />
              Bank Accounts
            </h3>
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {banks.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs font-semibold text-slate-400">No bank accounts registered.</p>
                </div>
              )}
              {banks.map((bank) => (
                <div key={bank.id} className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl group transition-all border border-slate-100/60 hover:border-slate-200">
                  <div>
                    <p className="font-bold text-slate-800 text-sm group-hover:text-slate-950 transition-colors">{bank.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sync {format(new Date(bank.lastUpdated), "MMM dd")}</p>
                  </div>
                  <p className="text-base font-mono font-black text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-250/50 shadow-sm">{formatCurrency(bank.balance)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-md shadow-slate-100/30 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Recent Logbook Transactions
          </h3>
          <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/50 uppercase tracking-widest">
            Latest 6 entries
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Account/Category</th>
                <th className="px-6 py-4">Gateway</th>
                <th className="px-6 py-4 text-right">Magnitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors cursor-default group">
                  <td className="px-6 py-4 text-xs font-semibold text-slate-400 whitespace-nowrap">
                    {format(new Date(tx.date), "MMM dd, yyyy HH:mm")}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{tx.category}</span>
                      {tx.notes && <span className="text-xs text-slate-400 font-medium line-clamp-1">{tx.notes}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-[10px] px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-black uppercase tracking-wider border border-slate-200/20">
                      {tx.paymentMethod}
                    </span>
                  </td>
                  <td className={cn(
                    "px-6 py-4 text-sm font-black text-right whitespace-nowrap font-mono",
                    tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                  )}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{tx.type === "income" ? "+" : "-"}</span>
                      <span>{formatCurrency(tx.amount)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, description }: any) {
  const colorMap: any = {
    emerald: {
      bg: "bg-emerald-50 text-emerald-600 border-emerald-100/50",
      glow: "group-hover:shadow-emerald-100"
    },
    indigo: {
      bg: "bg-indigo-50 text-indigo-600 border-indigo-100/50",
      glow: "group-hover:shadow-indigo-100"
    },
    rose: {
      bg: "bg-rose-50 text-rose-600 border-rose-100/50",
      glow: "group-hover:shadow-rose-100"
    },
    amber: {
      bg: "bg-amber-50 text-amber-600 border-amber-100/50",
      glow: "group-hover:shadow-amber-100"
    },
  };

  const style = colorMap[color] || colorMap.indigo;

  return (
    <div className={cn(
      "bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-all duration-300 group hover:-translate-y-0.5",
      style.glow
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-3.5 rounded-2xl border transition-transform duration-300 group-hover:scale-105", style.bg)}>
          <Icon className="w-5.5 h-5.5" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-350 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
          Global
        </span>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">{formatCurrency(value)}</p>
      </div>
      <p className="text-[10px] font-semibold text-slate-400 mt-2.5 flex items-center gap-1.5 border-t border-slate-50 pt-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse" />
        {description}
      </p>
    </div>
  );
}
