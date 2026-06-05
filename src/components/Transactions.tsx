import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, addDoc, query, orderBy, onSnapshot, limit, deleteDoc, doc, increment, where } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, updateDoc } from "@/src/lib/firebase";
import { Transaction, TransactionType, Category, Bank, UserRole, Employee, Supplier } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Plus, Search, Filter, Trash2, ArrowUpCircle, ArrowDownCircle, Wallet, Landmark, UserCheck, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { motion } from "motion/react";
import { format } from "date-fns";

export default function Transactions({ user, role }: { user: User; role: UserRole }) {
  const [activeTab, setActiveTab ] = useState<TransactionType>("income");
  const [currentAction, setCurrentAction] = useState<
    "income" | "prev_cash" | "expense" | "bank_deposit" | "bank_credit" | "loan_deposit" | "loan_credit"
  >("income");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  const canManage = role === "admin" || role === "accountant";
  const canDelete = true;

  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // Form State
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [category, setCategory] = useState("Income");
  const [subCategory, setSubCategory] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  // Multiple Supplier Payments State
  const [supplierPayments, setSupplierPayments] = useState<{[supplierId: string]: string}>({});
  const [supplierSearch, setSupplierSearch] = useState("");

  useEffect(() => {
    const q = query(collection(db, "transactions"), orderBy("date", "desc"), limit(50));
    const unsubTxs = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    const unsubCats = onSnapshot(collection(db, "categories"), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "categories"));

    const unsubBanks = onSnapshot(collection(db, "banks"), (snapshot) => {
      setBanks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    const unsubEmps = onSnapshot(query(collection(db, "employees"), where("status", "==", "active")), (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    const unsubSuppliers = onSnapshot(collection(db, "suppliers"), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "suppliers"));

    return () => {
      unsubTxs();
      unsubCats();
      unsubBanks();
      unsubEmps();
      unsubSuppliers();
    };
  }, []);

  // Sync subcategory with employee name
  useEffect(() => {
    if (employeeId) {
      const emp = employees.find(e => e.id === employeeId);
      if (emp) setSubCategory(emp.name);
    }
  }, [employeeId, employees]);

  // Sync amount with sum of supplierPayments
  useEffect(() => {
    if (category === "Supplier Due Payment") {
      const total = Object.keys(supplierPayments)
        .map(id => parseFloat(supplierPayments[id] || "0"))
        .filter(val => !isNaN(val) && val > 0)
        .reduce((sum, val) => sum + val, 0);
      setAmount(total > 0 ? total.toString() : "");
    }
  }, [supplierPayments, category]);

  // Handle action selection change
  const handleActionChange = (action: typeof currentAction) => {
    setCurrentAction(action);
    setCategory("");
    setSubCategory("");
    setEmployeeId("");
    setSupplierId("");
    
    if (action === "income") {
      setActiveTab("income");
      setCategory("Income");
      setPaymentMethod("Cash");
    } else if (action === "prev_cash") {
      setActiveTab("income");
      setCategory("Previous Cash");
      setPaymentMethod("Cash");
    } else if (action === "expense") {
      setActiveTab("expense");
      setPaymentMethod("Cash");
    } else if (action === "bank_deposit") {
      setActiveTab("income");
      setCategory("Bank Deposit");
      const firstBankName = banks[0]?.name || "Bank";
      setPaymentMethod(firstBankName);
    } else if (action === "bank_credit") {
      setActiveTab("expense");
      setCategory("Bank Credit");
      const firstBankName = banks[0]?.name || "Bank";
      setPaymentMethod(firstBankName);
    } else if (action === "loan_deposit") {
      setActiveTab("income");
      setCategory("Loan Deposit");
      setPaymentMethod("Cash");
    } else if (action === "loan_credit") {
      setActiveTab("expense");
      setCategory("Loan Credit");
      setPaymentMethod("Cash");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;
    if ((category === "Staff Salary" || category === "Employee Advance" || category === "Employee") && !employeeId) {
      alert("Please select an employee");
      return;
    }

    if (category === "Supplier Due Payment") {
      const activePayments = Object.keys(supplierPayments)
        .map(id => ({ id, numAmount: parseFloat(supplierPayments[id] || "0") }))
        .filter(p => !isNaN(p.numAmount) && p.numAmount > 0);

      if (activePayments.length === 0) {
        alert("Please enter a payment amount for at least one supplier.");
        return;
      }

      setLoading(true);
      try {
        for (const payment of activePayments) {
          const sup = suppliers.find(s => s.id === payment.id);
          const supName = sup ? sup.name : "Unknown Supplier";

          const newTx: Transaction = {
            date: new Date(date).toISOString(),
            type: activeTab,
            category,
            amount: payment.numAmount,
            paymentMethod,
            notes: notes.trim() ? `${notes.trim()} (Paid to ${supName})` : `Supplier Due Payment to ${supName}`,
            createdBy: user.uid,
            subCategory: supName,
            supplierId: payment.id
          };

          // 1. Record single Transaction
          await addDoc(collection(db, "transactions"), newTx);

          // 2. Decrement Supplier Due balance
          await updateDoc(doc(db, "suppliers", payment.id), {
            purchaseDue: increment(-payment.numAmount)
          });

          // 3. Add to unique supplierTransactions history
          const sTx = {
            supplierId: payment.id,
            date: format(new Date(date), "yyyy-MM-dd"),
            type: "payment",
            refNo: `TX-DUE-${Math.floor(100000 + Math.random() * 900000)}`,
            totalAmount: payment.numAmount,
            paymentMethod,
            notes: notes.trim() || "Supplier Due Payment recorded via Transactions Sheet",
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, "supplierTransactions"), sTx);

          // 4. Update Bank Balance if not cash
          if (paymentMethod !== "Cash") {
            const bank = banks.find(b => b.name === paymentMethod);
            if (bank?.id) {
              await updateDoc(doc(db, "banks", bank.id), {
                balance: increment(-payment.numAmount),
                lastUpdated: new Date().toISOString()
              });
            }
          }
        }

        // Reset inputs
        setAmount("");
        setSupplierPayments({});
        setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setNotes("");
        setSubCategory("");
        setEmployeeId("");
        setSupplierId("");
        
        if (currentAction === "expense") {
          setCategory("");
        } else if (currentAction === "income") {
          setCategory("Income");
        } else if (currentAction === "prev_cash") {
          setCategory("Previous Cash");
        } else if (currentAction === "bank_deposit") {
          setCategory("Bank Deposit");
        } else if (currentAction === "bank_credit") {
          setCategory("Bank Credit");
        } else if (currentAction === "loan_deposit") {
          setCategory("Loan Deposit");
        } else if (currentAction === "loan_credit") {
          setCategory("Loan Credit");
        }

        alert(`Successfully recorded ${activePayments.length} supplier payments.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "transactions");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const numAmount = parseFloat(amount);
      const newTx: Transaction = {
        date: new Date(date).toISOString(),
        type: activeTab,
        category,
        amount: numAmount,
        paymentMethod,
        notes,
        createdBy: user.uid,
        ...(subCategory.trim() ? { subCategory: subCategory.trim() } : {}),
        ...(employeeId ? { employeeId } : {}),
        ...(supplierId ? { supplierId } : {})
      };

      await addDoc(collection(db, "transactions"), newTx);

      // Decrement Supplier Due balance & add a log in supplier transactions list
      if (category === "Supplier Due Payment" && supplierId) {
        await updateDoc(doc(db, "suppliers", supplierId), {
          purchaseDue: increment(-numAmount)
        });

        // Add a supplierPayment history log
        const sTx = {
          supplierId,
          date: format(new Date(date), "yyyy-MM-dd"),
          type: "payment",
          refNo: `TX-DUE-${Math.floor(100000 + Math.random() * 900000)}`,
          totalAmount: numAmount,
          paymentMethod,
          notes: notes.trim() || "Supplier Due Payment recorded via Transactions Sheet",
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, "supplierTransactions"), sTx);
      }

      // Update Bank Balance if not cash
      if (paymentMethod !== "Cash") {
        const bank = banks.find(b => b.name === paymentMethod);
        if (bank?.id) {
          await updateDoc(doc(db, "banks", bank.id), {
            balance: increment(activeTab === "income" ? numAmount : -numAmount),
            lastUpdated: new Date().toISOString()
          });
        }
      }

      setAmount("");
      setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setNotes("");
      setSubCategory("");
      setEmployeeId("");
      setSupplierId("");
      
      // Reset or align category with current selected action
      if (currentAction === "expense") {
        setCategory("");
      } else if (currentAction === "income") {
        setCategory("Income");
      } else if (currentAction === "prev_cash") {
        setCategory("Previous Cash");
      } else if (currentAction === "bank_deposit") {
        setCategory("Bank Deposit");
      } else if (currentAction === "bank_credit") {
        setCategory("Bank Credit");
      } else if (currentAction === "loan_deposit") {
        setCategory("Loan Deposit");
      } else if (currentAction === "loan_credit") {
        setCategory("Loan Credit");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "transactions");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tx: Transaction) => {
    try {
      if (tx.id) {
        await deleteDoc(doc(db, "transactions", tx.id));

        // If it was a supplier payment, revert the balance reduction
        if (tx.category === "Supplier Due Payment" && tx.supplierId) {
          await updateDoc(doc(db, "suppliers", tx.supplierId), {
            purchaseDue: increment(tx.amount)
          });
        }

        // Reverse bank balance
        if (tx.paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === tx.paymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(tx.type === "income" ? -tx.amount : tx.amount),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "transactions");
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (tx.notes && tx.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (tx.subCategory && tx.subCategory.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterType === "all") return matchesSearch;
    return matchesSearch && tx.type === filterType;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 divide-x-0 lg:divide-x lg:divide-slate-200/60 animate-in fade-in duration-200">
      {/* Transaction Form Side */}
      <div className="lg:col-span-5 space-y-6">
        <header className="border-b border-slate-100 pb-3">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Financial Input</h2>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">Record sales, cash flow & operations</p>
        </header>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/55 shadow-md shadow-slate-100/40">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 p-1.5 bg-slate-150/85 rounded-2xl mb-5">
            <button
              type="button"
              onClick={() => handleActionChange("income")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              Income
            </button>
            <button
              type="button"
              onClick={() => handleActionChange("prev_cash")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "prev_cash" ? "bg-white text-indigo-650 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <Wallet className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              Open Cash
            </button>
            <button
              type="button"
              onClick={() => handleActionChange("expense")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "expense" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <ArrowDownCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              Expense
            </button>
            <button
              type="button"
              onClick={() => handleActionChange("bank_deposit")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "bank_deposit" ? "bg-white text-emerald-650 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <Landmark className="w-3.5 h-3.5 text-emerald-550 shrink-0" />
              Deposit
            </button>
            <button
              type="button"
              onClick={() => handleActionChange("bank_credit")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "bank_credit" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-violet-505 shrink-0" />
              Withdrawal
            </button>
            <button
              type="button"
              onClick={() => handleActionChange("loan_deposit")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "loan_deposit" ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <Plus className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Loan In
            </button>
            <button
              type="button"
              onClick={() => handleActionChange("loan_credit")}
              className={cn(
                "col-span-2 lg:col-span-3 flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer",
                currentAction === "loan_credit" ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-950"
              )}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              Loan Credit Offer
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Timestamp</label>
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 focus:ring-0 font-semibold text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                {category === "Supplier Due Payment" ? "Total Calculated Amount" : "Amount"}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-lg">৳</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  readOnly={category === "Supplier Due Payment"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 focus:ring-0 text-xl font-mono font-black outline-none transition-all",
                    category === "Supplier Due Payment" && "bg-amber-50/70 border-amber-200 text-amber-900 cursor-not-allowed font-extrabold"
                  )}
                />
              </div>
              {category === "Supplier Due Payment" && (
                <p className="text-[10px] font-bold text-amber-700 mt-1 pl-1">
                  💡 Autocompleted instantly from the supplier list below.
                </p>
              )}
            </div>

            {currentAction === "expense" ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Category</label>
                  <select
                    required
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSubCategory("");
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 font-semibold text-sm outline-none transition-all"
                  >
                    <option value="">Select Category</option>
                    <option value="Supplier Due Payment">Supplier Due Payment</option>
                    {categories
                      .filter(c => {
                        if (c.type !== "expense") return false;
                        if (c.name === "Supplier Due Payment") return false;
                        if (c.name === "Previous Cash") return false;
                        if (c.name === "Bank Deposit") return false;
                        if (c.name === "Bank Credit") return false;
                        if (c.name === "Loan Deposit") return false;
                        if (c.name === "Loan Credit") return false;
                        return true;
                      })
                      .map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))
                    }
                  </select>
                </div>

                {category === "Supplier Due Payment" && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                        Select Suppliers & Record Payment Amounts
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Clear all recorded supplier payments?")) {
                            setSupplierPayments({});
                          }
                        }}
                        className="text-[10px] font-extrabold text-red-500 hover:text-red-700 uppercase tracking-wider transition-colors"
                      >
                        Clear All
                      </button>
                    </div>

                    {/* Search Field */}
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search supplier by name or code..."
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:border-slate-800 transition-all outline-none"
                      />
                    </div>

                    {/* Supplier Grid list */}
                    <div className="border border-slate-200/60 rounded-2xl max-h-[280px] overflow-y-auto divide-y divide-slate-100 bg-white p-1">
                      {suppliers.filter(sup => 
                        sup.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                        (sup.code && sup.code.toLowerCase().includes(supplierSearch.toLowerCase()))
                      ).length === 0 ? (
                        <div className="p-4 text-center text-xs font-semibold text-slate-400">
                          No matching suppliers found.
                        </div>
                      ) : (
                        suppliers.filter(sup => 
                          sup.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                          (sup.code && sup.code.toLowerCase().includes(supplierSearch.toLowerCase()))
                        ).map(sup => {
                          const val = supplierPayments[sup.id!] || "";
                          const purchaseDue = sup.purchaseDue || 0;
                          return (
                            <div key={sup.id} className="flex items-center justify-between p-2.5 hover:bg-slate-50/80 transition-all gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-800 truncate">{sup.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {sup.code && (
                                    <span className="text-[9px] font-black tracking-wider text-slate-400 bg-slate-100 px-1 rounded-sm">
                                      {sup.code}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-semibold text-orange-600 font-mono">
                                    Due: ৳{purchaseDue.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSupplierPayments(prev => ({
                                      ...prev,
                                      [sup.id!]: purchaseDue > 0 ? purchaseDue.toFixed(2) : ""
                                    }));
                                  }}
                                  className="px-2 py-1 text-[9px] font-black text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-all uppercase shrink-0"
                                >
                                  Full
                                </button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">৳</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={val}
                                    onChange={(e) => {
                                      const inputVal = e.target.value;
                                      setSupplierPayments(prev => ({
                                        ...prev,
                                        [sup.id!]: inputVal
                                      }));
                                    }}
                                    className="w-24 pl-5 pr-2 py-1 bg-slate-50 border border-slate-250 rounded-lg text-xs font-mono font-bold focus:border-slate-800 text-right outline-none transition-all"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {(category === "Staff Salary" || category === "Employee Advance" || category === "Employee") && (
                  <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Select Employee</label>
                    <select
                      required
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 font-semibold text-sm outline-none transition-all"
                    >
                      <option value="">Choose registered personnel...</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sub-category (Optional)</label>
                  <input
                    list="subcategory-options"
                    placeholder="e.g. Utility name, travel purpose..."
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 font-semibold text-sm outline-none transition-all"
                  />
                  <datalist id="subcategory-options">
                    {Array.from(new Set(transactions.filter(t => t.category === category && t.subCategory).map(t => t.subCategory))).map(sub => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>
              </>
            ) : currentAction === "income" ? (
              <>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-500 animate-in slide-in-from-top-1">
                  <span>Category:</span>
                  <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-800 font-black uppercase text-[10px] tracking-wide">
                    {category}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sub-category (Optional)</label>
                  <input
                    list="subcategory-options-income"
                    placeholder="e.g. Retail, wholesale, specific customer, etc."
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 font-semibold text-sm outline-none transition-all"
                  />
                  <datalist id="subcategory-options-income">
                    <option value="Retail Sales" />
                    <option value="Wholesale Sales" />
                    {Array.from(new Set(transactions.filter(t => t.category === "Income" && t.subCategory).map(t => t.subCategory))).map(sub => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>
              </>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-500 animate-in slide-in-from-top-1">
                <span>Operation:</span>
                <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-800 font-black uppercase text-[10px] tracking-wide">
                  {category}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Payment Method / Gateway</label>
              {(currentAction === "bank_deposit" || currentAction === "bank_credit") ? (
                <div className="animate-in slide-in-from-top-1">
                  <select
                    required
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 font-bold text-slate-800 text-sm outline-none"
                  >
                    <option value="">Select Account...</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.name}>
                        {b.name} (Balance: ৳{b.balance.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={currentAction === "prev_cash"}
                      onClick={() => setPaymentMethod("Cash")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all disabled:opacity-40 cursor-pointer text-xs font-bold",
                        paymentMethod === "Cash" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      <Wallet className="w-4 h-4" />
                      Cash hand
                    </button>
                    <button
                      type="button"
                      disabled={currentAction === "prev_cash"}
                      onClick={() => setPaymentMethod(banks[0]?.name || "Bank")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all disabled:opacity-40 cursor-pointer text-xs font-bold",
                        paymentMethod !== "Cash" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      <Landmark className="w-4 h-4" />
                      Bank Account
                    </button>
                  </div>
                  {paymentMethod !== "Cash" && banks.length > 0 && (
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full mt-2 px-4 py-2 bg-slate-150 border border-slate-200 rounded-xl text-xs font-semibold"
                    >
                      {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Notes (Optional)</label>
              <textarea
                placeholder="Memo reference, comments, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl focus:border-slate-800 text-sm font-medium min-h-[85px] outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer text-white mt-1",
                currentAction === "prev_cash" ? "bg-indigo-650 hover:bg-indigo-700" :
                currentAction === "bank_deposit" ? "bg-emerald-600 hover:bg-emerald-700" :
                currentAction === "bank_credit" ? "bg-violet-605 hover:bg-violet-700" :
                activeTab === "income" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              )}
            >
              {loading ? "Recording entry..." : 
               currentAction === "prev_cash" ? "Save Opening Balance" :
               currentAction === "bank_deposit" ? "Record Bank Deposit" :
               currentAction === "bank_credit" ? "Record Bank Credit" :
               `Record ${activeTab === "income" ? "Inflow" : "Outflow"}`}
            </button>
          </form>
        </div>
      </div>

      {/* History Side */}
      <div className="lg:col-span-7 lg:pl-8 space-y-5 animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Recent Ledger</h3>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Audit log of system transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Filter description..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold w-40 focus:w-56 focus:border-slate-800 transition-all outline-none"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-650 cursor-pointer select-none outline-none"
            >
              <option value="all">All Flow</option>
              <option value="income">Inflow</option>
              <option value="expense">Outflow</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-track]:transparent scrollbar-thin">
          {filteredTransactions.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Clean Slate</p>
              <p className="text-xs font-semibold text-slate-455">No ledger records match search parameter.</p>
            </div>
          )}
          {filteredTransactions.map((tx) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              key={tx.id}
              className="bg-white p-4 rounded-2xl border border-slate-200/60 hover:border-slate-300 transition-all flex items-center gap-3.5 group relative shadow-sm"
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                tx.type === "income" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
              )}>
                {tx.type === "income" ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <h4 className="font-extrabold text-sm text-slate-800 truncate">{tx.category}</h4>
                    {tx.employeeId && (
                      <span className="text-[9px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md font-bold uppercase shrink-0 border border-sky-100">
                        {employees.find(e => e.id === tx.employeeId)?.name || "Employee"}
                      </span>
                    )}
                    {tx.subCategory && (
                      <span className="text-[9px] bg-slate-50 text-slate-650 px-2 py-0.5 rounded-md font-bold uppercase shrink-0 border border-slate-200">
                        {tx.subCategory}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-sm font-mono font-black shrink-0",
                    tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {tx.type === "income" ? "+" : "-"} {formatCurrency(tx.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold">
                    <span className="bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded-md text-slate-505 font-medium">{tx.paymentMethod}</span>
                    <span>•</span>
                    <span>{format(new Date(tx.date), "MMM dd, hh:mm a")}</span>
                  </div>
                  {canDelete && (
                    <button 
                      onClick={() => setTransactionToDelete(tx)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-350 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {tx.notes && (
                  <p className="mt-2 text-xs text-slate-400/90 font-semibold italic bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                    "{tx.notes}"
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Custom Transaction Delete Confirmation Modal */}
      {transactionToDelete && (
        <div id="delete-tx-confirmation-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center border border-rose-100">
              <Trash2 className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Annihilate record?</h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">This operation is irrecoverable</p>
              <p className="text-sm text-slate-550 mt-2.5 leading-relaxed">
                Are you sure you want to delete the <strong className="text-slate-800 font-extrabold">{transactionToDelete.category}</strong> ledger entry of <strong className="text-rose-600 font-mono font-bold">{formatCurrency(transactionToDelete.amount)}</strong>?
              </p>
              <div className="text-xs text-rose-600 bg-rose-50 p-4 rounded-2xl mt-3 font-semibold space-y-1">
                <span className="block font-black uppercase text-[10px] tracking-wide mb-1 text-rose-700">⚠️ IMPORTANT REVERSALS:</span>
                <span className="block">• Revoke the transaction entry permanently</span>
                <span className="block">• Automatically reverse bank dynamic balance or supplier outstanding accounts if applicable</span>
                <span className="block font-bold mt-1 text-rose-750">This action cannot be undone.</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <button
                onClick={() => setTransactionToDelete(null)}
                className="py-3 bg-slate-50 border border-slate-205 text-slate-600 rounded-xl font-bold text-xs uppercase cursor-pointer hover:bg-slate-100 transition-colors"
              >
                No, cancel
              </button>
              <button
                onClick={async () => {
                  const tx = transactionToDelete;
                  setTransactionToDelete(null);
                  await handleDelete(tx);
                }}
                className="py-3 bg-rose-600 text-white rounded-xl font-black text-xs uppercase cursor-pointer hover:bg-rose-700 transition-colors shadow-lg shadow-rose-900/10"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
