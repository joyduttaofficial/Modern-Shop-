import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, doc, increment, query, where } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, updateDoc } from "@/src/lib/firebase";
import { Employee, Bank, UserRole } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Table, Save, Calendar, Landmark, Wallet, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { format } from "date-fns";
import { motion } from "motion/react";

interface RowState {
  salary: string;
  advance: string;
  notes: string;
}

export default function SalaryEntry({ user, role }: { user: User; role: UserRole }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sheet State
  const [sheetData, setSheetData] = useState<Record<string, RowState>>({});
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const unsubEmps = onSnapshot(query(collection(db, "employees"), where("status", "==", "active")), (snap) => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      emps.sort((a, b) => {
        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(emps);
      
      // Initialize sheet data if not already set
      setSheetData(prev => {
        const next = { ...prev };
        emps.forEach(emp => {
          if (!next[emp.id!]) {
            next[emp.id!] = { salary: "", advance: "", notes: "" };
          }
        });
        return next;
      });
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    const unsubBanks = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    return () => { unsubEmps(); unsubBanks(); };
  }, []);

  const handleInputChange = (empId: string, field: keyof RowState, value: string) => {
    setSheetData(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value }
    }));
  };

  const handleSubmit = async () => {
    const entries = (Object.entries(sheetData) as [string, RowState][]).filter(([_, data]) => data.salary || data.advance);
    if (entries.length === 0) return alert("Please input at least one salary or advance.");
    
    setIsSubmitting(true);
    try {
      let totalExpense = 0;

      for (const [empId, data] of entries) {
        const emp = employees.find(e => e.id === empId);
        
        // Record Salary if present
        if (data.salary) {
          const amount = parseFloat(data.salary);
          totalExpense += amount;
          await addDoc(collection(db, "transactions"), {
            date: new Date(date).toISOString(),
            type: "expense",
            category: "Staff Salary",
            subCategory: emp?.name || "",
            amount: amount,
            paymentMethod,
            notes: data.notes,
            createdBy: user.uid,
            employeeId: empId
          });
        }

        // Record Advance if present
        if (data.advance) {
          const amount = parseFloat(data.advance);
          totalExpense += amount;
          await addDoc(collection(db, "transactions"), {
            date: new Date(date).toISOString(),
            type: "expense",
            category: "Employee Advance",
            subCategory: emp?.name || "",
            amount: amount,
            paymentMethod,
            notes: data.notes,
            createdBy: user.uid,
            employeeId: empId
          });
        }
      }

      // Update bank balance if not cash
      if (paymentMethod !== "Cash") {
        const bank = banks.find(b => b.name === paymentMethod);
        if (bank?.id) {
          await updateDoc(doc(db, "banks", bank.id), {
            balance: increment(-totalExpense),
            lastUpdated: new Date().toISOString()
          });
        }
      }

      setSuccess(true);
      // Reset sheet
      const resetData: Record<string, RowState> = {};
      employees.forEach(emp => {
        resetData[emp.id!] = { salary: "", advance: "", notes: "" };
      });
      setSheetData(resetData);
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "transactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-gray-400 font-medium">Loading Salary Entry Sheet...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight mb-2">Salary Entry</h2>
          <p className="text-gray-500 font-medium italic">Record salaries and advances for the whole team in one go.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-[24px] shadow-sm border border-gray-100">
          <div className="relative group">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-[#D12765] transition-colors" />
            <input 
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="pl-11 pr-4 py-3 bg-transparent border-none focus:ring-0 font-bold text-gray-900 cursor-pointer outline-none"
            />
          </div>
          <div className="h-8 w-[1px] bg-gray-100 hidden md:block" />
          <div className="relative group">
            {paymentMethod === "Cash" ? <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" /> : <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />}
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="pl-11 pr-8 py-3 bg-transparent border-none focus:ring-0 font-bold text-gray-900 appearance-none cursor-pointer outline-none"
            >
              <option value="Cash">Cash Account</option>
              {banks.map(b => (
                <option key={b.id} value={b.name}>{b.name} (৳{b.balance.toLocaleString()})</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Employee Details</th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Monthly Salary</th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Paid Salary</th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Advance Given</th>
                <th className="px-8 py-6 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Notes / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-gray-500 shrink-0 group-hover:bg-[#D12765] group-hover:text-white transition-all">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 leading-none mb-1">{emp.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{emp.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="font-mono font-bold text-gray-500">
                      {role === "admin" ? formatCurrency(emp.salary) : "***"}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 font-bold">৳</span>
                      <input 
                        type="number"
                        placeholder="0"
                        value={sheetData[emp.id!]?.salary || ""}
                        onChange={e => handleInputChange(emp.id!, "salary", e.target.value)}
                        className="w-full pl-7 pr-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-green-100 font-bold placeholder:text-gray-300"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500 font-bold">৳</span>
                      <input 
                        type="number"
                        placeholder="0"
                        value={sheetData[emp.id!]?.advance || ""}
                        onChange={e => handleInputChange(emp.id!, "advance", e.target.value)}
                        className="w-full pl-7 pr-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-orange-100 font-bold placeholder:text-gray-300"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <input 
                      placeholder="Optional notes..."
                      value={sheetData[emp.id!]?.notes || ""}
                      onChange={e => handleInputChange(emp.id!, "notes", e.target.value)}
                      className="w-full px-4 py-3 bg-transparent border-none focus:ring-0 focus:bg-gray-50 rounded-xl font-medium text-sm transition-all"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-6 pt-4">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <AlertCircle className="w-4 h-4" />
          <p>This will create separate transaction entries for each input value.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {success && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-green-600 font-bold"
            >
              <CheckCircle2 className="w-5 h-5" />
              Payroll Processed Successfully
            </motion.div>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || employees.length === 0}
            className={cn(
              "px-10 py-5 rounded-[24px] font-black text-lg transition-all flex items-center gap-3 active:scale-95 shadow-xl disabled:opacity-50 cursor-pointer",
              success ? "bg-green-600 text-white" : "bg-[#D12765] hover:bg-[#B41A50] text-white"
            )}
          >
            {isSubmitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <Save className="w-6 h-6" />
            )}
            {isSubmitting ? "Processing Sheet..." : "Record All Payments"}
          </button>
        </div>
      </footer>
    </div>
  );
}
