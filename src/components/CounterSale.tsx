import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  addDoc, 
  deleteDoc, 
  serverTimestamp,
  getDocs,
  where
} from "firebase/firestore";
import { db, OperationType, handleFirestoreError, cleanFirestoreData, updateDoc } from "@/src/lib/firebase";
import { CounterSale, SlipItem, Bank, UserRole, Transaction } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Receipt, 
  Plus, 
  Trash2, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  RefreshCw, 
  Save, 
  RotateCcw, 
  Scale, 
  DollarSign, 
  Eye, 
  Search, 
  Layers, 
  ArrowRight,
  Sparkles,
  ShoppingBag,
  Info,
  UserCircle
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";

interface CounterSaleProps {
  user: User;
  role: UserRole;
  onNavigateToStaffSales?: () => void;
  onNavigateToSalesLedger?: () => void;
}

export default function CounterSaleView({ 
  user, 
  role, 
  onNavigateToStaffSales, 
  onNavigateToSalesLedger 
}: CounterSaleProps) {
  const { language, t, formatDate, formatNumber } = useLanguage();

  // Branding parameters
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

  // Mode: "entry" | "register"
  const [activeTab, setActiveTab] = useState<"entry" | "register">("entry");

  // Helper to generate Day-wise Sequential Slip/Customer ID (দিন অনুযায়ী সিরিয়াল যেমন CS-260928-01, CS-260928-02)
  const getDayBasedId = (targetDateStr: string, salesList: CounterSale[]) => {
    let d: Date;
    try {
      d = new Date(targetDateStr.length === 10 ? `${targetDateStr}T12:00:00` : targetDateStr);
      if (isNaN(d.getTime())) d = new Date();
    } catch {
      d = new Date();
    }
    const yy = format(d, "yy");
    const mm = format(d, "MM");
    const dd = format(d, "dd");
    const dateCode = `${yy}${mm}${dd}`;
    const prefix = `CS-${dateCode}-`;

    // Filter sales on this specific target day
    const daySales = salesList.filter(s => s.date === targetDateStr);

    let maxSerial = 0;
    for (const sale of daySales) {
      if (typeof sale.dailySerial === "number" && sale.dailySerial > maxSerial) {
        maxSerial = sale.dailySerial;
      }
      if (sale.saleId) {
        const match = sale.saleId.match(/-(\d+)$/);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          // Only numbers < 10000 are daily serials (avoiding legacy 6-digit HHMMSS timestamps)
          if (!isNaN(num) && num < 10000 && num > maxSerial) {
            maxSerial = num;
          }
        }
      }
    }

    const nextSerial = Math.max(daySales.length + 1, maxSerial + 1);
    const seqStr = String(nextSerial).padStart(2, "0");
    return {
      saleId: `${prefix}${seqStr}`,
      dailySerial: nextSerial
    };
  };

  const [saleId, setSaleId] = useState<string>(() => {
    const today = new Date();
    return `CS-${format(today, "yyMMdd")}-01`;
  });
  const [currentDailySerial, setCurrentDailySerial] = useState<number>(1);
  
  // Date and Time (Live auto-updating until edited)
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  const [isManualTime, setIsManualTime] = useState(false);
  const [customDate, setCustomDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customTime, setCustomTime] = useState(format(new Date(), "HH:mm:ss"));

  // Keep live time ticking if in auto mode
  useEffect(() => {
    if (isManualTime) return;
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentDateTime(now);
      setCustomDate(format(now, "yyyy-MM-dd"));
      setCustomTime(format(now, "HH:mm:ss"));
    }, 1000);
    return () => clearInterval(timer);
  }, [isManualTime]);

  // Slips: user can input multiple slips (default 3 rows as requested: "যেমন একজন কাস্টমার দুই থেকে তিনটা স্লিপ হতে পারে তো তিনটা অ্যামাউন্ট আমি হাতে ইনপুট দেব")
  const [slips, setSlips] = useState<{ id: string; amount: string; note: string }[]>([
    { id: "1", amount: "", note: "" },
    { id: "2", amount: "", note: "" },
    { id: "3", amount: "", note: "" }
  ]);

  // Payment & Customer states (Name, Phone, Address are non-mandatory as requested)
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerAddress, setCustomerAddress] = useState<string>("");
  const [saleNotes, setSaleNotes] = useState<string>("");
  const [banks, setBanks] = useState<Bank[]>([]);

  // Feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSavedSale, setLastSavedSale] = useState<CounterSale | null>(null);

  // Counter Sales Register states
  const [counterSalesList, setCounterSalesList] = useState<CounterSale[]>([]);
  const [loadingSalesList, setLoadingSalesList] = useState(true);
  const [filterDate, setFilterDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedSaleForView, setSelectedSaleForView] = useState<CounterSale | null>(null);

  // Load Banks
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    });
    return () => unsub();
  }, []);

  // Load Counter Sales from Firestore
  useEffect(() => {
    setLoadingSalesList(true);
    const q = query(collection(db, "counterSales"), orderBy("dateTime", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CounterSale));
      setCounterSalesList(list);
      setLoadingSalesList(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "counterSales");
      setLoadingSalesList(false);
    });
    return () => unsub();
  }, []);

  // Active Date for Day-wise Sequence ID
  const activeDate = isManualTime ? customDate : format(currentDateTime, "yyyy-MM-dd");

  useEffect(() => {
    const nextInfo = getDayBasedId(activeDate, counterSalesList);
    setSaleId(nextInfo.saleId);
    setCurrentDailySerial(nextInfo.dailySerial);
  }, [activeDate, counterSalesList]);

  // Calculations
  const slipAmounts = slips.map(s => parseFloat(s.amount) || 0);
  const totalSlipsAmount = slipAmounts.reduce((acc, curr) => acc + curr, 0);
  const receivedNum = parseFloat(receivedAmount) || 0;

  // Balancing logic ("এবং এই সেল টোটাল আমি দেখব যে সমান সমান হচ্ছে কিনা")
  const diff = receivedNum - totalSlipsAmount;
  const isBalanced = totalSlipsAmount > 0 && Math.abs(diff) < 0.01;
  const isShort = totalSlipsAmount > 0 && diff < -0.01;
  const isExcess = totalSlipsAmount > 0 && diff > 0.01;

  // Slip manipulation handlers
  const handleSlipChange = (index: number, val: string) => {
    const newSlips = [...slips];
    newSlips[index].amount = val;
    setSlips(newSlips);
  };

  const addSlipRow = () => {
    setSlips(prev => [
      ...prev,
      { id: Date.now().toString(), amount: "", note: "" }
    ]);
  };

  const removeSlipRow = (index: number) => {
    if (slips.length <= 1) {
      setSlips([{ id: Date.now().toString(), amount: "", note: "" }]);
      return;
    }
    setSlips(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setIsManualTime(false);
    const now = new Date();
    setCurrentDateTime(now);
    const todayStr = format(now, "yyyy-MM-dd");
    setCustomDate(todayStr);
    setCustomTime(format(now, "HH:mm:ss"));
    const nextInfo = getDayBasedId(todayStr, counterSalesList);
    setSaleId(nextInfo.saleId);
    setCurrentDailySerial(nextInfo.dailySerial);
    setSlips([
      { id: "1", amount: "", note: "" },
      { id: "2", amount: "", note: "" },
      { id: "3", amount: "", note: "" }
    ]);
    setReceivedAmount("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setSaleNotes("");
    setPaymentMethod("Cash");
  };

  // Quick Action: Match received to total ("সমান সমান করুন")
  const handleAutoEqual = () => {
    if (totalSlipsAmount > 0) {
      setReceivedAmount(totalSlipsAmount.toString());
    }
  };

  // Save Counter Sale
  const handleSaveCounterSale = async () => {
    const validSlips: SlipItem[] = slips
      .map((s, idx) => {
        const item: SlipItem = {
          slipNo: idx + 1,
          amount: parseFloat(s.amount) || 0,
        };
        const trimmedNote = (s.note || "").trim();
        if (trimmedNote) {
          item.notes = trimmedNote;
        }
        return item;
      })
      .filter(s => s.amount > 0);

    if (validSlips.length === 0) {
      alert("অনুগ্রহ করে অন্তত একটি স্লিপের টাকার পরিমাণ ইনপুট দিন। (Please enter at least one slip amount)");
      return;
    }

    if (receivedNum <= 0 && receivedAmount === "") {
      // If user hasn't explicitly entered received amount, ask or auto-assume exact payment
      const proceed = confirm(`প্রাপ্ত টাকার পরিমাণ ইনপুট দেওয়া হয়নি। সর্বমোট স্লিপ ৳${totalSlipsAmount} সমান সমান (সম্পূর্ণ পরিশোধ) ধরে সংরক্ষণ করবেন?`);
      if (proceed) {
        setReceivedAmount(totalSlipsAmount.toString());
      } else {
        return;
      }
    }

    const finalReceived = receivedAmount !== "" ? (parseFloat(receivedAmount) || 0) : totalSlipsAmount;
    const finalDiff = finalReceived - totalSlipsAmount;
    const finalIsBalanced = Math.abs(finalDiff) < 0.01;
    const balanceStatus: "equal" | "short" | "excess" = 
      finalIsBalanced ? "equal" : finalDiff < 0 ? "short" : "excess";

    setIsSubmitting(true);

    try {
      const isoDateTime = isManualTime 
        ? new Date(`${customDate}T${customTime}`).toISOString()
        : currentDateTime.toISOString();
      const datePart = isManualTime ? customDate : format(currentDateTime, "yyyy-MM-dd");
      const timePart = isManualTime ? customTime : format(currentDateTime, "HH:mm:ss");

      // Generate day-based sequence ID and serial
      const dayCalc = getDayBasedId(datePart, counterSalesList);
      const finalSaleId = saleId || dayCalc.saleId;
      const finalDailySerial = currentDailySerial || dayCalc.dailySerial;

      // 1. Create CounterSale document in Firestore (ensure zero undefined fields)
      const newCounterSale: Record<string, any> = {
        saleId: finalSaleId,
        dailySerial: finalDailySerial,
        dateTime: isoDateTime,
        date: datePart,
        time: timePart,
        slips: validSlips,
        totalSlipsAmount: totalSlipsAmount,
        receivedAmount: finalReceived,
        changeAmount: finalDiff > 0 ? finalDiff : 0,
        dueAmount: finalDiff < 0 ? Math.abs(finalDiff) : 0,
        isBalanced: finalIsBalanced,
        balanceStatus: balanceStatus,
        paymentMethod: paymentMethod,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      };

      const trimmedCustomer = customerName.trim();
      if (trimmedCustomer) {
        newCounterSale.customerName = trimmedCustomer;
      }
      const trimmedPhone = customerPhone.trim();
      if (trimmedPhone) {
        newCounterSale.customerPhone = trimmedPhone;
      }
      const trimmedAddress = customerAddress.trim();
      if (trimmedAddress) {
        newCounterSale.customerAddress = trimmedAddress;
      }
      const trimmedNotes = saleNotes.trim();
      if (trimmedNotes) {
        newCounterSale.notes = trimmedNotes;
      }

      const docRef = await addDoc(collection(db, "counterSales"), cleanFirestoreData(newCounterSale));

      // 2. Also register as income in general transactions so store cash flow & totals stay 100% in sync!
      try {
        const slipsSummary = validSlips.map(s => `স্লিপ #${s.slipNo}: ৳${s.amount}`).join(", ");
        const newTx: Record<string, any> = {
          date: isoDateTime,
          type: "income",
          category: "Counter Sale",
          subCategory: newCounterSale.saleId,
          amount: totalSlipsAmount,
          paymentMethod: paymentMethod,
          notes: `Counter Sale [${newCounterSale.saleId}] - ${validSlips.length} Slips (${slipsSummary}) | ${finalIsBalanced ? 'সমান সমান ✓' : `প্রাপ্ত: ৳${finalReceived}`}`,
          createdBy: user.uid
        };
        const txDoc = await addDoc(collection(db, "transactions"), cleanFirestoreData(newTx));
        // Link transaction ID
        newCounterSale.transactionId = txDoc.id;
        try {
          await updateDoc(doc(db, "counterSales", docRef.id), { transactionId: txDoc.id });
        } catch {
          // ignore background update error if any
        }
      } catch (txErr) {
        console.warn("Could not log matching transaction record:", txErr);
      }

      setLastSavedSale({ id: docRef.id, ...newCounterSale } as CounterSale);
      setSaveSuccess(true);
      resetForm();

      setTimeout(() => {
        setSaveSuccess(false);
      }, 3500);

    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "counterSales");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Thermal Slip Printing Handler
  const handlePrintSlip = (sale: CounterSale) => {
    const printWindow = window.open("", "_blank", "width=360,height=600");
    if (!printWindow) {
      alert("Please allow popups to print receipt.");
      return;
    }

    const slipsRows = sale.slips.map((s, idx) => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px;">
        <span>স্লিপ #${s.slipNo || idx + 1}</span>
        <span style="font-weight: bold; font-family: monospace;">৳ ${s.amount.toLocaleString()}</span>
      </div>
    `).join("");

    const statusBadge = sale.isBalanced 
      ? `<div style="text-align: center; margin-top: 10px; padding: 6px; background-color: #ecfdf5; color: #047857; font-weight: bold; border-radius: 6px; border: 1px solid #a7f3d0; font-size: 13px;">
          ✓ হিসাব সমান সমান (PAID IN FULL)
         </div>`
      : sale.dueAmount > 0 
      ? `<div style="text-align: center; margin-top: 10px; padding: 6px; background-color: #fffbeb; color: #b45309; font-weight: bold; border-radius: 6px; border: 1px solid #fde68a; font-size: 13px;">
          বাকি / শর্ট: ৳ ${sale.dueAmount.toLocaleString()}
         </div>`
      : `<div style="text-align: center; margin-top: 10px; padding: 6px; background-color: #eff6ff; color: #1d4ed8; font-weight: bold; border-radius: 6px; border: 1px solid #bfdbfe; font-size: 13px;">
          ফেরত প্রদান: ৳ ${sale.changeAmount.toLocaleString()}
         </div>`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${sale.saleId}</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
              width: 76mm; 
              margin: 0 auto; 
              padding: 10px 6px; 
              color: #0f172a;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .header { margin-bottom: 10px; }
            .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; }
            .header p { margin: 2px 0; font-size: 11px; color: #64748b; }
            .info-block { font-size: 11px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #000; }
            .info-row { display: flex; justify-content: space-between; margin: 2px 0; }
            .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; margin-top: 6px; }
            .footer { margin-top: 16px; text-align: center; font-size: 10px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header center">
            <h2>${companyName}</h2>
            <p>${companyAddress}</p>
            <p>ফোন: ${companyPhone}</p>
            <p style="font-weight: bold; margin-top: 4px; font-size: 12px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">কাউন্টার সেল ভাউচার</p>
          </div>

          <div class="info-block">
            <div class="info-row">
              <span>স্লিপ কাস্টমার আইডি:</span>
              <span class="bold" style="font-family: monospace;">${sale.saleId} ${sale.dailySerial ? `(নং #${sale.dailySerial})` : ''}</span>
            </div>
            <div class="info-row">
              <span>তারিখ ও সময়:</span>
              <span>${sale.date} ${sale.time}</span>
            </div>
            ${sale.customerName ? `
            <div class="info-row">
              <span>কাস্টমার নাম:</span>
              <span class="bold">${sale.customerName}</span>
            </div>` : ''}
            ${sale.customerPhone ? `
            <div class="info-row">
              <span>মোবাইল নং:</span>
              <span class="bold font-mono">${sale.customerPhone}</span>
            </div>` : ''}
            ${sale.customerAddress ? `
            <div class="info-row">
              <span>ঠিকানা:</span>
              <span>${sale.customerAddress}</span>
            </div>` : ''}
            <div class="info-row">
              <span>পেমেন্ট মোড:</span>
              <span class="bold">${sale.paymentMethod}</span>
            </div>
          </div>

          <div style="margin-bottom: 6px;">
            <div style="font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; margin-bottom: 4px;">স্লিপের হিসাব বিবরণী:</div>
            ${slipsRows}
          </div>

          <div class="total-row">
            <span>সর্বমোট স্লিপ:</span>
            <span>৳ ${sale.totalSlipsAmount.toLocaleString()}</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px;">
            <span>প্রাপ্ত টাকা:</span>
            <span style="font-family: monospace; font-weight: bold;">৳ ${sale.receivedAmount.toLocaleString()}</span>
          </div>

          ${statusBadge}

          <div class="footer">
            <p>আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!</p>
            <p style="font-family: monospace; font-size: 8px;">ModernManager POS Automated Desk</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Delete counter sale
  const handleDeleteSale = async (id: string, sId: string, txId?: string) => {
    const confirmDel = confirm(`আপনি কি নিশ্চিত যে সেল আইডি ${sId} মুছে ফেলতে চান?`);
    if (!confirmDel) return;

    try {
      await deleteDoc(doc(db, "counterSales", id));
      if (txId) {
        try {
          await deleteDoc(doc(db, "transactions", txId));
        } catch (e) {
          console.warn("Could not delete matching transaction:", e);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `counterSales/${id}`);
    }
  };

  // Filtering for Register tab
  const filteredSales = counterSalesList.filter(sale => {
    const matchesDate = filterDate ? sale.date === filterDate : true;
    const matchesSearch = searchTerm 
      ? sale.saleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sale.customerName && sale.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (sale.customerPhone && sale.customerPhone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (sale.customerAddress && sale.customerAddress.toLowerCase().includes(searchTerm.toLowerCase())) ||
        sale.totalSlipsAmount.toString().includes(searchTerm)
      : true;
    return matchesDate && matchesSearch;
  });

  // Daily Tally Calculations for filtered list
  const dailyTotalSales = filteredSales.reduce((acc, s) => acc + s.totalSlipsAmount, 0);
  const dailyTotalReceived = filteredSales.reduce((acc, s) => acc + s.receivedAmount, 0);
  const dailyTotalSlipsCount = filteredSales.reduce((acc, s) => acc + s.slips.length, 0);
  const dailyBalancedSalesCount = filteredSales.filter(s => s.isBalanced).length;
  const isDailyTallyBalanced = filteredSales.length > 0 && Math.abs(dailyTotalReceived - dailyTotalSales) < 0.01;

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation & Context Switcher */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-white border border-gray-200 text-gray-900 shadow-2xs">
              <Receipt className="w-5 h-5 text-gray-800" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                কাউন্টার সেল (স্লিপ ভিত্তিক বিক্রয়)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                স্লিপ অনুযায়ী দ্রুত এন্ট্রি, অটো টাইম-আইডি ও তাৎক্ষণিক সমান সমান মিলকরণ
              </p>
            </div>
          </div>
        </div>

        {/* Tab & View Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex p-1 bg-white rounded-2xl border border-gray-200 w-full sm:w-auto shadow-2xs">
            <button
              onClick={() => setActiveTab("entry")}
              className={cn(
                "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === "entry"
                  ? "bg-gray-900 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>নতুন স্লিপ এন্ট্রি</span>
            </button>
            <button
              onClick={() => setActiveTab("register")}
              className={cn(
                "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === "register"
                  ? "bg-gray-900 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>কাউন্টার রেজিস্টার ও মিলকরণ ({filteredSales.length})</span>
            </button>
          </div>

          {onNavigateToStaffSales && (
            <button
              onClick={onNavigateToStaffSales}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 rounded-xl text-xs font-bold border border-gray-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Switch to Staff Sales Entry"
            >
              <span>স্টাফ দৈনিক সেল</span>
              <ArrowRight className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* SUCCESS NOTIFICATION TOAST */}
      <AnimatePresence>
        {saveSuccess && lastSavedSale && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-white border-2 border-emerald-500 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-extrabold text-sm text-gray-900">
                  কাউন্টার সেল সফলভাবে সংরক্ষিত হয়েছে!
                </p>
                <p className="text-xs text-gray-600 font-mono mt-0.5">
                  স্লিপ কাস্টমার আইডি: <strong className="text-gray-900">{lastSavedSale.saleId}</strong>
                  {lastSavedSale.customerName && ` • ${lastSavedSale.customerName}`}
                  {lastSavedSale.customerPhone && ` (${lastSavedSale.customerPhone})`}
                  {` • মোট: ৳${lastSavedSale.totalSlipsAmount.toLocaleString()}`} 
                  {lastSavedSale.isBalanced && " • সমান সমান ✓"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handlePrintSlip(lastSavedSale)}
                className="flex-1 sm:flex-initial px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>স্লিপ প্রিন্ট করুন</span>
              </button>
              <button
                type="button"
                onClick={() => setSaveSuccess(false)}
                className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl border border-gray-200 cursor-pointer"
              >
                ঠিক আছে
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= TAB 1: FAST SLIP ENTRY DESK ================= */}
      {activeTab === "entry" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Slips Input Card */}
          <div className="lg:col-span-8 bg-white rounded-3xl p-5 sm:p-8 border border-gray-200 shadow-sm space-y-6">
            {/* Auto Time & Day-wise Customer ID Bar */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
              {/* Day-based Customer/Slip ID */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-gray-700" />
                  স্লিপ কাস্টমার আইডি (দিন অনুযায়ী)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-black font-mono text-gray-900 bg-white px-3.5 py-1 rounded-xl border border-gray-300 shadow-2xs">
                    {saleId}
                  </span>
                  <span className="text-xs font-bold text-gray-700 bg-gray-50 px-2.5 py-1 rounded-xl border border-gray-200">
                    আজকের ক্রমিক #{currentDailySerial}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextInfo = getDayBasedId(activeDate, counterSalesList);
                      setSaleId(nextInfo.saleId);
                      setCurrentDailySerial(nextInfo.dailySerial);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 bg-white"
                    title="দিন অনুযায়ী আইডি রিফ্রেশ করুন"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Auto Date & Live Time */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    তারিখ ও লাইভ সময়
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsManualTime(!isManualTime)}
                    className="text-[10px] text-gray-600 hover:text-gray-900 font-bold underline cursor-pointer"
                  >
                    {isManualTime ? "লাইভ টাইম চালু করুন" : "সময় পরিবর্তন"}
                  </button>
                </div>

                {!isManualTime ? (
                  <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-xl border border-gray-300 shadow-2xs">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-800">
                      {format(currentDateTime, "dd MMM yyyy")}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs font-mono font-black text-gray-900">
                      {format(currentDateTime, "hh:mm:ss a")}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="px-2.5 py-1 text-xs font-bold bg-white rounded-xl border border-gray-300 text-gray-900 focus:outline-none focus:border-gray-900"
                    />
                    <input
                      type="time"
                      step="1"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="px-2.5 py-1 text-xs font-bold font-mono bg-white rounded-xl border border-gray-300 text-gray-900 focus:outline-none focus:border-gray-900"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Slip Amount Entry Table / Rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-gray-900 flex items-center gap-2">
                    <span>স্লিপ অনুযায়ী এন্ট্রি (Slip Inputs)</span>
                    <span className="text-xs font-normal text-gray-500">
                      (কাপড়ের নাম প্রয়োজন নেই — শুধু টাকার পরিমাণ)
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    একজন কাস্টমারের ২ বা ৩টি বা ততোধিক স্লিপের টাকা ক্রমানুসারে ইনপুট দিন
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addSlipRow}
                  className="px-3.5 py-1.5 bg-white hover:bg-gray-50 text-gray-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-gray-300 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ আরও স্লিপ যোগ করুন</span>
                </button>
              </div>

              {/* Slips List */}
              <div className="space-y-2.5 pt-2">
                {slips.map((slip, idx) => {
                  const slipVal = parseFloat(slip.amount) || 0;
                  return (
                    <motion.div
                      key={slip.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className={cn(
                        "flex items-center gap-3 p-3 bg-white rounded-2xl border transition-all shadow-2xs",
                        slipVal > 0 
                          ? "border-gray-400" 
                          : "border-gray-200"
                      )}
                    >
                      {/* Slip Index Badge */}
                      <div className="w-9 h-9 rounded-xl bg-white text-gray-800 border border-gray-200 flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                        #{idx + 1}
                      </div>

                      {/* Slip Amount Input */}
                      <div className="flex-1 relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                          ৳
                        </span>
                        <input
                          type="number"
                          step="any"
                          placeholder={`স্লিপ #${idx + 1} এর টাকা`}
                          value={slip.amount}
                          onChange={(e) => handleSlipChange(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (idx === slips.length - 1) {
                                addSlipRow();
                              } else {
                                const nextInput = document.getElementById(`slip-input-${idx + 1}`);
                                if (nextInput) nextInput.focus();
                              }
                            }
                          }}
                          id={`slip-input-${idx}`}
                          autoFocus={idx === 0}
                          className="w-full pl-8 pr-4 py-2.5 bg-white rounded-xl border border-gray-300 text-base font-black font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                        />
                      </div>

                      {/* Optional Slip Remark */}
                      <input
                        type="text"
                        placeholder="মন্তব্য (ঐচ্ছিক)"
                        value={slip.note}
                        onChange={(e) => {
                          const updated = [...slips];
                          updated[idx].note = e.target.value;
                          setSlips(updated);
                        }}
                        className="w-28 sm:w-40 px-3 py-2.5 text-xs bg-white rounded-xl border border-gray-300 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 hidden sm:block"
                      />

                      {/* Remove Row Button */}
                      <button
                        type="button"
                        onClick={() => removeSlipRow(idx)}
                        disabled={slips.length <= 1}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-30 cursor-pointer"
                        title="Remove slip row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>

              {/* Slips Summary Bar */}
              <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-700">
                    মোট স্লিপ সংখ্যা: {slips.filter(s => parseFloat(s.amount) > 0).length} টি
                  </span>
                  <span>•</span>
                  <span>(Enter চাপলে স্বয়ংক্রিয়ভাবে পরবর্তী স্লিপ যোগ হবে)</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSlips([
                      { id: "1", amount: "", note: "" },
                      { id: "2", amount: "", note: "" },
                      { id: "3", amount: "", note: "" }
                    ]);
                    setReceivedAmount("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>সব স্লিপ ক্লিয়ার করুন</span>
                </button>
              </div>
            </div>

            {/* Optional Customer Information & Payment Details (Non-mandatory as requested) */}
            <div className="pt-4 border-t border-gray-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider flex items-center gap-1.5">
                  <UserCircle className="w-4 h-4 text-gray-700" />
                  <span>কাস্টমার তথ্য ও পেমেন্ট (ঐচ্ছিক — কোনো তথ্যই বাধ্যতামূলক নয়)</span>
                </span>
                <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-2xs">
                  ঐচ্ছিক / Optional
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Customer Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    কাস্টমার নাম <span className="text-[10px] font-normal text-gray-400">(ঐচ্ছিক)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="যেমন: মো: রফিকুল ইসলাম"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900"
                  />
                </div>

                {/* Customer Phone / Mobile */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    মোবাইল নম্বর <span className="text-[10px] font-normal text-gray-400">(ঐচ্ছিক)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="যেমন: 017xxxxxxxx"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-mono font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900"
                  />
                </div>

                {/* Customer Address */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    কাস্টমার ঠিকানা <span className="text-[10px] font-normal text-gray-400">(ঐচ্ছিক)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="যেমন: মিরপুর-১০, ঢাকা"
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    পেমেন্ট মাধ্যম (Payment Method)
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-bold text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer"
                  >
                    <option value="Cash">ক্যাশ অ্যাকাউন্ট (Cash Drawer)</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.name}>
                        {b.name} (৳{b.balance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sale Notes */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    সেল নোট / বিশেষ মন্তব্য <span className="text-[10px] font-normal text-gray-400">(ঐচ্ছিক)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="প্রয়োজনীয় কোনো নোট থাকলে লিখুন..."
                    value={saleNotes}
                    onChange={e => setSaleNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Side Balancing & Verification Panel ("সমান সমান হচ্ছে কিনা") */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-200 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <Scale className="w-5 h-5 text-gray-900" />
                <h3 className="font-extrabold text-base text-gray-900">
                  হিসাব ও মিলকরণ (Balancing)
                </h3>
              </div>

              {/* Total Slips Big Display */}
              <div className="p-4 bg-white rounded-2xl border border-gray-200 space-y-1 shadow-2xs">
                <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                  সর্বমোট স্লিপের টাকা (Total Slips)
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-gray-900">
                  ৳ {totalSlipsAmount.toLocaleString()}
                </div>
                <div className="text-[11px] text-gray-500 pt-1">
                  {slips.filter(s => parseFloat(s.amount) > 0).map((s, i) => (
                    <span key={i} className="inline-block mr-2 font-mono text-gray-700 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                      #{i + 1}: ৳{parseFloat(s.amount).toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>

              {/* Received Amount Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-gray-700">
                    কাস্টমার থেকে প্রাপ্ত টাকা (Cash Received):
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoEqual}
                    className="text-[11px] text-gray-900 font-extrabold hover:bg-gray-100 cursor-pointer bg-white px-2.5 py-1 rounded-xl border border-gray-300 shadow-2xs"
                  >
                    সমান সমান করুন ✓
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                    ৳
                  </span>
                  <input
                    type="number"
                    step="any"
                    placeholder={totalSlipsAmount > 0 ? totalSlipsAmount.toString() : "0"}
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-white rounded-xl border-2 border-gray-300 text-xl font-black font-mono text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  />
                </div>
              </div>

              {/* LIVE BALANCING STATUS BANNER ("সমান সমান হচ্ছে কিনা") */}
              <div className="pt-1">
                {totalSlipsAmount === 0 ? (
                  <div className="p-3.5 rounded-2xl bg-white text-gray-400 text-xs font-semibold text-center border border-dashed border-gray-200">
                    স্লিপের টাকার পরিমাণ ইনপুট দিলে সমান সমান স্ট্যাটাস দেখা যাবে
                  </div>
                ) : isBalanced ? (
                  <div className="p-4 rounded-2xl bg-white border-2 border-emerald-500 text-gray-900 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2 font-black text-sm text-emerald-700">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>✓ সম্পূর্ণ সমান সমান (100% Balanced)</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      মোট স্লিপের টাকা (৳{totalSlipsAmount.toLocaleString()}) এবং প্রাপ্ত টাকা (৳{receivedNum.toLocaleString()}) হুবহু সমান সমান মিলে গেছে!
                    </p>
                  </div>
                ) : isShort ? (
                  <div className="p-4 rounded-2xl bg-white border-2 border-amber-500 text-gray-900 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2 font-black text-sm text-amber-700">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                      <span>বাকি / শর্ট: ৳ {Math.abs(diff).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      কাস্টমার থেকে মোট স্লিপের চেয়ে ৳{Math.abs(diff).toLocaleString()} কম প্রাপ্ত হয়েছে।
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-white border-2 border-gray-400 text-gray-900 space-y-1 shadow-2xs">
                    <div className="flex items-center gap-2 font-black text-sm text-gray-900">
                      <Info className="w-5 h-5 text-gray-700" />
                      <span>ফেরত প্রদান: ৳ {diff.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      কাস্টমারকে অতিরিক্ত ৳{diff.toLocaleString()} ফেরত দিতে হবে।
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || totalSlipsAmount <= 0}
                  onClick={handleSaveCounterSale}
                  className="w-full py-4 bg-gray-900 hover:bg-black disabled:opacity-40 text-white rounded-2xl font-black text-base transition-all shadow-sm active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>সংরক্ষণ হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>কাউন্টার সেল সংরক্ষণ করুন</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all cursor-pointer text-center"
                >
                  ফর্ম রিসেট করুন (নতুন কাস্টমার)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: COUNTER SALES REGISTER & DAILY TALLY ================= */}
      {activeTab === "register" && (
        <div className="space-y-6">
          {/* Daily Tally Summary Bento Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Today's Total Counter Sales */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-2">
              <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                ফিল্টারকৃত মোট কাউন্টার সেল
              </span>
              <div className="text-2xl font-black font-mono text-gray-900">
                ৳ {dailyTotalSales.toLocaleString()}
              </div>
              <p className="text-xs text-gray-400">
                মোট {filteredSales.length} টি অর্ডারে সর্বমোট বিক্রয়
              </p>
            </div>

            {/* Card 2: Total Slips Logged */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-2">
              <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                মোট স্লিপ সংখ্যা (Slips Logged)
              </span>
              <div className="text-2xl font-black font-mono text-gray-900">
                {dailyTotalSlipsCount} টি
              </div>
              <p className="text-xs text-gray-400">
                গড়ে প্রতি কাস্টমারে {filteredSales.length > 0 ? (dailyTotalSlipsCount / filteredSales.length).toFixed(1) : 0} টি স্লিপ
              </p>
            </div>

            {/* Card 3: Cash Received */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-2">
              <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                প্রাপ্ত ক্যাশ/পেমেন্ট (Cash In)
              </span>
              <div className="text-2xl font-black font-mono text-gray-900">
                ৳ {dailyTotalReceived.toLocaleString()}
              </div>
              <p className="text-xs text-gray-400">
                কাউন্টার ক্যাশ ড্রয়ারে মোট প্রাপ্তি
              </p>
            </div>

            {/* Card 4: Daily Balance / Tally Status */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-2">
              <span className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                ক্যাশ ও স্লিপ সমীকরণ (Daily Tally)
              </span>
              <div className={cn(
                "text-lg font-black flex items-center gap-1.5",
                isDailyTallyBalanced 
                  ? "text-emerald-700"
                  : "text-amber-700"
              )}>
                {isDailyTallyBalanced ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                    <span>১০০% সমান সমান ✓</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                    <span>পার্থক্য: ৳{Math.abs(dailyTotalReceived - dailyTotalSales).toLocaleString()}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {dailyBalancedSalesCount} / {filteredSales.length} টি সেল সমান সমান
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs font-bold text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>

              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate("")}
                  className="text-xs text-gray-500 hover:text-gray-900 underline cursor-pointer"
                >
                  সব তারিখ দেখুন
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="সেল আইডি বা টাকার পরিমাণ খুঁজুন..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-white rounded-xl border border-gray-300 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900"
              />
            </div>
          </div>

          {/* Sales Ledger Table */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingSalesList ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold">
                লোড হচ্ছে...
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center mx-auto text-gray-400 shadow-2xs">
                  <Receipt className="w-6 h-6 text-gray-600" />
                </div>
                <p className="text-sm font-bold text-gray-600">কোন কাউন্টার সেল পাওয়া যায়নি</p>
                <button
                  onClick={() => setActiveTab("entry")}
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black cursor-pointer shadow-xs"
                >
                  প্রথম স্লিপ এন্ট্রি দিন
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-gray-200 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                      <th className="px-5 py-4">স্লিপ কাস্টমার আইডি ও বিবরণ</th>
                      <th className="px-5 py-4">স্লিপসমূহ (Slips Breakdown)</th>
                      <th className="px-5 py-4 text-right">সর্বমোট স্লিপ</th>
                      <th className="px-5 py-4 text-right">প্রাপ্ত টাকা</th>
                      <th className="px-5 py-4 text-center">স্ট্যাটাস</th>
                      <th className="px-5 py-4 text-center">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs font-medium">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-gray-50/70 transition-colors bg-white">
                        <td className="px-5 py-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-gray-900 text-sm">
                                {sale.saleId}
                              </span>
                              {sale.dailySerial && (
                                <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                                  #{sale.dailySerial}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 font-medium">
                              {sale.date} • {sale.time}
                            </div>
                            {sale.customerName && (
                              <div className="text-[11px] text-gray-800 font-bold">
                                {sale.customerName}
                              </div>
                            )}
                            {sale.customerPhone && (
                              <div className="text-[10px] text-gray-500 font-mono">
                                📞 {sale.customerPhone}
                              </div>
                            )}
                            {sale.customerAddress && (
                              <div className="text-[10px] text-gray-400">
                                📍 {sale.customerAddress}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-md">
                            {sale.slips.map((s, idx) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white text-gray-800 text-[11px] font-mono border border-gray-200 shadow-2xs"
                              >
                                <span className="text-gray-400">#{s.slipNo || idx + 1}:</span>
                                <strong className="font-bold">৳{s.amount.toLocaleString()}</strong>
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right font-mono font-black text-gray-900 text-sm">
                          ৳ {sale.totalSlipsAmount.toLocaleString()}
                        </td>

                        <td className="px-5 py-4 text-right font-mono font-black text-gray-800">
                          ৳ {sale.receivedAmount.toLocaleString()}
                          <div className="text-[10px] text-gray-400 font-normal">
                            {sale.paymentMethod}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-center">
                          {sale.isBalanced ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-emerald-700 text-[11px] font-black border border-emerald-300 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>সমান সমান</span>
                            </span>
                          ) : sale.dueAmount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-amber-700 text-[11px] font-bold border border-amber-300 shadow-2xs">
                              <span>বাকি ৳{sale.dueAmount.toLocaleString()}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-gray-800 text-[11px] font-bold border border-gray-300 shadow-2xs">
                              <span>ফেরত ৳{sale.changeAmount.toLocaleString()}</span>
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handlePrintSlip(sale)}
                              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                              title="Print Slip Receipt"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSaleForView(sale)}
                              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                              title="View Slips Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {role === "admin" && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSale(sale.id!, sale.saleId, sale.transactionId)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                title="Delete counter sale"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedSaleForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-gray-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">
                  কাউন্টার সেল বিবরণী
                </h3>
                <p className="text-xs font-mono text-gray-600 font-bold mt-0.5">
                  {selectedSaleForView.saleId}
                </p>
              </div>
              <button
                onClick={() => setSelectedSaleForView(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">তারিখ ও সময়:</span>
                <span className="font-bold text-gray-900">{selectedSaleForView.date} {selectedSaleForView.time}</span>
              </div>
              {selectedSaleForView.dailySerial && (
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">দিন অনুযায়ী ক্রমিক:</span>
                  <span className="font-bold text-gray-900 font-mono">#{selectedSaleForView.dailySerial}</span>
                </div>
              )}
              {selectedSaleForView.customerName && (
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">কাস্টমার নাম:</span>
                  <span className="font-bold text-gray-900">{selectedSaleForView.customerName}</span>
                </div>
              )}
              {selectedSaleForView.customerPhone && (
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">মোবাইল নং:</span>
                  <span className="font-bold text-gray-900 font-mono">{selectedSaleForView.customerPhone}</span>
                </div>
              )}
              {selectedSaleForView.customerAddress && (
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">ঠিকানা:</span>
                  <span className="font-bold text-gray-900">{selectedSaleForView.customerAddress}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">পেমেন্ট মোড:</span>
                <span className="font-bold text-gray-900">{selectedSaleForView.paymentMethod}</span>
              </div>

              <div className="pt-2">
                <span className="font-bold text-gray-800 block mb-2">
                  স্লিপসমূহের তালিকা:
                </span>
                <div className="space-y-1.5 bg-white border border-gray-200 p-3.5 rounded-2xl shadow-2xs">
                  {selectedSaleForView.slips.map((s, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-gray-100 last:border-none">
                      <span className="text-gray-700">স্লিপ #{s.slipNo || idx + 1} {s.notes ? `(${s.notes})` : ''}</span>
                      <strong className="font-mono text-gray-900">৳ {s.amount.toLocaleString()}</strong>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-black text-sm">
                    <span className="text-gray-800">সর্বমোট স্লিপ:</span>
                    <span className="text-gray-900">৳ {selectedSaleForView.totalSlipsAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 pt-1">
                    <span>প্রাপ্ত ক্যাশ:</span>
                    <span className="font-bold">৳ {selectedSaleForView.receivedAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold pt-1">
                    <span className="text-gray-600">মিলকরণ স্ট্যাটাস:</span>
                    <span className={selectedSaleForView.isBalanced ? "text-emerald-700" : "text-amber-700"}>
                      {selectedSaleForView.isBalanced ? "✓ সমান সমান" : `বাকি: ৳${selectedSaleForView.dueAmount}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  handlePrintSlip(selectedSaleForView);
                  setSelectedSaleForView(null);
                }}
                className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>প্রিন্ট ভাউচার</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSaleForView(null)}
                className="px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
