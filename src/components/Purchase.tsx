import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, updateDoc, increment, where, getDocs } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Supplier, Bank, UserRole, Transaction, SupplierTransaction } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  Plus, Search, Eye, Trash2, Calendar, FileText, Image, ClipboardList, Wallet, Landmark, X, ChevronDown, Check, Download, Printer, RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface PurchaseModel {
  id?: string;
  supplierId: string;
  supplierName: string;
  date: string;
  refNo: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  writtenReturn?: number;
  paymentMethod: string;
  notes?: string;
  invoicePhoto?: string; // base64 representation
  createdAt: string;
}

export default function Purchase({
  user,
  role,
  mode = "list",
  onSuccess
}: {
  user: User;
  role: UserRole;
  mode?: "new" | "list";
  onSuccess?: () => void;
}) {
  const [purchases, setPurchases] = useState<PurchaseModel[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  // Form or list switch
  const [viewState, setViewState] = useState<"list" | "form">(mode === "new" ? "form" : "list");

  // Form state
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [refNo, setRefNo] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [writtenReturn, setWrittenReturn] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [invoicePhoto, setInvoicePhoto] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected Purchase Modal state (for detail view)
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseModel | null>(null);

  // Deletion Confirmation State
  const [purchaseToDelete, setPurchaseToDelete] = useState<PurchaseModel | null>(null);
  const [returnToDelete, setReturnToDelete] = useState<SupplierTransaction | null>(null);

  // Search/Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [entriesLimit, setEntriesLimit] = useState(10);

  // Auto-calculated due
  const dueAmount = Math.max(0, (parseFloat(totalAmount) || 0) - (parseFloat(paidAmount) || 0) - (parseFloat(writtenReturn) || 0));

  // Sub menu split
  const [subMenu, setSubMenu] = useState<"purchases" | "returns">("purchases");
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [adjustType, setAdjustType] = useState<"due" | "refund">("due");

  useEffect(() => {
    // Generate pre-filled transaction ref
    if (viewState === "form" && !refNo) {
      if (subMenu === "purchases") {
        setRefNo(`PUR-${Math.floor(100000 + Math.random() * 900000)}`);
      } else {
        setRefNo(`RET-${Math.floor(100000 + Math.random() * 900000)}`);
      }
    }
  }, [viewState, subMenu, refNo]);

  // Load Data
  useEffect(() => {
    // 1. Snapshot for purchases
    const qPurchases = query(collection(db, "purchases"), orderBy("createdAt", "desc"));
    const unsubPurchases = onSnapshot(qPurchases, (snap) => {
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseModel)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "purchases"));

    // 2. Snapshot for suppliers
    const unsubSuppliers = onSnapshot(collection(db, "suppliers"), (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "suppliers"));

    // 3. Snapshot for banks
    const unsubBanks = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    // 4. Snapshot for supplier transactions
    const qSTx = query(collection(db, "supplierTransactions"), orderBy("createdAt", "desc"));
    const unsubSTx = onSnapshot(qSTx, (snap) => {
      setSupplierTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierTransaction)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "supplierTransactions"));

    return () => {
      unsubPurchases();
      unsubSuppliers();
      unsubBanks();
      unsubSTx();
    };
  }, []);

  // Handle invoice image file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (limit base64 to around ~2MB to prevent Firestore limits issue)
      if (file.size > 2 * 1024 * 1024) {
        alert("Attached image is too large! Please choose an image smaller than 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setInvoicePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Purchase Form
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      alert("Please select a supplier");
      return;
    }

    const totalVal = parseFloat(totalAmount) || 0;
    const paidVal = parseFloat(paidAmount) || 0;
    const returnVal = parseFloat(writtenReturn) || 0;
    if (totalVal <= 0) {
      alert("Total purchase amount must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedSupplier = suppliers.find(s => s.id === supplierId);
      const supplierNameStr = selectedSupplier ? selectedSupplier.name : "Unknown Supplier";

      const netDue = totalVal - paidVal - returnVal;
      const savedDue = Math.max(0, netDue);

      const purchaseData: PurchaseModel = {
        supplierId,
        supplierName: supplierNameStr,
        date,
        refNo: refNo || `PUR-${Date.now()}`,
        totalAmount: totalVal,
        paidAmount: paidVal,
        dueAmount: savedDue,
        writtenReturn: returnVal,
        paymentMethod,
        notes: (notes + (returnVal > 0 ? ` (Auto-deducted purchase return: ৳${returnVal.toFixed(2)})` : "")).trim(),
        invoicePhoto: invoicePhoto || "",
        createdAt: new Date().toISOString()
      };

      // 1. Create Purchase document
      await addDoc(collection(db, "purchases"), purchaseData);

      // 2. Increment supplier totals (Total purchases gross + Supplier Due minus return)
      await updateDoc(doc(db, "suppliers", supplierId), {
        totalAmount: increment(totalVal),
        purchaseDue: increment(netDue)
      });

      // 3. Create Supplier transaction event so it logs in the supplier profile view
      const sTx = {
        supplierId,
        date,
        type: "purchase",
        refNo: purchaseData.refNo,
        totalAmount: totalVal,
        paidAmount: paidVal,
        dueAmount: netDue,
        paymentMethod,
        notes: notes.trim() || "Purchase Bill Registered",
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, "supplierTransactions"), sTx);

      // 3b. Create an automatic companion Purchase Return Transaction event if returnVal > 0
      if (returnVal > 0) {
        const retTx: SupplierTransaction = {
          supplierId,
          date,
          type: "return",
          refNo: `RET-${purchaseData.refNo}`,
          totalAmount: returnVal,
          paymentMethod: "Due Adjusted",
          notes: `Auto adjustment on purchase: ${purchaseData.refNo}. ${notes}`.trim(),
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, "supplierTransactions"), retTx);
      }

      // 4. Save Expense Transaction inside "transactions" collection to properly link with BI Reports
      if (paidVal > 0) {
        // Since paidVal is cash outflow at purchase time, record it as a transactional expense
        const txDoc: Transaction = {
          date: new Date(date + "T12:00:00").toISOString(),
          type: "expense",
          category: "Purchases",
          subCategory: supplierNameStr,
          amount: paidVal,
          paymentMethod,
          notes: `Paid on Purchase: ${purchaseData.refNo}. ${notes}`.trim(),
          createdBy: user.uid
        };
        await addDoc(collection(db, "transactions"), txDoc);

        // Deduct from bank if bank payment
        if (paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === paymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(-paidVal),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }

      // Reset fields
      setSupplierId("");
      setTotalAmount("");
      setPaidAmount("");
      setWrittenReturn("");
      setNotes("");
      setInvoicePhoto("");
      setRefNo("");
      setViewState("list");

      if (onSuccess) onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "purchases");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Purchase
  const confirmDeletePurchase = async () => {
    if (!purchaseToDelete) return;
    const p = purchaseToDelete;
    setPurchaseToDelete(null);
    try {
      if (!p.id) return;
      
      // 1. Delete main purchase document
      await deleteDoc(doc(db, "purchases", p.id));

      // 2. Revert Supplier total caches and outstanding dues
      const originalNetDue = p.totalAmount - p.paidAmount - (p.writtenReturn || 0);
      await updateDoc(doc(db, "suppliers", p.supplierId), {
        totalAmount: increment(-p.totalAmount),
        purchaseDue: increment(-originalNetDue)
      });

      // 3. Clear companion supplierTransactions logs (both the purchase and the auto return)
      const supplierTxQuery = query(
        collection(db, "supplierTransactions"), 
        where("supplierId", "==", p.supplierId)
      );
      const supplierTxSnap = await getDocs(supplierTxQuery);
      for (const dDoc of supplierTxSnap.docs) {
        const txData = dDoc.data();
        if (txData.refNo === p.refNo || txData.refNo === `RET-${p.refNo}`) {
          await deleteDoc(doc(db, "supplierTransactions", dDoc.id));
        }
      }

      // 4. Clear general finance transactions logs to keep Reports & Audit Ledger correct
      const generalTxQuery = query(
        collection(db, "transactions"),
        where("category", "==", "Purchases")
      );
      const generalTxSnap = await getDocs(generalTxQuery);
      for (const dDoc of generalTxSnap.docs) {
        const txData = dDoc.data();
        // If the transaction is linked to this specific purchase invoice
        if (txData.notes?.includes(p.refNo)) {
          await deleteDoc(doc(db, "transactions", dDoc.id));
        }
      }

      // 5. Revert associated bank balance if paymentMethod was not cash
      if (p.paidAmount > 0 && p.paymentMethod !== "Cash") {
        const bank = banks.find(b => b.name === p.paymentMethod);
        if (bank?.id) {
          await updateDoc(doc(db, "banks", bank.id), {
            balance: increment(p.paidAmount),
            lastUpdated: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "purchases");
    }
  };

  // Submit Purchase Return Form
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      alert("Please select a supplier");
      return;
    }

    const amountVal = parseFloat(totalAmount) || 0;
    if (amountVal <= 0) {
      alert("Return amount must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedSupplier = suppliers.find(s => s.id === supplierId);
      const supplierNameStr = selectedSupplier ? selectedSupplier.name : "Unknown Supplier";

      // 1. Create Supplier Transaction document of type "return"
      const returnTx: SupplierTransaction = {
        supplierId,
        date,
        type: "return",
        refNo: refNo || `RET-${Date.now()}`,
        totalAmount: amountVal,
        paymentMethod: adjustType === "refund" ? paymentMethod : "Due Adjusted",
        notes: (notes + (adjustType === "due" ? " (Automatically adjusted from due)" : "")).trim(),
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, "supplierTransactions"), returnTx);

      // 2. Adjust balance
      if (adjustType === "due") {
        // Subtract return amount from Supplier's Due
        await updateDoc(doc(db, "suppliers", supplierId), {
          purchaseDue: increment(-amountVal)
        });
      } else {
        // Direct Refund: Create "income" Transaction in "transactions"
        const txDoc: Transaction = {
          date: new Date(date + "T12:00:00").toISOString(),
          type: "income",
          category: "Purchase Return",
          subCategory: supplierNameStr,
          amount: amountVal,
          paymentMethod,
          notes: `Refund for Purchase Return: ${returnTx.refNo}. ${notes}`.trim(),
          createdBy: user.uid
        };
        await addDoc(collection(db, "transactions"), txDoc);

        // Refund goes into bank/cash account
        if (paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === paymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(amountVal),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }

      // Reset fields
      setSupplierId("");
      setTotalAmount("");
      setNotes("");
      setInvoicePhoto("");
      setRefNo("");
      setViewState("list");

      if (onSuccess) onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "supplierTransactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Purchase Return
  const confirmDeleteReturn = async () => {
    if (!returnToDelete) return;
    const tx = returnToDelete;
    setReturnToDelete(null);
    try {
      if (!tx.id) return;

      // 1. Revert Supplier balance if it was due adjusted
      if (tx.notes?.includes("Automatically adjusted from due") || tx.paymentMethod === "Due Adjusted") {
        await updateDoc(doc(db, "suppliers", tx.supplierId), {
          purchaseDue: increment(tx.totalAmount)
        });
      } else {
        // Direct Refund: Revert cash/bank balance and delete companion income transaction
        if (tx.paymentMethod && tx.paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === tx.paymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(-tx.totalAmount),
              lastUpdated: new Date().toISOString()
            });
          }
        }

        // Fetch companion transaction and delete it
        const txSnap = await getDocs(collection(db, "transactions"));
        const matchingTxDoc = txSnap.docs.find(d => {
          const data = d.data();
          return data.notes?.includes(tx.refNo) && data.type === "income";
        });
        if (matchingTxDoc) {
          await deleteDoc(doc(db, "transactions", matchingTxDoc.id));
        }
      }

      // Delete the return transaction
      await deleteDoc(doc(db, "supplierTransactions", tx.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "supplierTransactions");
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    const text = (p.supplierName + p.refNo + (p.notes || "")).toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const purchaseReturns = supplierTransactions.filter(t => t.type === "return");
  const filteredReturns = purchaseReturns.filter((r) => {
    const sName = suppliers.find(s => s.id === r.supplierId)?.name || "Unknown Supplier";
    const text = (sName + r.refNo + (r.notes || "")).toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  // Export purchases list to CSV (Excel compatible)
  const handleExportCSV = () => {
    const headers = ["Date", "Ref No", "Supplier Name", "Total Amount (৳)", "Paid Amount (৳)", "Due Amount (৳)", "Payment Method", "Notes"];
    const rows = filteredPurchases.map((p) => {
      return [
        p.date ? p.date.replace("T", " ") : "",
        p.refNo,
        p.supplierName,
        p.totalAmount.toFixed(2),
        p.paidAmount.toFixed(2),
        p.dueAmount.toFixed(2),
        p.paymentMethod,
        p.notes || ""
      ];
    });

    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Purchase_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintList = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 print:bg-white print:p-0">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5 print:hidden">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-8 h-8 text-slate-700" />
            {viewState === "form" ? (subMenu === "purchases" ? "New Purchase" : "New Purchase Return") : (subMenu === "purchases" ? "Purchase List" : "Purchase Returns List")}
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {viewState === "form" 
              ? (subMenu === "purchases" ? "Log purchase bills manually without inventory selectors" : "Record item or value returns to any supplier") 
              : (subMenu === "purchases" ? "View historical purchase bills and scan uploads" : "Track outstanding return value adjustments or direct refunds")}
          </p>
        </div>
      </header>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 print:hidden overflow-x-auto gap-4">
        <button
          onClick={() => {
            setSubMenu("purchases");
            setViewState("list");
          }}
          className={cn(
            "pb-3 px-4 font-bold text-sm transition-all relative cursor-pointer",
            subMenu === "purchases"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-400 hover:text-slate-600"
          )}
        >
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <ClipboardList className="w-4 h-4" /> Book Purchases
          </span>
        </button>
        <button
          onClick={() => {
            setSubMenu("returns");
            setViewState("list");
          }}
          className={cn(
            "pb-3 px-4 font-bold text-sm transition-all relative cursor-pointer",
            subMenu === "returns"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-400 hover:text-slate-600"
          )}
        >
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <RotateCcw className="w-4 h-4" /> Purchase Returns
          </span>
        </button>
      </div>

      {/* Main Switch */}
      <AnimatePresence mode="wait">
        {viewState === "form" ? (
          subMenu === "purchases" ? (
            <motion.div
              key="purchase-form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 max-w-3xl mx-auto"
            >
              <form onSubmit={handleSubmitPurchase} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Left Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Supplier <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                      >
                        <option value="">Select Supplier...</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code}) - Due: ৳{s.purchaseDue.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Purchase Date</label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Invoice/Ref No</label>
                      <input
                        type="text"
                        required
                        value={refNo}
                        onChange={(e) => setRefNo(e.target.value)}
                        placeholder="e.g. PUR-12345"
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Payment Method</label>
                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("Cash")}
                          className={cn(
                            "flex items-center justify-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-bold",
                            paymentMethod === "Cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-400 hover:border-gray-300"
                          )}
                        >
                          <Wallet className="w-3.5 h-3.5" /> Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod(banks[0]?.name || "Bank")}
                          className={cn(
                            "flex items-center justify-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-bold",
                            paymentMethod !== "Cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-400 hover:border-gray-300"
                          )}
                        >
                          <Landmark className="w-3.5 h-3.5" /> Bank
                        </button>
                      </div>

                      {paymentMethod !== "Cash" && banks.length > 0 && (
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none"
                        >
                          {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Right Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Total Purchase Amount (৳) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Paid Amount (৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm text-green-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center justify-between">
                        <span>Purchase Return / Written Amount (৳)</span>
                        {writtenReturn && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold">Auto Subtract</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={writtenReturn}
                        onChange={(e) => setWrittenReturn(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm text-amber-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Calculate Due Amount (৳)</label>
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-mono font-bold text-red-600 flex justify-between items-center">
                        <span>৳ {dueAmount.toFixed(2)}</span>
                        {parseFloat(writtenReturn) > 0 && (
                          <span className="text-xs font-sans text-gray-500 font-semibold">
                            (Total: {totalAmount || 0} - Paid: {paidAmount || 0} - Return: {writtenReturn})
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center justify-between">
                        <span>Invoice Photo (Skip if none)</span>
                        {invoicePhoto && (
                          <button
                            type="button"
                            onClick={() => setInvoicePhoto("")}
                            className="text-xs text-red-500 hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="flex-1 flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-gray-200 hover:bg-slate-50 cursor-pointer rounded-2xl text-center group">
                          <Image className="w-5 h-5 text-gray-400 group-hover:text-gray-600 mb-1" />
                          <span className="text-xs text-gray-400 font-medium group-hover:text-gray-600">
                            {invoicePhoto ? "Image selected" : "Click to select invoice photo"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                        {invoicePhoto && (
                          <img
                            src={invoicePhoto}
                            alt="Invoice Thumbnail"
                            className="w-14 h-14 object-cover rounded-xl border border-gray-200 shadow-xs"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Purchase Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Purchased raw materials, boxes, bags, etc."
                    className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs resize-none"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-[#00a65a] hover:bg-[#008d4c] text-white font-semibold py-3 px-10 rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 text-sm font-bold"
                  >
                    {isSubmitting ? "Saving..." : "Save Purchase"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewState("list")}
                    className="bg-slate-200 hover:bg-slate-300 text-gray-750 font-semibold py-3 px-10 rounded-xl transition-all cursor-pointer text-sm font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="purchase-return-form-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 max-w-3xl mx-auto"
            >
              <form onSubmit={handleSubmitReturn} className="space-y-6">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <RotateCcw className="w-5 h-5 text-amber-500" />
                  <h3 className="font-bold text-lg text-slate-950">Record Supplier Purchase Return</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Left Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Supplier <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                      >
                        <option value="">Select Supplier...</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code}) - Due: ৳{s.purchaseDue.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Return Date</label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Return Ref No</label>
                      <input
                        type="text"
                        required
                        value={refNo}
                        onChange={(e) => setRefNo(e.target.value)}
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 font-medium"
                      />
                    </div>
                  </div>

                  {/* Right Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Return Value Amount (৳) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm text-amber-600"
                      />
                      {suppliers.find(s => s.id === supplierId) && adjustType === "due" && (
                        <div className="mt-2.5 p-3 bg-sky-50 rounded-2xl border border-sky-100 text-xs text-sky-800 flex flex-col gap-1">
                          <div className="flex justify-between">
                            <span>Current Outstanding Due:</span>
                            <span className="font-bold">৳{(suppliers.find(s => s.id === supplierId)?.purchaseDue || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-amber-600">
                            <span>Return Worth (Subtracting):</span>
                            <span className="font-bold">- ৳{(parseFloat(totalAmount) || 0).toFixed(2)}</span>
                          </div>
                          <hr className="border-sky-200/50 my-1" />
                          <div className="flex justify-between font-bold text-emerald-700">
                            <span>Estimated Remaining Due:</span>
                            <span>৳{Math.max(0, (suppliers.find(s => s.id === supplierId)?.purchaseDue || 0) - (parseFloat(totalAmount) || 0)).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Adjustment Action</label>
                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <button
                          type="button"
                          onClick={() => setAdjustType("due")}
                          className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-xs font-bold gap-1 text-center cursor-pointer",
                            adjustType === "due" ? "border-sky-505 bg-sky-50 text-sky-750 shadow-xs" : "border-gray-200 text-gray-400 hover:border-gray-300"
                          )}
                        >
                          <Check className="w-4 h-4" />
                          <span>Adjust From Due</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustType("refund")}
                          className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-xs font-bold gap-1 text-center cursor-pointer",
                            adjustType === "refund" ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs" : "border-gray-200 text-gray-400 hover:border-gray-300"
                          )}
                        >
                          <Wallet className="w-4 h-4" />
                          <span>Account Refund</span>
                        </button>
                      </div>
                    </div>

                    {adjustType === "refund" && (
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Refund Account Selector</label>
                        <div className="grid grid-cols-2 gap-3 mb-2">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("Cash")}
                            className={cn(
                              "flex items-center justify-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-bold cursor-pointer",
                              paymentMethod === "Cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-400 hover:border-gray-300"
                            )}
                          >
                            <Wallet className="w-3.5 h-3.5" /> Cash
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod(banks[0]?.name || "Bank")}
                            className={cn(
                              "flex items-center justify-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-bold cursor-pointer",
                              paymentMethod !== "Cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-400 hover:border-gray-300"
                            )}
                          >
                            <Landmark className="w-3.5 h-3.5" /> Bank
                          </button>
                        </div>

                        {paymentMethod !== "Cash" && banks.length > 0 && (
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none"
                          >
                            {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Return Reason / Damage Specifications</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Provide clear reasons for this product return"
                    className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs resize-none"
                  />
                </div>

                {/* Return Form Action buttons */}
                <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-amber-550 hover:bg-amber-600 text-white font-bold py-3 px-10 rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 text-sm"
                  >
                    {isSubmitting ? "Saving Return..." : "Save Product Return"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewState("list")}
                    className="bg-slate-200 hover:bg-slate-300 text-gray-750 font-semibold py-3 px-10 rounded-xl transition-all cursor-pointer text-sm font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          )
        ) : (
          subMenu === "purchases" ? (
            <motion.div
              key="purchase-list-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Box Header Controls */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Historical Purchases Ledger</h2>
                  <button
                    onClick={() => {
                      setSupplierId("");
                      setTotalAmount("");
                      setPaidAmount("");
                      setNotes("");
                      setInvoicePhoto("");
                      setRefNo("");
                      setViewState("form");
                    }}
                    className="bg-[#00c0ef] hover:bg-[#00acd6] text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> New Manual Purchase
                  </button>
                </div>

                {/* Filters & Grid Buttons */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Show</span>
                    <select
                      value={entriesLimit}
                      onChange={(e) => setEntriesLimit(parseInt(e.target.value))}
                      className="border border-gray-200 rounded-lg p-1.5 bg-gray-50 text-xs font-bold"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="bg-emerald-600 hover:bg-[#008d4ccc] text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-[#00a65a]"
                    >
                      <Download className="w-4 h-4" /> Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintList}
                      className="bg-sky-600 hover:bg-sky-750 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-sky-650"
                    >
                      <Printer className="w-4 h-4" /> Print / Save PDF
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 font-medium">Search:</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Supplier / Ref..."
                        className="border border-gray-200 rounded-lg py-1.5 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 bg-gray-50"
                      />
                      <Search className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5" />
                    </div>
                  </div>
                </div>

                {/* Purchase Table */}
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#3182ce] text-white uppercase text-[11px] tracking-wider font-bold">
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Invoice/Ref No</th>
                        <th className="p-3.5">Supplier Name</th>
                        <th className="p-3.5 text-right font-bold">Total Amount</th>
                        <th className="p-3.5 text-right flex-nowrap">Paid</th>
                        <th className="p-3.5 text-right font-bold">Due Amount</th>
                        <th className="p-3.5">Payment Method</th>
                        <th className="p-3.5 text-center">Invoice Photo</th>
                        <th className="p-3.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="p-10 text-center text-gray-400">Loading purchases...</td>
                        </tr>
                      ) : filteredPurchases.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-gray-400">No purchases found.</td>
                        </tr>
                      ) : (
                        filteredPurchases.slice(0, entriesLimit).map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3.5 font-medium whitespace-nowrap">{p.date}</td>
                            <td className="p-3.5 font-bold font-mono text-gray-500">{p.refNo}</td>
                            <td className="p-3.5 font-semibold text-gray-900">{p.supplierName}</td>
                            <td className="p-3.5 text-right font-bold text-gray-900">
                              {formatCurrency(p.totalAmount)}
                            </td>
                            <td className="p-3.5 text-right font-medium text-green-600">
                              {formatCurrency(p.paidAmount)}
                            </td>
                            <td className="p-3.5 text-right font-semibold text-red-650 font-mono">
                              {formatCurrency(p.dueAmount)}
                            </td>
                            <td className="p-3.5">
                              <span className="bg-slate-100 px-2.5 py-0.5 rounded text-xs font-semibold text-gray-600">
                                {p.paymentMethod}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              {p.invoicePhoto ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPurchase(p)}
                                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-bold cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" /> View Photo
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">No Photo</span>
                              )}
                            </td>
                            <td className="p-3.5 text-center space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedPurchase(p)}
                                title="Details"
                                className="text-blue-500 hover:text-blue-700 inline-block p-1 hover:bg-blue-50 rounded cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPurchaseToDelete(p)}
                                title="Delete"
                                className="text-red-550 hover:text-red-750 inline-block p-1 hover:bg-red-50 rounded cursor-pointer"
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
            </motion.div>
          ) : (
            <motion.div
              key="purchase-return-list-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Box Header Controls */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Historical Purchase Returns Ledger</h2>
                    <p className="text-xs text-slate-500 mt-1">Logs of supplier items returned, adjusted from dues, or direct account refunds.</p>
                  </div>
                  <button
                    onClick={() => {
                      setSupplierId("");
                      setTotalAmount("");
                      setNotes("");
                      setRefNo("");
                      setViewState("form");
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Log New Return
                  </button>
                </div>

                {/* Filters & Grid Buttons */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Show</span>
                    <select
                      value={entriesLimit}
                      onChange={(e) => setEntriesLimit(parseInt(e.target.value))}
                      className="border border-gray-200 rounded-lg p-1.5 bg-gray-50 text-xs font-bold"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const headers = ["Return Date", "Ref No", "Supplier Name", "Returned Value (৳)", "Adjustment Mode", "Notes"];
                        const rows = filteredReturns.map((r) => {
                          const sName = suppliers.find(s => s.id === r.supplierId)?.name || "Unknown Supplier";
                          return [
                            r.date,
                            r.refNo,
                            sName,
                            r.totalAmount.toFixed(2),
                            r.paymentMethod || "Due Adjusted",
                            r.notes || ""
                          ];
                        });

                        const csvContent = "\uFEFF" + [
                          headers.join(","),
                          ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
                        ].join("\n");

                        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.setAttribute("download", `Purchase_Returns_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="bg-[#00a65a] hover:bg-[#008d4ccc] text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-[#00a65a]"
                    >
                      <Download className="w-4 h-4" /> Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintList}
                      className="bg-sky-600 hover:bg-sky-750 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-sky-650"
                    >
                      <Printer className="w-4 h-4" /> Print / Save PDF
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 font-medium">Search:</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Ref / Notes..."
                        className="border border-gray-200 rounded-lg py-1.5 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 bg-gray-50"
                      />
                      <Search className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5" />
                    </div>
                  </div>
                </div>

                {/* Return Table */}
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#3182ce] text-white uppercase text-[11px] tracking-wider font-bold">
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Return Ref No</th>
                        <th className="p-3.5">Supplier Name</th>
                        <th className="p-3.5 text-right font-bold">Return Value</th>
                        <th className="p-3.5">Adjustment Mode</th>
                        <th className="p-3.5 flex-1">Reason Notes</th>
                        <th className="p-3.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="p-10 text-center text-gray-400">Loading purchase returns...</td>
                        </tr>
                      ) : filteredReturns.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-400">No returns found.</td>
                        </tr>
                      ) : (
                        filteredReturns.slice(0, entriesLimit).map((r) => {
                          const sName = suppliers.find(s => s.id === r.supplierId)?.name || "Unknown Supplier";
                          return (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3.5 font-medium whitespace-nowrap">{r.date}</td>
                              <td className="p-3.5 font-bold font-mono text-gray-500">{r.refNo}</td>
                              <td className="p-3.5 font-semibold text-gray-900">{sName}</td>
                              <td className="p-3.5 text-right font-bold text-amber-600 font-mono">
                                {formatCurrency(r.totalAmount)}
                              </td>
                              <td className="p-3.5">
                                <span className={cn(
                                  "px-2.5 py-1 rounded text-xs font-bold",
                                  r.paymentMethod === "Due Adjusted" ? "bg-sky-50 text-sky-750 border border-sky-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                )}>
                                  {r.paymentMethod || "Due Adjusted"}
                                </span>
                              </td>
                              <td className="p-3.5 italic text-gray-500 max-w-xs truncate" title={r.notes}>
                                {r.notes || "-"}
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setReturnToDelete(r)}
                                  title="Delete"
                                  className="text-red-500 hover:text-red-700 inline-block p-1 hover:bg-red-50 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Invoice Details with Image Viewer Modal */}
      <AnimatePresence>
        {selectedPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100"
            >
              <div className="bg-[#00c0ef] text-white py-4 px-6 flex items-center justify-between">
                <h3 className="text-lg font-bold">Purchase Order Overview</h3>
                <button
                  onClick={() => setSelectedPurchase(null)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5 pointer-events-auto" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block">Supplier Name</span>
                    <span className="text-sm font-bold text-gray-900">{selectedPurchase.supplierName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block">Reference No</span>
                    <span className="text-sm font-bold font-mono text-gray-900">{selectedPurchase.refNo}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block">Purchase Date</span>
                    <span className="text-sm font-semibold text-gray-800">{selectedPurchase.date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block">Payment Method</span>
                    <span className="text-sm font-semibold text-gray-800">{selectedPurchase.paymentMethod}</span>
                  </div>
                </div>

                <div className="border-t border-b border-gray-100 py-3 grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <span className="text-[9px] font-black text-gray-400 block">TOTAL</span>
                    <span className="text-sm font-extrabold text-gray-900">৳{selectedPurchase.totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="p-2 bg-green-50 rounded-xl">
                    <span className="text-[9px] font-black text-green-700 block">PAID</span>
                    <span className="text-sm font-extrabold text-green-700">৳{selectedPurchase.paidAmount.toFixed(2)}</span>
                  </div>
                  <div className="p-2 bg-red-50 rounded-xl">
                    <span className="text-[9px] font-black text-red-700 block">DUE</span>
                    <span className="text-sm font-extrabold text-red-700">৳{selectedPurchase.dueAmount.toFixed(2)}</span>
                  </div>
                </div>

                {selectedPurchase.notes && (
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block">Notes</span>
                    <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl italic mt-0.5">"{selectedPurchase.notes}"</p>
                  </div>
                )}

                {selectedPurchase.invoicePhoto ? (
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-1">Attached Invoice Photo</span>
                    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-inner bg-slate-100 flex items-center justify-center max-h-[220px]">
                      <img
                        src={selectedPurchase.invoicePhoto}
                        alt="Invoice scan"
                        referrerPolicy="no-referrer"
                        className="object-contain max-h-[220px] w-full"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 bg-slate-50 rounded-xl">
                    <span className="text-xs text-gray-400 font-medium italic">No invoice photo captured/attached.</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end">
                <button
                  onClick={() => setSelectedPurchase(null)}
                  className="bg-gray-900 text-white font-bold text-xs uppercase px-5 py-2.5 rounded-xl block transition-all"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Purchase Delete Modal */}
        {purchaseToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Purchase?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete this purchase entry? This will delete all companion ledger records and reverse calculations.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPurchaseToDelete(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeletePurchase}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Purchase Return Delete Modal */}
        {returnToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Purchase Return?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete this purchase return entry? This will reverse all ledger calculations and bank/supplier balances.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReturnToDelete(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteReturn}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
