import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, updateDoc, increment } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Supplier, Bank, UserRole, Transaction } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  Plus, Search, Eye, Trash2, Calendar, FileText, Image, ClipboardList, Wallet, Landmark, X, ChevronDown, Check
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
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [invoicePhoto, setInvoicePhoto] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected Purchase Modal state (for detail view)
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseModel | null>(null);

  // Search/Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [entriesLimit, setEntriesLimit] = useState(10);

  // Auto-calculated due
  const dueAmount = Math.max(0, (parseFloat(totalAmount) || 0) - (parseFloat(paidAmount) || 0));

  useEffect(() => {
    // Generate pre-filled transaction ref
    if (viewState === "form" && !refNo) {
      setRefNo(`PUR-${Math.floor(100000 + Math.random() * 900000)}`);
    }
  }, [viewState]);

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

    return () => {
      unsubPurchases();
      unsubSuppliers();
      unsubBanks();
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
    if (totalVal <= 0) {
      alert("Total purchase amount must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedSupplier = suppliers.find(s => s.id === supplierId);
      const supplierNameStr = selectedSupplier ? selectedSupplier.name : "Unknown Supplier";

      const purchaseData: PurchaseModel = {
        supplierId,
        supplierName: supplierNameStr,
        date,
        refNo: refNo || `PUR-${Date.now()}`,
        totalAmount: totalVal,
        paidAmount: paidVal,
        dueAmount: totalVal - paidVal,
        paymentMethod,
        notes: notes.trim() || "",
        invoicePhoto: invoicePhoto || "",
        createdAt: new Date().toISOString()
      };

      // 1. Create Purchase document
      await addDoc(collection(db, "purchases"), purchaseData);

      // 2. Increment supplier totals (Total purchases gross + Supplier Due)
      await updateDoc(doc(db, "suppliers", supplierId), {
        totalAmount: increment(totalVal),
        purchaseDue: increment(totalVal - paidVal)
      });

      // 3. Create Supplier transaction event so it logs in the supplier profile view
      const sTx = {
        supplierId,
        date,
        type: "purchase",
        refNo: purchaseData.refNo,
        totalAmount: totalVal,
        paidAmount: paidVal,
        dueAmount: totalVal - paidVal,
        paymentMethod,
        notes: notes.trim() || "Purchase Bill Registered",
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, "supplierTransactions"), sTx);

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
  const handleDeletePurchase = async (p: PurchaseModel) => {
    if (!window.confirm("Are you sure you want to delete this purchase entry? This will delete all companion ledger records and reverse calculations.")) return;
    try {
      if (!p.id) return;
      
      // 1. Delete main purchase document
      await deleteDoc(doc(db, "purchases", p.id));

      // 2. Revert Supplier total caches and outstanding dues
      await updateDoc(doc(db, "suppliers", p.supplierId), {
        totalAmount: increment(-p.totalAmount),
        purchaseDue: increment(-p.dueAmount)
      });

      // 3. Clear companion supplierTransactions logs
      const supplierTxQuery = query(
        collection(db, "supplierTransactions"), 
        where("supplierId", "==", p.supplierId),
        where("refNo", "==", p.refNo)
      );
      const supplierTxSnap = await getDocs(supplierTxQuery);
      for (const dDoc of supplierTxSnap.docs) {
        await deleteDoc(doc(db, "supplierTransactions", dDoc.id));
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

  const filteredPurchases = purchases.filter((p) => {
    const text = (p.supplierName + p.refNo + (p.notes || "")).toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="w-full bg-[#F5F5F4] min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-gray-700" />
            {viewState === "form" ? "New Purchase" : "Purchase List"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {viewState === "form" ? "Log purchase bills manually without inventory selectors" : "View historical purchases and invoice scans"}
          </p>
        </div>
        <div className="text-xs font-medium text-gray-500 mt-2 md:mt-0">
          Home &gt; Purchases &gt; {viewState === "form" ? "New" : "All List"}
        </div>
      </div>

      {/* Main Switch */}
      <AnimatePresence mode="wait">
        {viewState === "form" ? (
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
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Calculate Due Amount (৳)</label>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-mono font-bold text-red-600">
                      ৳ {dueAmount.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center justify-between">
                      <span>Invoice Photo (Skip if none)</span>
                      {invoicePhoto && (
                        <button
                          type="button"
                          onClick={() => setInvoicePhoto("")}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-gray-205 hover:bg-slate-50 cursor-pointer rounded-2xl text-center group">
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
                  className="bg-[#00a65a] hover:bg-[#008d4c] text-white font-semibold py-3 px-10 rounded-xl transition-all shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Purchase"}
                </button>
                <button
                  type="button"
                  onClick={() => setViewState("list")}
                  className="bg-slate-200 hover:bg-slate-300 text-gray-700 font-semibold py-3 px-10 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
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
                  className="bg-[#00c0ef] hover:bg-[#00acd6] text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-sm"
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

                <div className="flex items-center gap-1 flex-wrap">
                  {["Copy", "Excel", "PDF", "Print"].map((bLabel) => (
                    <button
                      key={bLabel}
                      onClick={() => alert(`${bLabel} successfully simulated.`)}
                      className="bg-[#5bc0de] hover:bg-[#31b0d5] text-white border border-[#46b8da] text-xs font-semibold py-1.5 px-3 rounded text-center transition-colors"
                    >
                      {bLabel}
                    </button>
                  ))}
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
                      <th className="p-3.5 text-right">Paid</th>
                      <th className="p-3.5 text-right">Due Amount</th>
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
                          <td className="p-3.5 text-right font-semibold text-red-600 font-mono">
                            {formatCurrency(p.dueAmount)}
                          </td>
                          <td className="p-3.5">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-semibold text-gray-600">
                              {p.paymentMethod}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            {p.invoicePhoto ? (
                              <button
                                onClick={() => setSelectedPurchase(p)}
                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-bold"
                              >
                                <Eye className="w-3.5 h-3.5" /> View Photo
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">No Photo</span>
                            )}
                          </td>
                          <td className="p-3.5 text-center space-x-2">
                            <button
                              onClick={() => setSelectedPurchase(p)}
                              title="Details"
                              className="text-blue-500 hover:text-blue-700 inline-block p-1 hover:bg-blue-50 rounded"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {role === "admin" && (
                              <button
                                onClick={() => handleDeletePurchase(p)}
                                title="Delete"
                                className="text-red-500 hover:text-red-700 inline-block p-1 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
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
      </AnimatePresence>
    </div>
  );
}
