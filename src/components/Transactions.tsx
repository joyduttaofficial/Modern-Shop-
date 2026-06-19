import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, addDoc, query, orderBy, onSnapshot, limit, deleteDoc, doc, increment, where } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, updateDoc } from "@/src/lib/firebase";
import { Transaction, TransactionType, Category, Bank, UserRole, Employee, Supplier } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  Plus, Search, Filter, Trash2, ArrowUpCircle, ArrowDownCircle, 
  Wallet, Landmark, ArrowUpRight, ArrowDownLeft, ArrowUpDown, 
  PlusCircle, MinusCircle, Calendar, ChevronRight, Info, Percent, AlertCircle, 
  DollarSign, Calculator, History, UserCheck, Users, RefreshCw
} from "lucide-react";
import { motion } from "motion/react";
import { format } from "date-fns";

export default function Transactions({ 
  user, 
  role,
  initialActiveTab,
  onClearInitialActiveTab
}: { 
  user: User; 
  role: UserRole;
  initialActiveTab?: "income" | "expense";
  onClearInitialActiveTab?: () => void;
}) {
  const [workspaceTab, setWorkspaceTab] = useState<"inout" | "opening" | "banks" | "loans" | "ledgers">("inout");
  const [activeTab, setActiveTab] = useState<TransactionType>(initialActiveTab || "income");

  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
      if (onClearInitialActiveTab) {
        onClearInitialActiveTab();
      }
    }
  }, [initialActiveTab]);
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

  // General Form States
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

  // Bank Actions States
  const [transferSource, setTransferSource] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newBankBalance, setNewBankBalance] = useState("");
  const [showAddBank, setShowAddBank] = useState(false);
  const [bankSubTab, setBankSubTab] = useState<"deposit" | "credit" | "transfer">("deposit");
  const [bankActionBankName, setBankActionBankName] = useState("");
  const [bankActionAmount, setBankActionAmount] = useState("");
  const [bankActionNotes, setBankActionNotes] = useState("");

  // Loan Desk States
  const [loanLenderName, setLoanLenderName] = useState("");
  const [loanSearch, setLoanSearch] = useState("");

  useEffect(() => {
    const q = query(collection(db, "transactions"), orderBy("date", "desc"), limit(100));
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

  // Align actions with selected workspace tabs
  useEffect(() => {
    if (workspaceTab === "inout") {
      setCurrentAction(activeTab === "income" ? "income" : "expense");
      setCategory(activeTab === "income" ? "Income" : "");
    } else if (workspaceTab === "opening") {
      setCurrentAction("prev_cash");
      setCategory("Previous Cash");
      setPaymentMethod("Cash");
    } else if (workspaceTab === "banks") {
      setCurrentAction("bank_deposit");
      setCategory("Bank Deposit");
      if (banks.length > 0 && !paymentMethod.startsWith("Cash")) {
        setPaymentMethod(banks[0].name);
      }
    } else if (workspaceTab === "loans") {
      setCurrentAction("loan_deposit");
      setCategory("Loan Deposit");
      setPaymentMethod("Cash");
    }
  }, [workspaceTab, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;
    if ((category === "Staff Salary" || category === "Employee Advance" || category === "Employee") && !employeeId) {
      alert("Please select an employee");
      return;
    }

    // Special behavior for Supplier Due Payment
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
            type: "expense",
            category,
            amount: payment.numAmount,
            paymentMethod,
            notes: notes.trim() ? `${notes.trim()} (Paid to ${supName})` : `Supplier Due Payment to ${supName}`,
            createdBy: user.uid,
            subCategory: supName,
            supplierId: payment.id
          };

          await addDoc(collection(db, "transactions"), newTx);

          await updateDoc(doc(db, "suppliers", payment.id), {
            purchaseDue: increment(-payment.numAmount)
          });

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

        setAmount("");
        setSupplierPayments({});
        setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setNotes("");
        setSubCategory("");
        setEmployeeId("");
        setSupplierId("");
        
        alert(`Successfully recorded ${activePayments.length} supplier payments.`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "transactions");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Normal Transaction entry logic
    setLoading(true);
    try {
      const numAmount = parseFloat(amount);
      const isOutflow = (category === "Bank Credit" || category === "Loan Credit" || activeTab === "expense");
      const computedType: TransactionType = (category === "Previous Cash" || category === "Bank Deposit" || category === "Loan Deposit" || activeTab === "income") ? "income" : "expense";

      const newTx: Transaction = {
        date: new Date(date).toISOString(),
        type: computedType,
        category,
        amount: numAmount,
        paymentMethod,
        notes: notes.trim(),
        createdBy: user.uid,
        ...(subCategory.trim() ? { subCategory: subCategory.trim() } : {}),
        ...(employeeId ? { employeeId } : {}),
        ...(supplierId ? { supplierId } : {})
      };

      await addDoc(collection(db, "transactions"), newTx);

      // Decrement Supplier Due balance if singular
      if (category === "Supplier Due Payment" && supplierId) {
        await updateDoc(doc(db, "suppliers", supplierId), {
          purchaseDue: increment(-numAmount)
        });

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

      // Update Bank Balance
      if (paymentMethod !== "Cash") {
        const bank = banks.find(b => b.name === paymentMethod);
        if (bank?.id) {
          const isBankInflow = (category === "Bank Deposit" || computedType === "income") && category !== "Bank Credit";
          await updateDoc(doc(db, "banks", bank.id), {
            balance: increment(isBankInflow ? numAmount : -numAmount),
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
      alert("Transaction successfully recorded in system ledger.");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "transactions");
    } finally {
      setLoading(false);
    }
  };

  // Perform dynamic asset transfers (Cash to Bank or Bank to Bank)
  const handleBankTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid transfer amount.");
      return;
    }
    if (!transferSource || !transferTarget) {
      alert("Please select source and destination accounts.");
      return;
    }
    if (transferSource === transferTarget) {
      alert("Source and target accounts must be different.");
      return;
    }

    setLoading(true);
    try {
      const nowStr = new Date().toISOString();
      const customMemo = transferNotes.trim() ? `: ${transferNotes.trim()}` : "";

      // 1. Record Outflow (source)
      const txOut: Transaction = {
        date: nowStr,
        type: "expense",
        category: transferSource === "Cash" ? "Expense" : "Bank Credit",
        amount: amt,
        paymentMethod: transferSource,
        notes: `Transfer Out to ${transferTarget}${customMemo}`,
        createdBy: user.uid,
        subCategory: "Account Transfer"
      };
      await addDoc(collection(db, "transactions"), txOut);

      // Decrement source bank
      if (transferSource !== "Cash") {
        const srcB = banks.find(b => b.name === transferSource);
        if (srcB?.id) {
          await updateDoc(doc(db, "banks", srcB.id), {
            balance: increment(-amt),
            lastUpdated: nowStr
          });
        }
      }

      // 2. Record Inflow (target)
      const txIn: Transaction = {
        date: nowStr,
        type: "income",
        category: transferTarget === "Cash" ? "Income" : "Bank Deposit",
        amount: amt,
        paymentMethod: transferTarget,
        notes: `Transfer In from ${transferSource}${customMemo}`,
        createdBy: user.uid,
        subCategory: "Account Transfer"
      };
      await addDoc(collection(db, "transactions"), txIn);

      // Increment target bank
      if (transferTarget !== "Cash") {
        const targetB = banks.find(b => b.name === transferTarget);
        if (targetB?.id) {
          await updateDoc(doc(db, "banks", targetB.id), {
            balance: increment(amt),
            lastUpdated: nowStr
          });
        }
      }

      setTransferAmount("");
      setTransferNotes("");
      alert("Successfully completed account balance transfer.");
    } catch (error) {
      alert("Transfer failed: " + error);
    } finally {
      setLoading(false);
    }
  };

  const handleBankAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(bankActionAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    const selectedBank = bankActionBankName || (banks.length > 0 ? banks[0].name : "");
    if (!selectedBank) {
      alert("Please select or create a bank account first.");
      return;
    }

    const bankObj = banks.find(b => b.name === selectedBank);
    if (!bankObj || !bankObj.id) {
      alert("Selected bank account was not found in the gateway registration.");
      return;
    }

    setLoading(true);
    try {
      const nowStr = new Date().toISOString();
      const customMemo = bankActionNotes.trim();

      if (bankSubTab === "deposit") {
        const newTx: Transaction = {
          date: nowStr,
          type: "income",
          category: "Bank Deposit",
          amount: amt,
          paymentMethod: selectedBank,
          notes: customMemo || `Cash Deposit into ${selectedBank}`,
          createdBy: user.uid,
          subCategory: "Bank Deposit"
        };
        await addDoc(collection(db, "transactions"), newTx);

        await updateDoc(doc(db, "banks", bankObj.id), {
          balance: increment(amt),
          lastUpdated: nowStr
        });

        alert(`Successfully deposited ৳${amt.toLocaleString()} into ${selectedBank}.`);
      } else if (bankSubTab === "credit") {
        const newTx: Transaction = {
          date: nowStr,
          type: "expense",
          category: "Bank Credit",
          amount: amt,
          paymentMethod: selectedBank,
          notes: customMemo || `Cash Withdrawal from ${selectedBank}`,
          createdBy: user.uid,
          subCategory: "Bank Credit"
        };
        await addDoc(collection(db, "transactions"), newTx);

        await updateDoc(doc(db, "banks", bankObj.id), {
          balance: increment(-amt),
          lastUpdated: nowStr
        });

        alert(`Successfully withdrew ৳${amt.toLocaleString()} from ${selectedBank} into Cash drawer.`);
      }

      setBankActionAmount("");
      setBankActionNotes("");
    } catch (error) {
      alert("Bank action failed: " + error);
    } finally {
      setLoading(false);
    }
  };

  // Quick Account registration
  const handleAddNewBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim()) {
      alert("Please enter a valid bank name.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "banks"), {
        name: newBankName.trim(),
        balance: parseFloat(newBankBalance) || 0,
        lastUpdated: new Date().toISOString()
      });
      setNewBankName("");
      setNewBankBalance("");
      setShowAddBank(false);
      alert("New bank gateway created successfully!");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "banks");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tx: Transaction) => {
    try {
      if (tx.id) {
        await deleteDoc(doc(db, "transactions", tx.id));

        // If it was a supplier payment, revert outstanding
        if (tx.category === "Supplier Due Payment" && tx.supplierId) {
          await updateDoc(doc(db, "suppliers", tx.supplierId), {
            purchaseDue: increment(tx.amount)
          });
        }

        // Reverse bank balance
        if (tx.paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === tx.paymentMethod);
          if (bank?.id) {
            const isBankInflow = (tx.category === "Bank Deposit" || tx.type === "income") && tx.category !== "Bank Credit";
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(isBankInflow ? -tx.amount : tx.amount),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }
      alert("Ledger transaction deleted successfully.");
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

  // Calculate Real-Time Dynamic metrics
  const calculatedCashInHand = transactions
    .reduce((sum, tx) => {
      // Regular Cash Drawer transactions
      if (tx.paymentMethod === "Cash") {
        return sum + (tx.type === "income" ? tx.amount : -tx.amount);
      }
      // Bank Deposit (moving Cash -> Bank): decreases physical cash drawer
      if (tx.category === "Bank Deposit" && tx.subCategory !== "Account Transfer") {
        return sum - tx.amount;
      }
      // Bank Credit (moving Bank -> Cash): increases physical cash drawer
      if (tx.category === "Bank Credit" && tx.subCategory !== "Account Transfer") {
        return sum + tx.amount;
      }
      return sum;
    }, 0);

  const calculatedBankBalance = banks.reduce((sum, b) => sum + b.balance, 0);

  const totalLoansDeposited = transactions
    .filter(tx => tx.category === "Loan Deposit")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalLoansRepaid = transactions
    .filter(tx => tx.category === "Loan Credit")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const outstandingLoanBalance = totalLoansDeposited - totalLoansRepaid;

  // Monthly breakdown
  const currentMonthStr = format(new Date(), "yyyy-MM");
  const monthlyInflow = transactions
    .filter(tx => tx.type === "income" && tx.date.startsWith(currentMonthStr) && tx.category !== "Previous Cash")
    .reduce((sum, x) => sum + x.amount, 0);

  const monthlyOutflow = transactions
    .filter(tx => tx.type === "expense" && tx.date.startsWith(currentMonthStr))
    .reduce((sum, x) => sum + x.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Dynamic Bento metrics panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cash in Hand */}
        <div id="drawer-cash-metric" className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-3xl text-white shadow-lg border border-emerald-400/20 relative overflow-hidden">
          <div className="absolute right-3 bottom-0 opacity-10 pointer-events-none">
            <Wallet className="w-24 h-24 stroke-[1.5]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100/90 flex items-center gap-1.5 leading-none mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse"></span>
            Cash Drawer Balance
          </p>
          <h3 className="text-2xl font-black font-mono tracking-tight text-white mb-1">
            {formatCurrency(calculatedCashInHand)}
          </h3>
          <p className="text-[10px] text-emerald-150/80 font-medium">Accumulative localized physical tender</p>
        </div>

        {/* Bank balances */}
        <div id="bank-assets-metric" className="bg-gradient-to-br from-indigo-500 to-blue-600 p-5 rounded-3xl text-white shadow-lg border border-indigo-400/20 relative overflow-hidden">
          <div className="absolute right-3 bottom-0 opacity-10 pointer-events-none">
            <Landmark className="w-24 h-24 stroke-[1.5]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-105 flex items-center gap-1.5 leading-none mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-200"></span>
            Combined Bank Assets
          </p>
          <h3 className="text-2xl font-black font-mono tracking-tight text-white mb-1">
            {formatCurrency(calculatedBankBalance)}
          </h3>
          <p className="text-[10px] text-indigo-150/85 font-medium">Across {banks.length} registered electronic portals</p>
        </div>

        {/* Loan balance */}
        <div id="loans-liabilities-metric" className="bg-gradient-to-br from-amber-500 to-orange-600 p-5 rounded-3xl text-white shadow-lg border border-amber-400/20 relative overflow-hidden">
          <div className="absolute right-3 bottom-0 opacity-10 pointer-events-none">
            <RefreshCw className="w-24 h-24 stroke-[1.5]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-100 flex items-center gap-1.5 leading-none mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-200"></span>
            Unsettled Loan Debt
          </p>
          <h3 className="text-2xl font-black font-mono tracking-tight text-white mb-1">
            {formatCurrency(outstandingLoanBalance)}
          </h3>
          <p className="text-[10px] text-amber-100/80 font-medium">Repaid: {formatCurrency(totalLoansRepaid)} so far</p>
        </div>

        {/* Month flow stats */}
        <div id="monthly-outlay-metric" className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-3xl text-white shadow-lg border border-slate-700/30 relative overflow-hidden">
          <div className="absolute right-3 bottom-0 opacity-10 pointer-events-none">
            <Calculator className="w-24 h-24 stroke-[1.5]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 leading-none mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-450"></span>
            Monthly Flow ({format(new Date(), "MMMM")})
          </p>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-400 font-bold">In:</span>
              <span className="text-emerald-400 font-mono font-black">+{formatCurrency(monthlyInflow)}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-400 font-bold">Out:</span>
              <span className="text-rose-400 font-mono font-black">-{formatCurrency(monthlyOutflow)}</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1.5 pt-1.5 border-t border-slate-700/50">Current financial month activity</p>
        </div>
      </div>

      {/* Primary Workspace Navigation & Area */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-100/40 overflow-hidden min-h-[580px] grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        
        {/* High-fidelity Sidebar Control Rail */}
        <div className="lg:col-span-3 p-5 space-y-6 bg-slate-50/70">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">Financial Hub</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Organized Cash flow registries</p>
          </div>

          <nav className="flex flex-col gap-1.5">
            <button
              id="tab-inout"
              onClick={() => setWorkspaceTab("inout")}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all uppercase tracking-wider text-left border cursor-pointer",
                workspaceTab === "inout" 
                  ? "bg-white text-slate-900 border-slate-205 shadow-sm font-black text-indigo-700" 
                  : "bg-transparent text-slate-505 border-transparent hover:bg-slate-100/80 hover:text-slate-950"
              )}
            >
              <span className="flex items-center gap-2.5">
                <ArrowUpDown className="w-4 h-4 text-emerald-500 shrink-0" />
                Inflows & Outflows
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <button
              id="tab-opening"
              onClick={() => setWorkspaceTab("opening")}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all uppercase tracking-wider text-left border cursor-pointer",
                workspaceTab === "opening" 
                  ? "bg-white text-slate-900 border-slate-205 shadow-sm font-black text-indigo-700" 
                  : "bg-transparent text-slate-505 border-transparent hover:bg-slate-100/80 hover:text-slate-950"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Wallet className="w-4 h-4 text-indigo-500 shrink-0" />
                Previous / Opening Cash
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <button
              id="tab-banks"
              onClick={() => setWorkspaceTab("banks")}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all uppercase tracking-wider text-left border cursor-pointer",
                workspaceTab === "banks" 
                  ? "bg-white text-slate-900 border-slate-205 shadow-sm font-black text-indigo-700" 
                  : "bg-transparent text-slate-505 border-transparent hover:bg-slate-100/80 hover:text-slate-950"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Landmark className="w-4 h-4 text-sky-550 shrink-0" />
                Bank Operations
              </span>
              <span className="bg-sky-50 text-sky-700 border border-sky-100 text-[9px] px-1.5 py-0.5 rounded-md font-bold">
                {banks.length}
              </span>
            </button>

            <button
              id="tab-loans"
              onClick={() => setWorkspaceTab("loans")}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all uppercase tracking-wider text-left border cursor-pointer",
                workspaceTab === "loans" 
                  ? "bg-white text-slate-900 border-slate-205 shadow-sm font-black text-indigo-700" 
                  : "bg-transparent text-slate-505 border-transparent hover:bg-slate-100/80 hover:text-slate-950"
              )}
            >
              <span className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-amber-500 shrink-0" />
                Debt & loan Desk
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>

            <button
              id="tab-ledgers"
              onClick={() => setWorkspaceTab("ledgers")}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all uppercase tracking-wider text-left border cursor-pointer",
                workspaceTab === "ledgers" 
                  ? "bg-white text-slate-900 border-slate-205 shadow-sm font-black text-indigo-700" 
                  : "bg-transparent text-slate-505 border-transparent hover:bg-slate-100/80 hover:text-slate-950"
              )}
            >
              <span className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-slate-600 shrink-0" />
                Unified Ledger List
              </span>
              <span className="bg-slate-100 text-slate-700 text-[9px] px-1.5 py-0.5 rounded-md font-bold">
                {transactions.length}
              </span>
            </button>
          </nav>

          {/* Quick info tip context block */}
          <div className="bg-slate-100/60 p-4 rounded-2xl border border-slate-200/50 space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest text-slate-400 uppercase">
              <Info className="w-3 h-3 text-slate-500" /> Accounting Shield
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
              Always balance cash withdrawals & bank credits with physical deposit ledgers to keep business balance sheets accurate.
            </p>
          </div>
        </div>

        {/* Modular workspace views with polished structures */}
        <div className="lg:col-span-9 p-6 lg:p-8 flex flex-col justify-between">
          
          {/* TAB 1: Inflows & Outflows */}
          {workspaceTab === "inout" && (
            <div id="view-inflows-outflows" className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Inflows & Outflows</h3>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Register corporate income, salaries, and operating spends</p>
                </div>
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                  <button
                    onClick={() => { setActiveTab("income"); }}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                      activeTab === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Income Inflow
                  </button>
                  <button
                    onClick={() => { setActiveTab("expense"); }}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                      activeTab === "expense" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Expense Outflow
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <form onSubmit={handleSubmit} className="md:col-span-7 space-y-4">
                  {/* Timestamp & Amount Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Date & Time</label>
                      <input
                        type="datetime-local"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 font-semibold text-sm outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                        {category === "Supplier Due Payment" ? "Full Allocation (Sum)" : "Amount in BDT"}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-sm">৳</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0.00"
                          readOnly={category === "Supplier Due Payment"}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className={cn(
                            "w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-0 text-base font-mono font-black outline-none transition-all",
                            category === "Supplier Due Payment" && "bg-amber-50/70 border-amber-200 text-amber-950 font-bold cursor-not-allowed"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Operational Settings dynamic selector */}
                  {activeTab === "expense" && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Operational Spend Category</label>
                      <select
                        required
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          setSubCategory("");
                        }}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-800 font-semibold text-sm outline-none transition-all"
                      >
                        <option value="">Select Spend Category...</option>
                        <option value="Supplier Due Payment">Supplier Due Settlement</option>
                        <option value="Staff Salary">Staff Monthly Salary</option>
                        <option value="Employee Advance">Employee Advance Disbursement</option>
                        {categories
                          .filter(c => {
                            if (c.type !== "expense") return false;
                            if (["Supplier Due Payment", "Staff Salary", "Employee Advance", "Previous Cash", "Bank Deposit", "Bank Credit", "Loan Deposit", "Loan Credit"].includes(c.name)) return false;
                            return true;
                          })
                          .map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))
                        }
                      </select>
                    </div>
                  )}

                  {/* Supplier due grid checklist popup container */}
                  {category === "Supplier Due Payment" && activeTab === "expense" && (
                    <div className="space-y-3 p-4 bg-amber-50/30 border border-amber-200/50 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-amber-850 uppercase tracking-wider">Allocate payment amounts directly</span>
                        <button
                          type="button"
                          onClick={() => setSupplierPayments({})}
                          className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase"
                        >
                          Clear all
                        </button>
                      </div>

                      {/* Search box helper */}
                      <input
                        type="text"
                        placeholder="Filter suppliers by name or code..."
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-205 rounded-xl text-xs font-semibold outline-none focus:border-slate-800"
                      />

                      <div className="border border-slate-200/50 bg-white rounded-xl divide-y divide-slate-100 max-h-[190px] overflow-y-auto p-1 text-xs">
                        {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.code && s.code.toLowerCase().includes(supplierSearch.toLowerCase()))).map(sup => {
                          const val = supplierPayments[sup.id!] || "";
                          const due = sup.purchaseDue || 0;
                          return (
                            <div key={sup.id} className="flex gap-2 items-center justify-between p-2 hover:bg-slate-50 transition-all">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-800 truncate">{sup.name}</p>
                                <span className="font-mono text-[10px] font-bold text-slate-400">Due: ৳{due.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setSupplierPayments(p => ({...p, [sup.id!]: due > 0 ? due.toFixed(2) : ""}))}
                                  className="px-2 py-0.5 bg-amber-100/80 text-amber-800 rounded text-[9px] font-black"
                                >
                                  Max
                                </button>
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  value={val}
                                  onChange={(e) => setSupplierPayments(p => ({...p, [sup.id!]: e.target.value}))}
                                  className="w-20 px-2 py-0.5 border rounded outline-none font-mono text-right"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Employee details for human wage allocations */}
                  {(category === "Staff Salary" || category === "Employee Advance") && activeTab === "expense" && (
                    <div className="space-y-1 p-4 bg-sky-50/40 border border-sky-100 rounded-2xl animate-in slide-in-from-top-1.5">
                      <label className="text-[10px] font-black text-sky-800 uppercase tracking-widest pl-1">Select Active Staff Employee</label>
                      <select
                        required
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-205 rounded-xl font-semibold text-sm outline-none text-slate-800"
                      >
                        <option value="">Select registered individual...</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Standard SubCategory Input (not used during Employee payouts) */}
                  {!(["Staff Salary", "Employee Advance", "Supplier Due Payment"].includes(category)) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Reference / Sub-category</label>
                      <input
                        type="text"
                        placeholder={activeTab === "income" ? "e.g. Retail sale, wholesale" : "e.g. Electricity, transport bill"}
                        value={subCategory}
                        onChange={(e) => setSubCategory(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-800 font-semibold text-sm outline-none transition-all"
                      />
                    </div>
                  )}

                  {/* Payment gateway select options */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Payment Method / Gateway</label>
                    <div className="grid grid-cols-2 gap-3 pb-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("Cash")}
                        className={cn(
                          "flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all text-xs font-bold cursor-pointer",
                          paymentMethod === "Cash" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <Wallet className="w-4 h-4" />
                        Cash Drawer
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod(banks[0]?.name || "Bank")}
                        className={cn(
                          "flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all text-xs font-bold cursor-pointer",
                          paymentMethod !== "Cash" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <Landmark className="w-4 h-4" />
                        Bank Account
                      </button>
                    </div>

                    {paymentMethod !== "Cash" && (
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-sm outline-none"
                      >
                        {banks.map(b => (
                          <option key={b.id} value={b.name}>{b.name} (৳{b.balance.toFixed(2)})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Transaction Memo (Optional)</label>
                    <textarea
                      placeholder="Comment for audit trail reference..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-800 text-sm font-medium min-h-[70px] outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "w-full py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer",
                      activeTab === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                    )}
                  >
                    {loading ? "Registering Influx..." : `Save ${activeTab === "income" ? "Inflow Record" : "Outflow Record"}`}
                  </button>
                </form>

                {/* Side guide panel */}
                <div className="md:col-span-5 space-y-4">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/50 space-y-3">
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-slate-600" /> Allocation Rules
                    </h4>
                    <div className="space-y-2.5 text-[11px] text-slate-600 leading-relaxed font-semibold">
                      <div className="p-3 bg-white rounded-xl border border-slate-100">
                        <span className="block text-emerald-600 font-extrabold uppercase text-[10px] mb-0.5">💰 Store Income:</span>
                        Updates corporate sales analytics, adds liquidity into selected Cash or Bank gateway automatically.
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-slate-100">
                        <span className="block text-rose-600 font-extrabold uppercase text-[10px] mb-0.5">🔧 Spend Expenses:</span>
                        Under generic costs (e.g. utility, salary or raw supply settlements). Allocating Supplier settlements dynamically cancels invoice liabilities.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Opening / Previous Cash */}
          {workspaceTab === "opening" && (
            <div id="view-opening-balance" className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Shift Opening & Previous Cash drawer</h3>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Setup starting liquid cash reserves for the active day / business shift</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <form onSubmit={handleSubmit} className="md:col-span-7 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Registry Date</label>
                    <input
                      type="datetime-local"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl font-semibold outline-none"
                    />
                  </div>

                  <div className="space-y-1 flex-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Previous / Day Opening Cash (BDT)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black">৳</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-205 rounded-xl font-mono focus:border-slate-900 text-lg font-black outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Opening Note</label>
                    <input
                      type="text"
                      placeholder="e.g. Counter counter 1 morning drawer balance"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl outline-none text-xs font-semibold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider transition-colors active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  >
                    Confirm & Store Opening Capital
                  </button>
                </form>

                <div className="md:col-span-5 space-y-4">
                  <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100/60 space-y-3">
                    <div className="flex gap-2 items-center">
                      <Wallet className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h4 className="text-xs font-black text-indigo-900 uppercase">Opening Drawer history</h4>
                    </div>
                    <div className="space-y-2 text-xs overflow-y-auto max-h-[290px] divide-y divide-indigo-100/50">
                      {transactions.filter(t => t.category === "Previous Cash").length === 0 ? (
                        <p className="p-3 text-slate-400 font-bold italic">No physical cash openers logged recently.</p>
                      ) : (
                        transactions.filter(t => t.category === "Previous Cash").slice(0, 5).map(t => (
                          <div key={t.id} className="py-2.5 first:pt-0 flex justify-between items-center bg-white/40 p-2 rounded-xl mt-1.5 border border-transparent hover:border-indigo-110 transition-all">
                            <div>
                              <p className="font-bold text-slate-800">{format(new Date(t.date), "MMM dd, yyyy")}</p>
                              <span className="text-[10px] font-medium text-slate-400 block">{t.notes || "No extra memo"}</span>
                            </div>
                            <span className="font-mono font-black text-indigo-650 bg-white px-2 py-1 rounded-lg border border-indigo-100 shadow-sm">
                              ৳{t.amount.toLocaleString()}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Bank Operations */}
          {workspaceTab === "banks" && (
            <div id="view-bank-operations" className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Bank Gateways & Asset Vaults</h3>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Control dynamic ledger transfers, cash deposits, and direct withdrawals</p>
                </div>
                <button
                  onClick={() => setShowAddBank(!showAddBank)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showAddBank ? "Show Desk" : "Register New Account"}
                </button>
              </div>

              {showAddBank ? (
                /* INLINE FORM: Register New Bank accounts list */
                <form id="add-bank-ledger-form" onSubmit={handleAddNewBank} className="max-w-md p-5 bg-slate-50 border border-slate-200/50 rounded-2xl space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-emerald-650" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">Register New Gateway Account</h4>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 font-bold">Bank / Account Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dutch-Bangla, bKash, BRAC Bank"
                      value={newBankName}
                      onChange={(e) => setNewBankName(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-slate-205 rounded-xl font-semibold outline-none focus:border-slate-800 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 font-bold">Initial Starting balance (BDT)</label>
                    <input
                      type="number"
                      required
                      placeholder="0.00"
                      value={newBankBalance}
                      onChange={(e) => setNewBankBalance(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-slate-205 rounded-xl font-mono text-xs font-semibold focus:border-slate-800"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddBank(false)}
                      className="flex-1 py-2 border rounded-xl font-bold bg-white text-slate-600 text-xs uppercase"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase"
                    >
                      Save Gateway
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                  {/* Accounts Grid list */}
                  <div className="md:col-span-6 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Registered gateways ({banks.length})</h4>
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {banks.length === 0 ? (
                        <p className="p-6 bg-slate-50 border border-dashed rounded-2xl text-center text-xs font-semibold text-slate-400">No bank accounts added in settings.</p>
                      ) : (
                        banks.map(b => (
                          <div key={b.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between hover:bg-slate-100/50 transition-all">
                            <div>
                              <p className="font-extrabold text-xs text-slate-800">{b.name}</p>
                              <span className="text-[9px] font-semibold text-slate-400 uppercase">Synchronized recently</span>
                            </div>
                            <span className="font-mono font-black text-xs text-slate-900 bg-white px-3 py-1 bg-white border rounded-xl shadow-sm">
                              ৳{b.balance.toLocaleString()}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Vault Actions panels */}
                  <div className="md:col-span-6 space-y-5">
                    
                    <div className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-5 shadow-sm">
                      {/* Sub-tabs header */}
                      <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setBankSubTab("deposit")}
                          className={cn(
                            "py-2 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer text-center",
                            bankSubTab === "deposit" ? "bg-emerald-600 text-white shadow font-bold" : "text-slate-500 hover:text-slate-800 font-semibold"
                          )}
                        >
                          Deposit
                        </button>
                        <button
                          type="button"
                          onClick={() => setBankSubTab("credit")}
                          className={cn(
                            "py-2 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer text-center",
                            bankSubTab === "credit" ? "bg-rose-600 text-white shadow font-bold" : "text-slate-500 hover:text-slate-800 font-semibold"
                          )}
                        >
                          Credit / WD
                        </button>
                        <button
                          type="button"
                          onClick={() => setBankSubTab("transfer")}
                          className={cn(
                            "py-2 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer text-center",
                            bankSubTab === "transfer" ? "bg-indigo-600 text-white shadow font-bold" : "text-slate-500 hover:text-slate-800 font-semibold"
                          )}
                        >
                          Transfer
                        </button>
                      </div>

                      {bankSubTab === "deposit" && (
                        <form onSubmit={handleBankAction} className="space-y-4 animate-in fade-in duration-200">
                          <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50 flex gap-2 items-start text-xs text-emerald-800 font-semibold mb-2">
                            <PlusCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Record Bank Deposit</p>
                              <p className="text-[10px] text-emerald-600 font-medium">This moves liquid physical Cash from your Drawer into a registered Bank account.</p>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Target Bank Gateway</label>
                            <select
                              required
                              value={bankActionBankName}
                              onChange={(e) => setBankActionBankName(e.target.value)}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs outline-none"
                            >
                              <option value="">Select Target Bank...</option>
                              {banks.map(b => (
                                <option key={b.id} value={b.name}>{b.name} (Current: ৳{b.balance.toLocaleString()})</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Deposit Amount (BDT)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">৳</span>
                              <input
                                type="number"
                                required
                                placeholder="0.00"
                                value={bankActionAmount}
                                onChange={(e) => setBankActionAmount(e.target.value)}
                                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-black focus:border-emerald-600 outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Transaction Note</label>
                            <input
                              type="text"
                              value={bankActionNotes}
                              onChange={(e) => setBankActionNotes(e.target.value)}
                              placeholder="e.g., Deposited daily sales cash at branch..."
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs outline-none"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                          >
                            {loading ? "Registering Deposit..." : "Record Deposit Entry"}
                          </button>
                        </form>
                      )}

                      {bankSubTab === "credit" && (
                        <form onSubmit={handleBankAction} className="space-y-4 animate-in fade-in duration-200">
                          <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100/50 flex gap-2 items-start text-xs text-rose-800 font-semibold mb-2">
                            <MinusCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Record Bank Credit / Withdrawal</p>
                              <p className="text-[10px] text-rose-600 font-medium">This withdraws funds from a registered Bank account back into your physical Cash Hand drawer.</p>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Source Bank Gateway</label>
                            <select
                              required
                              value={bankActionBankName}
                              onChange={(e) => setBankActionBankName(e.target.value)}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs outline-none"
                            >
                              <option value="">Select Source Bank...</option>
                              {banks.map(b => (
                                <option key={b.id} value={b.name}>{b.name} (Current: ৳{b.balance.toLocaleString()})</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Withdrawal Amount (BDT)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">৳</span>
                              <input
                                type="number"
                                required
                                placeholder="0.00"
                                value={bankActionAmount}
                                onChange={(e) => setBankActionAmount(e.target.value)}
                                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-black focus:border-rose-600 outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Transaction Note</label>
                            <input
                              type="text"
                              value={bankActionNotes}
                              onChange={(e) => setBankActionNotes(e.target.value)}
                              placeholder="e.g., ATM withdrawal, cheque encashment reference..."
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs outline-none"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                          >
                            {loading ? "Registering Withdrawal..." : "Record Withdrawal Entry"}
                          </button>
                        </form>
                      )}

                      {bankSubTab === "transfer" && (
                        <form onSubmit={handleBankTransfer} className="space-y-4 animate-in fade-in duration-200">
                          <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50 flex gap-2 items-start text-xs text-indigo-800 font-semibold mb-2">
                            <ArrowUpDown className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Inter-gateway Account Transfer</p>
                              <p className="text-[10px] text-indigo-600 font-medium">Reallocate cash directly between different gateways (e.g., Transferring money from Bank A to Bank B).</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">From Account</label>
                              <select
                                required
                                value={transferSource}
                                onChange={(e) => setTransferSource(e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none text-xs"
                              >
                                <option value="">Select Source...</option>
                                <option value="Cash">Cash Drawer</option>
                                {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">To Account</label>
                              <select
                                required
                                value={transferTarget}
                                onChange={(e) => setTransferTarget(e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none text-xs"
                              >
                                <option value="">Select Target...</option>
                                <option value="Cash">Cash Drawer</option>
                                {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                              </select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Transfer Amount (BDT)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">৳</span>
                              <input
                                type="number"
                                required
                                placeholder="0.00"
                                value={transferAmount}
                                onChange={(e) => setTransferAmount(e.target.value)}
                                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-black focus:border-indigo-650 outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Transfer Description</label>
                            <input
                              type="text"
                              placeholder="e.g. Internal account adjustment reference notes..."
                              value={transferNotes}
                              onChange={(e) => setTransferNotes(e.target.value)}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs outline-none"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer animate-in duration-300"
                          >
                            Execute Transfer Order
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Loans & Debts */}
          {workspaceTab === "loans" && (
            <div id="view-loan-desk" className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Active Loans & Liabilities</h3>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Discharge interest payloads, log loan deposits, and track lender repayments</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <form onSubmit={handleSubmit} className="md:col-span-7 space-y-4">
                  <div className="grid grid-cols-2 gap-3 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setCategory("Loan Deposit");
                        setActiveTab("income");
                        setPaymentMethod("Cash");
                      }}
                      className={cn(
                        "py-1.5 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer",
                        category === "Loan Deposit" ? "bg-white text-emerald-600 shadow-sm animate-in" : "text-slate-500"
                      )}
                    >
                      Receive Loan (Inflow)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCategory("Loan Credit");
                        setActiveTab("expense");
                        setPaymentMethod("Cash");
                      }}
                      className={cn(
                        "py-1.5 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer",
                        category === "Loan Credit" ? "bg-white text-orange-600 shadow-sm animate-in" : "text-slate-500"
                      )}
                    >
                      Repay Loan (Outflow)
                    </button>
                  </div>

                  {/* Timestamp */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Registry DateTime</label>
                    <input
                      type="datetime-local"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl font-semibold outline-none"
                    />
                  </div>

                  {/* Lender identifier: subcategory */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Lender / Borrower Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bank Loan, Uncle Rafiq, Corporate credit"
                      value={subCategory}
                      onChange={(e) => setSubCategory(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl text-xs font-semibold outline-none focus:border-slate-800"
                    />
                  </div>

                  {/* Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tender Amount (BDT)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black">৳</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-205 rounded-xl font-mono text-base font-black focus:border-slate-900 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 font-semibold">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Payment gateway channel</label>
                      <input
                        type="text"
                        readOnly
                        value="Cash hand Drawer"
                        className="w-full px-4 py-2.5 bg-slate-100 border border-slate-205 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Memo */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Loan Memo Note</label>
                    <input
                      type="text"
                      placeholder="Special agreements, collateral reference, etc."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-205 rounded-xl text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider transition-colors active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-md",
                      category === "Loan Credit" && "bg-orange-600 hover:bg-orange-700 hover:shadow-orange-100"
                    )}
                  >
                    {category === "Loan Deposit" ? "Confirm Loan Injection" : "Register Loan Remittance"}
                  </button>
                </form>

                {/* Loans log details */}
                <div className="md:col-span-5 space-y-4">
                  <div className="p-4 bg-slate-50 border rounded-2xl space-y-3">
                    <h4 className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Active Debts and loans log</h4>
                    
                    {/* Filter and search */}
                    <input
                      type="text"
                      placeholder="Filter lender name..."
                      value={loanSearch}
                      onChange={(e) => setLoanSearch(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-205 rounded-lg text-xs outline-none focus:border-slate-800"
                    />

                    <div className="space-y-2 max-h-[290px] overflow-y-auto">
                      {transactions.filter(t => (t.category === "Loan Deposit" || t.category === "Loan Credit") && (t.subCategory || "").toLowerCase().includes(loanSearch.toLowerCase())).length === 0 ? (
                        <p className="p-4 text-center text-xs font-semibold text-slate-400 italic">No loan records tracked match search criteria.</p>
                      ) : (
                        transactions.filter(t => t.category === "Loan Deposit" || t.category === "Loan Credit").filter(t => (t.subCategory || "").toLowerCase().includes(loanSearch.toLowerCase())).slice(0, 8).map(t => (
                          <div key={t.id} className="p-2.5 bg-white border rounded-xl flex items-center justify-between text-xs hover:border-amber-300 hover:bg-amber-50/10 transition-all">
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-slate-800 truncate">{t.subCategory || "Unspecified Lender"}</p>
                              <span className="text-[9px] font-bold uppercase shrink-0 px-2 py-0.5 rounded-md border inline-block mt-1 scale-90 -translate-x-1.5 leading-none bg-slate-100">
                                {t.category === "Loan Deposit" ? "Loan Received" : "Loan Repaid"}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-black text-slate-900">৳{t.amount.toLocaleString()}</p>
                              <span className="text-[9px] font-semibold text-slate-400 block">{format(new Date(t.date), "MMM dd")}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Unified Ledger Chronological View */}
          {workspaceTab === "ledgers" && (
            <div id="view-ledgers-recap" className="space-y-5 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100/50 pb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Main Ledger Journal</h3>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Chronologically sorted immutable registers log</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 font-semibold" />
                    <input 
                      type="text" 
                      placeholder="Search memo..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-205 rounded-xl text-xs font-semibold w-36 focus:w-48 transition-all outline-none"
                    />
                  </div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-205 rounded-xl text-[10px] font-black uppercase tracking-wider select-none outline-none cursor-pointer"
                  >
                    <option value="all">Filters: All</option>
                    <option value="income">Inflows Only</option>
                    <option value="expense">Outflows Only</option>
                  </select>
                </div>
              </div>

              {/* Transactions master scroll container */}
              <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-track]:transparent scrollbar-thin">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Audit log is clean</p>
                    <p className="text-xs font-semibold text-slate-400">Add systematic inputs using the left control segments.</p>
                  </div>
                ) : (
                  filteredTransactions.map(tx => {
                    const isIncome = tx.type === "income";
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        key={tx.id}
                        className="p-4 bg-white rounded-2xl border border-slate-200/55 shadow-sm hover:shadow hover:border-slate-300 transition-all flex items-center gap-4 relative group"
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-slate-100",
                          isIncome ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                        )}>
                          {isIncome ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <h4 className="font-extrabold text-xs text-slate-800 tracking-tight truncate leading-none capitalize">{tx.category}</h4>
                              
                              {tx.subCategory && (
                                <span className="text-[8px] font-black uppercase bg-slate-100 text-slate-505 border border-slate-200/50 px-1.5 py-0.5 rounded-md leading-none">
                                  {tx.subCategory}
                                </span>
                              )}
                              
                              {tx.paymentMethod && (
                                <span className="text-[8px] font-bold uppercase bg-slate-50 text-slate-400 border px-1 rounded-md leading-none">
                                  {tx.paymentMethod}
                                </span>
                              )}
                            </div>
                            <span className={cn(
                              "text-xs font-mono font-black shrink-0",
                              isIncome ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {isIncome ? "+" : "-"} {formatCurrency(tx.amount)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-slate-400 font-bold">
                              {format(new Date(tx.date), "yyyy-MM-dd hh:mm a")}
                            </p>
                            {canDelete && (
                              <button
                                onClick={() => setTransactionToDelete(tx)}
                                className="opacity-0 group-hover:opacity-100 inline-flex items-center text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-all scale-95 leading-none cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {tx.notes && (
                            <p className="mt-1.5 text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-xl border border-slate-100/75 tracking-tight font-medium">
                              "{tx.notes}"
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Re-usable premium Deletion Modal box */}
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
              <p className="text-sm text-slate-550 mt-2.5 leading-relaxed font-semibold">
                Are you sure you want to delete the <strong className="text-slate-800 font-extrabold">{transactionToDelete.category}</strong> ledger entry of <strong className="text-rose-600 font-mono font-bold">{formatCurrency(transactionToDelete.amount)}</strong>?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <button
                onClick={() => setTransactionToDelete(null)}
                className="py-3 bg-slate-50 border border-slate-205 text-slate-600 rounded-xl font-bold text-xs uppercase cursor-pointer hover:bg-slate-100 transition-all font-semibold"
              >
                No, cancel
              </button>
              <button
                onClick={async () => {
                  const tx = transactionToDelete;
                  setTransactionToDelete(null);
                  await handleDelete(tx);
                }}
                className="py-3 bg-rose-600 text-white rounded-xl font-black text-xs uppercase cursor-pointer hover:bg-rose-700 transition-all shadow-lg"
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
