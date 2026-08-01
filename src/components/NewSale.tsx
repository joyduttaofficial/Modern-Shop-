import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, doc, getDocs, writeBatch, setDoc, deleteDoc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Transaction, UserRole, Employee } from "@/src/types";
import { cn, formatCurrency } from "@/src/lib/utils";
import { Calendar, UserCircle, Save, CheckCircle, Loader2, Home, ChevronRight, ShoppingCart, Printer, FileText } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { useLanguage } from "../contexts/LanguageContext";
import { exportHtmlToPdf } from "@/src/lib/pdfExport";

export default function NewSale({ 
  user, 
  role, 
  editDate, 
  onClearEditDate,
  onSaveSuccess
}: { 
  user: User; 
  role: UserRole; 
  editDate?: string; 
  onClearEditDate?: () => void; 
  onSaveSuccess?: () => void;
}) {
  const { language, t, formatCurrency, formatDate, formatNumber, translateValue } = useLanguage();
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // Marketing & white-labeled branding parameters
  const [companyName, setCompanyName] = useState("Modern Pro");
  const [companyPoweredBy, setCompanyPoweredBy] = useState("Powered by ModernManager");
  const [showPoweredBy, setShowPoweredBy] = useState(true);
  const [companyPhone, setCompanyPhone] = useState("+880 1234 567890");
  const [companyEmail, setCompanyEmail] = useState("info@modernmanager.com");
  const [companyAddress, setCompanyAddress] = useState("Dhaka, Bangladesh");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Pro");
        setCompanyPoweredBy(data.companyPoweredBy || "Powered by ModernManager");
        setShowPoweredBy(data.showPoweredBy ?? true);
        setCompanyPhone(data.companyPhone || "+880 1234 567890");
        setCompanyEmail(data.companyEmail || "info@modernmanager.com");
        setCompanyAddress(data.companyAddress || "Dhaka, Bangladesh");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/company");
    });
    return () => unsub();
  }, []);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingSales, setLoadingSales] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form states
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dayName, setDayName] = useState(format(new Date(), "EEEE"));

  // Check if routed with editDate
  useEffect(() => {
    if (editDate) {
      setSelectedDate(editDate);
      if (onClearEditDate) {
        onClearEditDate();
      }
    }
  }, [editDate, onClearEditDate]);

  // Key: Employee ID, Value: sale amount as string
  const [salesAmounts, setSalesAmounts] = useState<Record<string, string>>({});
  // Key: Employee ID, Value: Transaction Doc ID if it exists
  const [salesTxIds, setSalesTxIds] = useState<Record<string, string>>({});

  // Wholesale and total deposit states
  const [wholesaleAmount, setWholesaleAmount] = useState<string>("");
  const [wholesaleTxId, setWholesaleTxId] = useState<string>("");

  const [depositAmount, setDepositAmount] = useState<string>("");
  const [depositTxId, setDepositTxId] = useState<string>("");

  // Sync Day name when Date is selected
  useEffect(() => {
    if (selectedDate) {
      try {
        const parsedDate = new Date(selectedDate);
        if (!isNaN(parsedDate.getTime())) {
          setDayName(format(parsedDate, "EEEE"));
        }
      } catch (e) {
        // ignore
      }
    }
  }, [selectedDate]);

  // Load Employees (filtered in UI/Logic for "Sales" department)
  useEffect(() => {
    setLoadingEmployees(true);
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const allEmps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      // Filter for active employees in specified target sales departments/sections
      const salesEmps = allEmps.filter(emp => {
        if (emp.status !== "active") return false;
        const dept = (emp.department || "").toLowerCase().trim();
        return (
          dept === "sales" ||
          dept === "fast accountant" ||
          dept === "men's section" ||
          dept === "mens section" ||
          dept === "men section" ||
          dept === "sales ladies' section" ||
          dept === "sales ladies section" ||
          dept === "ladies' section" ||
          dept === "ladies section" ||
          dept.includes("sales") ||
          dept.includes("men's") ||
          dept.includes("mens") ||
          dept.includes("ladies") ||
          dept.includes("accountant")
        );
      });
      // Sort employees with section priority (Men's Section first, then Ladies' Section, then others)
      salesEmps.sort((a, b) => {
        const getSectionScore = (emp: Employee) => {
          const role = (emp.role || "").toLowerCase();
          const name = (emp.name || "").toLowerCase();
          const dept = (emp.department || "").toLowerCase();

          // Check if Men's Section
          const isMens = 
            role.includes("men's") || role.includes("mens") ||
            name.includes("men's") || name.includes("mens") ||
            dept.includes("men's") || dept.includes("mens") ||
            /\b(men|gents|gent)\b/i.test(role) || /\b(men|gents|gent)\b/i.test(name) || /\b(men|gents|gent)\b/i.test(dept);

          if (isMens) return 1;

          // Check if Ladies' Section
          const isLadies = 
            role.includes("ladies") || role.includes("women") || role.includes("lady") ||
            name.includes("ladies") || name.includes("women") || name.includes("lady") ||
            dept.includes("ladies") || dept.includes("women") || dept.includes("lady") ||
            /\b(ladies|lady|women|woman|girls|girl)\b/i.test(role) || /\b(ladies|lady|women|woman|girls|girl)\b/i.test(name) || /\b(all-ladies)\b/i.test(dept);

          if (isLadies) return 2;

          return 3;
        };

        const scoreA = getSectionScore(a);
        const scoreB = getSectionScore(b);

        if (scoreA !== scoreB) {
          return scoreA - scoreB;
        }

        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(salesEmps);
      setLoadingEmployees(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "employees");
      setLoadingEmployees(false);
    });

    return () => unsub();
  }, []);

  // Sync existing Sales transactions for the selected Date
  useEffect(() => {
    async function fetchExistingSales() {
      if (!selectedDate) return;
      setLoadingSales(true);
      try {
        // Get start and end range for the chosen date to query Firestore safely
        const start = startOfDay(new Date(selectedDate));
        const end = endOfDay(new Date(selectedDate));

        const q = query(
          collection(db, "transactions")
        );

        const snap = await getDocs(q);
        const allTxs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
        
        // Filter daily "Employee Sales" client-side
        const dailyEmployeeSales = allTxs.filter(tx => {
          if (tx.category !== "Employee Sales") return false;
          const txDate = new Date(tx.date);
          return txDate >= start && txDate <= end;
        });

        // Map existing transactions to states
        const amounts: Record<string, string> = {};
        const txIds: Record<string, string> = {};

        dailyEmployeeSales.forEach(tx => {
          if (tx.employeeId) {
            amounts[tx.employeeId] = tx.amount.toString();
            txIds[tx.employeeId] = tx.id || "";
          }
        });

        setSalesAmounts(amounts);
        setSalesTxIds(txIds);

        // Find existing Wholesale Sales transaction
        const dailyWholesaleTx = allTxs.find(tx => {
          if (tx.category !== "Wholesale Sales") return false;
          const txDate = new Date(tx.date);
          return txDate >= start && txDate <= end;
        });

        if (dailyWholesaleTx) {
          setWholesaleAmount(dailyWholesaleTx.amount.toString());
          setWholesaleTxId(dailyWholesaleTx.id || "");
        } else {
          setWholesaleAmount("");
          setWholesaleTxId("");
        }

        // Find existing Total Deposit transaction
        const dailyDepositTx = allTxs.find(tx => {
          if (tx.category !== "Total Deposit") return false;
          const txDate = new Date(tx.date);
          return txDate >= start && txDate <= end;
        });

        if (dailyDepositTx) {
          setDepositAmount(dailyDepositTx.amount.toString());
          setDepositTxId(dailyDepositTx.id || "");
        } else {
          setDepositAmount("");
          setDepositTxId("");
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "transactions");
      } finally {
        setLoadingSales(false);
      }
    }

    fetchExistingSales();
  }, [selectedDate]);

  // Handle saving of all amounts in bulk (Batch)
  const handleSaveSales = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const batch = writeBatch(db);

      for (const emp of employees) {
        if (!emp.id) continue;
        const currentAmountStr = salesAmounts[emp.id] || "";
        const currentAmount = parseFloat(currentAmountStr) || 0;
        const existingTxId = salesTxIds[emp.id];

        if (currentAmount > 0) {
          if (existingTxId) {
            // Update existing transaction
            const txRef = doc(db, "transactions", existingTxId);
            batch.update(txRef, {
              amount: currentAmount,
              date: new Date(selectedDate).toISOString()
            });
          } else {
            // Create new transaction doc reference
            const newTxRef = doc(collection(db, "transactions"));
            const newTx: Transaction = {
              date: new Date(selectedDate).toISOString(),
              type: "income",
              category: "Employee Sales",
              amount: currentAmount,
              paymentMethod: "Cash",
              notes: `Daily Sales for ${emp.name}`,
              createdBy: user.uid,
              employeeId: emp.id,
              subCategory: emp.name
            };
            batch.set(newTxRef, newTx);
          }
        } else if (existingTxId) {
          // Amount was deleted or set to 0, delete the old transaction
          const txRef = doc(db, "transactions", existingTxId);
          batch.delete(txRef);
        }
      }

      // Save Wholesale Sales
      const currentWholesale = parseFloat(wholesaleAmount) || 0;
      if (currentWholesale > 0) {
        if (wholesaleTxId) {
          const txRef = doc(db, "transactions", wholesaleTxId);
          batch.update(txRef, {
            amount: currentWholesale,
            date: new Date(selectedDate).toISOString()
          });
        } else {
          const newTxRef = doc(collection(db, "transactions"));
          const newTx: Transaction = {
            date: new Date(selectedDate).toISOString(),
            type: "income",
            category: "Wholesale Sales",
            amount: currentWholesale,
            paymentMethod: "Cash",
            notes: `Wholesale Sales for ${selectedDate}`,
            createdBy: user.uid,
            subCategory: "Wholesale"
          };
          batch.set(newTxRef, newTx);
        }
      } else if (wholesaleTxId) {
        const txRef = doc(db, "transactions", wholesaleTxId);
        batch.delete(txRef);
      }

      // Save Total Deposit
      const currentDeposit = parseFloat(depositAmount) || 0;
      if (currentDeposit > 0) {
        if (depositTxId) {
          const txRef = doc(db, "transactions", depositTxId);
          batch.update(txRef, {
            amount: currentDeposit,
            date: new Date(selectedDate).toISOString()
          });
        } else {
          const newTxRef = doc(collection(db, "transactions"));
          const newTx: Transaction = {
            date: new Date(selectedDate).toISOString(),
            type: "income",
            category: "Total Deposit",
            amount: currentDeposit,
            paymentMethod: "Cash",
            notes: `Total Deposit for ${selectedDate}`,
            createdBy: user.uid,
            subCategory: "Deposit"
          };
          batch.set(newTxRef, newTx);
        }
      } else if (depositTxId) {
        const txRef = doc(db, "transactions", depositTxId);
        batch.delete(txRef);
      }

      await batch.commit();

      // Refresh mapping by manually querying again (triggered via slight state refresh or fake delay)
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "transactions");
    } finally {
      setSaving(false);
      // Re-trigger the selectedDate sync to reload the salesTxIds
      setSelectedDate(prev => prev);
    }
  };

  const handleGenerateInvoicePDF = async () => {
    const tableRowsHtml = employees.map((emp, index) => {
      const amountValue = salesAmounts[emp.id!] || "0.00";
      return `
        <tr>
          <td style="text-align: center; font-weight: bold;">${index + 1}</td>
          <td style="font-weight: 700; color: #0f172a;">${emp.name}</td>
          <td style="font-weight: 600; text-transform: uppercase;">${emp.role}</td>
          <td>${emp.department || "Sales"}</td>
          <td style="text-align: right; font-weight: 800; color: #0f172a; font-family: monospace;">BDT ${(parseFloat(amountValue) || 0).toFixed(2)}</td>
        </tr>
      `;
    }).join("");

    const wholesaleFloat = parseFloat(wholesaleAmount) || 0;
    const depositFloat = parseFloat(depositAmount) || 0;
    const syncStatus = Object.keys(salesTxIds).length > 0 ? "LEDGER SYNCED" : "DRAFT STATEMENT";

    const htmlContent = `
      <div style="font-size: 12px; color: #0f172a; line-height: 1.5;">
        <!-- Header Banner -->
        <div style="background-color: #0f172a; color: #ffffff; padding: 20px 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #ffffff;">${companyName}</h1>
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #cbd5e1;">Phone: ${companyPhone} • Email: ${companyEmail} • Address: ${companyAddress}</p>
          <div style="margin-top: 10px; font-size: 13px; font-weight: 800; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px;">DAILY SALES SHIFT STATEMENT & INVOICE</div>
        </div>
        <div style="height: 4px; background-color: #dc2626; margin-bottom: 20px;"></div>

        <!-- Info Split Box -->
        <div style="display: flex; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          <div style="flex: 1; padding-right: 12px; border-right: 1px solid #e2e8f0;">
            <div style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 6px;">STATEMENT INVOICE METADATA:</div>
            <div style="font-size: 11px;"><strong>Reference:</strong> INV-SL-${selectedDate.replace(/-/g, "")}</div>
            <div style="font-size: 11px;"><strong>Created By:</strong> ${user.email} (${role})</div>
          </div>
          <div style="flex: 1; padding-left: 12px;">
            <div style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 6px;">STATEMENT DETAILS:</div>
            <div style="font-size: 11px;"><strong>Sales Date:</strong> ${format(new Date(selectedDate), "dd MMM yyyy (EEEE)")}</div>
            <div style="font-size: 11px;"><strong>Save Status:</strong> ${syncStatus}</div>
          </div>
        </div>

        <!-- Table -->
        <div style="margin-bottom: 24px;">
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">S.No</th>
                <th>Sales Officer</th>
                <th>Designation</th>
                <th>Department</th>
                <th style="text-align: right;">Daily Inflow Volume</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Summary Box -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
          <div style="width: 280px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px;">
              <span style="color: #64748b;">Total Staff Sales:</span>
              <span style="font-weight: 700; font-family: monospace;">BDT ${totalSale.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px;">
              <span style="color: #64748b;">Wholesale Sales (+):</span>
              <span style="font-weight: 700; font-family: monospace;">BDT ${wholesaleFloat.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; padding-bottom: 6px; border-bottom: 1px dashed #cbd5e1;">
              <span style="color: #64748b;">Due Sales (-):</span>
              <span style="font-weight: 700; color: #ef4444; font-family: monospace;">BDT ${depositFloat.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 10px; background-color: #0f172a; color: #ffffff; border-radius: 6px; font-size: 12px; font-weight: 800;">
              <span>Grand Net Total:</span>
              <span style="color: #10b981; font-family: monospace;">BDT ${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Signatures -->
        <div style="display: flex; justify-content: space-between; margin-top: 50px; padding-top: 10px;">
          <div style="width: 220px; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
            PREPARED BY (STAFF SIGNATURE)
          </div>
          <div style="width: 220px; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">
            APPROVED BY (AUTHORIZED SIGNATURE)
          </div>
        </div>

        <!-- Audit Stamp -->
        <div style="margin-top: 30px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 8px;">
          Invoice generated automatically on ${format(new Date(), "dd/MM/yyyy HH:mm:ss")} from ${companyName} Ledger.
        </div>
      </div>
    `;

    await exportHtmlToPdf(htmlContent, `Invoice_Sales_${selectedDate}.pdf`);
  };

  const handleAmountChange = (empId: string, val: string) => {
    setSalesAmounts(prev => ({
      ...prev,
      [empId]: val
    }));
  };

  const totalSale = (Object.values(salesAmounts) as string[]).reduce<number>((acc, curr) => acc + (parseFloat(curr) || 0), 0);
  const grandTotal = totalSale + (parseFloat(wholesaleAmount) || 0) - (parseFloat(depositAmount) || 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs and Topbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1 text-gray-900">Sales</h2>
          <p className="text-sm text-gray-500 font-medium">Add/Update Sales</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
          <span className="hover:text-gray-900 cursor-pointer flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> {t("Home")}
          </span>
          <ChevronRight className="w-3 h-3" />
          <span className="hover:text-gray-900 cursor-pointer">{t("Sales List")}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="hover:text-gray-900 cursor-pointer text-gray-900">{t("New Sale")}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-blue-600">{t("Sales")}</span>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3 text-emerald-800 animate-in fade-in duration-300">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <span className="font-bold text-sm block">{t("Daily sales recorded successfully!")}</span>
            <span className="text-xs text-emerald-600">{t("Transactions ledger has been synchronized for the select date.")}</span>
          </div>
        </div>
      )}

      {/* Main Form Container */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6 sm:p-8">
        <form onSubmit={handleSaveSales} className="space-y-8">
          {/* Top Selection Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
            {/* Sales Date field */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5 pl-1">
                {t("Sales Date")} <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  required
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 hover:bg-gray-100/50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 transition-all font-bold text-gray-800"
                />
              </div>
            </div>

            {/* Day display field */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-red-500 uppercase tracking-widest pl-1">
                {t("Day")} <span className="text-red-500 font-bold">*</span>
              </label>
              <select
                disabled
                value={dayName}
                className="w-full px-4 py-4 bg-gray-100 rounded-2xl border-none font-bold text-gray-500 cursor-not-allowed appearance-none"
              >
                <option value={dayName}>{language === "bn" ? translateValue(dayName) : dayName}</option>
              </select>
            </div>
          </div>

          {/* Daily Table of filtered Sales Employees */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-gray-500" />
                {t("Staff Sales Entry")}
              </h3>
              <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
                {formatNumber(employees.length)} {t("Sales Officers")}
              </span>
            </div>

            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 bg-[#2D7BBF] text-white text-sm font-bold p-4">
                <div className="col-span-8">{t("Employee Name")}</div>
                <div className="col-span-4 text-center">{t("Amount")}</div>
              </div>

              {loadingEmployees ? (
                <div className="py-20 text-center text-gray-400 font-medium">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
                  {t("Loading active staff roster...")}
                </div>
              ) : employees.length === 0 ? (
                <div className="p-16 text-center text-gray-400 bg-gray-50/50 italic">
                  {t("No active employees exist in the designated sales departments.")}
                  <p className="not-italic text-xs text-gray-500 mt-2 font-medium">
                    {t("Go to the Employees tab and set their department to one of: Sales, Fast Accountant, Men's Section, or Sales Ladies' Section.")}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 bg-white">
                  {employees.map(emp => {
                    const avatarImage = emp.documents?.find(d => d.type.startsWith("image/"));
                    const amountValue = salesAmounts[emp.id!] || "";

                    return (
                      <div key={emp.id} className="grid grid-cols-12 items-center p-4 hover:bg-slate-50/50 transition-colors">
                        {/* Profile Photo and Employee Details */}
                        <div className="col-span-8 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-50 flex items-center justify-center border border-blue-100 shrink-0">
                            {avatarImage ? (
                              <img src={avatarImage.data} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserCircle className="w-7 h-7 text-blue-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{emp.name}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t(emp.role)}</p>
                          </div>
                        </div>

                        {/* Amount Input */}
                        <div className="col-span-4">
                          <div className="relative max-w-xs mx-auto">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold font-mono">৳</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0.00"
                              value={amountValue}
                              onChange={(e) => handleAmountChange(emp.id!, e.target.value)}
                              disabled={loadingSales || saving}
                              className="w-full pl-7 pr-3 py-3 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl outline-none font-bold text-sm text-gray-800 bg-white transition-all text-right font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total / Summary Section below the Employee List */}
                  <div className="bg-gray-50/30 divide-y divide-gray-100 border-t border-gray-100">
                    {/* Total Sale */}
                    <div className="grid grid-cols-12 items-center p-4">
                      <div className="col-span-8 text-right font-bold text-gray-700 pr-10 text-sm">
                        {t("Total Sale")}
                      </div>
                      <div className="col-span-4 flex justify-between items-center px-1">
                        <div className="w-full max-w-xs mx-auto text-right pr-4 font-bold text-gray-900 font-mono text-sm">
                          {formatNumber(totalSale.toFixed(2))}
                        </div>
                      </div>
                    </div>

                    {/* Wholesale */}
                    <div className="grid grid-cols-12 items-center p-3">
                      <div className="col-span-8 text-right font-bold text-gray-700 pr-10 text-sm">
                        {t("Wholesale")}
                      </div>
                      <div className="col-span-4">
                        <div className="relative max-w-xs mx-auto animate-in fade-in duration-200">
                          <input
                            type="number"
                            min="0"
                            placeholder={language === "bn" ? "পাইকারি পরিমাণ লিখুন" : "Enter wholesale amount"}
                            value={wholesaleAmount}
                            onChange={(e) => setWholesaleAmount(e.target.value)}
                            disabled={saving || loadingSales}
                            className="w-full px-4 py-3 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl outline-none font-medium text-sm text-gray-700 bg-white transition-all placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Due Sales */}
                    <div className="grid grid-cols-12 items-center p-3">
                      <div className="col-span-8 text-right font-bold text-gray-700 pr-10 text-sm">
                        {t("Due Sales")}
                      </div>
                      <div className="col-span-4">
                        <div className="relative max-w-xs mx-auto animate-in fade-in duration-200">
                          <input
                            type="number"
                            min="0"
                            placeholder={language === "bn" ? "বাকি বিক্রয়ের পরিমাণ লিখুন" : "Enter due sales amount"}
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            disabled={saving || loadingSales}
                            className="w-full px-4 py-3 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl outline-none font-medium text-sm text-gray-700 bg-gray-50 hover:bg-gray-100/50 transition-all placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Grand Total */}
                    <div className="grid grid-cols-12 items-center p-4">
                      <div className="col-span-8 text-right font-bold text-gray-700 pr-10 text-sm">
                        {t("Grand Total")}
                      </div>
                      <div className="col-span-4 flex justify-between items-center px-1">
                        <div className="w-full max-w-xs mx-auto text-right pr-4 font-bold text-gray-900 font-mono text-sm">
                          {formatNumber(grandTotal.toFixed(2))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {employees.length > 0 && (
            <div className="pt-6 flex flex-col md:flex-row items-center gap-4">
              <button
                id="download-invoice-btn"
                type="button"
                onClick={handleGenerateInvoicePDF}
                className="w-full md:w-1/2 bg-slate-900 hover:bg-slate-800 text-white py-4 font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99] rounded-xl text-base"
              >
                <Printer className="w-5 h-5 text-amber-400" />
                <span>{t("Download Invoice PDF")}</span>
              </button>
              <button
                id="save-sales-btn"
                type="submit"
                disabled={saving || loadingSales || success}
                className={cn(
                  "w-full md:w-1/2 py-4 font-bold flex items-center justify-center transition-all cursor-pointer active:scale-[0.99] disabled:opacity-55 rounded-xl text-base text-white",
                  success ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#D12765] hover:bg-[#B41A50]"
                )}
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>{t("saving...")}</span>
                  </div>
                ) : success ? (
                  <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                    <CheckCircle className="w-5 h-5 text-white animate-bounce" />
                    <span>{t("Saved Successfully!")}</span>
                  </div>
                ) : (
                  <span>{t("save")}</span>
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row justify-between items-center text-[11px] text-gray-400 pt-6 px-2 font-medium border-t border-gray-100 mt-8">
        <div>
          Copyright &copy; 2026-2027 {companyName}. {showPoweredBy ? companyPoweredBy : "All rights reserved."}
        </div>
        <div className="mt-1 sm:mt-0 font-semibold text-gray-500">
          Corporate System v2.4
        </div>
      </div>
    </div>
  );
}
