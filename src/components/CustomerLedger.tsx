import React, { useState, useEffect, useMemo } from "react";
import { User } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  query, 
  orderBy, 
  deleteDoc, 
  getDoc,
  where,
  getDocs
} from "firebase/firestore";
import { db, OperationType, handleFirestoreError, cleanFirestoreData, updateDoc } from "@/src/lib/firebase";
import { CustomerProfile, CustomerPayment, CounterSale, Bank, Transaction } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { exportHtmlToPdf } from "@/src/lib/pdfExport";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Users, 
  Search, 
  FileText, 
  CreditCard, 
  DollarSign, 
  Printer, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Clock, 
  Phone, 
  MapPin, 
  UserPlus, 
  ArrowRight, 
  X, 
  Receipt, 
  TrendingUp, 
  RotateCcw,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Filter,
  Trash2,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";

interface CustomerLedgerProps {
  user: User | null;
  role?: string;
  initialCustomerId?: string;
  onNavigateToCounterSale?: () => void;
}

export default function CustomerLedger({
  user,
  role,
  initialCustomerId,
  onNavigateToCounterSale
}: CustomerLedgerProps) {
  const { language, t, formatDate, formatNumber } = useLanguage();

  // Company Branding parameters
  const [companyName, setCompanyName] = useState("Modern Pro");
  const [companyPhone, setCompanyPhone] = useState("+880 1234 567890");
  const [companyAddress, setCompanyAddress] = useState("Dhaka, Bangladesh");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Pro");
        setCompanyPhone(data.companyPhone || "+880 1234 567890");
        setCompanyAddress(data.companyAddress || "Dhaka, Bangladesh");
      }
    });
    return () => unsub();
  }, []);

  // Main collections state
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [counterSales, setCounterSales] = useState<CounterSale[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Filtering
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || "");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "clear">("all");
  const [activeLedgerTab, setActiveLedgerTab] = useState<"statement" | "sales" | "payments">("statement");

  // Payment Recording State ("Record Payment")
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<CustomerPayment | null>(null);

  // New Customer Profile Modal State
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustOpeningDue, setNewCustOpeningDue] = useState("");
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);

  // PDF Export loading
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Deletion Modals State
  const [saleToDelete, setSaleToDelete] = useState<CounterSale | null>(null);
  const [isDeletingSale, setIsDeletingSale] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<CustomerPayment | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerProfile | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  // 1. Listen for Customers
  useEffect(() => {
    const q = query(collection(db, "customers"), orderBy("name", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerProfile));
      setCustomers(list);
      setLoading(false);
      // If no customer selected yet and list has items, auto-select the first one with due or first one
      if (!selectedCustomerId && list.length > 0) {
        const firstWithDue = list.find(c => (c.totalDue || 0) > 0);
        setSelectedCustomerId(firstWithDue?.id || list[0].id || "");
      }
    }, (err) => {
      console.warn("Could not fetch customers in CustomerLedger:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Listen for Counter Sales
  useEffect(() => {
    const q = query(collection(db, "counterSales"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CounterSale));
      setCounterSales(list);
    }, (err) => {
      console.warn("Could not fetch counterSales in CustomerLedger:", err);
    });
    return () => unsub();
  }, []);

  // 3. Listen for Customer Payments
  useEffect(() => {
    const q = query(collection(db, "customerPayments"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerPayment));
      setCustomerPayments(list);
    }, (err) => {
      console.warn("Could not fetch customerPayments in CustomerLedger:", err);
    });
    return () => unsub();
  }, []);

  // 4. Listen for Banks
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "banks"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank));
      setBanks(list);
    }, (err) => console.warn("Could not load banks:", err));
    return () => unsub();
  }, []);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Filtered customer list for the left panel
  const filteredCustomers = useMemo(() => {
    return customers.filter(cust => {
      const matchesSearch = 
        !searchTerm.trim() ||
        cust.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cust.phone && cust.phone.includes(searchTerm)) ||
        (cust.address && cust.address.toLowerCase().includes(searchTerm.toLowerCase()));

      const hasDue = (cust.totalDue || 0) > 0.01;
      const matchesStatus = 
        statusFilter === "all" ||
        (statusFilter === "due" && hasDue) ||
        (statusFilter === "clear" && !hasDue);

      return matchesSearch && matchesStatus;
    });
  }, [customers, searchTerm, statusFilter]);

  // Overall KPIs
  const overallKpi = useMemo(() => {
    const totalCustomersCount = customers.length;
    const customersWithDueCount = customers.filter(c => (c.totalDue || 0) > 0.01).length;
    const totalOutstandingDue = customers.reduce((sum, c) => sum + (c.totalDue || 0), 0);
    const totalCollections = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return {
      totalCustomersCount,
      customersWithDueCount,
      totalOutstandingDue,
      totalCollections
    };
  }, [customers, customerPayments]);

  // Specific customer transactions: Counter Sales
  const customerSpecificSales = useMemo(() => {
    if (!selectedCustomer) return [];
    return counterSales.filter(s => {
      if (selectedCustomer.id && s.customerId === selectedCustomer.id) return true;
      if (selectedCustomer.phone && s.customerPhone && s.customerPhone.trim() === selectedCustomer.phone.trim()) return true;
      if (s.customerName && selectedCustomer.name && s.customerName.trim().toLowerCase() === selectedCustomer.name.trim().toLowerCase()) return true;
      return false;
    });
  }, [counterSales, selectedCustomer]);

  // Specific customer transactions: Payments
  const customerSpecificPayments = useMemo(() => {
    if (!selectedCustomer) return [];
    return customerPayments.filter(p => {
      if (selectedCustomer.id && p.customerId === selectedCustomer.id) return true;
      if (selectedCustomer.phone && p.customerPhone && p.customerPhone.trim() === selectedCustomer.phone.trim()) return true;
      if (p.customerName && selectedCustomer.name && p.customerName.trim().toLowerCase() === selectedCustomer.name.trim().toLowerCase()) return true;
      return false;
    });
  }, [customerPayments, selectedCustomer]);

  // Chronological Unified Ledger (Sales + Payments)
  interface LedgerEntry {
    id: string;
    date: string;
    time?: string;
    timestamp: number;
    type: "sale" | "payment";
    refNo: string;
    particulars: string;
    debit: number;   // Charges / Invoiced net amount (increases due)
    credit: number;  // Paid at counter or collected later (decreases due)
    dueImpact: number; // Net remaining due generated by this event
    method?: string;
    notes?: string;
    rawItem: CounterSale | CustomerPayment;
  }

  const unifiedLedgerEntries: LedgerEntry[] = useMemo(() => {
    const entries: LedgerEntry[] = [];

    // Add Sales
    customerSpecificSales.forEach(s => {
      const netPayable = s.netPayable ?? (s.totalSlipsAmount - (s.discountAmount || 0));
      const received = s.receivedAmount || 0;
      const due = s.dueAmount || 0;
      const dateStr = s.date || (s.dateTime ? s.dateTime.substring(0, 10) : "");
      let ts = 0;
      try {
        ts = new Date(s.dateTime || `${dateStr}T${s.time || "12:00:00"}`).getTime();
      } catch {
        ts = Date.now();
      }

      entries.push({
        id: `sale-${s.id || s.saleId}`,
        date: dateStr,
        time: s.time,
        timestamp: ts,
        type: "sale",
        refNo: s.saleId,
        particulars: `কাউন্টার সেল #${s.saleId} (${s.slips?.length || 1}টি স্লিপ)`,
        debit: netPayable,
        credit: received,
        dueImpact: due,
        method: s.paymentMethod || "Cash",
        notes: s.notes,
        rawItem: s
      });
    });

    // Add Payments
    customerSpecificPayments.forEach(p => {
      const dateStr = p.date;
      let ts = 0;
      try {
        ts = new Date(`${dateStr}T${p.time || "12:00:00"}`).getTime();
      } catch {
        ts = Date.now();
      }

      entries.push({
        id: `pay-${p.id || p.receiptNo}`,
        date: dateStr,
        time: p.time,
        timestamp: ts,
        type: "payment",
        refNo: p.receiptNo || "CR-REC",
        particulars: `বাকি আদায় জমা (${p.receiptNo || "রিসিট"})`,
        debit: 0,
        credit: p.amount,
        dueImpact: -p.amount,
        method: p.paymentMethod || "Cash",
        notes: p.notes,
        rawItem: p
      });
    });

    // Sort chronologically ascending for running balance calculation
    return entries.sort((a, b) => a.timestamp - b.timestamp);
  }, [customerSpecificSales, customerSpecificPayments]);

  // -------------------------------------------------------------
  // ACTION: Record Payment (আদায় ও বকেয়া পরিশোধ)
  // -------------------------------------------------------------
  const handleOpenRecordPayment = () => {
    if (!selectedCustomer) return;
    setPaymentAmount(selectedCustomer.totalDue > 0 ? selectedCustomer.totalDue.toString() : "");
    setPaymentMethod("Cash");
    setPaymentNotes("");
    setIsPaymentModalOpen(true);
  };

  const handleClearFullBalance = () => {
    if (!selectedCustomer) return;
    setPaymentAmount(Math.max(0, selectedCustomer.totalDue).toString());
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedCustomer.id) return;
    const amountNum = parseFloat(paymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("অনুগ্রহ করে সঠিক টাকার পরিমাণ লিখুন (Please enter a valid payment amount)");
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const now = new Date();
      const dateStr = format(now, "yyyy-MM-dd");
      const timeStr = format(now, "HH:mm:ss");
      const receiptNo = `CR-${format(now, "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;

      const currentDue = selectedCustomer.totalDue || 0;
      const newTotalDue = Math.max(0, currentDue - amountNum);
      const newTotalPaid = (selectedCustomer.totalPaid || 0) + amountNum;
      const newPaymentsCount = (selectedCustomer.totalPaymentsCount || 0) + 1;

      // 1. Create CustomerPayment record
      const paymentRecord: Record<string, any> = {
        receiptNo,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || "",
        customerAddress: selectedCustomer.address || "",
        date: dateStr,
        time: timeStr,
        amount: amountNum,
        previousDue: currentDue,
        remainingDue: newTotalDue,
        paymentMethod,
        notes: paymentNotes.trim(),
        receivedBy: user?.displayName || user?.email || "Admin",
        createdAt: now.toISOString()
      };

      const payDocRef = await addDoc(collection(db, "customerPayments"), cleanFirestoreData(paymentRecord));

      // 2. Update Customer Profile
      const custDocRef = doc(db, "customers", selectedCustomer.id);
      await updateDoc(custDocRef, cleanFirestoreData({
        totalDue: newTotalDue,
        totalPaid: newTotalPaid,
        totalPaymentsCount: newPaymentsCount,
        lastTransactionDate: dateStr,
        updatedAt: now.toISOString()
      }));

      // 3. Create Income Transaction in general transactions for 100% accurate financial sync
      try {
        const txDoc = await addDoc(collection(db, "transactions"), cleanFirestoreData({
          date: now.toISOString(),
          type: "income",
          category: "Due Collection",
          subCategory: receiptNo,
          amount: amountNum,
          paymentMethod,
          notes: `কাস্টমার বাকি আদায়: ${selectedCustomer.name} (${receiptNo}) ${paymentNotes ? `• ${paymentNotes}` : ""}`,
          createdBy: user?.uid || "system",
          createdAt: now.toISOString()
        }));

        await updateDoc(doc(db, "customerPayments", payDocRef.id), { transactionId: txDoc.id });
      } catch (txErr) {
        console.warn("Could not write transaction for due collection:", txErr);
      }

      // 4. Update bank balance if paymentMethod was not Cash
      if (paymentMethod !== "Cash") {
        const targetBank = banks.find(b => b.name === paymentMethod);
        if (targetBank && targetBank.id) {
          try {
            await updateDoc(doc(db, "banks", targetBank.id), {
              balance: (targetBank.balance || 0) + amountNum,
              lastUpdated: now.toISOString()
            });
          } catch (bErr) {
            console.warn("Could not update bank balance:", bErr);
          }
        }
      }

      const fullPayment = { id: payDocRef.id, ...paymentRecord } as CustomerPayment;
      setIsPaymentModalOpen(false);
      setPaymentAmount("");
      setPaymentNotes("");

      // Open Money Receipt Modal
      setReceiptToShow(fullPayment);

    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "customerPayments");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Add New Customer
  // -------------------------------------------------------------
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      alert("অনুগ্রহ করে কাস্টমারের নাম লিখুন");
      return;
    }
    setIsSubmittingCustomer(true);
    try {
      const now = new Date();
      const openingDueNum = parseFloat(newCustOpeningDue) || 0;
      const newCust: Record<string, any> = {
        name: newCustName.trim(),
        totalPurchases: openingDueNum,
        totalPaid: 0,
        totalDue: openingDueNum,
        totalDiscount: 0,
        totalPurchasesCount: openingDueNum > 0 ? 1 : 0,
        totalDueCount: openingDueNum > 0 ? 1 : 0,
        totalPaymentsCount: 0,
        lastTransactionDate: format(now, "yyyy-MM-dd"),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      if (newCustPhone.trim()) newCust.phone = newCustPhone.trim();
      if (newCustAddress.trim()) newCust.address = newCustAddress.trim();

      const docRef = await addDoc(collection(db, "customers"), cleanFirestoreData(newCust));
      setIsAddCustomerModalOpen(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      setNewCustOpeningDue("");
      setSelectedCustomerId(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "customers");
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Delete Counter Sale
  // -------------------------------------------------------------
  const executeDeleteSale = async (sale: CounterSale) => {
    if (!sale || !sale.id) return;
    setIsDeletingSale(true);
    try {
      // 1. Delete counterSales document from Firestore
      await deleteDoc(doc(db, "counterSales", sale.id));
      setCounterSales(prev => prev.filter(c => c.id !== sale.id));

      // 2. Delete linked income transaction from general transactions collection
      if (sale.transactionId) {
        try {
          await deleteDoc(doc(db, "transactions", sale.transactionId));
        } catch (e) {
          console.warn("Could not delete matching transaction by ID:", e);
        }
      }

      // Also clean up any transactions that reference this saleId
      try {
        if (sale.saleId) {
          const txSnap1 = await getDocs(query(collection(db, "transactions"), where("subCategory", "==", sale.saleId)));
          for (const tDoc of txSnap1.docs) {
            await deleteDoc(doc(db, "transactions", tDoc.id));
          }
        }
        const txSnapAll = await getDocs(collection(db, "transactions"));
        for (const tDoc of txSnapAll.docs) {
          const tData = tDoc.data();
          if (
            (sale.transactionId && tDoc.id === sale.transactionId) ||
            (sale.saleId && tData.subCategory === sale.saleId) ||
            (sale.saleId && tData.notes && tData.notes.includes(sale.saleId))
          ) {
            await deleteDoc(doc(db, "transactions", tDoc.id));
          }
        }
      } catch (qErr) {
        console.warn("Could not query matching transactions for saleId:", qErr);
      }

      // 3. Revert Customer Profile totals if this sale was linked to a customer
      if (sale.customerId) {
        try {
          const custDocRef = doc(db, "customers", sale.customerId);
          const custDocSnap = await getDoc(custDocRef);
          if (custDocSnap.exists()) {
            const cData = custDocSnap.data();
            const payable = sale.netPayable ?? (sale.totalSlipsAmount - (sale.discountAmount || 0));
            const newPurchases = Math.max(0, (cData.totalPurchases || 0) - payable);
            const newPaid = Math.max(0, (cData.totalPaid || 0) - (sale.receivedAmount || 0));
            const newDue = Math.max(0, (cData.totalDue || 0) - (sale.dueAmount || 0));
            const newDiscount = Math.max(0, (cData.totalDiscount || 0) - (sale.discountAmount || 0));
            const newPurchasesCount = Math.max(0, (cData.totalPurchasesCount || 1) - 1);
            const newDueCount = (sale.dueAmount || 0) > 0 ? Math.max(0, (cData.totalDueCount || 1) - 1) : (cData.totalDueCount || 0);

            await updateDoc(custDocRef, cleanFirestoreData({
              totalPurchases: newPurchases,
              totalPaid: newPaid,
              totalDue: newDue,
              totalDiscount: newDiscount,
              totalPurchasesCount: newPurchasesCount,
              totalDueCount: newDueCount,
              updatedAt: new Date().toISOString()
            }));
          }
        } catch (cErr) {
          console.warn("Could not revert customer stats upon sale deletion:", cErr);
        }
      }

      setSaleToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `counterSales/${sale.id}`);
    } finally {
      setIsDeletingSale(false);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Delete Customer Payment (Rollback Due Collection)
  // -------------------------------------------------------------
  const executeDeletePayment = async (payment: CustomerPayment) => {
    if (!payment || !payment.id) return;
    setIsDeletingPayment(true);
    try {
      // 1. Delete customerPayments doc
      await deleteDoc(doc(db, "customerPayments", payment.id));

      // 2. Delete linked income transaction
      if (payment.transactionId) {
        try {
          await deleteDoc(doc(db, "transactions", payment.transactionId));
        } catch (e) {
          console.warn("Could not delete tx by id:", e);
        }
      }
      try {
        const txQuery = query(
          collection(db, "transactions"),
          where("category", "==", "Due Collection"),
          where("subCategory", "==", payment.receiptNo)
        );
        const txSnap = await getDocs(txQuery);
        for (const tDoc of txSnap.docs) {
          await deleteDoc(doc(db, "transactions", tDoc.id));
        }
      } catch (qErr) {
        console.warn("Could not clean up due collection tx:", qErr);
      }

      // 3. Rollback bank account balance if non-cash
      if (payment.paymentMethod && payment.paymentMethod !== "Cash") {
        const targetBank = banks.find(b => b.name === payment.paymentMethod);
        if (targetBank && targetBank.id) {
          try {
            await updateDoc(doc(db, "banks", targetBank.id), {
              balance: Math.max(0, (targetBank.balance || 0) - payment.amount),
              lastUpdated: new Date().toISOString()
            });
          } catch (bErr) {
            console.warn("Could not revert bank balance:", bErr);
          }
        }
      }

      // 4. Restore customer totalDue and revert totalPaid
      if (payment.customerId) {
        const custDocRef = doc(db, "customers", payment.customerId);
        const custDocSnap = await getDoc(custDocRef);
        if (custDocSnap.exists()) {
          const cData = custDocSnap.data();
          const restoredDue = (cData.totalDue || 0) + payment.amount;
          const revertedPaid = Math.max(0, (cData.totalPaid || 0) - payment.amount);
          const revertedPaymentsCount = Math.max(0, (cData.totalPaymentsCount || 1) - 1);

          await updateDoc(custDocRef, cleanFirestoreData({
            totalDue: restoredDue,
            totalPaid: revertedPaid,
            totalPaymentsCount: revertedPaymentsCount,
            updatedAt: new Date().toISOString()
          }));
        }
      }
      setPaymentToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `customerPayments/${payment.id}`);
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Delete Customer Profile
  // -------------------------------------------------------------
  const executeDeleteCustomer = async (cust: CustomerProfile) => {
    if (!cust || !cust.id) return;
    setIsDeletingCustomer(true);
    try {
      await deleteDoc(doc(db, "customers", cust.id));
      setSelectedCustomerId("");
      setCustomerToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `customers/${cust.id}`);
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // -------------------------------------------------------------
  // PRINT SLIP VOUCHER UTILITY
  // -------------------------------------------------------------
  const handlePrintSlip = (sale: CounterSale) => {
    const printWindow = window.open("", "_blank", "width=380,height=600");
    if (!printWindow) {
      alert("অনুগ্রহ করে পপ-আপ অনুমোদন করুন (Please allow popups to print)");
      return;
    }

    const slipsRows = (sale.slips || [])
      .map(
        (s, idx) => `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>স্লিপ #${s.slipNo || idx + 1} ${s.notes ? `(${s.notes})` : ""}</span>
          <span style="font-family: monospace; font-weight: bold;">৳ ${s.amount.toLocaleString()}</span>
        </div>`
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Slip Voucher - ${sale.saleId}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
            body { font-family: 'Hind Siliguri', sans-serif; margin: 0; padding: 16px; font-size: 12px; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 10px; margin-bottom: 12px; }
            .title { font-size: 16px; font-weight: 800; text-transform: uppercase; color: #0f172a; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
            .badge { display: inline-block; background: #0f172a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-top: 4px; }
            .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 11px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .total-box { border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; padding: 8px 0; margin: 10px 0; font-size: 13px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${companyName}</div>
            <div class="subtitle">${companyAddress} • ফোন: ${companyPhone}</div>
            <div class="badge">কাউন্টার সেল ভাউচার (${sale.saleId})</div>
          </div>
          <div class="info-box">
            <div class="row">
              <span><strong>তারিখ:</strong> ${sale.date} ${sale.time || ""}</span>
              <span><strong>পদ্ধতি:</strong> ${sale.paymentMethod || "Cash"}</span>
            </div>
            ${sale.customerName ? `<div class="row"><span><strong>গ্রাহক:</strong> ${sale.customerName}</span>${sale.customerPhone ? `<span><strong>মোবাইল:</strong> ${sale.customerPhone}</span>` : ""}</div>` : ""}
          </div>
          <div style="margin-bottom: 12px;">
            ${slipsRows}
          </div>
          <div class="total-box">
            <div class="row">
              <span>মোট স্লিপ:</span>
              <span style="font-family: monospace;">৳ ${sale.totalSlipsAmount.toLocaleString()}</span>
            </div>
            ${sale.discountAmount && sale.discountAmount > 0 ? `
            <div class="row" style="color: #e11d48; font-size: 11px;">
              <span>ছাড়:</span>
              <span style="font-family: monospace;">- ৳ ${sale.discountAmount.toLocaleString()}</span>
            </div>` : ""}
            <div class="row" style="font-size: 14px; font-weight: 900;">
              <span>প্রদেয় বিল:</span>
              <span style="font-family: monospace;">৳ ${(sale.netPayable ?? (sale.totalSlipsAmount - (sale.discountAmount || 0))).toLocaleString()}</span>
            </div>
            <div class="row" style="font-size: 11px; color: #047857;">
              <span>পরিশোধিত:</span>
              <span style="font-family: monospace;">৳ ${(sale.receivedAmount || 0).toLocaleString()}</span>
            </div>
            ${(sale.dueAmount || 0) > 0 ? `
            <div class="row" style="font-size: 12px; color: #b45309; font-weight: bold;">
              <span>বকেয়া বাকি:</span>
              <span style="font-family: monospace;">৳ ${sale.dueAmount.toLocaleString()}</span>
            </div>` : ""}
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // -------------------------------------------------------------
  // PRINT & PDF EXPORT UTILITIES
  // -------------------------------------------------------------
  const handlePrintCollectionReceipt = (payment: CustomerPayment) => {
    const printWindow = window.open("", "_blank", "width=380,height=620");
    if (!printWindow) {
      alert("অনুগ্রহ করে পপ-আপ অনুমোদন করুন (Please allow popups to print)");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Money Receipt - ${payment.receiptNo || "CR"}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
            body { font-family: 'Hind Siliguri', sans-serif; margin: 0; padding: 16px; font-size: 12px; color: #1e293b; }
            .font-mono { font-family: 'JetBrains Mono', monospace; }
            .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 10px; margin-bottom: 12px; }
            .title { font-size: 16px; font-weight: 800; text-transform: uppercase; color: #0f172a; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
            .badge { display: inline-block; background: #0f172a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-top: 4px; }
            .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 11px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .amount-box { background: #ecfdf5; border: 2px solid #059669; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 12px; }
            .amount-label { font-size: 10px; font-weight: bold; color: #065f46; text-transform: uppercase; }
            .amount-val { font-size: 22px; font-weight: 900; color: #047857; font-family: 'JetBrains Mono', monospace; }
            .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10px; text-align: center; }
            .sign-line { border-top: 1px dashed #94a3b8; width: 100px; margin-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${companyName}</div>
            <div class="subtitle">${companyAddress} • ফোন: ${companyPhone}</div>
            <div class="badge">বাকি আদায় মানি রিসিট (MONEY RECEIPT)</div>
          </div>

          <div class="info-box">
            <div class="row">
              <span><strong>রশিদ নং:</strong> <span class="font-mono">${payment.receiptNo}</span></span>
              <span><strong>তারিখ:</strong> ${payment.date} ${payment.time || ""}</span>
            </div>
            <div class="row">
              <span><strong>গ্রাহক:</strong> ${payment.customerName}</span>
              ${payment.customerPhone ? `<span><strong>মোবাইল:</strong> ${payment.customerPhone}</span>` : ""}
            </div>
            ${payment.customerAddress ? `<div class="row"><span><strong>ঠিকানা:</strong> ${payment.customerAddress}</span></div>` : ""}
            <div class="row">
              <span><strong>মাধ্যম:</strong> ${payment.paymentMethod}</span>
              ${payment.notes ? `<span><strong>নোট:</strong> ${payment.notes}</span>` : ""}
            </div>
          </div>

          <div class="amount-box">
            <div class="amount-label">আদায়কৃত মোট টাকা (Collected Amount)</div>
            <div class="amount-val">৳ ${(payment.amount || 0).toLocaleString()}</div>
          </div>

          <div class="info-box">
            ${payment.previousDue !== undefined ? `
            <div class="row">
              <span style="color: #64748b;">পূর্বের মোট বাকি:</span>
              <span class="font-mono" style="font-weight: bold;">৳ ${payment.previousDue.toLocaleString()}</span>
            </div>` : ""}
            <div class="row" style="color: #047857; font-weight: bold;">
              <span>জমা প্রদান:</span>
              <span class="font-mono">- ৳ ${(payment.amount || 0).toLocaleString()}</span>
            </div>
            ${payment.remainingDue !== undefined ? `
            <div class="row" style="border-top: 1px dashed #cbd5e1; padding-top: 4px; font-weight: bold; font-size: 12px; color: ${payment.remainingDue > 0 ? "#b45309" : "#047857"};">
              <span>বর্তমান অবশিষ্ট বাকি:</span>
              <span class="font-mono">৳ ${payment.remainingDue.toLocaleString()}</span>
            </div>` : ""}
          </div>

          <div class="footer">
            <div>
              <div class="sign-line"></div>
              <span>গ্রাহকের স্বাক্ষর</span>
            </div>
            <div>
              <div class="sign-line"></div>
              <span>আদায়কারীর স্বাক্ষর</span>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadLedgerPdf = async () => {
    if (!selectedCustomer) return;
    setIsExportingPdf(true);
    try {
      let runningBalance = 0;
      const rowsHtml = unifiedLedgerEntries.map((entry, idx) => {
        runningBalance += entry.dueImpact;
        const isSale = entry.type === "sale";
        return `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
            <td style="padding: 6px 8px; font-family: monospace;">${entry.date}</td>
            <td style="padding: 6px 8px; font-family: monospace; font-weight: bold; color: ${isSale ? "#0f172a" : "#047857"};">
              ${entry.refNo}
            </td>
            <td style="padding: 6px 8px;">
              <span style="font-weight: bold;">${entry.particulars}</span>
              ${entry.method ? `<span style="color: #64748b; font-size: 9px; display: block;">(${entry.method})</span>` : ""}
            </td>
            <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #0f172a;">
              ${entry.debit > 0 ? `৳${entry.debit.toLocaleString()}` : "—"}
            </td>
            <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #047857;">
              ${entry.credit > 0 ? `৳${entry.credit.toLocaleString()}` : "—"}
            </td>
            <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 800; color: ${runningBalance > 0 ? "#b45309" : "#047857"};">
              ৳${runningBalance.toLocaleString()}
            </td>
          </tr>
        `;
      }).join("");

      const html = `
        <div style="font-family: 'Hind Siliguri', sans-serif; padding: 12px; color: #0f172a; max-width: 760px; margin: 0 auto;">
          <!-- Shop Header -->
          <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px;">
            <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px;">${companyName}</div>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">${companyAddress} • ফোন: ${companyPhone}</div>
            <div style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 3px 12px; border-radius: 4px; font-size: 11px; font-weight: 800; margin-top: 6px; letter-spacing: 0.5px;">
              গ্রাহকের পূর্ণাঙ্গ হিসাব খাতা ও স্টেটমেন্ট (CUSTOMER STATEMENT)
            </div>
          </div>

          <!-- Customer Meta Box -->
          <div style="display: flex; justify-content: space-between; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 11px;">
            <div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${selectedCustomer.name}</div>
              ${selectedCustomer.phone ? `<div style="color: #475569; font-family: monospace; margin-top: 2px;">📞 ${selectedCustomer.phone}</div>` : ""}
              ${selectedCustomer.address ? `<div style="color: #64748b; margin-top: 2px;">📍 ${selectedCustomer.address}</div>` : ""}
            </div>
            <div style="text-align: right;">
              <div><strong>স্টেটমেন্ট প্রকাশের তারিখ:</strong> ${format(new Date(), "yyyy-MM-dd")}</div>
              <div><strong>মোট কেনাকাটা:</strong> ${unifiedLedgerEntries.filter(e => e.type === "sale").length} বার</div>
              <div><strong>মোট পেমেন্ট:</strong> ${unifiedLedgerEntries.filter(e => e.type === "payment").length} বার</div>
            </div>
          </div>

          <!-- Financial Snapshot Bento -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center;">
              <span style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold;">মোট কেনাকাটা</span>
              <div style="font-size: 14px; font-weight: 800; font-family: monospace; color: #0f172a;">৳${selectedCustomer.totalPurchases.toLocaleString()}</div>
            </div>
            <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 8px; text-align: center;">
              <span style="font-size: 9px; text-transform: uppercase; color: #065f46; font-weight: bold;">মোট পরিশোধ</span>
              <div style="font-size: 14px; font-weight: 800; font-family: monospace; color: #047857;">৳${selectedCustomer.totalPaid.toLocaleString()}</div>
            </div>
            <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 8px; text-align: center;">
              <span style="font-size: 9px; text-transform: uppercase; color: #92400e; font-weight: bold;">মোট ছাড়</span>
              <div style="font-size: 14px; font-weight: 800; font-family: monospace; color: #b45309;">৳${(selectedCustomer.totalDiscount || 0).toLocaleString()}</div>
            </div>
            <div style="background-color: #fff1f2; border: 2px solid #fda4af; border-radius: 6px; padding: 8px; text-align: center;">
              <span style="font-size: 9px; text-transform: uppercase; color: #9f1239; font-weight: 800;">বর্তমান অবশিষ্ট বাকি</span>
              <div style="font-size: 16px; font-weight: 900; font-family: monospace; color: #e11d48;">৳${selectedCustomer.totalDue.toLocaleString()}</div>
            </div>
          </div>

          <!-- Transaction Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #0f172a; color: #ffffff; font-size: 10px; text-transform: uppercase; font-weight: bold;">
                <th style="padding: 8px; text-align: left;">তারিখ</th>
                <th style="padding: 8px; text-align: left;">ভাউচার / রিসিট</th>
                <th style="padding: 8px; text-align: left;">বিবরণ</th>
                <th style="padding: 8px; text-align: right;">ডেবিট (+বাকি/বিল)</th>
                <th style="padding: 8px; text-align: right;">ক্রেডিট (-জমা)</th>
                <th style="padding: 8px; text-align: right;">অবশিষ্ট বকেয়া</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #94a3b8;">কোন লেনদেনের রেকর্ড পাওয়া যায়নি</td></tr>`}
            </tbody>
          </table>

          <!-- Signatures -->
          <div style="display: flex; justify-content: space-between; margin-top: 40px; font-size: 10px;">
            <div style="text-align: center;">
              <div style="border-top: 1px dashed #64748b; width: 140px; margin-bottom: 4px;"></div>
              <span>গ্রাহকের স্বাক্ষর</span>
            </div>
            <div style="text-align: center;">
              <div style="border-top: 1px dashed #64748b; width: 140px; margin-bottom: 4px;"></div>
              <span>ম্যানেজার / হিসাব রক্ষক</span>
            </div>
          </div>
        </div>
      `;

      await exportHtmlToPdf(html, `Statement_${selectedCustomer.name.replace(/\s+/g, "_")}`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("স্টেটমেন্ট পিডিএফ তৈরিতে সমস্যা হয়েছে।");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Bento & Overall KPI Summary */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                কাস্টমার লেজার ও খাতা (Customer Ledger)
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                গ্রাহকভিত্তিক পূর্ণাঙ্গ বাকি হিসাব, ট্রানজাকশন ইতিহাস ও বকেয়া পরিশোধ মডিউল
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsAddCustomerModalOpen(true)}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ নতুন কাস্টমার প্রোফাইল</span>
          </button>

          {onNavigateToCounterSale && (
            <button
              type="button"
              onClick={onNavigateToCounterSale}
              className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 text-xs font-bold rounded-xl border border-gray-300 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-gray-600" />
              <span>কাউন্টার সেল ডেস্কে যান</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">মোট নথিভুক্ত গ্রাহক</span>
          <div className="text-xl sm:text-2xl font-black font-mono text-gray-900">
            {overallKpi.totalCustomersCount} জন
          </div>
          <span className="text-[11px] text-gray-500 font-medium">সিস্টেমের মোট ক্রেতা</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">বাকিদার গ্রাহক</span>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-900">
            {overallKpi.customersWithDueCount} জন
          </div>
          <span className="text-[11px] text-amber-700 font-medium">যাদের বকেয়া রয়েছে</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/40 shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider">সর্বমোট বকেয়া বাকি</span>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-900">
            ৳ {overallKpi.totalOutstandingDue.toLocaleString()}
          </div>
          <span className="text-[11px] text-amber-800 font-semibold">গ্রাহকদের কাছে মোট পাওনা</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-2xs space-y-1">
          <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">মোট আদায় ও জমা</span>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-800">
            ৳ {overallKpi.totalCollections.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold">বাকি থেকে সংগৃহীত ক্যাশ</span>
        </div>
      </div>

      {/* 2. Main Two-Column Layout: Customer List (Left) + Detail Ledger (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Panel: Customer Directory (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-4 sm:p-5 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-700" />
              <span>কাস্টমার তালিকা ({filteredCustomers.length})</span>
            </h3>
            
            <button
              type="button"
              onClick={() => setIsAddCustomerModalOpen(true)}
              className="text-xs font-bold text-gray-900 hover:text-black flex items-center gap-1 cursor-pointer bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>যোগ</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="নাম, মোবাইল বা ঠিকানা দিয়ে খুঁজুন..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex p-0.5 bg-gray-100 rounded-xl border border-gray-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer",
                statusFilter === "all" ? "bg-white text-gray-900 shadow-2xs font-black" : "text-gray-500 hover:text-gray-900"
              )}
            >
              সব ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("due")}
              className={cn(
                "flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer",
                statusFilter === "due" ? "bg-white text-amber-900 shadow-2xs font-black" : "text-gray-500 hover:text-gray-900"
              )}
            >
              বাকি ({customers.filter(c => (c.totalDue || 0) > 0.01).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("clear")}
              className={cn(
                "flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer",
                statusFilter === "clear" ? "bg-white text-emerald-800 shadow-2xs font-black" : "text-gray-500 hover:text-gray-900"
              )}
            >
              পরিশোধিত
            </button>
          </div>

          {/* Customer List Container */}
          <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-12 text-center text-xs text-gray-400 font-bold">লোড হচ্ছে...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Users className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-500 font-bold">কোন কাস্টমার পাওয়া যায়নি</p>
                <button
                  type="button"
                  onClick={() => setIsAddCustomerModalOpen(true)}
                  className="text-xs font-bold text-gray-900 underline cursor-pointer"
                >
                  নতুন কাস্টমার যোগ করুন
                </button>
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = cust.id === selectedCustomerId;
                const hasDue = (cust.totalDue || 0) > 0.01;

                return (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(cust.id || "")}
                    className={cn(
                      "w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5",
                      isSelected
                        ? "bg-gray-900 text-white border-gray-900 shadow-md scale-[1.01]"
                        : "bg-white hover:bg-gray-50 text-gray-900 border-gray-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-black text-xs truncate">
                        {cust.name}
                      </div>
                      <span className={cn(
                        "text-[10px] font-mono font-black px-2 py-0.5 rounded-full shrink-0",
                        isSelected
                          ? hasDue ? "bg-amber-400 text-black" : "bg-emerald-400 text-black"
                          : hasDue ? "bg-amber-100 text-amber-900 border border-amber-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      )}>
                        {hasDue ? `বাকি: ৳${(cust.totalDue || 0).toLocaleString()}` : "পরিশোধিত ✓"}
                      </span>
                    </div>

                    <div className={cn(
                      "flex items-center justify-between text-[11px]",
                      isSelected ? "text-gray-300" : "text-gray-500"
                    )}>
                      <span className="font-mono">
                        {cust.phone ? `📞 ${cust.phone}` : (cust.address || "ঠিকানা নেই")}
                      </span>
                      <span className="text-[10px]">
                        মোট: ৳{(cust.totalPurchases || 0).toLocaleString()}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Selected Customer Detailed Ledger & History (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedCustomer ? (
            <div className="bg-white rounded-3xl p-12 border border-gray-200 text-center space-y-3 shadow-sm">
              <Users className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="font-black text-base text-gray-800">কোন কাস্টমার সিলেক্ট করা নেই</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                বাম পাশের তালিকা থেকে যেকোনো কাস্টমার বেছে নিন অথবা নতুন কাস্টমার প্রোফাইল যোগ করে তাদের বকেয়া ও লেনদেন হিসাব দেখুন।
              </p>
            </div>
          ) : (
            <>
              {/* Customer Profile Card & Primary Actions */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-200 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg sm:text-xl font-black text-gray-900">
                        {selectedCustomer.name}
                      </h3>
                      {(selectedCustomer.totalDue || 0) > 0.01 ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300">
                          বাকি: ৳{(selectedCustomer.totalDue || 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-300">
                          পরিশোধিত ✓
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-medium">
                      {selectedCustomer.phone && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {selectedCustomer.phone}
                        </span>
                      )}
                      {selectedCustomer.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          {selectedCustomer.address}
                        </span>
                      )}
                      {selectedCustomer.lastTransactionDate && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Clock className="w-3 h-3" />
                          শেষ লেনদেন: {selectedCustomer.lastTransactionDate}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Record Payment Button - Exactly matches user prompt! */}
                    <button
                      type="button"
                      onClick={handleOpenRecordPayment}
                      className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      title="বাকি আদায় / পেমেন্ট জমা করুন"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Record Payment (বাকি আদায়)</span>
                    </button>

                    {/* Statement PDF Download */}
                    <button
                      type="button"
                      onClick={handleDownloadLedgerPdf}
                      disabled={isExportingPdf}
                      className="px-3.5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                      title="লেজার স্টেটমেন্ট PDF ডাউনলোড করুন"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isExportingPdf ? "প্রস্তুত..." : "Statement PDF"}</span>
                    </button>

                    {/* Delete Customer Profile Button */}
                    <button
                      type="button"
                      onClick={() => setCustomerToDelete(selectedCustomer)}
                      className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition-all cursor-pointer border border-rose-200"
                      title="এই কাস্টমার প্রোফাইলটি মুছে ফেলুন (Delete Customer Profile)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 4-Bento Financial Overview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-amber-800">বর্তমান অবশিষ্ট বাকি</span>
                    <p className="text-xl font-black font-mono text-amber-950">
                      ৳ {(selectedCustomer.totalDue || 0).toLocaleString()}
                    </p>
                    <span className="text-[10px] text-amber-900 font-bold block">
                      {(selectedCustomer.totalDue || 0) > 0.01 ? "⚠️ বকেয়া অনাদায়ী" : "সব হিসাব ক্লিয়ার ✓"}
                    </span>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-gray-500">মোট কেনাকাটা</span>
                    <p className="text-xl font-black font-mono text-gray-900">
                      ৳ {(selectedCustomer.totalPurchases || 0).toLocaleString()}
                    </p>
                    <span className="text-[10px] text-gray-500 font-bold block">
                      🛒 {customerSpecificSales.length} বার ইনভয়েস
                    </span>
                  </div>

                  <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-emerald-800">মোট পরিশোধ</span>
                    <p className="text-xl font-black font-mono text-emerald-800">
                      ৳ {(selectedCustomer.totalPaid || 0).toLocaleString()}
                    </p>
                    <span className="text-[10px] text-emerald-800 font-bold block">
                      ✅ {customerSpecificPayments.length} বার জমা
                    </span>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-0.5">
                    <span className="text-[10px] font-black uppercase text-gray-500">মোট ছাড় / ডিসকাউন্ট</span>
                    <p className="text-xl font-black font-mono text-rose-600">
                      ৳ {(selectedCustomer.totalDiscount || 0).toLocaleString()}
                    </p>
                    <span className="text-[10px] text-gray-400 font-bold block">
                      বিশেষ ছাড়
                    </span>
                  </div>
                </div>
              </div>

              {/* Specific Transaction History Tabs */}
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden space-y-0">
                {/* Tab Header Controls */}
                <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
                  <div className="flex p-1 bg-white rounded-2xl border border-gray-200 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setActiveLedgerTab("statement")}
                      className={cn(
                        "px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                        activeLedgerTab === "statement"
                          ? "bg-gray-900 text-white shadow-xs font-black"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>পূর্ণাঙ্গ হিসাব স্টেটমেন্ট ({unifiedLedgerEntries.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveLedgerTab("sales")}
                      className={cn(
                        "px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                        activeLedgerTab === "sales"
                          ? "bg-gray-900 text-white shadow-xs font-black"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>বিক্রয় ও স্লিপ তালিকা ({customerSpecificSales.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveLedgerTab("payments")}
                      className={cn(
                        "px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                        activeLedgerTab === "payments"
                          ? "bg-gray-900 text-white shadow-xs font-black"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>বাকি আদায় ও পেমেন্ট রিসিট ({customerSpecificPayments.length})</span>
                    </button>
                  </div>

                  <span className="text-xs text-gray-500 font-mono">
                    সর্বশেষ হিসাব: <strong className="text-gray-900 font-bold">{selectedCustomer.lastTransactionDate || "আজ"}</strong>
                  </span>
                </div>

                {/* TAB 1: Unified Statement Ledger */}
                {activeLedgerTab === "statement" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-black uppercase text-gray-500 tracking-wider">
                          <th className="px-5 py-3.5">তারিখ ও সময়</th>
                          <th className="px-5 py-3.5">ভাউচার / রিসিট নং</th>
                          <th className="px-5 py-3.5">লেনদেনের বিবরণ</th>
                          <th className="px-5 py-3.5 text-right">ডেবিট (+বিল)</th>
                          <th className="px-5 py-3.5 text-right">ক্রেডিট (-জমা)</th>
                          <th className="px-5 py-3.5 text-right">অবশিষ্ট বকেয়া</th>
                          <th className="px-5 py-3.5 text-center">রশিদ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {unifiedLedgerEntries.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-gray-400 italic">
                              এই কাস্টমারের কোনো লেনদেনের ইতিহাস নেই
                            </td>
                          </tr>
                        ) : (
                          (() => {
                            let runningDue = 0;
                            return unifiedLedgerEntries.map((entry) => {
                              runningDue += entry.dueImpact;
                              const isSale = entry.type === "sale";

                              return (
                                <tr key={entry.id} className="hover:bg-gray-50/70 transition-colors">
                                  <td className="px-5 py-3.5">
                                    <span className="font-bold text-gray-900 block">{entry.date}</span>
                                    {entry.time && (
                                      <span className="text-[10px] text-gray-400 font-mono">{entry.time}</span>
                                    )}
                                  </td>

                                  <td className="px-5 py-3.5">
                                    <span className={cn(
                                      "font-mono font-bold text-xs px-2 py-0.5 rounded",
                                      isSale ? "bg-gray-100 text-gray-900" : "bg-emerald-50 text-emerald-800"
                                    )}>
                                      {entry.refNo}
                                    </span>
                                  </td>

                                  <td className="px-5 py-3.5">
                                    <span className="font-bold text-gray-900 block">{entry.particulars}</span>
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium mt-0.5">
                                      <span>পেমেন্ট: {entry.method || "Cash"}</span>
                                      {entry.notes && <span>• নোট: {entry.notes}</span>}
                                    </div>
                                  </td>

                                  <td className="px-5 py-3.5 text-right font-mono font-black text-gray-900">
                                    {entry.debit > 0 ? `৳${entry.debit.toLocaleString()}` : "—"}
                                  </td>

                                  <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">
                                    {entry.credit > 0 ? `৳${entry.credit.toLocaleString()}` : "—"}
                                  </td>

                                  <td className="px-5 py-3.5 text-right font-mono font-black">
                                    <span className={runningDue > 0 ? "text-amber-800" : "text-emerald-700"}>
                                      ৳{runningDue.toLocaleString()}
                                    </span>
                                  </td>

                                  <td className="px-5 py-3.5 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {entry.type === "payment" ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handlePrintCollectionReceipt(entry.rawItem as CustomerPayment)}
                                            className="p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer"
                                            title="মানি রিসিট প্রিন্ট করুন"
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setPaymentToDelete(entry.rawItem as CustomerPayment)}
                                            className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
                                            title="এই পেমেন্ট জমা বাতিল/মুছুন"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handlePrintSlip(entry.rawItem as CounterSale)}
                                            className="p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer"
                                            title="স্লিপ ভাউচার প্রিন্ট করুন"
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setSaleToDelete(entry.rawItem as CounterSale)}
                                            className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
                                            title="এই সেল বিলটি ডিলিট করুন (Delete Sale)"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            });
                          })()
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB 2: Counter Sales Bills & Slips */}
                {activeLedgerTab === "sales" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-black uppercase text-gray-500 tracking-wider">
                          <th className="px-5 py-3.5">তারিখ ও বিল নং</th>
                          <th className="px-5 py-3.5">স্লিপের হিসাব</th>
                          <th className="px-5 py-3.5 text-right">মোট স্লিপ</th>
                          <th className="px-5 py-3.5 text-right">ছাড়</th>
                          <th className="px-5 py-3.5 text-right">প্রদেয় বিল</th>
                          <th className="px-5 py-3.5 text-right">কাউন্টারে প্রাপ্ত</th>
                          <th className="px-5 py-3.5 text-right">বাকি</th>
                          <th className="px-5 py-3.5 text-center">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {customerSpecificSales.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-5 py-12 text-center text-gray-400 italic">
                              কোন বিক্রয় স্লিপ রেকর্ড পাওয়া যায়নি
                            </td>
                          </tr>
                        ) : (
                          customerSpecificSales.map((sale) => (
                            <tr key={sale.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="px-5 py-3.5">
                                <span className="font-mono font-black text-gray-900 block">{sale.saleId}</span>
                                <span className="text-[10px] text-gray-400 font-medium">{sale.date} • {sale.time}</span>
                              </td>

                              <td className="px-5 py-3.5">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {sale.slips?.map((sl, i) => (
                                    <span key={i} className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-mono">
                                      #{sl.slipNo || i + 1}: ৳{sl.amount}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-bold text-gray-700">
                                ৳{(sale.totalSlipsAmount || 0).toLocaleString()}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono text-rose-600">
                                {(sale.discountAmount && sale.discountAmount > 0) ? `-৳${sale.discountAmount}` : "—"}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-black text-gray-900">
                                ৳{(sale.netPayable ?? (sale.totalSlipsAmount - (sale.discountAmount || 0))).toLocaleString()}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">
                                ৳{(sale.receivedAmount || 0).toLocaleString()}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-black">
                                {(sale.dueAmount && sale.dueAmount > 0) ? (
                                  <span className="text-amber-800">৳{sale.dueAmount.toLocaleString()}</span>
                                ) : (
                                  <span className="text-emerald-700">পরিশোধিত ✓</span>
                                )}
                              </td>

                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handlePrintSlip(sale)}
                                    className="p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer"
                                    title="স্লিপ ভাউচার প্রিন্ট করুন"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSaleToDelete(sale)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
                                    title="এই সেল বিলটি ডিলিট করুন (Delete Sale)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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

                {/* TAB 3: Payment History */}
                {activeLedgerTab === "payments" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-black uppercase text-gray-500 tracking-wider">
                          <th className="px-5 py-3.5">রশিদ নং ও তারিখ</th>
                          <th className="px-5 py-3.5 text-right">পূর্বের বকেয়া</th>
                          <th className="px-5 py-3.5 text-right">আদায়কৃত টাকা</th>
                          <th className="px-5 py-3.5 text-right">অবশিষ্ট বকেয়া</th>
                          <th className="px-5 py-3.5">মাধ্যম</th>
                          <th className="px-5 py-3.5">মন্তব্য</th>
                          <th className="px-5 py-3.5 text-center">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {customerSpecificPayments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-gray-400 italic">
                              কোন বাকি আদায়ের রেকর্ড নেই
                            </td>
                          </tr>
                        ) : (
                          customerSpecificPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="px-5 py-3.5">
                                <span className="font-mono font-bold text-gray-900 block">{p.receiptNo || "CR-Manual"}</span>
                                <span className="text-[10px] text-gray-500 font-mono">{p.date} {p.time ? `• ${p.time}` : ""}</span>
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono text-gray-500">
                                {p.previousDue !== undefined ? `৳${p.previousDue.toLocaleString()}` : "—"}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-black text-emerald-700 text-sm">
                                ৳{(p.amount || 0).toLocaleString()}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-bold text-amber-900">
                                {p.remainingDue !== undefined ? `৳${p.remainingDue.toLocaleString()}` : "—"}
                              </td>

                              <td className="px-5 py-3.5">
                                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-mono text-[10px]">
                                  {p.paymentMethod}
                                </span>
                              </td>

                              <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">
                                {p.notes || "—"}
                              </td>

                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handlePrintCollectionReceipt(p)}
                                    className="p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer"
                                    title="রশিদ প্রিন্ট"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPaymentToDelete(p)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
                                    title="এই পেমেন্ট জমা বাতিল/মুছুন (Delete Payment)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
            </>
          )}
        </div>
      </div>

      {/* ================= MODAL 1: RECORD PAYMENT (বাকি আদায় জমা) ================= */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">
                    Record Payment (বাকি আদায় ও জমা)
                  </h3>
                  <p className="text-xs text-gray-500">
                    গ্রাহক: <strong className="text-gray-900">{selectedCustomer.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Current Due Highlight Box with "Clear Full Balance" button */}
            <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">বর্তমান বকেয়া বাকি:</span>
                <span className="text-xl font-black font-mono text-amber-950">৳ {(selectedCustomer.totalDue || 0).toLocaleString()}</span>
              </div>

              {(selectedCustomer.totalDue || 0) > 0 && (
                <button
                  type="button"
                  onClick={handleClearFullBalance}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  সম্পূর্ণ পরিশোধ
                </button>
              )}
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  আদায়কৃত টাকার পরিমাণ (Payment Amount) <span className="text-rose-500">*</span>:
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">৳</span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="যেমন: ১০০০"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 bg-white rounded-xl border border-gray-300 text-base font-black font-mono text-gray-900 focus:outline-none focus:border-gray-900"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">পেমেন্ট মাধ্যম (জমা খাতা):</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-bold text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer"
                >
                  <option value="Cash">ক্যাশ অ্যাকাউন্ট (Cash Drawer)</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.name}>{b.name} (৳{b.balance.toLocaleString()})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">মন্তব্য / বিবরণ (ঐচ্ছিক):</label>
                <input
                  type="text"
                  placeholder="যেমন: চেক নং, কিস্তি পরিশোধ বা নোট..."
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>

              {/* Dynamic Live Balance Preview */}
              {parseFloat(paymentAmount) > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 space-y-1 text-[11px]">
                  <div className="flex justify-between text-gray-600">
                    <span>পূর্বের বকেয়া:</span>
                    <span className="font-mono font-bold">৳ {(selectedCustomer.totalDue || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>আদায়কৃত টাকা:</span>
                    <span className="font-mono">- ৳ {parseFloat(paymentAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-black text-gray-900 border-t border-dashed border-gray-200 pt-1 text-xs">
                    <span>নতুন অবশিষ্ট বকেয়া:</span>
                    <span className="font-mono text-amber-900">
                      ৳ {Math.max(0, (selectedCustomer.totalDue || 0) - parseFloat(paymentAmount)).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmittingPayment || !paymentAmount}
                  className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 transition-all"
                >
                  {isSubmittingPayment ? "জমা হচ্ছে..." : "আদায় নিশ্চিত করুন ✓"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  বাতিল
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: MONEY RECEIPT (আদায় ভাউচার) ================= */}
      {receiptToShow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">পেমেন্ট সফল হয়েছে</h3>
                  <p className="text-xs text-emerald-700 font-bold">মানি রিসিট প্রস্তুত</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptToShow(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Receipt Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-gray-200 space-y-2.5 text-xs font-sans">
              <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 block">রশিদ নম্বর</span>
                  <span className="font-mono font-bold text-gray-900 text-sm">{receiptToShow.receiptNo}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-gray-400 block">তারিখ ও সময়</span>
                  <span className="text-xs font-bold text-gray-800">{receiptToShow.date} {receiptToShow.time || ""}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 block">কাস্টমার</span>
                <p className="font-bold text-sm text-gray-900">{receiptToShow.customerName}</p>
                {receiptToShow.customerPhone && (
                  <p className="text-xs text-gray-600 font-mono">মোবাইল: {receiptToShow.customerPhone}</p>
                )}
              </div>

              <div className="bg-white rounded-xl p-3 border border-gray-200 space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>পূর্বের বকেয়া:</span>
                  <span className="font-mono font-bold">৳ {(receiptToShow.previousDue || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-bold py-1 border-y border-dashed border-gray-200 text-sm">
                  <span>আদায়কৃত টাকা (জমা):</span>
                  <span className="font-mono font-black text-emerald-700">৳ {(receiptToShow.amount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-900 pt-0.5">
                  <span>বর্তমান অবশিষ্ট বকেয়া:</span>
                  <span className="font-mono font-black">৳ {(receiptToShow.remainingDue || 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="text-[11px] text-gray-600 flex justify-between">
                <span>মাধ্যম: <strong>{receiptToShow.paymentMethod}</strong></span>
                {receiptToShow.notes && <span>নোট: <strong>{receiptToShow.notes}</strong></span>}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handlePrintCollectionReceipt(receiptToShow)}
                className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>রশিদ প্রিন্ট করুন</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptToShow(null)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: ADD NEW CUSTOMER ================= */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900">নতুন কাস্টমার প্রোফাইল</h3>
                  <p className="text-xs text-gray-500">বাকি ও নগদ হিসাব খাতা খোলার জন্য</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCustomerModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  কাস্টমারের নাম <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  placeholder="যেমন: হাজী আব্দুল করিম"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-medium text-gray-900 focus:outline-none focus:border-gray-900"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">মোবাইল নম্বর (ঐচ্ছিক):</label>
                <input
                  type="text"
                  placeholder="01XXXXXXXXX"
                  value={newCustPhone}
                  onChange={e => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-mono text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ঠিকানা / এলাকা (ঐচ্ছিক):</label>
                <input
                  type="text"
                  placeholder="যেমন: চকবাজার, দোকান নং ৫"
                  value={newCustAddress}
                  onChange={e => setNewCustAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">প্রারম্ভিক বকেয়া বাকি (যদি থাকে):</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">৳</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newCustOpeningDue}
                    onChange={e => setNewCustOpeningDue(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-mono font-bold text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmittingCustomer || !newCustName.trim()}
                  className="flex-1 py-3 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmittingCustomer ? "সংরক্ষণ হচ্ছে..." : "প্রোফাইল তৈরি করুন ✓"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCustomerModalOpen(false)}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  বাতিল
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= IN-APP COUNTER SALE DELETE CONFIRMATION MODAL ================= */}
      {saleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-gray-900">
                কাউন্টার সেল মুছে ফেলবেন?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                আপনি কি নিশ্চিত যে সেল আইডি <strong className="text-gray-900 font-mono">{saleToDelete.saleId}</strong> ({saleToDelete.date}, মোট: ৳{saleToDelete.totalSlipsAmount.toLocaleString()}) মুছে ফেলতে চান?
              </p>
            </div>

            <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100 text-[11px] text-rose-800 space-y-1">
              <p className="font-bold">• এই সেল এবং এর সকল স্লিপ রেকর্ড স্থায়ীভাবে মুছে যাবে।</p>
              <p>• সংশ্লিষ্ট ক্যাশ লেনদেন এবং এই কাস্টমারের হিসাব খাতা থেকে বিলটি স্বয়ংক্রিয়ভাবে সমন্বয় (রিভার্স) হবে।</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingSale}
                onClick={() => executeDeleteSale(saleToDelete)}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeletingSale ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>মুছে ফেলা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>হ্যাঁ, ডিলিট করুন</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isDeletingSale}
                onClick={() => setSaleToDelete(null)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= IN-APP PAYMENT RECEIPT DELETE CONFIRMATION MODAL ================= */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-gray-900">
                পেমেন্ট রিসিট জমা বাতিল করবেন?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                রশিদ নং <strong className="text-gray-900 font-mono">{paymentToDelete.receiptNo}</strong> (টাকা: ৳{(paymentToDelete.amount || 0).toLocaleString()}, তারিখ: {paymentToDelete.date}) বাতিল করতে চান?
              </p>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-900 space-y-1 font-medium">
              <p className="font-bold">• এই জমার পরিমাণটি (৳{paymentToDelete.amount.toLocaleString()}) পুনরায় কাস্টমারের বকেয়া বাকি হিসেবে যুক্ত হবে।</p>
              <p>• সাধারণ আয় হিসাব ও ব্যাংক খাতা থেকে জমাটি রোলব্যাক হবে।</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={() => executeDeletePayment(paymentToDelete)}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeletingPayment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>বাতিল হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>হ্যাঁ, পেমেন্ট বাতিল করুন</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={() => setPaymentToDelete(null)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= IN-APP CUSTOMER PROFILE DELETE CONFIRMATION MODAL ================= */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-100 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-gray-900">
                কাস্টমার প্রোফাইল মুছে ফেলবেন?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                আপনি কি নিশ্চিত যে গ্রাহক <strong className="text-gray-900 font-bold">{customerToDelete.name}</strong> এর প্রোফাইল স্থায়ীভাবে মুছে ফেলতে চান?
              </p>
            </div>

            {customerToDelete.totalDue > 0 && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-900 font-bold space-y-1">
                ⚠️ সতর্কতা: এই কাস্টমারের নিকট এখনো ৳{customerToDelete.totalDue.toLocaleString()} বকেয়া বাকি রয়েছে!
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingCustomer}
                onClick={() => executeDeleteCustomer(customerToDelete)}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeletingCustomer ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>মুছে ফেলা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>হ্যাঁ, প্রোফাইল মুছুন</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isDeletingCustomer}
                onClick={() => setCustomerToDelete(null)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
