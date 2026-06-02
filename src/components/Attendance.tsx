import React, { useState, useEffect } from "react";
import { 
  db, 
  OperationType, 
  handleFirestoreError,
  updateDoc,
  User,
  collection,
  onSnapshot,
  addDoc,
  doc,
  query,
  where,
  deleteDoc
} from "@/src/lib/supabase";
import { Employee, UserRole, Attendance, AttendanceStatus } from "@/src/types";
import { cn } from "@/src/lib/utils";
import { 
  Calendar, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock3, 
  Plane, 
  Sun,
  MoreVertical,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Save,
  Download,
  Activity,
  Trash2,
  UserCheck,
  CalendarDays,
  FileSpreadsheet,
  History,
  CheckCircle,
  HelpCircle,
  UserX,
  X,
  Plus,
  TrendingUp,
  UserCircle
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfToday, addDays, subDays, parseISO } from "date-fns";
import { motion, AnimatePresence } from "motion/react";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: any; color: string; bg: string; dot: string }> = {
  present: { label: "Present", icon: CheckCircle2, color: "text-emerald-600 border-emerald-100", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  absent: { label: "Absent", icon: XCircle, color: "text-red-600 border-red-100", bg: "bg-red-50", dot: "bg-red-500" },
  late: { label: "Late", icon: Clock3, color: "text-amber-600 border-amber-100", bg: "bg-amber-50", dot: "bg-amber-500" },
  "half-day": { label: "Half Day", icon: AlertCircle, color: "text-yellow-600 border-yellow-100", bg: "bg-yellow-50", dot: "bg-yellow-500" },
  leave: { label: "On Leave", icon: Plane, color: "text-indigo-600 border-indigo-100", bg: "bg-indigo-50", dot: "bg-indigo-500" },
  holiday: { label: "Holiday", icon: Sun, color: "text-purple-600 border-purple-100", bg: "bg-purple-50", dot: "bg-purple-500" }
};

export default function AttendancePage({ 
  user, 
  role,
  mode = "add",
  onSuccess
}: { 
  user: User; 
  role: UserRole; 
  mode?: "add" | "list";
  onSuccess?: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lateThreshold, setLateThreshold] = useState("10:00");
  const [lunchDurationLimit, setLunchDurationLimit] = useState(60);
  const [halfDayThreshold, setHalfDayThreshold] = useState("11:30");
  const [attendanceToDelete, setAttendanceToDelete] = useState<{ id: string; empName: string; prettyDate: string } | null>(null);
  
  // Custom detailed timings / submit states for phone and desktop views
  const [selectedEmpForTime, setSelectedEmpForTime] = useState<Employee | null>(null);
  const [modalStatus, setModalStatus] = useState<AttendanceStatus>("present");
  const [modalCheckIn, setModalCheckIn] = useState("09:00");
  const [modalLunchOut, setModalLunchOut] = useState("13:00");
  const [modalLunchIn, setModalLunchIn] = useState("14:00");
  const [modalNotes, setModalNotes] = useState("");
  
  // List view specific states
  const [listTab, setListTab] = useState<"matrix" | "logs" | "lunch">("matrix");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM")); // e.g. "2026-05"

  useEffect(() => {
    // Determine the month bounds based on view selection context
    let rangeDate = selectedDate;
    if (mode === "list") {
      try {
        const [year, month] = selectedMonth.split("-").map(Number);
        rangeDate = new Date(year, month - 1, 1);
      } catch {
        rangeDate = new Date();
      }
    }

    const unsubEmps = onSnapshot(query(collection(db, "employees"), where("status", "==", "active")), (snap) => {
      const emps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      emps.sort((a, b) => {
        const dateA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
        const dateB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEmployees(emps);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "employees"));

    const unsubSettings = onSnapshot(doc(db, "settings", "attendance"), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setLateThreshold(data.lateThreshold || "10:00");
        setLunchDurationLimit(data.lunchDurationLimit ?? 60);
        setHalfDayThreshold(data.halfDayThreshold || "11:30");
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, "settings"));

    // Fetch attendance for the selected date's / month's range
    const start = startOfMonth(rangeDate);
    const end = endOfMonth(rangeDate);
    
    const unsubAttendance = onSnapshot(
      query(
        collection(db, "attendance"), 
        where("date", ">=", start.toISOString()),
        where("date", "<=", end.toISOString())
      ), 
      (snap) => {
        setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "attendance")
    );

    return () => { unsubEmps(); unsubSettings(); unsubAttendance(); };
  }, [selectedDate, selectedMonth, mode]);

  const getAttendanceForDay = (empId: string, date: Date) => {
    return attendance.find(a => 
      a.employeeId === empId && 
      isSameDay(new Date(a.date), date)
    );
  };

  const isLate = (time: string) => {
    if (!time) return false;
    return time > lateThreshold;
  };

  const getLunchDurationMinutes = (lunchOut?: string, lunchIn?: string): number => {
    if (!lunchOut || !lunchIn) return 0;
    try {
      const [outH, outM] = lunchOut.split(":").map(Number);
      const [inH, inM] = lunchIn.split(":").map(Number);
      if (isNaN(outH) || isNaN(outM) || isNaN(inH) || isNaN(inM)) return 0;
      return (inH * 60 + inM) - (outH * 60 + outM);
    } catch {
      return 0;
    }
  };

  const computeStatus = (
    checkInTime: string, 
    desiredStatus: AttendanceStatus, 
    lunchOut?: string, 
    lunchIn?: string
  ): AttendanceStatus => {
    if (desiredStatus !== "present" && desiredStatus !== "late" && desiredStatus !== "half-day") {
      return desiredStatus;
    }
    // If lunchOut is filled but lunchIn is empty/falsy, count as half-day
    if (lunchOut && !lunchIn) {
      return "half-day";
    }
    if (!checkInTime) return "present";
    if (checkInTime > halfDayThreshold) {
      return "half-day";
    }
    if (checkInTime > lateThreshold) {
      return "late";
    }
    return "present";
  };

  const handleStatusChange = async (empId: string, status: AttendanceStatus) => {
    const existing = getAttendanceForDay(empId, selectedDate);
    const dateStr = selectedDate.toISOString();
    
    const currentIn = existing?.checkIn || "09:00";
    const currentLunchOut = existing?.lunchOut || "";
    const currentLunchIn = existing?.lunchIn || "";
    const finalStatus = computeStatus(currentIn, status, currentLunchOut, currentLunchIn);

    try {
      if (existing) {
        if (existing.id) {
          await updateDoc(doc(db, "attendance", existing.id), { status: finalStatus });
        }
      } else {
        let defaultIn = "09:00";
        if (finalStatus === "half-day") {
          defaultIn = "12:00";
        } else if (finalStatus === "late") {
          defaultIn = "10:15";
        }

        await addDoc(collection(db, "attendance"), {
          employeeId: empId,
          date: dateStr,
          status: finalStatus,
          checkIn: defaultIn,
          lunchOut: "",
          lunchIn: "",
          notes: ""
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "attendance");
    }
  };

  const handleBulkAttendance = async (status: AttendanceStatus) => {
    setIsSaving(true);
    try {
      for (const emp of employees) {
        const existing = getAttendanceForDay(emp.id!, selectedDate);
        const currentIn = existing?.checkIn || "09:00";
        const currentLunchOut = existing?.lunchOut || "";
        const currentLunchIn = existing?.lunchIn || "";
        const finalStatus = computeStatus(currentIn, status, currentLunchOut, currentLunchIn);

        if (!existing) {
          let defaultIn = "09:00";
          if (finalStatus === "half-day") {
            defaultIn = "12:00";
          } else if (finalStatus === "late") {
            defaultIn = "10:15";
          }

          await addDoc(collection(db, "attendance"), {
            employeeId: emp.id!,
            date: selectedDate.toISOString(),
            status: finalStatus,
            checkIn: defaultIn,
            lunchOut: "",
            lunchIn: "",
            notes: ""
          });
        } else if (existing.id) {
          await updateDoc(doc(db, "attendance", existing.id), { status: finalStatus });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "attendance");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to remove an attendance entry by staging in modal trigger
  const handleDeleteAttendanceLog = (id: string, empName: string, dateStr: string) => {
    if (!id) return;
    let prettyDate = dateStr;
    try {
      prettyDate = format(parseISO(dateStr), "dd MMMM yyyy");
    } catch {
      try {
        prettyDate = format(new Date(dateStr), "dd MMMM yyyy");
      } catch {
        prettyDate = dateStr;
      }
    }
    setAttendanceToDelete({ id, empName, prettyDate });
  };

  const executeDeleteAttendance = async () => {
    if (!attendanceToDelete) return;
    const { id } = attendanceToDelete;
    setAttendanceToDelete(null);
    try {
      await deleteDoc(doc(db, "attendance", id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, "attendance");
    }
  };

  // Timing Modal helper functions
  const handleOpenTimeModal = (emp: Employee) => {
    const record = getAttendanceForDay(emp.id!, selectedDate);
    setSelectedEmpForTime(emp);
    setModalStatus(record?.status || "present");
    setModalCheckIn(record?.checkIn || "09:00");
    setModalLunchOut(record?.lunchOut || "");
    setModalLunchIn(record?.lunchIn || "");
    setModalNotes(record?.notes || "");
  };

  const handleSaveTimeSubmit = async () => {
    if (!selectedEmpForTime) return;
    setIsSaving(true);
    const empId = selectedEmpForTime.id!;
    const record = getAttendanceForDay(empId, selectedDate);
    
    // Compute computed state status based on check-in time and lunch status
    const finalStatus = computeStatus(modalCheckIn, modalStatus, modalLunchOut, modalLunchIn);

    try {
      if (record && record.id) {
        await updateDoc(doc(db, "attendance", record.id), {
          status: finalStatus,
          checkIn: modalCheckIn,
          lunchOut: modalLunchOut,
          lunchIn: modalLunchIn,
          notes: modalNotes
        });
      } else {
        await addDoc(collection(db, "attendance"), {
          employeeId: empId,
          date: selectedDate.toISOString(),
          status: finalStatus,
          checkIn: modalCheckIn,
          lunchOut: modalLunchOut,
          lunchIn: modalLunchIn,
          notes: modalNotes
        });
      }
      setSelectedEmpForTime(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "attendance");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTimeFieldChange = async (empId: string, field: "checkIn" | "lunchOut" | "lunchIn", value: string) => {
    const existing = getAttendanceForDay(empId, selectedDate);
    const dateStr = selectedDate.toISOString();

    try {
      if (existing && existing.id) {
        const updates: any = { [field]: value };
        const checkIn = field === "checkIn" ? value : (existing.checkIn || "09:00");
        const lunchOut = field === "lunchOut" ? value : (existing.lunchOut || "");
        const lunchIn = field === "lunchIn" ? value : (existing.lunchIn || "");
        
        if (existing.status === "present" || existing.status === "late" || existing.status === "half-day") {
          updates.status = computeStatus(checkIn, existing.status, lunchOut, lunchIn);
        }
        await updateDoc(doc(db, "attendance", existing.id), updates);
      } else {
        const checkIn = field === "checkIn" ? value : "09:00";
        const lunchOut = field === "lunchOut" ? value : "";
        const lunchIn = field === "lunchIn" ? value : "";
        const finalStatus = computeStatus(checkIn, "present", lunchOut, lunchIn);

        await addDoc(collection(db, "attendance"), {
          employeeId: empId,
          date: dateStr,
          status: finalStatus,
          checkIn,
          lunchOut,
          lunchIn,
          notes: ""
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "attendance");
    }
  };

  // Filter staff by search box query
  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.department && e.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getRangeDateContext = () => {
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      return new Date(year, month - 1, 1);
    } catch {
      return new Date();
    }
  };

  const listMonthDate = getRangeDateContext();
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(listMonthDate),
    end: endOfMonth(listMonthDate)
  });

  // Filter out any entries that don't belong to active employees (remove test or orphan data logs)
  const validAttendance = attendance.filter(a => employees.some(e => e.id === a.employeeId));

  // Calculate detailed dashboard stats for the selected list month
  const totalSlotsPossible = employees.length * daysInMonth.length;
  const presentCount = validAttendance.filter(a => a.status === "present" || a.status === "late" || a.status === "half-day").length;
  const lateCount = validAttendance.filter(a => a.status === "late").length;
  const absentCount = validAttendance.filter(a => a.status === "absent").length;
  const leaveCount = validAttendance.filter(a => a.status === "leave").length;
  const holidayCount = validAttendance.filter(a => a.status === "holiday").length;
  const occupancyRate = totalSlotsPossible > 0 ? Math.round((presentCount / totalSlotsPossible) * 100) : 0;

  const downloadCSV = () => {
    const headers = ["Employee", "Role", "Department", ...daysInMonth.map(d => format(d, "yyyy-MM-dd")), "Present Days", "Percentage"];
    const rows = employees.map(emp => {
      const empRecords = validAttendance.filter(a => a.employeeId === emp.id);
      const daysPaid = empRecords.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
      const rate = daysInMonth.length > 0 ? Math.round((daysPaid / daysInMonth.length) * 100) : 0;
      return [
        emp.name,
        emp.role,
        emp.department || "General",
        ...daysInMonth.map(day => {
          const record = empRecords.find(r => isSameDay(new Date(r.date), day));
          return record ? record.status : "-";
        }),
        daysPaid,
        `${rate}%`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_summary_${format(listMonthDate, "yyyy_MM")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate Months List for Filter dropdown
  const generateMonthsDropdown = () => {
    const list = [];
    const base = new Date();
    for (let i = 0; i < 24; i++) {
      const optionMonth = new Date(base.getFullYear(), base.getMonth() - i, 1);
      list.push({
        value: format(optionMonth, "yyyy-MM"),
        label: format(optionMonth, "MMMM yyyy")
      });
    }
    return list;
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-gray-400 font-medium italic">
        Synchronizing official shop attendance registry...
      </div>
    );
  }

  // RENDER ADD MODE
  if (mode === "add") {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight mb-2 text-gray-950">Add Attendance</h2>
            <p className="text-gray-500 font-medium italic">Record custom shifts, check-in schedules, and daily presence markers.</p>
          </div>
          
          {onSuccess && (
            <button 
              onClick={onSuccess}
              className="bg-white border text-gray-700 hover:bg-gray-50 border-gray-200 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer text-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-gray-400" />
              View Ledger List
            </button>
          )}
        </header>

        {/* Interactive Premium Weekly Stripe & Unified Date Select Option */}
        {(() => {
          const surroundingDays = Array.from({ length: 7 }, (_, i) => {
            return addDays(subDays(selectedDate, 3), i);
          });
          return (
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-150/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest leading-none mb-1.5">Active Attendance Registry Date</p>
                  <div className="relative inline-flex items-center gap-2.5 group cursor-pointer text-gray-950 hover:text-blue-650 transition-colors">
                    <Calendar className="w-5 h-5 text-blue-600 animate-pulse" />
                    <h3 className="text-sm md:text-base font-black tracking-tight leading-none group-hover:underline">
                      {format(selectedDate, "EEEE, dd MMMM yyyy")}
                    </h3>
                    <span className="text-[9px] bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider group-hover:bg-blue-100 transition-colors">
                      Select Any Date
                    </span>
                    <input 
                      type="date"
                      value={format(selectedDate, "yyyy-MM-dd")}
                      onChange={(e) => {
                        if (e.target.value) {
                          const [year, month, day] = e.target.value.split("-").map(Number);
                          setSelectedDate(new Date(year, month - 1, day));
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      title="Click to select custom date"
                    />
                  </div>
                </div>

                {/* Quick Actions for Date */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(startOfToday())}
                    className={cn(
                      "py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border",
                      isSameDay(selectedDate, startOfToday())
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/10"
                        : "bg-gray-50 text-gray-600 border-gray-150 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(subDays(startOfToday(), 1))}
                    className={cn(
                      "py-2 px-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border",
                      isSameDay(selectedDate, subDays(startOfToday(), 1))
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-gray-50 text-gray-600 border-gray-150 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    Yesterday
                  </button>
                </div>
              </div>

              {/* Week stripe days slider */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDate(prev => subDays(prev, 1))}
                  className="p-2.5 md:p-3 bg-gray-50 hover:bg-gray-100 border border-gray-150 rounded-2xl text-gray-500 hover:text-gray-900 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex-1 grid grid-cols-7 gap-1 md:gap-2 overflow-hidden">
                  {surroundingDays.map((day) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, startOfToday());
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "flex flex-col items-center justify-center py-2 md:py-3 rounded-2xl border transition-all cursor-pointer text-center relative overflow-hidden group min-w-0",
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10 scale-102"
                            : "bg-white text-gray-500 border-gray-150 hover:bg-slate-50 hover:text-gray-950"
                        )}
                      >
                        <span className={cn(
                          "text-[8px] md:text-[9px] font-black uppercase tracking-widest block truncate max-w-full px-1",
                          isSelected ? "text-gray-300" : "text-gray-400 group-hover:text-gray-600"
                        )}>
                          {format(day, "EEE")}
                        </span>
                        <span className="text-xs md:text-sm font-black tracking-tight block">
                          {format(day, "dd")}
                        </span>
                        
                        {/* Tiny visual underline indicator for 'Today' */}
                        {isToday && (
                          <span className={cn(
                            "absolute bottom-0.5 md:bottom-1 w-1 md:w-1.5 h-1 md:h-1.5 rounded-full",
                            isSelected ? "bg-blue-400" : "bg-blue-600 animate-pulse"
                          )} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDate(prev => addDays(prev, 1))}
                  className="p-2.5 md:p-3 bg-gray-50 hover:bg-gray-100 border border-gray-150 rounded-2xl text-gray-500 hover:text-gray-900 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
                  title="Next Day"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Action Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search staff name or role..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-blue-100 text-xs font-bold leading-none placeholder:text-gray-400"
            />
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => handleBulkAttendance("present")}
              disabled={isSaving || employees.length === 0}
              className="flex-1 py-3.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-green-100/50 hover:border-green-200 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              Mark All Present
            </button>
            <button 
              onClick={() => handleBulkAttendance("holiday")}
              disabled={isSaving || employees.length === 0}
              className="flex-1 py-3.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-purple-100/50 hover:border-purple-200 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              Set Holiday
            </button>
          </div>
        </div>

        {/* Daily Attendance Grid Sheet table - Desktop Version */}
        <div className="hidden md:block bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Staff Member</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mark Registry Status</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Check-In & Lunch Durations</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Notes / Remarks</th>
                  <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Daily Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredEmployees.map((emp) => {
                  const record = getAttendanceForDay(emp.id!, selectedDate);
                  return (
                    <tr key={emp.id} className="hover:bg-blue-50/20 transition-colors group">
                      {/* Name Details */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gray-100 text-gray-500 rounded-xl flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 group-hover:bg-[#D12765] group-hover:text-white transition-colors">
                            {emp.documents?.find(d => d.type.startsWith('image/')) ? (
                              <img src={emp.documents.find(d => d.type.startsWith('image/'))?.data} alt="" className="w-full h-full object-cover" />
                            ) : emp.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm leading-none mb-1">{emp.name}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{emp.role} {emp.department ? `• ${emp.department}` : ""}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status select buttons */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-1">
                          {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, any][]).map(([status, cfg]) => (
                            <button
                              key={status}
                              onClick={() => handleStatusChange(emp.id!, status)}
                              title={cfg.label}
                              className={cn(
                                "p-2 rounded-xl transition-all border shrink-0 cursor-pointer hover:scale-105 active:scale-95",
                                record?.status === status 
                                  ? cn(cfg.bg, cfg.color, "border-current shadow-xs z-10 font-bold") 
                                  : "bg-white text-gray-300 border-gray-100 hover:border-gray-200 hover:text-gray-400"
                              )}
                            >
                              <cfg.icon className="w-4 h-4" />
                            </button>
                          ))}

                          {/* Action Button to clear and delete any daily attendance log */}
                          {record && (
                            <button
                              onClick={() => handleDeleteAttendanceLog(record.id!, emp.name, record.date)}
                              title="Delete/Clear today's attendance log"
                              className="p-2 bg-white text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-100 hover:border-red-100 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 ml-1.5 flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Shift schedule info */}
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">In:</span>
                            <input 
                              type="time" 
                              value={record?.checkIn || ""} 
                              onChange={async (e) => await handleTimeFieldChange(emp.id!, "checkIn", e.target.value)}
                              className="bg-gray-50 border-none rounded-lg text-xs font-bold p-1 w-18 focus:ring-1 focus:ring-blue-100 focus:bg-white outline-none cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">L.Out:</span>
                            <input 
                              type="time" 
                              value={record?.lunchOut || ""} 
                              onChange={async (e) => await handleTimeFieldChange(emp.id!, "lunchOut", e.target.value)}
                              className="bg-gray-50 border-none rounded-lg text-xs font-bold p-1 w-18 focus:ring-1 focus:ring-blue-100 focus:bg-white outline-none cursor-pointer"
                            />
                            <span className="text-gray-350 text-[10px]">-</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase">In:</span>
                            <input 
                              type="time" 
                              value={record?.lunchIn || ""} 
                              onChange={async (e) => await handleTimeFieldChange(emp.id!, "lunchIn", e.target.value)}
                              className="bg-gray-50 border-none rounded-lg text-xs font-bold p-1 w-18 focus:ring-1 focus:ring-blue-100 focus:bg-white outline-none cursor-pointer"
                            />
                          </div>

                          {/* Submit / detailed time edit shortcut indicator/button */}
                          <button
                            onClick={() => handleOpenTimeModal(emp)}
                            title="Open interactive check-in/lunch submit details"
                            className="p-1 px-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 font-extrabold text-[10px] uppercase tracking-wider rounded-lg border border-blue-105 transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1 inline-flex shrink-0 ml-auto"
                          >
                            <Clock className="w-3 h-3" />
                            Submit Options
                          </button>
                        </div>
                      </td>

                      {/* Custom notes remarks */}
                      <td className="px-6 py-5">
                        <input 
                          type="text"
                          placeholder="Add comment..."
                          value={record?.notes || ""}
                          onChange={async (e) => {
                            if (record?.id) {
                              await updateDoc(doc(db, "attendance", record.id), { notes: e.target.value });
                            }
                          }}
                          className="w-full bg-transparent hover:bg-gray-50 text-xs font-semibold px-2 py-1.5 rounded-lg border-none focus:ring-1 focus:ring-slate-200 focus:bg-slate-50 transition-all outline-none"
                        />
                      </td>

                      {/* Status Tag badge */}
                      <td className="px-6 py-5 text-right font-mono">
                        {record ? (
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider", 
                            STATUS_CONFIG[record.status].bg, 
                            STATUS_CONFIG[record.status].color
                          )}>
                            <span className={cn("w-1 h-1 rounded-full", STATUS_CONFIG[record.status].dot)} />
                            {STATUS_CONFIG[record.status].label}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-300 italic">No Registry</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredEmployees.length === 0 && (
            <div className="py-24 text-center text-gray-400 font-semibold italic">
              No staff members match the query or registered parameters.
            </div>
          )}
        </div>

        {/* Mobile View Employee Cards - Visible on mobile only */}
        <div className="block md:hidden space-y-4">
          {filteredEmployees.map((emp) => {
            const record = getAttendanceForDay(emp.id!, selectedDate);
            const statusConfig = record ? STATUS_CONFIG[record.status] : null;

            return (
              <motion.div 
                key={emp.id}
                layoutId={`emp-mobile-card-${emp.id}`}
                className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-xl flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                      {emp.documents?.find(d => d.type.startsWith('image/')) ? (
                        <img src={emp.documents.find(d => d.type.startsWith('image/'))?.data} alt="" className="w-full h-full object-cover" />
                      ) : emp.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm leading-none mb-1">{emp.name}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{emp.role} {emp.department ? `• ${emp.department}` : ""}</p>
                    </div>
                  </div>

                  {record ? (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider", 
                      statusConfig?.bg, 
                      statusConfig?.color
                    )}>
                      <span className={cn("w-1 h-1 rounded-full", statusConfig?.dot)} />
                      {statusConfig?.label}
                    </span>
                  ) : (
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-wider bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
                      No Registry
                    </span>
                  )}
                </div>

                {/* Direct time selection input fields on mobile */}
                <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-150 grid grid-cols-4 gap-1.5 text-xs text-gray-500 font-semibold font-mono">
                  <div>
                    <span className="text-[9px] font-black text-gray-400 block uppercase mb-1">In</span>
                    <input 
                      type="time" 
                      value={record?.checkIn || ""} 
                      onChange={async (e) => await handleTimeFieldChange(emp.id!, "checkIn", e.target.value)}
                      className="bg-white border border-gray-200 rounded-lg text-xs font-bold p-1 w-full text-center focus:ring-1 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-gray-400 block uppercase mb-1">L.Out</span>
                    <input 
                      type="time" 
                      value={record?.lunchOut || ""} 
                      onChange={async (e) => await handleTimeFieldChange(emp.id!, "lunchOut", e.target.value)}
                      className="bg-white border border-gray-200 rounded-lg text-xs font-bold p-1 w-full text-center focus:ring-1 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-gray-400 block uppercase mb-1">L.In</span>
                    <input 
                      type="time" 
                      value={record?.lunchIn || ""} 
                      onChange={async (e) => await handleTimeFieldChange(emp.id!, "lunchIn", e.target.value)}
                      className="bg-white border border-gray-200 rounded-lg text-xs font-bold p-1 w-full text-center focus:ring-1 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-gray-400 block uppercase mb-2">Overtime</span>
                    <span className={cn(
                      "font-black text-xs block text-center pt-1.5",
                      record?.lunchOut && record?.lunchIn && getLunchDurationMinutes(record.lunchOut, record.lunchIn) > lunchDurationLimit
                        ? "text-red-650 animate-pulse"
                        : "text-emerald-650"
                    )}>
                      {record?.lunchOut && record?.lunchIn 
                        ? `${getLunchDurationMinutes(record.lunchOut, record.lunchIn)}m`
                        : "—"
                      }
                    </span>
                  </div>
                </div>

                {record?.notes && (
                  <p className="text-[11px] text-gray-500 italic bg-slate-50/30 p-2.5 rounded-lg border border-slate-100">
                    <strong className="text-[9px] font-black uppercase text-gray-400 not-italic block mb-0.5">Comment:</strong>
                    {record.notes}
                  </p>
                )}

                {/* Quick Status and Edit triggers */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => handleOpenTimeModal(emp)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/10 flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                  >
                    <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                    Set Times & Submit
                  </button>

                  <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                    {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, any][]).map(([status, cfg]) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(emp.id!, status)}
                        title={cfg.label}
                        className={cn(
                          "w-10 h-10 rounded-xl transition-all border shrink-0 cursor-pointer flex items-center justify-center",
                          record?.status === status 
                            ? cn(cfg.bg, cfg.color, "border-current font-bold scale-105 shadow-sm") 
                            : "bg-white text-gray-300 border-gray-100 hover:border-gray-200"
                        )}
                      >
                        <cfg.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredEmployees.length === 0 && (
            <div className="py-12 bg-white rounded-2xl border border-gray-100 text-center text-gray-400 font-semibold italic">
              No staff members match the query details.
            </div>
          )}
        </div>

        {/* Custom Slide-over page / Centered interactive Timing Modal with Submit Option */}
        {selectedEmpForTime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[32px] max-w-md w-full p-6 md:p-8 shadow-2xl border border-slate-100 flex flex-col gap-5 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-950 leading-tight">Time & Lunch Submission</h3>
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                    {format(selectedDate, "EEEE, dd MMMM yyyy")}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedEmpForTime(null)}
                  className="p-1.5 hover:bg-slate-50 text-gray-400 hover:text-gray-700 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Employee Header */}
              <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-150/50">
                <div className="w-11 h-11 bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                  {selectedEmpForTime.documents?.find(d => d.type.startsWith('image/')) ? (
                    <img src={selectedEmpForTime.documents.find(d => d.type.startsWith('image/'))?.data} alt="" className="w-full h-full object-cover" />
                  ) : selectedEmpForTime.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 leading-tight">{selectedEmpForTime.name}</h4>
                  <p className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase mt-0.5">{selectedEmpForTime.role}</p>
                </div>
              </div>

              {/* Form Content */}
              <div className="space-y-4">
                {/* 1. Status Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Attendance Registry Status</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, any][]).map(([status, cfg]) => {
                      const isSelected = modalStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setModalStatus(status)}
                          className={cn(
                            "py-2 px-1.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer text-center",
                            isSelected 
                              ? cn(cfg.bg, cfg.color, "border-current font-bold scale-[1.02] shadow-xs") 
                              : "bg-white text-gray-400 border-gray-150 hover:border-gray-200"
                          )}
                        >
                          <cfg.icon className="w-4 h-4" />
                          <span className="text-[9px] font-extrabold uppercase tracking-wide leading-none">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Shift & Lunch time selectors */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">In Time</label>
                    <input 
                      type="time" 
                      value={modalCheckIn}
                      onChange={(e) => setModalCheckIn(e.target.value)}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Lunch Out</label>
                    <input 
                      type="time" 
                      value={modalLunchOut}
                      onChange={(e) => setModalLunchOut(e.target.value)}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Lunch In</label>
                    <input 
                      type="time" 
                      value={modalLunchIn}
                      onChange={(e) => setModalLunchIn(e.target.value)}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Overtime violation hint */}
                {modalLunchOut && modalLunchIn && (
                  <div className={cn(
                    "p-3 rounded-xl border text-[11px] font-bold font-mono text-center",
                    getLunchDurationMinutes(modalLunchOut, modalLunchIn) > lunchDurationLimit
                      ? "bg-red-50 border-red-150 text-red-700 animate-pulse"
                      : "bg-emerald-50 border-emerald-150 text-emerald-800"
                  )}>
                    Lunch Duration Taken: {getLunchDurationMinutes(modalLunchOut, modalLunchIn)} mins 
                    ({getLunchDurationMinutes(modalLunchOut, modalLunchIn) > lunchDurationLimit ? `Exceeds limit of ${lunchDurationLimit}m` : "Within limits"})
                  </div>
                )}

                {/* 3. Remarks notes */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Notes / Remarks</label>
                  <input 
                    type="text"
                    placeholder="E.g., late due to traffic, extended shift, etc."
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border border-slate-250 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-105 outline-none placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Submit Buttons footer */}
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedEmpForTime(null)}
                  className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveTimeSubmit}
                  className="flex-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Submit Timings"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  // RENDER LIST MODE (with rich KPIs, heatmap grid summary, and live ledger table logs)
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight mb-2 text-gray-950">Attendance List</h2>
          <p className="text-gray-500 font-medium italic">Monitor occupancy graphs, monthly check-in heatmaps, and audit logs.</p>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-[20px] shadow-xs border border-gray-100">
          <div className="flex items-center gap-1.5 px-3 text-gray-400">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] font-black uppercase tracking-wider">Select Month:</span>
          </div>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="pr-8 pl-1 py-1.5 bg-transparent border-none focus:ring-0 font-bold text-xs text-gray-950 outline-none cursor-pointer"
          >
            {generateMonthsDropdown().map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <div className="h-6 w-[1px] bg-gray-150 hidden md:block" />

          <button 
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-[14px] font-bold text-xs transition-colors active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </header>

      {/* KPI Stats Block */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Present rate occupancy */}
        <div className="bg-white p-5 rounded-[22px] border border-gray-100 shadow-xs hover:shadow-xs transition-shadow flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Presence Weight</p>
            <h3 className="text-lg font-extrabold text-gray-950 font-mono tracking-tight">{occupancyRate}%</h3>
            <span className="text-[8px] text-emerald-600 font-bold">{presentCount} check-ins</span>
          </div>
        </div>

        {/* Late Entries counts */}
        <div className="bg-white p-5 rounded-[22px] border border-gray-100 shadow-xs hover:shadow-xs transition-shadow flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Late Arrivals</p>
            <h3 className="text-lg font-extrabold text-gray-950 font-mono tracking-tight">{lateCount}</h3>
            <span className="text-[8px] text-amber-600 font-bold">Past {lateThreshold} AM</span>
          </div>
        </div>

        {/* Absent days */}
        <div className="bg-white p-5 rounded-[22px] border border-gray-100 shadow-xs hover:shadow-xs transition-shadow flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
            <UserX className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Absences Logged</p>
            <h3 className="text-lg font-extrabold text-gray-950 font-mono tracking-tight">{absentCount}</h3>
            <span className="text-[8px] text-gray-400 font-semibold">Requires followups</span>
          </div>
        </div>

        {/* On Leave or Holidays */}
        <div className="bg-white p-5 rounded-[22px] border border-gray-100 shadow-xs hover:shadow-xs transition-shadow flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Holidays & Leaves</p>
            <h3 className="text-lg font-extrabold text-gray-950 font-mono tracking-tight">{holidayCount + leaveCount}</h3>
            <span className="text-[8px] text-purple-600 font-bold">{leaveCount} leaves, {holidayCount} holidays</span>
          </div>
        </div>
      </div>      {/* Main Tab selectors for Ledger Lists */}
      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-150 pb-4 flex-wrap">
          <div className="flex bg-gray-50 p-1 rounded-xl flex-wrap gap-1">
            <button 
              onClick={() => setListTab("matrix")}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer",
                listTab === "matrix" ? "bg-white text-gray-950 shadow-xs" : "text-gray-500 hover:text-gray-950"
              )}
            >
              Presence Matrix Heatmap
            </button>
            <button 
              onClick={() => setListTab("logs")}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer",
                listTab === "logs" ? "bg-white text-gray-950 shadow-xs" : "text-gray-500 hover:text-gray-950"
              )}
            >
              Log History Ledger ({validAttendance.length})
            </button>
            <button 
              onClick={() => setListTab("lunch")}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer",
                listTab === "lunch" ? "bg-white text-slate-950 shadow-xs" : "text-gray-500 hover:text-slate-950"
              )}
            >
              Lunch Overtime Report ({validAttendance.filter(r => getLunchDurationMinutes(r.lunchOut, r.lunchIn) > lunchDurationLimit).length} breaches)
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input 
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 hover:bg-gray-100/50 rounded-xl border-none outline-none text-xs font-bold placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Tab contents */}
        {listTab === "matrix" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <span>Heatmap Legend:</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded" /> Present</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500 rounded" /> Late</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-500 rounded" /> Half-day</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded" /> Absent</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500 rounded" /> Leave</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-500 rounded" /> Holiday</span>
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-2xl">
              <table className="w-full text-left border-collapse table-fixed min-w-[950px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="sticky left-0 bg-white z-20 px-4 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-100 w-48 shadow-xs">Employee</th>
                    {daysInMonth.map(day => (
                      <th key={day.toISOString()} className="px-1 py-3 text-[8px] font-black text-gray-400 uppercase text-center border-r border-gray-50 min-w-[28px]">
                        {format(day, "dd")}
                        <div className="text-[6px] opacity-60 font-semibold">{format(day, "EEE").charAt(0)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest w-24 text-center bg-gray-50/50">Month Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth.length + 2} className="py-12 text-center text-gray-400 italic text-xs font-semibold">
                        No employees found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map(emp => {
                      const empRecords = validAttendance.filter(a => a.employeeId === emp.id);
                      const presentCount = empRecords.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-gray-100 shadow-xs truncate">
                            <p className="font-extrabold text-gray-900 text-xs truncate">{emp.name}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase truncate">{emp.role}</p>
                          </td>
                          {daysInMonth.map(day => {
                            const record = empRecords.find(r => isSameDay(new Date(r.date), day));
                            let bgClass = "bg-gray-50 border-gray-100 hover:bg-gray-100";
                            if (record) {
                              if (record.status === "present") bgClass = "bg-emerald-500 text-white hover:bg-emerald-600";
                              else if (record.status === "late") bgClass = "bg-amber-500 text-white hover:bg-amber-600";
                              else if (record.status === "half-day") bgClass = "bg-yellow-500 text-white hover:bg-yellow-600";
                              else if (record.status === "absent") bgClass = "bg-red-500 text-white hover:bg-red-600";
                              else if (record.status === "leave") bgClass = "bg-indigo-500 text-white hover:bg-indigo-600";
                              else if (record.status === "holiday") bgClass = "bg-purple-500 text-white hover:bg-purple-600";
                            }
                            return (
                              <td key={day.toISOString()} className="px-0.5 py-3 text-center border-r border-gray-50">
                                <div 
                                  className={cn(
                                    "w-4 h-4 rounded-xs mx-auto border cursor-help transition-all duration-100",
                                    bgClass
                                  )} 
                                  title={`${emp.name} - ${format(day, "dd MMM")}: ${record ? STATUS_CONFIG[record.status].label : "No Record"}`}
                                />
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center bg-gray-50/20">
                            <p className="text-xs font-black text-gray-900 font-mono">{presentCount}/{daysInMonth.length}</p>
                            <span className="text-[8px] text-emerald-600 font-bold uppercase tracking-wider">Days</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : listTab === "logs" ? (
          /* AUDIT LOG HISTORY TABLE */
          <div className="overflow-x-auto -mx-6 font-sans">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-150">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Entry Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Staff Target</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Marked Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Shift Hours (Punch-In)</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lunch Break Duration</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Remarks / Notes</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {validAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400 italic text-xs font-semibold">No attendance entries recorded in database this month.</td>
                  </tr>
                ) : (
                  validAttendance
                    .filter(tx => {
                      const emp = employees.find(e => e.id === tx.employeeId);
                      if (!emp) return false; // Hide completely if the employee is not active/valid
                      return emp.name.toLowerCase().includes(searchQuery.toLowerCase());
                    })
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(record => {
                      const targetEmp = employees.find(e => e.id === record.employeeId);
                      return (
                        <tr key={record.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-6 py-4 font-bold text-xs text-gray-650">
                            {format(parseISO(record.date), "dd MMM yyyy")}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <UserCircle className="w-5 h-5 text-gray-400" />
                              <div>
                                <span className="font-extrabold text-gray-900 text-sm">{targetEmp?.name || "Deleted Staff"}</span>
                                <span className="block text-[8px] font-bold text-gray-400 uppercase leading-none mt-0.5">{targetEmp?.role || "System"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border", 
                              STATUS_CONFIG[record.status].bg, 
                              STATUS_CONFIG[record.status].color
                            )}>
                              <span className={cn("w-1 h-1 rounded-full", STATUS_CONFIG[record.status].dot)} />
                              {STATUS_CONFIG[record.status].label}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-gray-800 text-xs">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              {record.checkIn || "09:00 AM"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-gray-550 font-mono">
                            {record.lunchOut && record.lunchIn ? (
                              <span>{record.lunchOut} - {record.lunchIn}</span>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-500 max-w-xs truncate" title={record.notes}>
                            {record.notes || "-"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteAttendanceLog(record.id!, targetEmp?.name || "staff", record.date)}
                              className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-650 rounded-xl transition-all border border-transparent hover:border-red-100 inline-flex items-center justify-center cursor-pointer"
                              title="Delete Attendance Log"
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
        ) : (
          /* LUNCH OVERTIME REPORT */
          <div className="space-y-4 font-sans">
            <div className="p-4 bg-amber-50/70 border border-amber-100 rounded-2xl text-[11px] font-bold uppercase text-amber-900 tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              Store Policy: Allowed break limit is set to {lunchDurationLimit} minutes. Exceeding records are flagged below:
            </div>

            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-150">
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Entry Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lunch Out</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lunch In</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Recorded Break</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Overtime Breach</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    const overtimeLogs = validAttendance
                      .filter(r => {
                        const mins = getLunchDurationMinutes(r.lunchOut, r.lunchIn);
                        return mins > lunchDurationLimit;
                      })
                      .filter(tx => {
                        const emp = employees.find(e => e.id === tx.employeeId);
                        if (!emp) return false;
                        return emp.name.toLowerCase().includes(searchQuery.toLowerCase());
                      })
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    if (overtimeLogs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-gray-400 italic text-xs font-semibold">
                            Perfect compliance! No lunch overtime breaches recorded for active employees this month.
                          </td>
                        </tr>
                      );
                    }

                    return overtimeLogs.map(record => {
                      const targetEmp = employees.find(e => e.id === record.employeeId);
                      const totalTaken = getLunchDurationMinutes(record.lunchOut, record.lunchIn);
                      const excess = totalTaken - lunchDurationLimit;

                      return (
                        <tr key={record.id} className="hover:bg-amber-50/10 transition-colors">
                          <td className="px-6 py-4 font-bold text-xs text-gray-650">
                            {format(parseISO(record.date), "dd MMM yyyy")}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <UserCircle className="w-5 h-5 text-gray-400" />
                              <div>
                                <span className="font-extrabold text-gray-900 text-sm">{targetEmp?.name || "Deleted Staff"}</span>
                                <span className="block text-[8px] font-bold text-gray-400 uppercase leading-none mt-0.5">{targetEmp?.role || "System"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-700 text-xs">{record.lunchOut || "-"}</td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-700 text-xs">{record.lunchIn || "-"}</td>
                          <td className="px-6 py-4 font-mono text-sm font-extrabold text-amber-700">{totalTaken} mins</td>
                          <td className="px-6 py-4 font-mono text-sm font-extrabold text-red-650">+{excess} mins policy breach</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteAttendanceLog(record.id!, targetEmp?.name || "staff", record.date)}
                              className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-650 rounded-xl transition-all border border-transparent hover:border-red-100 inline-flex items-center justify-center cursor-pointer"
                              title="Delete Attendance Log"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Custom Non-blocking Delete Confirmation Modal */}
      {attendanceToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-55 border border-red-100 rounded-2xl flex items-center justify-center text-red-600 mb-6">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Attendance Log?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete the attendance log of <strong className="text-slate-805">{attendanceToDelete.empName}</strong> on <span className="font-semibold">{attendanceToDelete.prettyDate}</span>? This action is permanent and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAttendanceToDelete(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteAttendance}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                Delete Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
