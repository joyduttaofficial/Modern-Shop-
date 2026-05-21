import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, where, getDocs, updateDoc, increment } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Supplier, SupplierTransaction, UserRole, Bank } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  Users, Plus, Trash2, CreditCard, History, Wallet, UserCircle, Landmark, X, Eye, Pencil, 
  Search, ArrowDownRight, ArrowUpRight, Check, CheckSquare, ClipboardList, Shield, ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function Suppliers({
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State for Supplier Create/Update
  const [viewState, setViewState] = useState<"list" | "form" | "profile">(mode === "new" ? "form" : "list");
  
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [country, setCountry] = useState("Bangladesh");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  // Search State
  const [searchTerm, setSearchTerm] = useState("");
  const [entriesLimit, setEntriesLimit] = useState(10);

  // Selected Profile state
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [profileTab, setProfileTab] = useState<"purchases" | "payments">("purchases");

  // Dynamic Modals States
  const [activeModal, setActiveModal] = useState<"payDue" | "payReturn" | "addPurchase" | "addReturn" | null>(null);
  const [modalSupplier, setModalSupplier] = useState<Supplier | null>(null);

  // Modal Form Inputs
  const [modalDate, setModalDate] = useState(new Date().toISOString().split("T")[0]);
  const [modalAmount, setModalAmount] = useState("");
  const [modalPaidAmount, setModalPaidAmount] = useState("");
  const [modalPaymentMethod, setModalPaymentMethod] = useState("Cash");
  const [modalRefNo, setModalRefNo] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [submittingModal, setSubmittingModal] = useState(false);

  // Load Initial Data
  useEffect(() => {
    // 1. Snapshot for suppliers
    const qSuppliers = query(collection(db, "suppliers"), orderBy("createdAt", "desc"));
    const unsubSuppliers = onSnapshot(qSuppliers, (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "suppliers"));

    // 2. Snapshot for banks
    const unsubBanks = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    // 3. Snapshot for transactions
    const qTransactions = query(collection(db, "supplierTransactions"), orderBy("date", "desc"));
    const unsubTransactions = onSnapshot(qTransactions, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierTransaction)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "supplierTransactions"));

    return () => {
      unsubSuppliers();
      unsubBanks();
      unsubTransactions();
    };
  }, []);

  // Set form fields when editing or clearing
  useEffect(() => {
    if (editingSupplier) {
      setName(editingSupplier.name);
      setMobile(editingSupplier.mobile || "");
      setEmail(editingSupplier.email || "");
      setPhone(editingSupplier.phone || "");
      setOpeningBalance(editingSupplier.openingBalance.toString());
      setCountry(editingSupplier.country);
      setAdvanceAmount(editingSupplier.advanceAmount.toString());
      setAddress(editingSupplier.address || "");
      setStatus(editingSupplier.status);
    } else {
      setName("");
      setMobile("");
      setEmail("");
      setPhone("");
      setOpeningBalance("0");
      setCountry("Bangladesh");
      setAdvanceAmount("0");
      setAddress("");
      setStatus("active");
    }
  }, [editingSupplier]);

  // Generate Unique Supplier Code
  const getNextSupplierCode = () => {
    if (suppliers.length === 0) return "BD001";
    // Check if there are code formats like BDxxx
    const bdCodes = suppliers
      .map((s) => parseInt(s.code.replace(/(BD|IND|SUP)/i, "")))
      .filter((num) => !isNaN(num));
    const maxNum = bdCodes.length > 0 ? Math.max(...bdCodes) : 0;
    const nextNum = maxNum + 1;
    const prefix = country === "Bangladesh" ? "BD" : country === "India" ? "IND" : "SUP";
    return `${prefix}${String(nextNum).padStart(3, "0")}`;
  };

  // Submit Supplier Add/Update Form
  const handleSubmitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const codeStr = editingSupplier ? editingSupplier.code : getNextSupplierCode();
      const sData = {
        name,
        code: codeStr,
        mobile: mobile.trim() || "",
        email: email.trim() || "",
        phone: phone.trim() || "",
        openingBalance: parseFloat(openingBalance) || 0,
        country,
        advanceAmount: parseFloat(advanceAmount) || 0,
        address: address.trim() || "",
        status,
        totalAmount: editingSupplier ? editingSupplier.totalAmount : 0, // dynamic or saved total
        purchaseDue: editingSupplier ? editingSupplier.purchaseDue : (parseFloat(openingBalance) || 0),
        createdAt: editingSupplier ? editingSupplier.createdAt : new Date().toISOString()
      };

      if (editingSupplier?.id) {
        // Update
        await updateDoc(doc(db, "suppliers", editingSupplier.id), sData);
      } else {
        // Create
        await addDoc(collection(db, "suppliers"), sData);
      }

      setViewState("list");
      setEditingSupplier(null);
      if (onSuccess) onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "suppliers");
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this supplier?")) return;
    try {
      await deleteDoc(doc(db, "suppliers", id));
      if (selectedSupplier?.id === id) {
        setSelectedSupplier(null);
        setViewState("list");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "suppliers");
    }
  };

  // Calculate specific metrics for a supplier based on transactions + opening balance
  const getSupplierFinances = (supplier: Supplier) => {
    const sTransactions = transactions.filter(t => t.supplierId === supplier.id);
    
    // Purchases summation
    const totalPurchases = sTransactions
      .filter(t => t.type === "purchase")
      .reduce((sum, t) => sum + t.totalAmount, 0);

    // Returns summation
    const totalReturns = sTransactions
      .filter(t => t.type === "return")
      .reduce((sum, t) => sum + t.totalAmount, 0);

    // Payments summation
    const totalPayments = sTransactions
      .filter(t => t.type === "payment")
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const netPurchases = supplier.openingBalance + totalPurchases - totalReturns;
    const remainingDue = netPurchases - totalPayments;

    return {
      totalPurchases: totalPurchases + supplier.openingBalance,
      netPurchases,
      totalReturns,
      totalPayments,
      remainingDue
    };
  };

  // Trigger modal operations and populate default inputs
  const openModal = (type: "payDue" | "payReturn" | "addPurchase" | "addReturn", s: Supplier) => {
    setModalSupplier(s);
    setModalDate(new Date().toISOString().split("T")[0]);
    setModalRefNo(`TX-${Math.floor(100000 + Math.random() * 900000)}`);
    setModalNotes("");
    setModalPaymentMethod("Cash");

    const finances = getSupplierFinances(s);

    if (type === "payDue") {
      setModalAmount(Math.max(0, finances.remainingDue).toFixed(2));
    } else if (type === "payReturn") {
      setModalAmount(finances.totalReturns.toFixed(2));
    } else {
      setModalAmount("");
    }
    setModalPaidAmount("");
    setActiveModal(type);
  };

  // Handle all transactions submission
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSupplier || !modalSupplier.id || !modalAmount) return;
    setSubmittingModal(true);

    try {
      const amountVal = parseFloat(modalAmount) || 0;
      const refTx = {
        supplierId: modalSupplier.id,
        date: modalDate,
        type: "payment", // fallback
        refNo: modalRefNo,
        totalAmount: amountVal,
        paymentMethod: modalPaymentMethod,
        notes: modalNotes,
        createdAt: new Date().toISOString()
      };

      if (activeModal === "payDue") {
        refTx.type = "payment";
        // Deduct from bank if not Cash and matches a real bank
        if (modalPaymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === modalPaymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(-amountVal),
              lastUpdated: new Date().toISOString()
            });
          }
        }
        await addDoc(collection(db, "supplierTransactions"), refTx);

        // Update supplier document due property for cached list checks
        await updateDoc(doc(db, "suppliers", modalSupplier.id), {
          purchaseDue: increment(-amountVal)
        });

      } else if (activeModal === "payReturn") {
        refTx.type = "payment"; // Pays the refund back
        refTx.notes = `Return Refund Received: ${modalNotes}`;
        
        // Income is received, so increase cash/bank
        if (modalPaymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === modalPaymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(amountVal),
              lastUpdated: new Date().toISOString()
            });
          }
        }
        await addDoc(collection(db, "supplierTransactions"), refTx);

        // Deduct due
        await updateDoc(doc(db, "suppliers", modalSupplier.id), {
          purchaseDue: increment(-amountVal)
        });

      } else if (activeModal === "addPurchase") {
        // Recording a total-amount based purchase bill
        const paidVal = parseFloat(modalPaidAmount) || 0;
        const dueVal = amountVal - paidVal;

        const purchaseTx: SupplierTransaction = {
          supplierId: modalSupplier.id,
          date: modalDate,
          type: "purchase",
          refNo: modalRefNo,
          totalAmount: amountVal,
          paidAmount: paidVal,
          dueAmount: dueVal,
          paymentMethod: modalPaymentMethod,
          notes: modalNotes,
          createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, "supplierTransactions"), purchaseTx);

        // If paidVal > 0, deduct from Cash/Bank
        if (paidVal > 0 && modalPaymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === modalPaymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(-paidVal),
              lastUpdated: new Date().toISOString()
            });
          }
        }

        // Update supplier totals caches
        await updateDoc(doc(db, "suppliers", modalSupplier.id), {
          totalAmount: increment(amountVal),
          purchaseDue: increment(dueVal)
        });

      } else if (activeModal === "addReturn") {
        // Recording a return
        const adjustDue = window.confirm("Do you want to automatically adjust/minus this return amount from the supplier's due amount?");
        
        const returnTx: SupplierTransaction = {
          supplierId: modalSupplier.id,
          date: modalDate,
          type: "return",
          refNo: modalRefNo,
          totalAmount: amountVal,
          notes: modalNotes + (adjustDue ? " (Automatically adjusted from due)" : ""),
          createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, "supplierTransactions"), returnTx);

        if (adjustDue) {
          // Subtract from due
          await updateDoc(doc(db, "suppliers", modalSupplier.id), {
            purchaseDue: increment(-amountVal)
          });
        } else {
          // Increase advance credits instead
          await updateDoc(doc(db, "suppliers", modalSupplier.id), {
            advanceAmount: increment(amountVal)
          });
        }
      }

      // Sync the selected supplier view in profile if active
      if (selectedSupplier?.id === modalSupplier.id) {
        const updatedSupplier = suppliers.find(s => s.id === modalSupplier.id);
        if (updatedSupplier) {
          setSelectedSupplier(updatedSupplier);
        }
      }

      setActiveModal(null);
      setModalSupplier(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "supplierTransactions");
    } finally {
      setSubmittingModal(false);
    }
  };

  // Flags generator
  const getCountryFlag = (countryCode: string) => {
    switch (countryCode.toLowerCase()) {
      case "bangladesh":
        return "🇧🇩";
      case "india":
        return "🇮🇳";
      default:
        return "🏳️";
    }
  };

  // Filter and search
  const filteredSuppliers = suppliers.filter((s) => {
    const text = (s.name + s.code + (s.mobile || "") + s.country).toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="w-full bg-[#F5F5F4] min-h-screen">
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-gray-700" />
            {viewState === "form" ? "Suppliers" : viewState === "profile" ? "Supplier Profile" : "Suppliers List"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {viewState === "form" ? "Add/Update Suppliers" : viewState === "profile" ? `Ledger and interactions for ${selectedSupplier?.name}` : "View/Search Suppliers"}
          </p>
        </div>
        <div className="text-xs font-medium text-gray-500 mt-2 md:mt-0">
          Home &gt; {viewState === "form" ? "Add/Update Supplier" : viewState === "profile" ? "Supplier Profile" : "Suppliers List"}
        </div>
      </div>

      {/* Main Switch */}
      <AnimatePresence mode="wait">
        {viewState === "form" && (
          <motion.div
            key="supplier-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 max-w-4xl mx-auto"
          >
            <form onSubmit={handleSubmitSupplier} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Side fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Supplier Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. সততা এন্টারপ্রাইজ"
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Mobile</label>
                    <input
                      type="text"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="e.g. +8801700000000"
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. info@supplier.com"
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Opening Balance</label>
                    <input
                      type="number"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* Right Side Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Country</label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="Bangladesh">Bangladesh</option>
                      <option value="India">India</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Advance Amount</label>
                    <input
                      type="number"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Total Amount</label>
                    <input
                      type="text"
                      disabled
                      value={editingSupplier ? editingSupplier.totalAmount.toFixed(2) : "0.00"}
                      className="w-full p-3 rounded-2xl border border-gray-105 bg-gray-50 text-gray-400 text-sm cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
                    <textarea
                      rows={4}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Full business address"
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                      className="w-full p-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-100">
                <button
                  type="submit"
                  className="bg-[#00a65a] hover:bg-[#008d4c] text-white font-semibold py-3 px-10 rounded-xl transition-all shadow-md shadow-green-100"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewState("list");
                    setEditingSupplier(null);
                  }}
                  className="bg-[#f39c12] hover:bg-[#e08e0b] text-white font-semibold py-3 px-10 rounded-xl transition-all shadow-md shadow-orange-100"
                >
                  Close
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {viewState === "list" && (
          <motion.div
            key="supplier-list-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Box Header Controls */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <h2 className="text-xl font-bold text-gray-900">Suppliers List</h2>
                <button
                  onClick={() => {
                    setEditingSupplier(null);
                    setViewState("form");
                  }}
                  className="bg-[#00c0ef] hover:bg-[#00acd6] text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> New Supplier
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
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {["Copy", "Excel", "PDF", "Print", "CSV", "Columns"].map((bLabel) => (
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
                      className="border border-gray-200 rounded-lg py-1.5 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 md:w-60 bg-gray-50"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              {/* Responsive Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#3182ce] text-white uppercase text-[11px] tracking-wider font-bold">
                      <th className="p-3.5 w-12 text-center">
                        <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" />
                      </th>
                      <th className="p-3.5">Supplier ID</th>
                      <th className="p-3.5">Supplier Name</th>
                      <th className="p-3.5">Country</th>
                      <th className="p-3.5 text-right">Total (৳)</th>
                      <th className="p-3.5 text-right">Purchase Due (৳)</th>
                      <th className="p-3.5 text-right">Deposit Amount (৳)</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-gray-400">
                          Loading suppliers...
                        </td>
                      </tr>
                    ) : filteredSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-gray-400">
                          No suppliers found. Click "+ New Supplier" to add one.
                        </td>
                      </tr>
                    ) : (
                      filteredSuppliers.slice(0, entriesLimit).map((s) => {
                        const finances = getSupplierFinances(s);
                        return (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3.5 text-center">
                              <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" />
                            </td>
                            <td className="p-3.5 font-bold text-gray-500">{s.code}</td>
                            <td className="p-3.5 font-semibold text-gray-900">{s.name}</td>
                            <td className="p-3.5 font-medium">
                              <span className="mr-1.5">{getCountryFlag(s.country)}</span>
                              {s.country}
                            </td>
                            <td className="p-3.5 text-right font-medium">
                              {formatCurrency(finances.totalPurchases)}
                            </td>
                            <td className="p-3.5 text-right">
                              <span className={cn(
                                "font-bold font-mono px-2 py-0.5 rounded text-xs",
                                finances.remainingDue > 0 ? "text-red-600 bg-red-50" : "text-green-600 bg-green-50"
                              )}>
                                {formatCurrency(finances.remainingDue)}
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-medium">
                              {formatCurrency(s.advanceAmount)}
                            </td>
                            <td className="p-3.5">
                              <span className={cn(
                                "text-[10px] font-extrabold uppercase px-2.5 py-1 rounded inline-block text-white",
                                s.status === "active" ? "bg-[#00a65a]" : "bg-red-500"
                              )}>
                                {s.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-center relative">
                              <div className="inline-block text-left group">
                                <button className="bg-[#337ab7] hover:bg-[#286090] text-white text-xs font-semibold py-1.5 px-3 rounded flex items-center gap-1 transition-all">
                                  Action <ChevronDown className="w-3 h-3" />
                                </button>
                                
                                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-left hidden group-hover:block z-20">
                                  <button
                                    onClick={() => {
                                      setSelectedSupplier(s);
                                      setViewState("profile");
                                    }}
                                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-slate-100 font-semibold flex items-center gap-2"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-500" /> View Details
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingSupplier(s);
                                      setViewState("form");
                                    }}
                                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-slate-100 font-semibold flex items-center gap-2"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-green-500" /> Edit
                                  </button>
                                  <button
                                    onClick={() => openModal("payDue", s)}
                                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-slate-100 font-semibold flex items-center gap-2"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-orange-500" /> Pay Due Payments
                                  </button>
                                  <button
                                    onClick={() => openModal("payReturn", s)}
                                    className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-slate-100 font-semibold flex items-center gap-2"
                                  >
                                    <History className="w-3.5 h-3.5 text-indigo-500" /> Pay Return Due
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSupplier(s.id!)}
                                    className="w-full px-4 py-2 text-xs text-red-600 hover:bg-red-50 font-semibold flex items-center gap-2 border-t border-gray-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                </div>
                              </div>
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
        )}

        {viewState === "profile" && selectedSupplier && (
          <motion.div
            key="supplier-profile-view"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Top Profile Card */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 text-blue-700 rounded-3xl flex items-center justify-center font-bold text-2xl shadow-sm">
                    {selectedSupplier.name.substring(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900">{selectedSupplier.name}</h2>
                      <span className="text-xs bg-slate-100 text-gray-500 font-mono px-2 py-0.5 rounded font-semibold">{selectedSupplier.code}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selectedSupplier.mobile || "No Mobile"} • {selectedSupplier.email || "No Email"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {getCountryFlag(selectedSupplier.country)} {selectedSupplier.country} • {selectedSupplier.address || "No Address Added"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => openModal("addPurchase", selectedSupplier)}
                    className="bg-[#00a65a] hover:bg-[#008d4c] text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Create Purchase
                  </button>
                  <button
                    onClick={() => openModal("addReturn", selectedSupplier)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm flex items-center gap-1.5"
                  >
                    <ArrowDownRight className="w-4 h-4" /> Create Return
                  </button>
                  <button
                    onClick={() => openModal("payDue", selectedSupplier)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm flex items-center gap-1.5"
                  >
                    <CreditCard className="w-4 h-4" /> Pay Due
                  </button>
                  <button
                    onClick={() => setViewState("list")}
                    className="bg-slate-200 hover:bg-slate-300 text-gray-700 text-xs font-bold py-2.5 px-4 rounded-lg transition-colors"
                  >
                    Back to List
                  </button>
                </div>
              </div>

              {/* Dynamic balances grid */}
              {(() => {
                const finances = getSupplierFinances(selectedSupplier);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                      <p className="text-[10px] uppercase font-extrabold text-blue-600 tracking-wider">Gross Purchases</p>
                      <h3 className="text-xl font-bold mt-1 text-gray-900">{formatCurrency(finances.totalPurchases)}</h3>
                      <p className="text-[10px] text-gray-500 mt-1">Incl. {formatCurrency(selectedSupplier.openingBalance)} opening</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-yellow-50 border border-yellow-100">
                      <p className="text-[10px] uppercase font-extrabold text-yellow-700 tracking-wider">Total Returns</p>
                      <h3 className="text-xl font-bold mt-1 text-gray-900">{formatCurrency(finances.totalReturns)}</h3>
                      <p className="text-[10px] text-gray-500 mt-1">Items refunded or adjusted</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-green-50 border border-green-100">
                      <p className="text-[10px] uppercase font-extrabold text-[#00a65a] tracking-wider">Total Paid Payments</p>
                      <h3 className="text-xl font-bold mt-1 text-gray-900">{formatCurrency(finances.totalPayments)}</h3>
                      <p className="text-[10px] text-gray-500 mt-1">Paid through all methods</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                      <p className="text-[10px] uppercase font-extrabold text-red-600 tracking-wider">Current Balance Due</p>
                      <h3 className="text-xl font-bold mt-1 text-red-600">{formatCurrency(finances.remainingDue)}</h3>
                      <p className="text-[10px] text-gray-500 mt-1">Net pending to supplier</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Profile Transaction Tabs and Logs */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <div className="flex border-b border-gray-100 gap-4 mb-4">
                <button
                  onClick={() => setProfileTab("purchases")}
                  className={cn(
                    "pb-3 text-sm font-semibold transition-all relative",
                    profileTab === "purchases" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  Purchases & Returns Historical Ledger
                </button>
                <button
                  onClick={() => setProfileTab("payments")}
                  className={cn(
                    "pb-3 text-sm font-semibold transition-all relative",
                    profileTab === "payments" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  Payment Outflow Logs
                </button>
              </div>

              {/* Tab Outputs */}
              {profileTab === "purchases" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-gray-600 uppercase text-[10px] font-bold tracking-wider border-b border-gray-200">
                        <th className="p-3">Date</th>
                        <th className="p-3">Ref No</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Total Amount (৳)</th>
                        <th className="p-3 text-right">Paid Amount (৳)</th>
                        <th className="p-3 text-right">Pending Due (৳)</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                      {transactions.filter(t => t.supplierId === selectedSupplier.id && (t.type === "purchase" || t.type === "return")).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-400 font-medium">No purchase bills logged yet.</td>
                        </tr>
                      ) : (
                        transactions
                          .filter(t => t.supplierId === selectedSupplier.id && (t.type === "purchase" || t.type === "return"))
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-gray-500">{t.date}</td>
                              <td className="p-3 font-bold font-mono text-gray-800">{t.refNo}</td>
                              <td className="p-3 uppercase">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-extrabold",
                                  t.type === "purchase" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"
                                )}>
                                  {t.type}
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(t.totalAmount)}</td>
                              <td className="p-3 text-right">{t.paidAmount ? formatCurrency(t.paidAmount) : "—"}</td>
                              <td className="p-3 text-right text-red-600 font-bold">{t.dueAmount ? formatCurrency(t.dueAmount) : "0"}</td>
                              <td className="p-3 text-gray-500 italic max-w-xs truncate">{t.notes || "—"}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {profileTab === "payments" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-gray-600 uppercase text-[10px] font-bold tracking-wider border-b border-gray-200">
                        <th className="p-3">Date</th>
                        <th className="p-3">Ref/Receipt No</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Amount Paid (৳)</th>
                        <th className="p-3">Payment Method</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                      {transactions.filter(t => t.supplierId === selectedSupplier.id && t.type === "payment").length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-gray-400 font-medium">No payments logs found.</td>
                        </tr>
                      ) : (
                        transactions
                          .filter(t => t.supplierId === selectedSupplier.id && t.type === "payment")
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-gray-500">{t.date}</td>
                              <td className="p-3 font-bold font-mono text-gray-800">{t.refNo}</td>
                              <td className="p-3 uppercase">
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-extrabold">
                                  payment
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-[#00a65a]">{formatCurrency(t.totalAmount)}</td>
                              <td className="p-3 font-bold text-gray-600">{t.paymentMethod || "Cash"}</td>
                              <td className="p-3 text-gray-500 italic max-w-xs truncate">{t.notes || "—"}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Entry Modals */}
      <AnimatePresence>
        {activeModal && modalSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100"
            >
              {/* Dynamic Modal Headers */}
              {(() => {
                let modalTitle = "";
                let finances = getSupplierFinances(modalSupplier);

                switch (activeModal) {
                  case "payDue":
                    modalTitle = "Pay Due Payments";
                    break;
                  case "payReturn":
                    modalTitle = "Pay purchase Return Due Payments";
                    break;
                  case "addPurchase":
                    modalTitle = "Logs New Purchase Bill";
                    break;
                  case "addReturn":
                    modalTitle = "Record Return Item/Value";
                    break;
                }

                return (
                  <div>
                    <div className="bg-[#00c0ef] text-white py-4 px-6 flex items-center justify-between">
                      <h3 className="text-lg font-bold">{modalTitle}</h3>
                      <button onClick={() => setActiveModal(null)} className="text-white/80 hover:text-white transition-colors">
                        <X className="w-5 h-5 pointer-events-auto" />
                      </button>
                    </div>

                    <div className="p-6">
                      <p className="text-xs text-gray-400 uppercase tracking-widest font-extrabold">Supplier Details</p>
                      <h4 className="text-lg font-bold text-gray-900 mt-1">{modalSupplier.name}</h4>

                      {/* Info balance panels showing matching design */}
                      <div className="bg-blue-50/50 rounded-2xl grid grid-cols-3 gap-1 p-4 border border-blue-50 mt-4 mb-6 text-center">
                        <div>
                          <p className="text-[9px] uppercase font-bold text-gray-400">
                            {activeModal === "payDue" ? "Total Due" : activeModal === "payReturn" ? "Total Purchase" : "Original Due"}
                          </p>
                          <p className="text-sm font-bold text-gray-800 mt-0.5">
                            ৳ {activeModal === "payDue" ? finances.remainingDue.toFixed(2) : activeModal === "payReturn" ? finances.totalPurchases.toFixed(2) : finances.remainingDue.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase font-bold text-gray-400">
                            {activeModal === "payDue" ? "Paid Payment" : activeModal === "payReturn" ? "Paid Payment" : "Total Refunds"}
                          </p>
                          <p className="text-sm font-bold text-gray-800 mt-0.5">
                            ৳ {activeModal === "payDue" ? finances.totalPayments.toFixed(2) : activeModal === "payReturn" ? finances.totalPayments.toFixed(2) : finances.totalReturns.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase font-bold text-gray-400">Remaining Due</p>
                          <p className="text-sm font-bold text-red-600 mt-0.5">
                            ৳ {finances.remainingDue.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <form onSubmit={handleModalSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                            <input
                              type="date"
                              required
                              value={modalDate}
                              onChange={(e) => setModalDate(e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                              {activeModal === "addPurchase" ? "Total Invoice Amount" : "Amount"}
                            </label>
                            <input
                              type="number"
                              required
                              step="any"
                              value={modalAmount}
                              onChange={(e) => setModalAmount(e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                            />
                          </div>
                        </div>

                        {activeModal === "addPurchase" && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Paid Amount</label>
                              <input
                                type="number"
                                required
                                step="any"
                                value={modalPaidAmount}
                                onChange={(e) => setModalPaidAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Outstanding Balance (Due)</label>
                              <input
                                type="text"
                                disabled
                                value={((parseFloat(modalAmount) || 0) - (parseFloat(modalPaidAmount) || 0)).toFixed(2)}
                                className="w-full p-2.5 rounded-xl border bg-gray-50 text-gray-400 text-sm cursor-not-allowed font-bold"
                              />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Type</label>
                            <select
                              value={modalPaymentMethod}
                              onChange={(e) => setModalPaymentMethod(e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-gray-700"
                            >
                              <option value="Cash">Cash</option>
                              {banks.map(b => (
                                <option key={b.id} value={b.name}>{b.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Reference No</label>
                            <input
                              type="text"
                              required
                              value={modalRefNo}
                              onChange={(e) => setModalRefNo(e.target.value)}
                              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Note</label>
                          <textarea
                            rows={3}
                            value={modalNotes}
                            onChange={(e) => setModalNotes(e.target.value)}
                            placeholder="Add reference notes about purchase, refund, or supplier bank checks"
                            className="w-full p-2.5 rounded-xl border border-gray-200 text-xs resize-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setActiveModal(null)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 px-5 rounded-lg transition-colors text-sm"
                          >
                            Close
                          </button>
                          <button
                            type="submit"
                            disabled={submittingModal}
                            className="bg-[#00a65a] hover:bg-[#008d4c] text-white font-bold py-2 px-5 rounded-lg transition-colors text-sm flex items-center gap-1.5 shadow-sm"
                          >
                            {submittingModal ? "Saving..." : "Save"} <Check className="w-4 h-4" />
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
