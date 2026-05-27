import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, where, getDocs } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Employee, Transaction, UserRole, Bank } from "@/src/types";
import { cn, formatCurrency, safeFormat as format } from "@/src/lib/utils";
import { Users, Plus, Trash2, UserPlus, CreditCard, History, Wallet, UserCircle, Landmark, X, FileText, FilePlus, Image, Eye, Pencil, ExternalLink, Download, ShieldCheck, Printer, FileDown } from "lucide-react";
import { startOfYear, endOfYear } from "date-fns";
import { increment, updateDoc, setDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";

export default function Employees({ 
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [empRole, setEmpRole] = useState("");
  const [salary, setSalary] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [department, setDepartment] = useState("Sales");
  const [employeeDocuments, setEmployeeDocuments] = useState<{ name: string; type: string; data: string }[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nidFrontPhoto, setNidFrontPhoto] = useState<string | null>(null);
  const [nidBackPhoto, setNidBackPhoto] = useState<string | null>(null);
  const [birthCertificatePhoto, setBirthCertificatePhoto] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(mode === "new");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingProfile, setViewingProfile] = useState<Employee | null>(null);
  const [viewingAttendance, setViewingAttendance] = useState<Employee | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const [employeeIdCode, setEmployeeIdCode] = useState("");
  const [idPrefix, setIdPrefix] = useState("MCS");
  const [customDepts, setCustomDepts] = useState<{ id?: string; name: string }[]>([]);

  // Deletion Confirmation State
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);

  // Dynamic Branding
  const [companyName, setCompanyName] = useState("Modern Shop");

  // Quick Pay State
  const [quickPay, setQuickPay] = useState<{ empId: string; type: "Staff Salary" | "Employee Advance" } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "employees"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      list.sort((a, b) => {
        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(list);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    // Also fetch all transactions linked to employees
    const qTx = query(collection(db, "transactions"), where("employeeId", "!=", null));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "transactions"));

    const unsubBanks = onSnapshot(collection(db, "banks"), (snap) => {
      setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bank)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "banks"));

    const unsubIdSettings = onSnapshot(doc(db, "settings", "employeeId"), (docSnap) => {
      if (docSnap.exists()) {
        setIdPrefix(docSnap.data().prefix || "MCS");
      }
    });

    const unsubDepts = onSnapshot(collection(db, "departments"), (snap) => {
      setCustomDepts(snap.docs.map(d => ({ id: d.id, name: d.data().name as string })));
    });

    const unsubCompany = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        setCompanyName(docSnap.data().companyName || "Modern Shop");
      }
    });

    return () => { 
      unsub(); 
      unsubTx(); 
      unsubBanks(); 
      unsubIdSettings();
      unsubDepts();
      unsubCompany();
    };
  }, []);

  // Sync / Suggest Next Employee ID sequentially
  useEffect(() => {
    if (showForm && !editingEmployee) {
      const prefix = idPrefix.trim() || "MCS";
      const matchingIds = employees
        .map(e => e.employeeIdCode || "")
        .filter(id => id.toUpperCase().startsWith(prefix.toUpperCase()));
      
      let maxNum = -1;
      matchingIds.forEach(id => {
        const numPart = id.substring(prefix.length).trim();
        const num = parseInt(numPart, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      });
      
      const nextNum = maxNum + 1;
      const formattedNum = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
      setEmployeeIdCode(`${prefix} ${formattedNum}`);
    }
  }, [showForm, editingEmployee, employees, idPrefix]);

  // Handle dynamic default departments
  useEffect(() => {
    if (showForm && !editingEmployee) {
      if (customDepts.length > 0) {
        setDepartment(customDepts[0].name);
      } else {
        setDepartment("Sales");
      }
    }
  }, [showForm, editingEmployee, customDepts]);

  const handleBulkImport = async () => {
    if (!importText) return;
    const lines = importText.split("\n").filter(l => l.trim());
    let imported = 0;
    try {
      for (const line of lines) {
        const [name, role, salary] = line.split(",").map(s => s.trim());
        if (name && role && salary) {
          await addDoc(collection(db, "employees"), {
            name,
            role,
            salary: parseFloat(salary) || 0,
            joinedDate: new Date().toISOString(),
            status: "active"
          });
          imported++;
        }
      }
      alert(`Imported ${imported} employees successfully.`);
      setImportText("");
      setShowImport(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "employees");
    }
  };

  const handleQuickPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPay || !payAmount) return;
    setIsPaying(true);
    try {
      const amount = parseFloat(payAmount);
      const emp = employees.find(e => e.id === quickPay.empId);
      const newTx = {
        date: new Date().toISOString(),
        type: "expense" as const,
        category: quickPay.type,
        amount: amount,
        paymentMethod: payMethod,
        notes: payNotes,
        createdBy: user.uid,
        employeeId: quickPay.empId,
        subCategory: emp?.name || ""
      };

      await addDoc(collection(db, "transactions"), newTx);

      if (payMethod !== "Cash") {
        const bank = banks.find(b => b.name === payMethod);
        if (bank?.id) {
          await updateDoc(doc(db, "banks", bank.id), {
            balance: increment(-amount),
            lastUpdated: new Date().toISOString()
          });
        }
      }

      setQuickPay(null);
      setPayAmount("");
      setPayNotes("");
      setPayMethod("Cash");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "transactions");
    } finally {
      setIsPaying(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onloadend = () => {
        setEmployeeDocuments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: reader.result as string
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeDocument = (index: number) => {
    setEmployeeDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: "nidFront" | "nidBack" | "birth") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result as string;
      if (target === "nidFront") setNidFrontPhoto(base64Data);
      else if (target === "nidBack") setNidBackPhoto(base64Data);
      else if (target === "birth") setBirthCertificatePhoto(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const employeeData: any = {
        name: name.trim(),
        role: empRole || "",
        status: status,
        department: department,
        documents: employeeDocuments,
        phone: phone.trim(),
        email: email.trim(),
        nidFrontPhoto,
        nidBackPhoto,
        birthCertificatePhoto,
        employeeIdCode: employeeIdCode.trim(),
        joinedDate: editingEmployee?.joinedDate || new Date().toISOString()
      };

      if (role === "admin") {
        employeeData.salary = salary ? parseFloat(salary) : 0;
      } else if (editingEmployee) {
        employeeData.salary = editingEmployee.salary || 0;
      } else {
        employeeData.salary = 0;
      }

      if (editingEmployee?.id) {
        await updateDoc(doc(db, "employees", editingEmployee.id), employeeData);
      } else {
        await addDoc(collection(db, "employees"), employeeData);
      }
      
      resetForm();
      if (onSuccess) {
        onSuccess();
      }
    } catch (e) {
      handleFirestoreError(e, editingEmployee ? OperationType.UPDATE : OperationType.CREATE, "employees");
    }
  };

  const resetForm = () => {
    setName("");
    setEmpRole("");
    setSalary("");
    setStatus("active");
    setDepartment("Sales");
    setEmployeeDocuments([]);
    setPhone("");
    setEmail("");
    setNidFrontPhoto(null);
    setNidBackPhoto(null);
    setBirthCertificatePhoto(null);
    setEmployeeIdCode("");
    setShowForm(mode === "new");
    setEditingEmployee(null);
  };

  const startEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setName(emp.name || "");
    setEmpRole(emp.role || "");
    setSalary((emp.salary ?? 0).toString());
    setStatus(emp.status || "active");
    setDepartment(emp.department || "Sales");
    setEmployeeDocuments(emp.documents || []);
    setPhone(emp.phone || "");
    setEmail(emp.email || "");
    setNidFrontPhoto(emp.nidFrontPhoto || null);
    setNidBackPhoto(emp.nidBackPhoto || null);
    setBirthCertificatePhoto(emp.birthCertificatePhoto || null);
    setEmployeeIdCode(emp.employeeIdCode || "");
    setShowForm(true);
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    const id = employeeToDelete;
    setEmployeeToDelete(null);
    try {
      await deleteDoc(doc(db, "employees", id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, "employees");
    }
  };

  const getEmployeeStats = (empId: string) => {
    const empTxs = transactions.filter(tx => tx.employeeId === empId);
    const totalPaid = empTxs
      .filter(tx => tx.category === "Staff Salary")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalAdvance = empTxs
      .filter(tx => tx.category === "Employee Advance")
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    return { totalPaid, totalAdvance };
  };

  const handlePrintProfile = (emp: Employee) => {
    const stats = getEmployeeStats(emp.id!);
    const joinedStr = emp.joinedDate ? format(new Date(emp.joinedDate), "MMMM dd, yyyy") : "N/A";
    const formatCurrJS = (amount: number) => {
      return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(amount);
    };

    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    iframe.style.top = "-9999px";
    document.body.appendChild(iframe);

    const docToWrite = iframe.contentWindow?.document;
    if (!docToWrite) return;

    const nidFrontHtml = emp.nidFrontPhoto 
      ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
           <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">NID Card Front</h4>
           <div class="h-40 flex items-center justify-center bg-white rounded-lg border border-slate-100 overflow-hidden">
             <img src="${emp.nidFrontPhoto}" alt="NID Front" class="max-h-full max-w-full object-contain p-1" />
           </div>
         </div>`
      : `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center flex flex-col justify-center items-center h-48">
           <span class="text-xs text-slate-400 italic">No Front NID Uploaded</span>
         </div>`;

    const nidBackHtml = emp.nidBackPhoto 
      ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
           <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">NID Card Back</h4>
           <div class="h-40 flex items-center justify-center bg-white rounded-lg border border-slate-100 overflow-hidden">
             <img src="${emp.nidBackPhoto}" alt="NID Back" class="max-h-full max-w-full object-contain p-1" />
           </div>
         </div>`
      : `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center flex flex-col justify-center items-center h-48">
           <span class="text-xs text-slate-400 italic">No Back NID Uploaded</span>
         </div>`;

    const birthCertHtml = emp.birthCertificatePhoto 
      ? `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
           <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Birth Certificate</h4>
           <div class="h-40 flex items-center justify-center bg-white rounded-lg border border-slate-100 overflow-hidden">
             <img src="${emp.birthCertificatePhoto}" alt="Birth Certificate" class="max-h-full max-w-full object-contain p-1" />
           </div>
         </div>`
      : `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center flex flex-col justify-center items-center h-48">
           <span class="text-xs text-slate-400 italic">No Birth Certificate Uploaded</span>
         </div>`;

    const imageHtml = emp.documents?.find(d => d.type.startsWith('image/'))
      ? `<img src="${emp.documents.find(d => d.type.startsWith('image/'))?.data}" class="w-full h-full object-cover" />`
      : `<svg class="w-12 h-12 text-slate-300 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

    const financialHtml = role === "admin" 
      ? `<div class="mb-8">
          <h3 class="text-base font-extrabold text-slate-900 mb-4 border-b border-slate-100 pb-2">Financial Account Statement</h3>
          <div class="grid grid-cols-3 gap-4">
            <div class="border border-slate-200 p-4 rounded-xl text-center bg-slate-50">
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Contracted Monthly Salary</p>
              <p class="text-base font-black text-slate-900 font-mono">${formatCurrJS(emp.salary || 0)}</p>
            </div>
            <div class="border border-slate-200 p-4 rounded-xl text-center bg-emerald-50/50">
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Paid To Date</p>
              <p class="text-base font-black text-emerald-700 font-mono">${formatCurrJS(stats.totalPaid)}</p>
            </div>
            <div class="border border-slate-200 p-4 rounded-xl text-center bg-amber-50/50">
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Advance Balance Due</p>
              <p class="text-base font-black text-amber-700 font-mono">${formatCurrJS(stats.totalAdvance)}</p>
            </div>
          </div>
        </div>`
      : "";

    docToWrite.write(`
      <html>
        <head>
          <title>${emp.name} - Official Personnel Record</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { size: portrait; margin: 15mm; }
            }
            body {
              font-family: 'Inter', sans-serif;
            }
          </style>
        </head>
        <body class="bg-white text-slate-800 p-8">
          <div class="max-w-4xl mx-auto border border-slate-200 rounded-3xl p-10 bg-white shadow-sm">
            <!-- Company / Roster Header -->
            <div class="flex justify-between items-start border-b border-slate-200 pb-8 mb-8">
              <div>
                <h1 class="text-3xl font-black text-slate-900 tracking-tight mb-1">${companyName}</h1>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">OFFICIAL PERSONNEL FILE</p>
                <p class="text-[10px] text-slate-400 mt-1">Generated: ${format(new Date(), "MMMM dd, yyyy - hh:mm a")}</p>
              </div>
              <div class="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 overflow-hidden shadow-inner">
                ${imageHtml}
              </div>
            </div>

            <!-- Profile Summary Title -->
            <div class="mb-6 flex justify-between items-center">
              <h2 class="text-xl font-extrabold text-slate-950">Employee Information Details</h2>
              <span class="px-4 py-1.5 bg-blue-100 text-blue-800 rounded-full text-xs font-extrabold uppercase tracking-widest">${emp.status}</span>
            </div>

            <!-- Profile Grid -->
            <div class="grid grid-cols-2 gap-y-6 gap-x-8 border border-slate-100 bg-slate-50/50 rounded-2xl p-6 mb-8 text-sm">
              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Full Name</span>
                <span class="font-extrabold text-slate-900 text-base">${emp.name}</span>
              </div>
              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Employee ID</span>
                <span class="font-black text-blue-600 text-base font-mono">${emp.employeeIdCode || "N/A"}</span>
              </div>
              
              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Designation / Role</span>
                <span class="font-extrabold text-slate-800">${emp.role || "N/A"}</span>
              </div>
              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Department</span>
                <span class="font-bold text-slate-700">${emp.department || "Sales"}</span>
              </div>

              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Phone Number</span>
                <span class="font-bold text-slate-800">${emp.phone || "N/A"}</span>
              </div>
              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Email</span>
                <span class="font-bold text-slate-700">${emp.email || "N/A"}</span>
              </div>

              <div>
                <span class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Date of Joining</span>
                <span class="font-bold text-slate-700">${joinedStr}</span>
              </div>
            </div>

            <!-- Financial Records Ledger -->
            ${financialHtml}

            <!-- KYC Verification Documents -->
            <div class="mb-10 page-break-inside-avoid">
              <h3 class="text-base font-extrabold text-slate-900 mb-4 border-b border-slate-100 pb-2">KYC Documentation & Proofs</h3>
              <div class="grid grid-cols-3 gap-4">
                ${nidFrontHtml}
                ${nidBackHtml}
                ${birthCertHtml}
              </div>
            </div>

            <!-- Official Signatures -->
            <div class="mt-16 pt-8 border-t border-dashed border-slate-300 flex justify-between text-xs font-bold text-slate-500 page-break-inside-avoid">
              <div class="text-center w-40">
                <div class="border-b border-slate-400 h-10 mb-2"></div>
                <p>Prepared By</p>
                <p class="text-[10px] font-medium text-slate-400">HR Executive</p>
              </div>
              <div class="text-center w-40">
                <div class="border-b border-slate-400 h-10 mb-2"></div>
                <p>Verified By</p>
                <p class="text-[10px] font-medium text-slate-400">Finance Manager</p>
              </div>
              <div class="text-center w-40">
                <div class="border-b border-slate-400 h-10 mb-2"></div>
                <p>Approved By</p>
                <p class="text-[10px] font-medium text-slate-400">Director / CEO</p>
              </div>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  window.parent.document.body.removeChild(window.frameElement);
                }, 100);
              }, 800);
            };
          </script>
        </body>
      </html>
    `);
    docToWrite.close();
  };

  const handlePrintRoster = () => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    iframe.style.top = "-9999px";
    document.body.appendChild(iframe);

    const docToWrite = iframe.contentWindow?.document;
    if (!docToWrite) return;

    const formatCurrJS = (amount: number) => {
      return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(amount);
    };

    const tableRows = employees.map((emp, idx) => {
      const stats = getEmployeeStats(emp.id!);
      const joinedStr = emp.joinedDate ? format(new Date(emp.joinedDate), "MMM dd, yyyy") : "N/A";
      const financialCells = role === "admin" 
        ? `<td class="px-4 py-3 text-right font-mono font-black text-slate-950">${formatCurrJS(emp.salary || 0)}</td>
           <td class="px-4 py-3 text-right font-mono text-emerald-700 font-black">${formatCurrJS(stats.totalPaid)}</td>
           <td class="px-4 py-3 text-right font-mono text-amber-700 font-black">${formatCurrJS(stats.totalAdvance)}</td>`
        : "";

      return `
        <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors text-xs font-semibold text-slate-700">
          <td class="px-4 py-3 text-slate-400 font-bold">${idx + 1}</td>
          <td class="px-4 py-3 font-bold text-slate-900">${emp.employeeIdCode || "—"}</td>
          <td class="px-4 py-3 font-black text-slate-900">${emp.name}</td>
          <td class="px-4 py-3 font-extrabold text-slate-800">${emp.role || "—"}</td>
          <td class="px-4 py-3 text-slate-600">${emp.department || "Sales"}</td>
          <td class="px-4 py-3 text-slate-600 font-mono">${emp.phone || "—"}</td>
          <td class="px-4 py-3 text-slate-600">${joinedStr}</td>
          ${financialCells}
          <td class="px-4 py-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase leading-tight ${emp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
              ${emp.status}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    const grandTotalSalary = employees.reduce((total, emp) => total + (emp.salary || 0), 0);
    const grandTotalPaid = employees.reduce((total, emp) => total + getEmployeeStats(emp.id!).totalPaid, 0);
    const grandTotalAdvance = employees.reduce((total, emp) => total + getEmployeeStats(emp.id!).totalAdvance, 0);

    const financialHeaders = role === "admin" 
      ? `<th class="px-4 py-3 text-right">Basic Salary</th>
         <th class="px-4 py-3 text-right">Total Paid</th>
         <th class="px-4 py-3 text-right">Advance Balance</th>`
      : "";

    const financialTotals = role === "admin" 
      ? `<tr class="bg-slate-50 border-t-2 border-slate-300 font-extrabold text-xs text-slate-900">
          <td colspan="7" class="px-4 py-4 text-right uppercase tracking-wider font-extrabold text-slate-500">Totals:</td>
          <td class="px-4 py-4 text-right font-mono font-black text-slate-950">${formatCurrJS(grandTotalSalary)}</td>
          <td class="px-4 py-4 text-right font-mono font-black text-green-700">${formatCurrJS(grandTotalPaid)}</td>
          <td class="px-4 py-4 text-right font-mono font-black text-amber-700">${formatCurrJS(grandTotalAdvance)}</td>
          <td></td>
         </tr>`
      : "";

    docToWrite.write(`
      <html>
        <head>
          <title>Active Employee Roster - ${companyName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { size: landscape; margin: 10mm; }
            }
            body {
              font-family: 'Inter', sans-serif;
            }
          </style>
        </head>
        <body class="bg-white text-slate-800 p-6">
          <div class="max-w-[100%] mx-auto">
            <!-- Header -->
            <div class="flex justify-between items-end border-b-2 border-slate-300 pb-4 mb-6">
              <div>
                <h1 class="text-3xl font-black text-slate-900 tracking-tight">${companyName}</h1>
                <h2 class="text-base font-bold text-slate-400 uppercase tracking-widest mt-1">OFFICIAL PERSONNEL & PAYROLL ROSTER</h2>
              </div>
              <div class="text-right text-xs text-slate-400">
                <p>Generated: ${format(new Date(), "MMMM dd, yyyy hh:mm a")}</p>
                <p>Total Count: <span class="font-extrabold text-slate-700">${employees.length} Staff Members</span></p>
              </div>
            </div>

            <!-- Details Table -->
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-100 border-b border-slate-300 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th class="px-4 py-3">#</th>
                  <th class="px-4 py-3">ID Code</th>
                  <th class="px-4 py-3">Employee Name</th>
                  <th class="px-4 py-3">Designation / Role</th>
                  <th class="px-4 py-3">Department</th>
                  <th class="px-4 py-3">Phone</th>
                  <th class="px-4 py-3">Joined Date</th>
                  ${financialHeaders}
                  <th class="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
                ${financialTotals}
              </tbody>
            </table>

            <!-- Signatures line -->
            <div class="mt-16 flex justify-between text-[11px] font-bold text-slate-500 page-break-inside-avoid">
              <div class="text-center w-48">
                <div class="border-b border-slate-300 h-10 mb-2"></div>
                <p>Prepared By HR Office</p>
              </div>
              <div class="text-center w-48">
                <div class="border-b border-slate-300 h-10 mb-2"></div>
                <p>Audited By Finance Dept</p>
              </div>
              <div class="text-center w-48">
                <div class="border-b border-slate-300 h-10 mb-2"></div>
                <p>Authorized Signature</p>
              </div>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  window.parent.document.body.removeChild(window.frameElement);
                }, 100);
              }, 800);
            };
          </script>
        </body>
      </html>
    `);
    docToWrite.close();
  };

  if (mode === "new") {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight mb-1 text-gray-950">New Employee</h2>
            <p className="text-sm text-gray-500 font-medium">Add a new staff member to the system.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowImport(!showImport)}
              className="bg-white border text-gray-700 hover:bg-gray-50 border-gray-200 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <History className="w-5 h-5 text-gray-400" />
              Bulk Import
            </button>
          </div>
        </header>

        {showImport && (
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-xl max-w-2xl">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold">Bulk Import Employees</h3>
                <p className="text-sm text-gray-500">Format: Name, Role, Salary (one per line)</p>
              </div>
              <textarea
                placeholder="Joy Dutta, Manager, 25000&#10;Rahim Ali, Sales, 15000"
                value={importText}
                onChange={e => setImportText(e.target.value)}
                className="w-full h-48 px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-mono text-sm"
              />
              <div className="flex gap-4">
                <button 
                  onClick={handleBulkImport}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all cursor-pointer"
                >
                  Import List
                </button>
                <button 
                  onClick={() => setShowImport(false)}
                  className="px-8 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-xl max-w-4xl"
        >
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-gray-400" />
            New Employee Registration
          </h3>
          <form onSubmit={handleAddEmployee} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                Employee ID
                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-mono">Auto generated</span>
              </label>
              <input 
                placeholder="e.g. MCS 01"
                value={employeeIdCode}
                onChange={e => setEmployeeIdCode(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-bold font-mono"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Full Name *</label>
              <input 
                required
                placeholder="Employee Name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Phone Number</label>
              <input 
                type="tel"
                placeholder="e.g. 017XXXXXXXX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Email Address</label>
              <input 
                type="email"
                placeholder="e.g. employee@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Designation / Role</label>
              <input 
                placeholder="e.g. Sales Officer, Manager"
                value={empRole}
                onChange={e => setEmpRole(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              />
            </div>

            {role === "admin" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Monthly Salary (BDT)</label>
                <input 
                  type="number"
                  placeholder="0.00"
                  value={salary}
                  onChange={e => setSalary(e.target.value)}
                  className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium font-mono"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Employment Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as "active" | "inactive")}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium font-bold outline-none cursor-pointer"
              >
                <option value="active">Active Staff</option>
                <option value="inactive">Resigned / Inactive</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Department</label>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium font-bold outline-none cursor-pointer"
              >
                {customDepts.length > 0 ? (
                  customDepts.map(d => (
                    <option key={d.id || d.name} value={d.name}>{d.name}</option>
                  ))
                ) : (
                  <>
                    <option value="Sales">Sales</option>
                    <option value="Accounts">Accounts</option>
                    <option value="Marketing">Marketing</option>
                    <option value="IT / Support">IT / Support</option>
                    <option value="Management">Management</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Others">Others</option>
                  </>
                )}
              </select>
            </div>

            {/* Custom NID Photo & Birth Certificate Photo Upload Panels */}
            <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* NID Front */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">NID Card Front Photo</label>
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[140px] hover:border-blue-400 hover:bg-blue-50/20 transition-all group">
                  {nidFrontPhoto ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img src={nidFrontPhoto} alt="NID Front" className="max-h-[100px] object-contain rounded-xl mb-2" />
                      <button 
                        type="button" 
                        onClick={() => setNidFrontPhoto(null)}
                        className="text-xs text-red-500 font-bold hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-450 hover:text-blue-500 transition-colors">
                      <Image className="w-8 h-8 mb-2 text-gray-300 group-hover:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider">Upload Front Side</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Click or drag image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handlePhotoUpload(e, "nidFront")} 
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* NID Back */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">NID Card Back Photo</label>
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[140px] hover:border-blue-400 hover:bg-blue-50/20 transition-all group">
                  {nidBackPhoto ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img src={nidBackPhoto} alt="NID Back" className="max-h-[100px] object-contain rounded-xl mb-2" />
                      <button 
                        type="button" 
                        onClick={() => setNidBackPhoto(null)}
                        className="text-xs text-red-500 font-bold hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-450 hover:text-blue-500 transition-colors">
                      <Image className="w-8 h-8 mb-2 text-gray-300 group-hover:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider">Upload Back Side</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Click or drag image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handlePhotoUpload(e, "nidBack")} 
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Birth Certificate */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Birth Certificate Photo</label>
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[140px] hover:border-blue-400 hover:bg-blue-50/20 transition-all group">
                  {birthCertificatePhoto ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img src={birthCertificatePhoto} alt="Birth Certificate" className="max-h-[100px] object-contain rounded-xl mb-2" />
                      <button 
                        type="button" 
                        onClick={() => setBirthCertificatePhoto(null)}
                        className="text-xs text-red-500 font-bold hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-450 hover:text-blue-500 transition-colors">
                      <Image className="w-8 h-8 mb-2 text-gray-300 group-hover:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider">Upload Certificate</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Click or drag image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handlePhotoUpload(e, "birth")} 
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Documents (Photo/ID/PDF)</label>
              <div className="flex flex-wrap gap-3">
                <label className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-400 hover:text-blue-500">
                  <FilePlus className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase">Upload</span>
                  <input type="file" multiple className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                </label>
                {employeeDocuments.map((doc, idx) => (
                  <div key={idx} className="relative w-24 h-24 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-center p-2 group overflow-hidden">
                    {doc.type.startsWith('image/') ? (
                      <img src={doc.data} alt={doc.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <FileText className="w-8 h-8 text-blue-500" />
                    )}
                    <button 
                      type="button"
                      onClick={() => removeDocument(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] p-1 truncate text-center">
                      {doc.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3 pt-4 flex gap-4">
              <button 
                type="submit"
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                Register Employee
              </button>
              {onSuccess && (
                <button 
                  type="button"
                  onClick={onSuccess}
                  className="px-8 py-4 bg-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-200 transition-all cursor-pointer"
                >
                  View Employee List
                </button>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1">Employee Management</h2>
          <p className="text-sm text-gray-500">Track staff details, salaries, and advances.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={handlePrintRoster}
            className="bg-blue-50 text-blue-600 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-100 border border-blue-200 transition-all shadow-sm active:scale-95"
          >
            <Printer className="w-5 h-5" />
            Print Roster
          </button>
          <button 
            onClick={() => setShowImport(!showImport)}
            className="bg-white border text-gray-700 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 border-gray-200 transition-all shadow-sm active:scale-95"
          >
            <History className="w-5 h-5" />
            Bulk Import
          </button>
          <button 
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
            className="bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg active:scale-95"
          >
            {showForm ? <Trash2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {showForm ? "Cancel" : "Add Employee"}
          </button>
        </div>
      </header>

      {showImport && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-xl max-w-2xl">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold">Bulk Import Employees</h3>
              <p className="text-sm text-gray-500">Format: Name, Role, Salary (one per line)</p>
            </div>
            <textarea
              placeholder="Joy Dutta, Manager, 25000&#10;Rahim Ali, Sales, 15000"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              className="w-full h-48 px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-mono text-sm"
            />
            <div className="flex gap-4">
               <button 
                onClick={handleBulkImport}
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all"
              >
                Import List
              </button>
              <button 
                onClick={() => setShowImport(false)}
                className="px-8 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-xl max-w-4xl"
        >
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            {editingEmployee ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {editingEmployee ? "Edit Employee Profile" : "New Employee Registration"}
          </h3>
          <form onSubmit={handleAddEmployee} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                Employee ID
                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-mono">Auto generated</span>
              </label>
              <input 
                placeholder="e.g. MCS 01"
                value={employeeIdCode}
                onChange={e => setEmployeeIdCode(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-bold font-mono"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Full Name *</label>
              <input 
                required
                placeholder="Employee Name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Phone Number</label>
              <input 
                type="tel"
                placeholder="e.g. 017XXXXXXXX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Email Address</label>
              <input 
                type="email"
                placeholder="e.g. employee@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Designation / Role</label>
              <input 
                placeholder="e.g. Sales Officer, Manager"
                value={empRole}
                onChange={e => setEmpRole(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              />
            </div>

            {role === "admin" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Monthly Salary (BDT)</label>
                <input 
                  type="number"
                  placeholder="0.00"
                  value={salary}
                  onChange={e => setSalary(e.target.value)}
                  className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium font-mono"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Employment Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as "active" | "inactive")}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              >
                <option value="active">Active Staff</option>
                <option value="inactive">Resigned / Inactive</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Department</label>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
              >
                {customDepts.length > 0 ? (
                  customDepts.map(d => (
                    <option key={d.id || d.name} value={d.name}>{d.name}</option>
                  ))
                ) : (
                  <>
                    <option value="Sales">Sales</option>
                    <option value="Accounts">Accounts</option>
                    <option value="Marketing">Marketing</option>
                    <option value="IT / Support">IT / Support</option>
                    <option value="Management">Management</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Others">Others</option>
                  </>
                )}
              </select>
            </div>

            {/* Custom NID Photo & Birth Certificate Photo Upload Panels */}
            <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* NID Front */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">NID Card Front Photo</label>
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[140px] hover:border-blue-400 hover:bg-blue-50/20 transition-all group">
                  {nidFrontPhoto ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img src={nidFrontPhoto} alt="NID Front" className="max-h-[100px] object-contain rounded-xl mb-2" />
                      <button 
                        type="button" 
                        onClick={() => setNidFrontPhoto(null)}
                        className="text-xs text-red-500 font-bold hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-450 hover:text-blue-500 transition-colors">
                      <Image className="w-8 h-8 mb-2 text-gray-300 group-hover:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider">Upload Front Side</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Click or drag image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handlePhotoUpload(e, "nidFront")} 
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* NID Back */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">NID Card Back Photo</label>
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[140px] hover:border-blue-400 hover:bg-blue-50/20 transition-all group">
                  {nidBackPhoto ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img src={nidBackPhoto} alt="NID Back" className="max-h-[100px] object-contain rounded-xl mb-2" />
                      <button 
                        type="button" 
                        onClick={() => setNidBackPhoto(null)}
                        className="text-xs text-red-500 font-bold hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-450 hover:text-blue-500 transition-colors">
                      <Image className="w-8 h-8 mb-2 text-gray-300 group-hover:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider">Upload Back Side</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Click or drag image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handlePhotoUpload(e, "nidBack")} 
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Birth Certificate */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Birth Certificate Photo</label>
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[140px] hover:border-blue-400 hover:bg-blue-50/20 transition-all group">
                  {birthCertificatePhoto ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <img src={birthCertificatePhoto} alt="Birth Certificate" className="max-h-[100px] object-contain rounded-xl mb-2" />
                      <button 
                        type="button" 
                        onClick={() => setBirthCertificatePhoto(null)}
                        className="text-xs text-red-500 font-bold hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-450 hover:text-blue-500 transition-colors">
                      <Image className="w-8 h-8 mb-2 text-gray-300 group-hover:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider">Upload Certificate</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">Click or drag image</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handlePhotoUpload(e, "birth")} 
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Documents (Photo/ID/PDF)</label>
              <div className="flex flex-wrap gap-3">
                <label className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-400 hover:text-blue-500">
                  <FilePlus className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase">Upload</span>
                  <input type="file" multiple className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                </label>
                {employeeDocuments.map((doc, idx) => (
                  <div key={idx} className="relative w-24 h-24 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center p-2 group overflow-hidden">
                    {doc.type.startsWith('image/') ? (
                      <img src={doc.data} alt={doc.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <FileText className="w-8 h-8 text-blue-500" />
                    )}
                    <button 
                      type="button"
                      onClick={() => removeDocument(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] p-1 truncate text-center">
                      {doc.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3 pt-4 flex gap-4">
              <button 
                type="submit"
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg active:scale-95"
              >
                {editingEmployee ? "Update Employee Details" : "Register Employee"}
              </button>
              <button 
                type="button"
                onClick={resetForm}
                className="px-8 py-4 bg-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center text-gray-400 font-medium">Crunching employee data...</div>
        ) : employees.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No employees added yet.</p>
          </div>
        ) : (
          employees.map(emp => {
            const stats = getEmployeeStats(emp.id!);
            return (
              <div key={emp.id} className="bg-white rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all group p-6 flex flex-col">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setViewingProfile(emp)}
                      className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition-all overflow-hidden"
                    >
                      {emp.documents?.find(d => d.type.startsWith('image/')) ? (
                        <img src={emp.documents.find(d => d.type.startsWith('image/'))?.data} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle className="w-8 h-8" />
                      )}
                    </button>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        {emp.employeeIdCode && (
                          <span className="text-[10px] bg-slate-100 font-extrabold font-mono text-slate-800 px-1.5 py-0.5 rounded leading-none shrink-0 border border-slate-200/50">
                            {emp.employeeIdCode}
                          </span>
                        )}
                        <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                          {emp.name}
                          <button onClick={() => setViewingProfile(emp)} className="p-1 hover:text-blue-600 text-gray-300">
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </h3>
                      </div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        {emp.department || "Sales"} {emp.phone ? `• ${emp.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => startEdit(emp)}
                      className="p-[8px] text-gray-300 hover:text-blue-500 hover:bg-blue-51 rounded-xl transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {role === "admin" && (
                      <button 
                        onClick={() => setEmployeeToDelete(emp.id!)}
                        className="p-[8px] text-gray-300 hover:text-red-500 hover:bg-red-51 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {role === "admin" && (
                    <>
                      <div className="flex justify-between items-center px-4 py-3 bg-gray-50 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-gray-400" />
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-tight">Main Salary</span>
                        </div>
                        <span className="font-black text-gray-900">{formatCurrency(emp.salary)}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-4 rounded-2xl border border-gray-50 flex flex-col justify-between">
                          <div>
                            <p className="text-[10px] items-center font-bold text-gray-400 uppercase tracking-widest mb-1 flex gap-1">
                              <CreditCard className="w-3 h-3" /> Paid
                            </p>
                            <p className="font-black text-green-600">{formatCurrency(stats.totalPaid)}</p>
                          </div>
                          <button 
                            onClick={() => { setQuickPay({ empId: emp.id!, type: "Staff Salary" }); setPayAmount((emp.salary ?? 0).toString()); }}
                            className="mt-2 text-[10px] font-bold text-blue-600 uppercase hover:underline text-left flex items-center gap-1"
                          >
                            <CreditCard className="w-3 h-3" /> Record Salary Payment
                          </button>
                        </div>
                        <div className="p-4 rounded-2xl border border-gray-50 flex flex-col justify-between">
                          <div>
                            <p className="text-[10px] items-center font-bold text-gray-400 uppercase tracking-widest mb-1 flex gap-1">
                              <History className="w-3 h-3" /> Advance
                            </p>
                            <p className="font-black text-orange-600">{formatCurrency(stats.totalAdvance)}</p>
                          </div>
                          <button 
                             onClick={() => { setQuickPay({ empId: emp.id!, type: "Employee Advance" }); setPayAmount(""); }}
                            className="mt-2 text-[10px] font-bold text-orange-600 uppercase hover:underline text-left"
                          >
                            Give Adv
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <button 
                    onClick={() => setViewingAttendance(emp)}
                    className="w-full mt-2 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-3 h-3" /> View Attendance History
                  </button>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Joined {format(new Date(emp.joinedDate), "MMM yyyy")}
                  </span>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    emp.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  )}>
                    {emp.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {viewingAttendance && (
          <AttendanceHistoryModal 
            employee={viewingAttendance} 
            onClose={() => setViewingAttendance(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingProfile && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-gray-50 w-full max-w-4xl rounded-[40px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="bg-white p-8 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-blue-600 rounded-[24px] flex items-center justify-center text-white overflow-hidden shadow-xl ring-4 ring-blue-50">
                    {viewingProfile.documents?.find(d => d.type.startsWith('image/')) ? (
                      <img src={viewingProfile.documents.find(d => d.type.startsWith('image/'))?.data} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle className="w-12 h-12" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-3xl font-black text-gray-900">{viewingProfile.name}</h2>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        viewingProfile.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {viewingProfile.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 font-bold space-y-1 mt-1">
                      <p>
                        {viewingProfile.department || "Sales"} • Joined {format(new Date(viewingProfile.joinedDate), "MMMM dd, yyyy")}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-600 font-bold">
                        {viewingProfile.phone && <span>📞 {viewingProfile.phone}</span>}
                        {viewingProfile.email && <span>✉️ {viewingProfile.email}</span>}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => handlePrintProfile(viewingProfile)}
                    title="Print Profile / Save as PDF"
                    className="p-4 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-2xl transition-all cursor-pointer"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setViewingProfile(null)}
                    className="p-4 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all cursor-pointer"
                  >
                    <X className="w-6 h-6 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Content */}
               <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Stats Grid */}
                {role === "admin" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-blue-500" /> Basic Salary
                      </p>
                      <p className="text-2xl font-black text-gray-900">{formatCurrency(viewingProfile.salary)}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-green-500" /> Total Paid
                      </p>
                      <p className="text-2xl font-black text-green-600">{formatCurrency(getEmployeeStats(viewingProfile.id!).totalPaid)}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <History className="w-4 h-4 text-orange-500" /> Advance Balance
                      </p>
                      <p className="text-2xl font-black text-orange-600">{formatCurrency(getEmployeeStats(viewingProfile.id!).totalAdvance)}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Documents Section */}
                  <div className={cn("space-y-4", role !== "admin" && "lg:col-span-2")}>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <FilePlus className="w-5 h-5 text-gray-400" /> 
                      Employee Documents ({viewingProfile.documents?.length || 0})
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingProfile.documents?.map((doc, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 group hover:border-blue-200 transition-all">
                          <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                            {doc.type.startsWith('image/') ? <Image className="w-6 h-6 text-blue-500" /> : <FileText className="w-6 h-6 text-orange-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{doc.name}</p>
                            <a 
                              href={doc.data} 
                              download={doc.name}
                              className="text-[10px] font-bold text-blue-600 uppercase hover:underline flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" /> Download
                            </a>
                          </div>
                        </div>
                      ))}
                      {!viewingProfile.documents?.length && (
                        <div className="col-span-2 py-8 text-center bg-gray-100/50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-medium italic">
                          No documents uploaded.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  {role === "admin" && (
                    <div className="space-y-4">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <History className="w-5 h-5 text-gray-400" /> Recent Transactions
                      </h3>
                      <div className="space-y-2">
                        {transactions
                          .filter(tx => tx.employeeId === viewingProfile.id)
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 5)
                          .map(tx => (
                            <div key={tx.id} className="bg-white p-4 rounded-2xl flex items-center justify-between border border-gray-50">
                              <div>
                                <p className="text-xs font-bold text-gray-900">{tx.category} - {tx.subCategory}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{format(new Date(tx.date), "MMM dd, yyyy")}</p>
                              </div>
                              <p className="font-black text-gray-900">-{formatCurrency(tx.amount)}</p>
                            </div>
                          ))}
                        {!transactions.filter(tx => tx.employeeId === viewingProfile.id).length && (
                          <div className="py-8 text-center bg-gray-100/50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-medium italic">
                            No transaction history.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Identification Documents (KYC) Section - takes full width */}
                  <div className="space-y-4 lg:col-span-2 pt-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-blue-600" /> 
                      Official Information & KYC Documents
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* NID Front */}
                      <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">NID Card Front</p>
                        {viewingProfile.nidFrontPhoto ? (
                          <div className="w-full flex flex-col items-center">
                            <div className="w-full h-32 bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-100 mb-3 shadow-inner">
                              <img src={viewingProfile.nidFrontPhoto} alt="NID Front" className="w-full h-full object-contain p-2" />
                            </div>
                            <a href={viewingProfile.nidFrontPhoto} download={`${viewingProfile.name}_NID_Front.png`} className="text-[10px] text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1.5 hover:underline">
                              <Download className="w-3.5 h-3.5" /> Download
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic py-8">No Front NID Photo uploaded</p>
                        )}
                      </div>

                      {/* NID Back */}
                      <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">NID Card Back</p>
                        {viewingProfile.nidBackPhoto ? (
                          <div className="w-full flex flex-col items-center">
                            <div className="w-full h-32 bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-100 mb-3 shadow-inner">
                              <img src={viewingProfile.nidBackPhoto} alt="NID Back" className="w-full h-full object-contain p-2" />
                            </div>
                            <a href={viewingProfile.nidBackPhoto} download={`${viewingProfile.name}_NID_Back.png`} className="text-[10px] text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1.5 hover:underline">
                              <Download className="w-3.5 h-3.5" /> Download
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic py-8">No Back NID Photo uploaded</p>
                        )}
                      </div>

                      {/* Birth Certificate */}
                      <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Birth Certificate</p>
                        {viewingProfile.birthCertificatePhoto ? (
                          <div className="w-full flex flex-col items-center">
                            <div className="w-full h-32 bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-100 mb-3 shadow-inner">
                              <img src={viewingProfile.birthCertificatePhoto} alt="Birth Certificate" className="w-full h-full object-contain p-2" />
                            </div>
                            <a href={viewingProfile.birthCertificatePhoto} download={`${viewingProfile.name}_Birth_Certificate.png`} className="text-[10px] text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1.5 hover:underline">
                              <Download className="w-3.5 h-3.5" /> Download
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic py-8">No Birth Certificate uploaded</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-8 bg-white border-t border-gray-100 flex justify-end gap-4 flex-wrap">
                <button 
                  type="button"
                  onClick={() => handlePrintProfile(viewingProfile)}
                  className="px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-2xl font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" /> Print / Save PDF
                </button>
                <button 
                  onClick={() => { startEdit(viewingProfile); setViewingProfile(null); }}
                  className="px-6 py-3 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-2xl font-bold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Pencil className="w-4 h-4" /> Edit Profile
                </button>
                <button 
                  onClick={() => setViewingProfile(null)}
                  className="px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all cursor-pointer"
                >
                  Close Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {quickPay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className={cn(
              "p-6 text-white flex justify-between items-center",
              quickPay.type === "Staff Salary" ? "bg-green-600" : "bg-orange-600"
            )}>
              <div>
                <h3 className="text-xl font-bold">Record {quickPay.type}</h3>
                <p className="text-xs opacity-75 font-medium">To: {employees.find(e => e.id === quickPay.empId)?.name}</p>
              </div>
              <button onClick={() => setQuickPay(null)} className="p-2 hover:bg-black/10 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleQuickPay} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Amount (BDT)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold font-mono text-xl">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 text-2xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPayMethod("Cash")}
                    className={cn(
                      "flex items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold",
                      payMethod === "Cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-100 text-gray-400 hover:border-gray-200"
                    )}
                  >
                    <Wallet className="w-4 h-4" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod(banks[0]?.name || "Bank")}
                    className={cn(
                      "flex items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold",
                      payMethod !== "Cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-100 text-gray-400 hover:border-gray-200"
                    )}
                  >
                    <Landmark className="w-4 h-4" /> Bank
                  </button>
                </div>
                {payMethod !== "Cash" && banks.length > 0 && (
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full mt-2 px-4 py-3 bg-gray-50 rounded-2xl border-none text-sm font-medium"
                  >
                    {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Notes (Optional)</label>
                <input
                  placeholder="e.g. For June Month"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gray-200 font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={isPaying}
                className={cn(
                  "w-full py-5 rounded-2xl font-bold text-lg shadow-xl transition-all active:scale-95 disabled:opacity-50 text-white",
                  quickPay.type === "Staff Salary" ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"
                )}
              >
                {isPaying ? "Processing..." : `Confirm ${quickPay.type === "Staff Salary" ? "Payment" : "Advance"}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Custom Employee Delete Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Remove Employee?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to remove this employee? This will not delete their transaction history.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteEmployee}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttendanceHistoryModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const start = startOfYear(new Date());
    const end = endOfYear(new Date());
    
    const q = query(
      collection(db, "attendance"),
      where("employeeId", "==", employee.id),
      where("date", ">=", start.toISOString()),
      where("date", "<=", end.toISOString()),
      orderBy("date", "desc")
    );

    getDocs(q).then(snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [employee.id]);

  const stats = {
    present: records.filter(r => r.status === "present").length,
    late: records.filter(r => r.status === "late").length,
    absent: records.filter(r => r.status === "absent").length,
    leave: records.filter(r => r.status === "leave").length,
    halfDay: records.filter(r => r.status === "half-day").length,
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black text-gray-900">Attendance History {currentYear}</h3>
            <p className="text-gray-500 font-bold">{employee.name} • {employee.role}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-blue-50 p-4 rounded-2xl text-center">
              <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Present</p>
              <p className="text-xl font-black text-blue-600">{stats.present}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-2xl text-center">
              <p className="text-[10px] font-black text-orange-400 uppercase mb-1">Late</p>
              <p className="text-xl font-black text-orange-600">{stats.late}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl text-center">
              <p className="text-[10px] font-black text-red-400 uppercase mb-1">Absent</p>
              <p className="text-xl font-black text-red-600">{stats.absent}</p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-2xl text-center">
              <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Leave</p>
              <p className="text-xl font-black text-indigo-600">{stats.leave}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-2xl text-center">
              <p className="text-[10px] font-black text-yellow-400 uppercase mb-1">Half Day</p>
              <p className="text-xl font-black text-yellow-600">{stats.halfDay}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-gray-900 border-l-4 border-blue-600 pl-3">Detailed Log</h4>
            {loading ? (
              <div className="py-10 text-center text-gray-400">Loading history...</div>
            ) : records.length === 0 ? (
              <div className="py-10 text-center text-gray-400 italic">No attendance records found for this year.</div>
            ) : (
              <div className="space-y-2">
                {records.map(record => (
                  <div key={record.id} className="bg-gray-50 p-4 rounded-2xl flex items-center justify-between border border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center font-bold text-gray-600 shadow-sm border border-gray-100">
                        {format(new Date(record.date), "dd")}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{format(new Date(record.date), "MMMM dd, yyyy")}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          In: {record.checkIn || "--:--"} 
                          {record.lunchOut && ` • Lunch: ${record.lunchOut} - ${record.lunchIn || "--:--"}`}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                      record.status === "present" && "bg-blue-100 text-blue-700",
                      record.status === "late" && "bg-orange-100 text-orange-700",
                      record.status === "absent" && "bg-red-100 text-red-700",
                      record.status === "leave" && "bg-indigo-100 text-indigo-700",
                      record.status === "half-day" && "bg-yellow-100 text-yellow-700",
                    )}>
                      {record.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
