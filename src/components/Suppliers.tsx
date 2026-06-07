import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, where, getDocs, increment } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, updateDoc } from "@/src/lib/firebase";
import { Supplier, SupplierTransaction, UserRole, Bank } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { 
  Users, Plus, Trash2, CreditCard, History, Wallet, UserCircle, Landmark, X, Eye, Pencil, 
  Search, ArrowDownRight, ArrowUpRight, Check, CheckSquare, ClipboardList, Shield, ChevronDown,
  Printer, ArrowLeft, Receipt, Download
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

  // Corporate identity parameters
  const [companyName, setCompanyName] = useState("Modern Pro");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyPhone, setCompanyPhone] = useState("+880 1234 567890");
  const [companyEmail, setCompanyEmail] = useState("info@modernmanager.com");
  const [companyAddress, setCompanyAddress] = useState("Dhaka, Bangladesh");

  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Pro");
        setCompanyTagline(data.companyTagline || "Automated POS");
        setCompanyLogoUrl(data.companyLogoUrl || "");
        setCompanyPhone(data.companyPhone || "+880 1234 567890");
        setCompanyEmail(data.companyEmail || "info@modernmanager.com");
        setCompanyAddress(data.companyAddress || "Dhaka, Bangladesh");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/company");
    });
    return () => unsubBranding();
  }, []);
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
  const [profileTab, setProfileTab] = useState<"purchases" | "payments" | "returns">("purchases");

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
  const [invoiceTransaction, setInvoiceTransaction] = useState<SupplierTransaction | null>(null);

  // States for Currency Exchange inside Supplier Add Purchase modal
  const [modalExchangeRate, setModalExchangeRate] = useState("70");
  const [modalInrTotalAmount, setModalInrTotalAmount] = useState("");
  const [modalInrPaidAmount, setModalInrPaidAmount] = useState("");

  const handleModalExchangeRateChange = (rateVal: string) => {
    setModalExchangeRate(rateVal);
    const rateFloat = parseFloat(rateVal) || 0;
    
    if (modalInrTotalAmount) {
      const computedBDT = rateFloat > 0 ? ((parseFloat(modalInrTotalAmount) || 0) / rateFloat) * 100 : 0;
      setModalAmount(computedBDT > 0 ? computedBDT.toFixed(2) : "");
    }
    if (modalInrPaidAmount) {
      const computedPaidBDT = rateFloat > 0 ? ((parseFloat(modalInrPaidAmount) || 0) / rateFloat) * 100 : 0;
      setModalPaidAmount(computedPaidBDT > 0 ? computedPaidBDT.toFixed(2) : "");
    }
  };

  const handleModalInrTotalChange = (inrVal: string) => {
    setModalInrTotalAmount(inrVal);
    const rateFloat = parseFloat(modalExchangeRate) || 0;
    const computedBDT = rateFloat > 0 ? ((parseFloat(inrVal) || 0) / rateFloat) * 100 : 0;
    setModalAmount(computedBDT > 0 ? computedBDT.toFixed(2) : "");
  };

  const handleModalInrPaidChange = (inrVal: string) => {
    setModalInrPaidAmount(inrVal);
    const rateFloat = parseFloat(modalExchangeRate) || 0;
    const computedBDT = rateFloat > 0 ? ((parseFloat(inrVal) || 0) / rateFloat) * 100 : 0;
    setModalPaidAmount(computedBDT > 0 ? computedBDT.toFixed(2) : "");
  };

  // Deletion Confirmation States
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);
  const [txToDelete, setTxToDelete] = useState<{ id: string; tx: SupplierTransaction } | null>(null);
  const [modalAdjustDue, setModalAdjustDue] = useState(true);

  const confirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    const id = supplierToDelete;
    setSupplierToDelete(null);
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

  const confirmDeleteTransaction = async () => {
    if (!txToDelete) return;
    const { id: txId, tx: sTx } = txToDelete;
    setTxToDelete(null);
    try {
      const supplierId = sTx.supplierId;
      
      if (sTx.type === "payment") {
        // Revert outstanding due: increment back
        await updateDoc(doc(db, "suppliers", supplierId), {
          purchaseDue: increment(sTx.totalAmount)
        });

        // Revert bank balances
        const isRefund = sTx.notes?.includes("Return Refund Received");
        if (sTx.paymentMethod && sTx.paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === sTx.paymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(isRefund ? -sTx.totalAmount : sTx.totalAmount),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      } else if (sTx.type === "purchase") {
        const paidVal = sTx.paidAmount || 0;
        const dueVal = sTx.dueAmount ?? (sTx.totalAmount - paidVal);

        // Revert totals: subtract from total spend and outstanding dues
        await updateDoc(doc(db, "suppliers", supplierId), {
          totalAmount: increment(-sTx.totalAmount),
          purchaseDue: increment(-dueVal)
        });

        // Revert bank/cash payment
        if (paidVal > 0 && sTx.paymentMethod && sTx.paymentMethod !== "Cash") {
          const bank = banks.find(b => b.name === sTx.paymentMethod);
          if (bank?.id) {
            await updateDoc(doc(db, "banks", bank.id), {
              balance: increment(paidVal),
              lastUpdated: new Date().toISOString()
            });
          }
        }
      } else if (sTx.type === "return") {
        const wasAdjusted = sTx.notes?.includes("(Automatically adjusted from due)") || sTx.notes?.includes("Automatically adjusted from due");
        if (wasAdjusted) {
          // Put the due back
          await updateDoc(doc(db, "suppliers", supplierId), {
            purchaseDue: increment(sTx.totalAmount)
          });
        } else {
          // Revert advance credit note
          await updateDoc(doc(db, "suppliers", supplierId), {
            advanceAmount: increment(-sTx.totalAmount)
          });
        }
      }

      // Delete the actual doc
      await deleteDoc(doc(db, "supplierTransactions", txId));

      // Synchronize in profile state
      if (selectedSupplier?.id === supplierId) {
        const updatedSupplier = suppliers.find(s => s.id === supplierId);
        if (updatedSupplier) {
          setSelectedSupplier(updatedSupplier);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "supplierTransactions");
    }
  };

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

  // Sync selected supplier in real-time when suppliers change
  useEffect(() => {
    if (selectedSupplier) {
      const match = suppliers.find(s => s.id === selectedSupplier.id);
      if (match) {
        setSelectedSupplier(match);
      }
    }
  }, [suppliers, selectedSupplier?.id]);

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

  // Supplier management utilities

  // Calculate specific metrics for a supplier based on transactions + opening balance
  const getSupplierFinances = (supplier: Supplier) => {
    if (!supplier) {
      return {
        openingBalance: 0,
        totalPurchases: 0,
        grossPurchases: 0,
        totalReturns: 0,
        totalPayments: 0,
        remainingDue: 0,
        openingBalanceINR: 0,
        totalPurchasesINR: 0,
        totalReturnsINR: 0,
        totalPaymentsINR: 0,
        remainingDueINR: 0
      };
    }

    const isIndian = supplier.country === "India";
    const sTransactions = transactions.filter(t => t.supplierId === supplier.id);
    
    let totalPurchases = 0;
    let totalPurchasesINR = 0;

    let totalReturns = 0;
    let totalReturnsINR = 0;

    let directPayments = 0;
    let directPaymentsINR = 0;

    let purchaseDownpayments = 0;
    let purchaseDownpaymentsINR = 0;

    sTransactions.forEach(t => {
      const bdtAmount = t.totalAmount || 0;
      const bdtPaid = t.paidAmount || 0;
      
      let rate = 70; // default rate
      let totalINR = 0;
      let paidINR = 0;

      if (isIndian) {
        const notes = t.notes || "";
        const rateMatch = notes.match(/(?:Rate|Exchange Rate):\s*₹?100\s*=\s*(?:৳|BDT)?\s*([\d.]+)/i);
        if (rateMatch) {
          rate = parseFloat(rateMatch[1]) || 70;
        }
        
        const totalMatch = notes.match(/INR Total:\s*₹?\s*([\d.]+)/i);
        if (totalMatch) {
          totalINR = parseFloat(totalMatch[1]) || 0;
        } else {
          totalINR = rate > 0 ? (bdtAmount * rate) / 100 : 0;
        }

        const paidMatch = notes.match(/INR Paid:\s*₹?\s*([\d.]+)/i);
        if (paidMatch) {
          paidINR = parseFloat(paidMatch[1]) || 0;
        } else {
          paidINR = rate > 0 ? (bdtPaid * rate) / 100 : 0;
        }
      }

      if (t.type === "purchase") {
        totalPurchases += bdtAmount;
        totalPurchasesINR += totalINR;
        purchaseDownpayments += bdtPaid;
        purchaseDownpaymentsINR += paidINR;
      } else if (t.type === "return") {
        totalReturns += bdtAmount;
        totalReturnsINR += totalINR;
      } else if (t.type === "payment") {
        directPayments += bdtAmount;
        if (isIndian) {
          const notes = t.notes || "";
          const paymentMatch = notes.match(/(?:INR Total|INR Paid):\s*₹?\s*([\d.]+)/i);
          if (paymentMatch) {
            directPaymentsINR += parseFloat(paymentMatch[1]) || 0;
          } else {
            const rateMatch = notes.match(/(?:Rate|Exchange Rate):\s*₹?100\s*=\s*(?:৳|BDT)?\s*([\d.]+)/i);
            const currentRate = rateMatch ? (parseFloat(rateMatch[1]) || 70) : 70;
            directPaymentsINR += currentRate > 0 ? (bdtAmount * currentRate) / 100 : 0;
          }
        }
      }
    });

    const totalPayments = directPayments + purchaseDownpayments;
    const totalPaymentsINR = directPaymentsINR + purchaseDownpaymentsINR;

    const opBal = supplier.openingBalance || 0;
    const opBalINR = isIndian ? (opBal * 70) / 100 : 0;

    const remainingDue = opBal + totalPurchases - totalPayments - totalReturns;
    const remainingDueINR = opBalINR + totalPurchasesINR - totalPaymentsINR - totalReturnsINR;

    return {
      openingBalance: opBal,
      totalPurchases, // Raw total purchases (exclusive of opening balance)
      grossPurchases: totalPurchases + opBal,
      totalReturns,
      totalPayments,
      remainingDue,
      openingBalanceINR: opBalINR,
      totalPurchasesINR,
      totalReturnsINR,
      totalPaymentsINR,
      remainingDueINR
    };
  };

  // Trigger modal operations and populate default inputs
  const openModal = (type: "payDue" | "payReturn" | "addPurchase" | "addReturn", s: Supplier) => {
    setModalSupplier(s);
    setModalDate(new Date().toISOString().split("T")[0]);
    setModalRefNo(`TX-${Math.floor(100000 + Math.random() * 900000)}`);
    setModalNotes("");
    setModalPaymentMethod("Cash");
    setModalExchangeRate("70");
    setModalInrTotalAmount("");
    setModalInrPaidAmount("");

    const finances = getSupplierFinances(s);
    setModalAdjustDue(true);

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

        let appendNotes = "";
        if (modalSupplier.country === "India" && parseFloat(modalExchangeRate) > 0) {
          appendNotes = ` [Rate: ₹100 = ৳${modalExchangeRate} | INR Total: ₹${parseFloat(modalInrTotalAmount || "0").toFixed(2)} | INR Paid: ₹${parseFloat(modalInrPaidAmount || "0").toFixed(2)}]`;
        }

        const purchaseTx: SupplierTransaction = {
          supplierId: modalSupplier.id,
          date: modalDate,
          type: "purchase",
          refNo: modalRefNo,
          totalAmount: amountVal,
          paidAmount: paidVal,
          dueAmount: dueVal,
          paymentMethod: modalPaymentMethod,
          notes: (modalNotes + appendNotes).trim(),
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
        const adjustDue = modalAdjustDue; // Avoids sandbox-blocking window.confirm!
        
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

  // Transactions reverted and updated correctly

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

  // Export suppliers list to CSV (Excel compatible)
  const handleExportCSV = () => {
    const headers = ["Supplier Code", "Supplier Name", "Country", "Total Purchases (৳)", "Purchase Due (৳)", "Deposit Amount (৳)", "Status"];
    const rows = filteredSuppliers.map((s) => {
      const finances = getSupplierFinances(s);
      return [
        s.code,
        s.name,
        s.country,
        finances.totalPurchases.toFixed(2),
        finances.remainingDue.toFixed(2),
        s.advanceAmount.toFixed(2),
        s.status
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
    link.setAttribute("download", `Suppliers_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintList = () => {
    window.print();
  };

  // Calculate aggregate metrics across ALL suppliers
  const aggregateFinances = (() => {
    let opening = 0;
    let purchases = 0;
    let payments = 0;
    let returns = 0;
    let due = 0;
    
    suppliers.forEach((s) => {
      const f = getSupplierFinances(s);
      opening += f.openingBalance || 0;
      purchases += f.totalPurchases || 0;
      payments += f.totalPayments || 0;
      returns += f.totalReturns || 0;
      due += f.remainingDue || 0;
    });

    return { opening, purchases, payments, returns, due };
  })();

  return (
    <div className="space-y-6 animate-in fade-in duration-200 print:bg-white print:p-0">
      {/* Dynamic Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5 print:hidden">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="w-8 h-8 text-slate-700" />
            {viewState === "form" ? "Suppliers Form" : viewState === "profile" ? "Supplier Profile" : "Suppliers List"}
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {viewState === "form" ? "Add/Update Suppliers details and balance settings." : viewState === "profile" ? `Ledger and interactions for ${selectedSupplier?.name}` : "View & manage your supplier transactions and ledgers."}
          </p>
        </div>
      </header>

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
                      className="w-full p-3 rounded-2xl border border-gray-200 bg-gray-50 text-gray-400 text-sm cursor-not-allowed"
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
                  Leave / Close
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
            className="space-y-6 animate-in fade-in duration-300"
          >
            {/* Aggregate Summary Cards Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
              <div className="p-4 rounded-3xl bg-indigo-50/70 border border-indigo-150 shadow-sm">
                <p className="text-[10px] uppercase font-extrabold text-indigo-700 tracking-wider">Total Opening Balance</p>
                <h3 className="text-xl font-black mt-1.5 text-indigo-950">{formatCurrency(aggregateFinances.opening)}</h3>
                <p className="text-[10px] text-gray-500 mt-1">Initial ledger opening sum</p>
              </div>

              <div className="p-4 rounded-3xl bg-blue-50/70 border border-blue-150 shadow-sm">
                <p className="text-[10px] uppercase font-extrabold text-blue-700 tracking-wider">Total Purchases</p>
                <h3 className="text-xl font-black mt-1.5 text-blue-950">{formatCurrency(aggregateFinances.purchases)}</h3>
                <p className="text-[10px] text-gray-500 mt-1">Excl. opening balance</p>
              </div>

              <div className="p-4 rounded-3xl bg-green-50/70 border border-green-150 shadow-sm">
                <p className="text-[10px] uppercase font-extrabold text-emerald-700 tracking-wider">Total Paid Payments</p>
                <h3 className="text-xl font-black mt-1.5 text-emerald-950">{formatCurrency(aggregateFinances.payments)}</h3>
                <p className="text-[10px] text-gray-500 mt-1">Direct & downpayments total</p>
              </div>

              <div className="p-4 rounded-3xl bg-yellow-50/70 border border-yellow-150 shadow-sm">
                <p className="text-[10px] uppercase font-extrabold text-amber-800 tracking-wider">Total Returns</p>
                <h3 className="text-xl font-black mt-1.5 text-amber-950">{formatCurrency(aggregateFinances.returns)}</h3>
                <p className="text-[10px] text-gray-500 mt-1">Returned items ledger amount</p>
              </div>

              <div className="p-4 rounded-3xl bg-red-50/70 border border-red-150 shadow-sm">
                <p className="text-[10px] uppercase font-extrabold text-red-700 tracking-wider">Total Due Amount</p>
                <h3 className="text-xl font-black mt-1.5 text-red-950">{formatCurrency(aggregateFinances.due)}</h3>
                <p className="text-[10px] text-gray-500 mt-1">Opening + Purchases - Paid - Returns</p>
              </div>
            </div>

            {/* Box Header Controls */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-none print:p-0">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 print:hidden">
                <h2 className="text-xl font-bold text-gray-900">Suppliers List</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplier(null);
                    setViewState("form");
                  }}
                  className="bg-[#00c0ef] hover:bg-[#00acd6] text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> New Supplier
                </button>
              </div>

              {/* Filters & Grid Buttons */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 print:hidden">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Show</span>
                  <select
                    value={entriesLimit}
                    onChange={(e) => setEntriesLimit(parseInt(e.target.value))}
                    className="border border-gray-200 rounded-lg p-1.5 bg-gray-50 text-xs font-bold outline-none"
                  >
                    <option value={5}>5</option>
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
                  <span className="text-sm text-gray-600 font-medium my-auto">Search:</span>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="border border-gray-200 rounded-xl py-1.5 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 md:w-60 bg-gray-50"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              {/* Responsive Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 print:border-none">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#3182ce] text-white uppercase text-[11px] tracking-wider font-bold">
                      <th className="p-3.5 w-12 text-center print:hidden">
                        <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" />
                      </th>
                      <th className="p-3.5">Supplier ID</th>
                      <th className="p-3.5">Supplier Name</th>
                      <th className="p-3.5">Country</th>
                      <th className="p-3.5 text-right text-nowrap">Total Purchases (৳)</th>
                      <th className="p-3.5 text-right text-nowrap">Purchase Due (৳)</th>
                      <th className="p-3.5 text-right text-nowrap">Deposit Amount (৳)</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-center print:hidden">Action</th>
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
                            <td className="p-3.5 text-center print:hidden">
                              <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" />
                            </td>
                            <td className="p-3.5 font-bold text-gray-500 font-mono">{s.code}</td>
                            <td className="p-3.5 font-semibold text-gray-900">{s.name}</td>
                            <td className="p-3.5 font-medium">
                              <span className="mr-1.5 print:hidden">{getCountryFlag(s.country)}</span>
                              {s.country}
                            </td>
                            <td className="p-3.5 text-right font-medium font-mono">
                              {formatCurrency(finances.totalPurchases)}
                            </td>
                            <td className="p-3.5 text-right font-mono">
                              <span className={cn(
                                "font-bold px-2 py-0.5 rounded text-xs",
                                finances.remainingDue > 0 ? "text-red-650 bg-red-50/70" : "text-green-600 bg-green-50"
                              )}>
                                {formatCurrency(finances.remainingDue)}
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-medium font-mono">
                              {formatCurrency(s.advanceAmount)}
                            </td>
                            <td className="p-3.5">
                              <span className={cn(
                                "text-[10px] font-extrabold uppercase px-2.5 py-1 rounded inline-block text-white print:text-black print:bg-transparent print:border print:border-slate-300 print:text-[8px] print:p-0.5",
                                s.status === "active" ? "bg-[#00a65a]" : "bg-red-500"
                              )}>
                                {s.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-center print:hidden">
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSupplier(s);
                                    setViewState("profile");
                                  }}
                                  title="View Details"
                                  className="p-1.5 text-blue-600 hover:text-blue-850 hover:bg-blue-50/70 rounded-lg transition-all cursor-pointer"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSupplier(s);
                                    setViewState("form");
                                  }}
                                  title="Edit"
                                  className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50/70 rounded-lg transition-all cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSupplierToDelete(s.id!)}
                                  title="Delete"
                                  className="p-1.5 text-rose-600 hover:text-rose-850 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Log Purchase
                  </button>
                  <button
                    onClick={() => openModal("addReturn", selectedSupplier)}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <ArrowDownRight className="w-4 h-4" /> Record Return
                  </button>
                  <button
                    onClick={() => openModal("payDue", selectedSupplier)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Wallet className="w-4 h-4" /> Pay Outstanding
                  </button>
                  <button
                    onClick={() => setViewState("list")}
                    className="bg-slate-200 hover:bg-slate-300 text-gray-700 text-xs font-bold py-2 px-3.5 rounded-xl transition-colors cursor-pointer"
                  >
                    Back to List
                  </button>
                </div>
              </div>

              {/* Dynamic balances grid */}
              {(() => {
                const finances = getSupplierFinances(selectedSupplier);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-120 shadow-sm">
                      <p className="text-[10px] uppercase font-extrabold text-indigo-700 tracking-wider">Supplier Opening Balance Amount</p>
                      {selectedSupplier.country === "India" ? (
                        <>
                          <h3 className="text-lg font-black mt-1.5 text-indigo-950">₹{(finances.openingBalanceINR || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                          <p className="text-[10px] text-indigo-700 font-bold mt-1">Converted: {formatCurrency(finances.openingBalance)}</p>
                        </>
                      ) : (
                        <h3 className="text-xl font-black mt-1.5 text-indigo-950">{formatCurrency(finances.openingBalance)}</h3>
                      )}
                      <p className="text-[10px] text-gray-450 mt-1">Opening ledger balance</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-120 shadow-sm">
                      <p className="text-[10px] uppercase font-extrabold text-blue-700 tracking-wider">Total Purchase Amount</p>
                      {selectedSupplier.country === "India" ? (
                        <>
                          <h3 className="text-lg font-black mt-1.5 text-blue-950">₹{(finances.totalPurchasesINR || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                          <p className="text-[10px] text-blue-700 font-bold mt-1">Converted: {formatCurrency(finances.totalPurchases)}</p>
                        </>
                      ) : (
                        <h3 className="text-xl font-black mt-1.5 text-blue-950">{formatCurrency(finances.totalPurchases)}</h3>
                      )}
                      <p className="text-[10px] text-gray-455 mt-1">Excluding opening balance</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-green-50/70 border border-green-120 shadow-sm">
                      <p className="text-[10px] uppercase font-extrabold text-[#00a65a] tracking-wider">Total Payment Amount</p>
                      {selectedSupplier.country === "India" ? (
                        <>
                          <h3 className="text-lg font-black mt-1.5 text-green-950">₹{(finances.totalPaymentsINR || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                          <p className="text-[10px] text-green-700 font-bold mt-1">Converted: {formatCurrency(finances.totalPayments)}</p>
                        </>
                      ) : (
                        <h3 className="text-xl font-black mt-1.5 text-[#00a65a]">{formatCurrency(finances.totalPayments)}</h3>
                      )}
                      <p className="text-[10px] text-gray-455 mt-1">Direct + purchase downpayments</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-yellow-50/70 border border-yellow-120 shadow-sm">
                      <p className="text-[10px] uppercase font-extrabold text-amber-700 tracking-wider">Purchase Return Amount</p>
                      {selectedSupplier.country === "India" ? (
                        <>
                          <h3 className="text-lg font-black mt-1.5 text-amber-950">₹{(finances.totalReturnsINR || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                          <p className="text-[10px] text-amber-700 font-bold mt-1">Converted: {formatCurrency(finances.totalReturns)}</p>
                        </>
                      ) : (
                        <h3 className="text-xl font-black mt-1.5 text-amber-950">{formatCurrency(finances.totalReturns)}</h3>
                      )}
                      <p className="text-[10px] text-gray-455 mt-1">Items returned or adjusted</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-red-50/70 border border-red-120 shadow-sm">
                      <p className="text-[10px] uppercase font-extrabold text-red-650 tracking-wider">Total Due Amount</p>
                      {selectedSupplier.country === "India" ? (
                        <>
                          <h3 className="text-lg font-black mt-1.5 text-red-950">₹{(finances.remainingDueINR || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                          <p className="text-[10px] text-red-700 font-bold mt-1">Converted: {formatCurrency(finances.remainingDue)}</p>
                        </>
                      ) : (
                        <h3 className="text-xl font-black mt-1.5 text-red-650">{formatCurrency(finances.remainingDue)}</h3>
                      )}
                      <p className="text-[10px] text-gray-455 mt-1">Net pending due to supplier</p>
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
                  Purchases Historical Ledger
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
                <button
                  onClick={() => setProfileTab("returns")}
                  className={cn(
                    "pb-3 text-sm font-semibold transition-all relative",
                    profileTab === "returns" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  Product Returns History
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
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                      {transactions.filter(t => t.supplierId === selectedSupplier.id && t.type === "purchase").length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-gray-400 font-medium font-medium">No purchase bills logged yet.</td>
                        </tr>
                      ) : (
                        transactions
                          .filter(t => t.supplierId === selectedSupplier.id && t.type === "purchase")
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-gray-500">{t.date}</td>
                              <td className="p-3 font-bold font-mono text-gray-800">{t.refNo}</td>
                              <td className="p-3 uppercase">
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-700">
                                  {t.type}
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(t.totalAmount)}</td>
                              <td className="p-3 text-right">{t.paidAmount ? formatCurrency(t.paidAmount) : "—"}</td>
                              <td className="p-3 text-right text-red-600 font-bold">{t.dueAmount ? formatCurrency(t.dueAmount) : "0"}</td>
                              <td className="p-3 text-gray-500 italic max-w-xs truncate">{t.notes || "—"}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setInvoiceTransaction(t)}
                                    title="View Proper Invoice"
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setTxToDelete({ id: t.id!, tx: t })}
                                    title="Delete Transaction Record"
                                    className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {profileTab === "returns" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-gray-600 uppercase text-[10px] font-bold tracking-wider border-b border-gray-200">
                        <th className="p-3">Return Date</th>
                        <th className="p-3">Return Ref No</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Return Value (৳)</th>
                        <th className="p-3">Adjustment / Method</th>
                        <th className="p-3">Status/Notes</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                      {transactions.filter(t => t.supplierId === selectedSupplier.id && t.type === "return").length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-400 font-medium">No product returns recorded for this supplier.</td>
                        </tr>
                      ) : (
                        transactions
                          .filter(t => t.supplierId === selectedSupplier.id && t.type === "return")
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-gray-500">{t.date}</td>
                              <td className="p-3 font-bold font-mono text-gray-800">{t.refNo}</td>
                              <td className="p-3 uppercase">
                                <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-extrabold">
                                  {t.type}
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-amber-600">{formatCurrency(t.totalAmount)}</td>
                              <td className="p-3 font-bold text-gray-600">{t.paymentMethod || "Due Adjusted"}</td>
                              <td className="p-3 text-gray-500 italic max-w-xs truncate">{t.notes || "—"}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setInvoiceTransaction(t)}
                                    title="View Return Voucher"
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setTxToDelete({ id: t.id!, tx: t })}
                                    title="Delete Return Record"
                                    className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
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
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                      {transactions.filter(t => t.supplierId === selectedSupplier.id && t.type === "payment").length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-400 font-medium">No payments logs found.</td>
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
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setInvoiceTransaction(t)}
                                    title="View Payment Voucher"
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setTxToDelete({ id: t.id!, tx: t })}
                                    title="Delete Paid Payment Voucher"
                                    className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
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
                        {modalSupplier.country === "India" && activeModal === "addPurchase" && (
                          <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                              <span className="p-1 px-1.5 bg-amber-100 rounded text-[10px]">INR ⇄ BDT</span>
                              Indian Supplier Currency Exchange
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div className="col-span-1">
                                <label className="block text-[9px] font-black uppercase text-amber-700 mb-1">Rate (₹100 = ৳)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={modalExchangeRate}
                                  onChange={(e) => handleModalExchangeRateChange(e.target.value)}
                                  placeholder="143"
                                  className="w-full p-2 bg-white rounded-xl border border-amber-200 text-xs font-bold text-amber-900 focus:outline-[#f59e0b]"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[9px] font-black uppercase text-amber-700 mb-1">Gross Purchase (₹ INR)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={modalInrTotalAmount}
                                  onChange={(e) => handleModalInrTotalChange(e.target.value)}
                                  placeholder="₹0.00"
                                  className="w-full p-2 bg-white rounded-xl border border-amber-200 text-xs font-bold text-amber-900 focus:outline-[#f59e0b]"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div className="col-span-1">
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[9px] font-black uppercase text-amber-700 mb-1">Paid Amount (₹ INR)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={modalInrPaidAmount}
                                  onChange={(e) => handleModalInrPaidChange(e.target.value)}
                                  placeholder="₹0.00"
                                  className="w-full p-2 bg-white rounded-xl border border-amber-200 text-xs font-bold text-[#10b981] focus:outline-[#10b981]"
                                />
                              </div>
                            </div>

                            <div className="text-[10px] text-amber-800 font-bold leading-normal pt-1.5 flex flex-col gap-1 bg-white/70 p-2.5 rounded-xl border border-amber-100/50">
                              <div className="flex justify-between">
                                <span>Calculated: ৳{(parseFloat(modalExchangeRate) > 0 ? ((parseFloat(modalInrTotalAmount) || 0) / parseFloat(modalExchangeRate)) * 100 : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span>Paid: ৳{(parseFloat(modalExchangeRate) > 0 ? ((parseFloat(modalInrPaidAmount) || 0) / parseFloat(modalExchangeRate)) * 100 : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <span className="text-[9px] text-amber-600 font-medium block border-t border-amber-100 pt-1 mt-0.5 text-center font-mono">
                                Formula: (INR / Rate) × 100
                              </span>
                            </div>
                          </div>
                        )}

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

                        {activeModal === "addReturn" && (
                          <div className="flex items-start gap-2.5 bg-sky-50 text-sky-800 font-medium text-xs p-3.5 rounded-2xl border border-sky-100">
                            <input
                              type="checkbox"
                              id="modalAdjustDueCheckbox"
                              checked={modalAdjustDue}
                              onChange={(e) => setModalAdjustDue(e.target.checked)}
                              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                            />
                            <label htmlFor="modalAdjustDueCheckbox" className="cursor-pointer text-slate-700 leading-tight">
                              <strong>Automatically adjust / deduct return:</strong> Check this to automatically subtract this transaction's return value from the supplier's outstanding due balance. If unchecked, it will be added as advance balance.
                            </label>
                          </div>
                        )}

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

      {/* Proper Invoice/Receipt Modal */}
      <AnimatePresence>
        {invoiceTransaction && selectedSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs overflow-y-auto print:absolute print:inset-0 print:bg-white print:p-0">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-3xl max-w-2xl w-full border border-gray-100 overflow-hidden print:shadow-none print:border-none print:rounded-none"
            >
              {/* Receipt Header Actions */}
              <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between print:hidden">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-400" />
                  <span className="font-bold text-sm tracking-wider uppercase">Official Transaction Voucher</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      window.print();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Invoice
                  </button>
                  <button
                    onClick={() => setInvoiceTransaction(null)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Printable Invoice Page Canvas */}
              <div className="p-8 space-y-8 bg-white text-gray-800 print:p-6" id="printable-invoice">
                {/* Brand Header */}
                {(() => {
                  const isIndian = selectedSupplier.country === "India";
                  let exchangeRateVal = 70;
                  let inrTotalVal = 0;
                  let inrPaidVal = 0;
                  let hasExchangeDetails = false;

                  if (isIndian && invoiceTransaction.notes) {
                    const notesStr = invoiceTransaction.notes;
                    const rateMatch = notesStr.match(/(?:Rate|Exchange Rate):\s*₹?100\s*=\s*(?:৳|BDT)?\s*([\d.]+)/i);
                    if (rateMatch) {
                      exchangeRateVal = parseFloat(rateMatch[1]) || 70;
                      hasExchangeDetails = true;
                    }
                    const totalMatch = notesStr.match(/INR Total:\s*₹?\s*([\d.]+)/i);
                    if (totalMatch) {
                      inrTotalVal = parseFloat(totalMatch[1]) || 0;
                      hasExchangeDetails = true;
                    }
                    const paidMatch = notesStr.match(/INR Paid:\s*₹?\s*([\d.]+)/i);
                    if (paidMatch) {
                      inrPaidVal = parseFloat(paidMatch[1]) || 0;
                      hasExchangeDetails = true;
                    }
                  }

                  const cleanNotes = invoiceTransaction.notes 
                    ? invoiceTransaction.notes.replace(/\[Rate:\s*₹?100\s*=.*?\]/, "").trim() 
                    : "";

                  return (
                    <>
                      {/* Top Accent Styling Line */}
                      <div className="h-1.5 w-full bg-slate-900 rounded-full mb-2 print:h-2"></div>

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-6 gap-4">
                        <div className="flex items-center gap-4">
                          {companyLogoUrl ? (
                            <img 
                              src={companyLogoUrl} 
                              alt="Logo" 
                              className="w-16 h-16 rounded-2xl object-contain border border-slate-200 p-1.5 shadow-xs bg-white shrink-0" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(companyName)}`;
                              }}
                            />
                          ) : (
                            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                              <Receipt className="w-9 h-9 text-indigo-400" />
                            </div>
                          )}
                          <div className="text-left">
                            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase leading-none">{companyName}</h1>
                            <p className="text-[10px] font-bold text-indigo-600 tracking-widest uppercase mt-2">{companyTagline}</p>
                            <div className="text-xs text-gray-500 space-y-0.5 mt-1.5 font-sans">
                              <p className="font-medium text-slate-600">{companyAddress}</p>
                              <p className="text-[11px] text-gray-400">Phone: {companyPhone} • Email: {companyEmail}</p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end w-full sm:w-auto border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
                          <div className={cn(
                            "text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full inline-block border",
                            invoiceTransaction.type === "purchase" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                            invoiceTransaction.type === "return" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}>
                            {invoiceTransaction.type} voucher
                          </div>
                          <p className="text-sm font-black text-slate-900 mt-2 font-mono">Invoice #{invoiceTransaction.refNo || "N/A"}</p>
                          <p className="text-[10px] text-gray-400 font-bold font-mono mt-0.5">Date: {invoiceTransaction.date}</p>
                        </div>
                      </div>

                      {/* To & From Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-left">
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60 flex flex-col justify-between">
                          <div>
                            <h3 className="text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                              <Users className="w-3.5 h-3.5 text-indigo-500" />
                              Billed To (Supplier Info)
                            </h3>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base font-black text-slate-900">{selectedSupplier.name}</span>
                                <span className="bg-slate-200 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider text-slate-700">
                                  {selectedSupplier.country}
                                </span>
                              </div>
                              <p className="text-[11px] font-bold text-indigo-600 font-mono">Supplier Code: {selectedSupplier.code}</p>
                              <div className="text-gray-600 space-y-0.5 pt-1.5">
                                {selectedSupplier.mobile && <p>📱 Phone: <span className="font-semibold text-slate-800">{selectedSupplier.mobile}</span></p>}
                                {selectedSupplier.email && <p>✉️ Email: <span className="font-semibold text-slate-800">{selectedSupplier.email}</span></p>}
                              </div>
                            </div>
                          </div>
                          <div className="text-gray-500 italic mt-3 bg-white/70 p-2 rounded-xl border border-slate-100 text-[11px]">
                            📍 {selectedSupplier.address || "No Registered Address"}
                          </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60 font-mono flex flex-col justify-between space-y-3">
                          <div>
                            <h3 className="text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5 mb-2.5">
                              <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                              Payment Metadata & Rates
                            </h3>
                            <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                              <span className="text-gray-400">Ref Date:</span>
                              <span className="font-bold text-slate-900 text-right">{invoiceTransaction.date}</span>

                              <span className="text-gray-400">Channel:</span>
                              <span className="font-bold text-slate-900 text-right">{invoiceTransaction.paymentMethod || "Cash"}</span>

                              <span className="text-gray-400">Receipt Type:</span>
                              <span className="font-bold text-indigo-600 text-right uppercase">{invoiceTransaction.type}</span>

                              <span className="text-gray-400">Voucher Currency:</span>
                              <span className="font-bold text-slate-900 text-right">
                                {isIndian ? `₹ INR (Rate: ${exchangeRateVal})` : "৳ BDT Direct"}
                              </span>
                            </div>
                          </div>
                          <div className="bg-indigo-500/5 text-[9px] text-slate-500 p-2 rounded-lg border border-indigo-150 text-center uppercase font-black tracking-wide">
                            🛡️ System Secure Transaction Statement
                          </div>
                        </div>
                      </div>

                      {/* Foreign Exchange Rates Detail Box */}
                      {isIndian && hasExchangeDetails && (
                        <div className="p-5 rounded-2xl bg-amber-50/40 border border-amber-200/70 space-y-4 text-left animate-in fade-in duration-300">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                              <span className="p-1 px-2 bg-amber-100 rounded-lg text-[10px] font-black border border-amber-300">INR ⇄ BDT</span>
                              Indian Supplier Currency Conversion Details
                            </div>
                            <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-100/50 p-1 px-2.5 rounded-full border border-amber-200">
                              Exchange Rate: ₹100 = ৳{exchangeRateVal.toFixed(2)}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="bg-white p-3 rounded-xl border border-amber-100 flex flex-col justify-center">
                              <span className="text-[9px] uppercase font-black text-amber-600 tracking-wider">Gross Purchase (INR)</span>
                              <span className="text-lg font-black text-amber-950 font-mono mt-1">₹{inrTotalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-amber-100 flex flex-col justify-center">
                              <span className="text-[9px] uppercase font-black text-amber-600 tracking-wider">Total Paid Amount (INR)</span>
                              <span className="text-lg font-black text-emerald-700 font-mono mt-1">₹{inrPaidVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-amber-100 flex flex-col justify-center">
                              <span className="text-[9px] uppercase font-black text-amber-600 tracking-wider">Remaining Due (INR)</span>
                              <span className={cn(
                                "text-lg font-black font-mono mt-1",
                                (inrTotalVal - inrPaidVal) > 0 ? "text-rose-600" : "text-gray-500"
                              )}>
                                ₹{(inrTotalVal - inrPaidVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <p className="text-[9px] text-amber-800 bg-amber-100/25 p-2 rounded-xl text-center font-mono italic">
                            Formula used: BDT Sum = (INR Sum / Rate) * 100
                          </p>
                        </div>
                      )}

                      {/* Transaction breakdown table */}
                      <div>
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-900 border-b border-slate-800 text-white text-[10px] font-black uppercase tracking-wider">
                                <th className="p-3.5 pl-5">Reference Ref #</th>
                                <th className="p-3.5">Statement or Item Description</th>
                                <th className="p-3.5 text-right">Value (INR)</th>
                                <th className="p-3.5 text-right pr-5">Amount (৳ BDT)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 text-xs text-left bg-white">
                              <tr className="hover:bg-slate-50/20 transition-colors">
                                <td className="p-4 pl-5 font-mono font-bold text-slate-800">{invoiceTransaction.refNo}</td>
                                <td className="p-4">
                                  <span className="font-bold text-slate-900 block">
                                    {invoiceTransaction.type === "purchase" && "Supplied Inventory Stocks & Materials Import Purchases"}
                                    {invoiceTransaction.type === "return" && "Stock Credits Return Voucher for Defective Inventories"}
                                    {invoiceTransaction.type === "payment" && "Acknowledge Settlement payout towards Outstanding Supplier Balance"}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mt-1 block leading-relaxed">
                                    Approved and verified ledger posting under the general suppliers framework.
                                  </span>
                                </td>
                                <td className="p-4 text-right font-mono">
                                  {isIndian && hasExchangeDetails ? (
                                    <span className="bg-amber-50/80 text-amber-800 border border-amber-100 rounded-lg px-2.5 py-1 text-[11px] font-black inline-block">
                                      ₹{inrTotalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 font-mono italic">N/A</span>
                                  )}
                                </td>
                                <td className="p-4 text-right font-mono font-black text-slate-950 pr-5 text-sm">
                                  {formatCurrency(invoiceTransaction.totalAmount)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Calculations Summary block */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                        {/* Transaction Notes / Comments */}
                        <div className="text-left">
                          {cleanNotes ? (
                            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/60 text-xs text-slate-650 h-full flex flex-col justify-start">
                              <span className="font-extrabold text-slate-800 block uppercase text-[9px] tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                📝 Remittance & Remarks Remarks:
                              </span>
                              <p className="italic leading-normal whitespace-pre-line">{cleanNotes}</p>
                            </div>
                          ) : (
                            <div className="bg-slate-50/20 p-4 rounded-2xl border border-dashed border-slate-200 text-xs text-gray-400 h-full flex items-center justify-center italic">
                              No custom remarks recorded on this voucher.
                            </div>
                          )}
                        </div>

                        {/* Totals panel */}
                        <div className="flex justify-end">
                          <div className="w-full sm:w-80 space-y-2.5 text-xs text-left p-4 rounded-2xl bg-slate-50 border border-slate-200">
                            <div className="flex justify-between font-medium text-slate-500 border-b border-slate-150 pb-2">
                              <span>Gross Invoice Subtotal:</span>
                              <span className="font-mono text-slate-800 font-bold">{formatCurrency(invoiceTransaction.totalAmount)}</span>
                            </div>
                            
                            {invoiceTransaction.paidAmount !== undefined && (
                              <div className="flex justify-between font-medium text-slate-500 border-b border-slate-150 pb-2">
                                <span>Paid Amount:</span>
                                <span className="font-mono text-emerald-600 font-black">{formatCurrency(invoiceTransaction.paidAmount)}</span>
                              </div>
                            )}

                            {invoiceTransaction.dueAmount !== undefined && (
                              <div className="flex justify-between font-medium text-slate-500 border-b border-slate-150 pb-2">
                                <span>Adjustment Due:</span>
                                <span className="font-mono text-rose-600 font-black">
                                  {formatCurrency(invoiceTransaction.dueAmount)}
                                </span>
                              </div>
                            )}

                            <div className="flex justify-between text-base font-black text-slate-900 pt-2.5 border-t-2 border-dashed border-slate-300">
                              <span>Net Total Cleared (BDT):</span>
                              <span className="font-mono text-indigo-650 text-base">{formatCurrency(invoiceTransaction.totalAmount)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Signatures footer */}
                      <div className="grid grid-cols-2 gap-8 pt-12 border-t border-dashed border-slate-200 text-center">
                        <div>
                          <div className="mx-auto w-36 border-b border-slate-300 h-12 flex items-end justify-center">
                            <span className="text-[9px] italic text-slate-400 font-mono pb-1">Authorized Representative</span>
                          </div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black mt-2.5">Authority Stamp & Signature</p>
                        </div>
                        <div>
                          <div className="mx-auto w-36 border-b border-slate-300 h-12 flex items-end justify-center">
                            <span className="text-[9px] italic text-slate-400 font-mono pb-1">Date Received</span>
                          </div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black mt-2.5">Supplier Acknowledgment</p>
                        </div>
                      </div>

                      {/* Declaration Stamp Footer */}
                      <div className="text-center text-[10px] text-slate-400 border-t border-slate-100 pt-6 mt-4 space-y-1">
                        <p className="font-black text-slate-600">Dhaka Ledger Enterprise System • Official Supplier Invoice</p>
                        <p>Document generated on {new Date().toLocaleDateString('en-GB')} from secure backend services.</p>
                        <p className="text-[9px] text-slate-350">Registered Corporate Address: {companyAddress} • Email: {companyEmail}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Leave and back action */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100 print:hidden">
                <button
                  type="button"
                  onClick={() => setInvoiceTransaction(null)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-5 rounded-xl transition-colors text-xs flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Leave Voucher View
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Supplier Delete Modal */}
        {supplierToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Supplier?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete this supplier? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSupplierToDelete(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteSupplier}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Transaction Delete Modal */}
        {txToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Transaction Record?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete this transaction record? This will automatically revert and correct outstanding supplier dues, purchase totals, and associated bank balances.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTxToDelete(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteTransaction}
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
