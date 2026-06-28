import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, addDoc, doc, query, where, deleteDoc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError, updateDoc } from "@/src/lib/firebase";
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
  Printer,
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfToday, addDays, subDays, parseISO, startOfDay, endOfDay } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [modalCheckOut, setModalCheckOut] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  
  // List view specific states
  const [listTab, setListTab] = useState<"matrix" | "logs" | "lunch" | "days" | "timeliness">("days");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM")); // e.g. "2026-05"
  const [filterType, setFilterType] = useState<"month" | "range">("month");
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    // Determine the month bounds based on view selection context
    let rangeDate = selectedDate;
    let queryStart: Date;
    let queryEnd: Date;

    if (mode === "list") {
      if (filterType === "month") {
        try {
          const [year, month] = selectedMonth.split("-").map(Number);
          rangeDate = new Date(year, month - 1, 1);
        } catch {
          rangeDate = new Date();
        }
        queryStart = startOfMonth(rangeDate);
        queryEnd = endOfMonth(rangeDate);
      } else {
        queryStart = startOfDay(new Date(startDate));
        queryEnd = endOfDay(new Date(endDate));
      }
    } else {
      queryStart = startOfDay(selectedDate);
      queryEnd = endOfDay(selectedDate);
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
    const unsubAttendance = onSnapshot(
      query(
        collection(db, "attendance"), 
        where("date", ">=", queryStart.toISOString()),
        where("date", "<=", queryEnd.toISOString())
      ), 
      (snap) => {
        setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "attendance")
    );

    return () => { unsubEmps(); unsubSettings(); unsubAttendance(); };
  }, [selectedDate, selectedMonth, mode, filterType, startDate, endDate]);

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
    
    const isOffDuty = status === "absent" || status === "leave" || status === "holiday";
    const currentIn = isOffDuty ? "" : (existing?.checkIn || "09:00");
    const currentLunchOut = isOffDuty ? "" : (existing?.lunchOut || "");
    const currentLunchIn = isOffDuty ? "" : (existing?.lunchIn || "");
    const currentCheckOut = isOffDuty ? "" : (existing?.checkOut || "");
    const finalStatus = isOffDuty ? status : computeStatus(currentIn, status, currentLunchOut, currentLunchIn);

    try {
      if (existing) {
        if (existing.id) {
          await updateDoc(doc(db, "attendance", existing.id), { 
            status: finalStatus,
            checkIn: currentIn,
            lunchOut: currentLunchOut,
            lunchIn: currentLunchIn,
            checkOut: currentCheckOut
          });
        }
      } else {
        let defaultIn = isOffDuty ? "" : "09:00";
        if (!isOffDuty) {
          if (finalStatus === "half-day") {
            defaultIn = "12:00";
          } else if (finalStatus === "late") {
            defaultIn = "10:15";
          }
        }

        await addDoc(collection(db, "attendance"), {
          employeeId: empId,
          date: dateStr,
          status: finalStatus,
          checkIn: defaultIn,
          lunchOut: "",
          lunchIn: "",
          checkOut: "",
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
    setModalCheckOut(record?.checkOut || "");
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
          checkOut: modalCheckOut,
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
          checkOut: modalCheckOut,
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

  const handleTimeFieldChange = async (empId: string, field: "checkIn" | "lunchOut" | "lunchIn" | "checkOut", value: string) => {
    const existing = getAttendanceForDay(empId, selectedDate);
    const dateStr = selectedDate.toISOString();

    try {
      if (existing && existing.id) {
        const updates: any = { [field]: value };
        const checkIn = field === "checkIn" ? value : (existing.checkIn ?? "");
        const lunchOut = field === "lunchOut" ? value : (existing.lunchOut ?? "");
        const lunchIn = field === "lunchIn" ? value : (existing.lunchIn ?? "");
        const checkOut = field === "checkOut" ? value : (existing.checkOut ?? "");
        
        if (existing.status === "present" || existing.status === "late" || existing.status === "half-day") {
          updates.status = computeStatus(checkIn, existing.status, lunchOut, lunchIn);
        }
        await updateDoc(doc(db, "attendance", existing.id), updates);
      } else {
        const checkIn = field === "checkIn" ? value : "09:00";
        const lunchOut = field === "lunchOut" ? value : "";
        const lunchIn = field === "lunchIn" ? value : "";
        const checkOut = field === "checkOut" ? value : "";
        const finalStatus = computeStatus(checkIn, "present", lunchOut, lunchIn);

        await addDoc(collection(db, "attendance"), {
          employeeId: empId,
          date: dateStr,
          status: finalStatus,
          checkIn,
          lunchOut,
          lunchIn,
          checkOut,
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
    start: filterType === "month" ? startOfMonth(listMonthDate) : startOfDay(new Date(startDate)),
    end: filterType === "month" ? endOfMonth(listMonthDate) : endOfDay(new Date(endDate))
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

  const handleDownloadPDF = () => {
    const doc = new jsPDF("landscape", "mm", "a4");
    
    // Title Banner
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(14, 15, 269, 18, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("GLOBAL OPERATIONS ATTENDANCE MODULE - DISCHARGE LEDGER", 20, 26);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")} | Caller: ${user?.email || "Manager"}`, 263, 26, { align: "right" });

    // Section header
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    
    let tabLabel = "";
    let subInfo = "";

    if (listTab === "matrix") {
      tabLabel = "PRESENCE HEATMAP MATRIX LEDGER";
      subInfo = `Month Period: ${format(listMonthDate, "MMMM yyyy")} | Active Personnel Checklist (${employees.length} staff)`;
    } else if (listTab === "logs") {
      tabLabel = "ALL CHECK-IN & CHECK-OUT HISTORY LEDGER (FILTERED)";
      subInfo = `Active logs dataset. Verified events logged: ${validAttendance.length}`;
    } else if (listTab === "lunch") {
      tabLabel = "LUNCH OVERTIME COMPLIANCE EXCEPTION REPORT";
      subInfo = `Official Limit: ${lunchDurationLimit} minutes. Filtered list identifying long break violations.`;
    } else if (listTab === "days") {
      const focusDateStr = selectedDate.toISOString().split("T")[0];
      const todayLogs = attendance.filter(a => a.date && a.date.startsWith(focusDateStr));
      tabLabel = `DAILY OPERATIONS AUDIT STATEMENT - ${format(selectedDate, "EEEE, d MMMM yyyy")}`;
      subInfo = `Marked: ${todayLogs.length} / ${employees.length} employees active today.`;
    } else if (listTab === "timeliness") {
      tabLabel = "MONTHLY TIMELINESS & BREACH AUDIT REPORT";
      subInfo = `Evaluation Period: ${format(new Date(selectedMonth + "-01"), "MMMM yyyy")} | Compliance ratings index.`;
    }

    doc.text(tabLabel, 14, 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subInfo, 14, 47);

    // Prepare headers and body rows dynamically based on selected ledger tab
    let headCells: string[][] = [];
    let bodyRows: any[][] = [];

    if (listTab === "matrix") {
      headCells = [["Employee Name", "Role", ...daysInMonth.map(d => format(d, "dd")), "Pr/Ab"]];
      bodyRows = filteredEmployees.map(emp => {
        const empRecords = validAttendance.filter(a => a.employeeId === emp.id);
        const presentCnt = empRecords.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
        const absentCnt = empRecords.filter(r => r.status === "absent").length;
        return [
          emp.name,
          emp.role,
          ...daysInMonth.map(day => {
            const r = empRecords.find(rec => isSameDay(new Date(rec.date), day));
            if (!r) return "-";
            if (r.status === "present") return "P";
            if (r.status === "late") return "L";
            if (r.status === "half-day") return "HD";
            if (r.status === "absent") return "A";
            if (r.status === "leave") return "LV";
            if (r.status === "holiday") return "H";
            return "-";
          }),
          `${presentCnt}/${absentCnt}`
        ];
      });
    } else if (listTab === "logs") {
      headCells = [["Log Date", "Employee Profile", "Recorded Status", "Clock In", "Lunch Out", "Lunch In", "Clock Out", "Remarks / Logs"]];
      const searchFilteredLogs = validAttendance
        .filter(rec => {
          const emp = employees.find(e => e.id === rec.employeeId);
          if (!emp) return false;
          return (
            emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (rec.notes && rec.notes.toLowerCase().includes(searchQuery.toLowerCase()))
          );
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      bodyRows = searchFilteredLogs.map(rec => {
        const emp = employees.find(e => e.id === rec.employeeId);
        return [
          rec.date ? format(new Date(rec.date), "yyyy-MM-dd") : "-",
          emp ? `${emp.name} (${emp.role})` : "Unindexed Employee",
          rec.status.toUpperCase(),
          rec.checkIn || "-",
          rec.lunchOut || "-",
          rec.lunchIn || "-",
          rec.checkOut || "-",
          rec.notes || "-"
        ];
      });
    } else if (listTab === "lunch") {
      headCells = [["Employee Profile", "Role / Department", "Total Present Days", "Lunch Breach Occurrences", "Average Break Taken", "Breach Ratio"]];
      bodyRows = filteredEmployees.map(emp => {
        const empRecords = validAttendance.filter(a => a.employeeId === emp.id);
        const presentCnt = empRecords.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
        const breaches = empRecords.filter(r => {
          const mins = getLunchDurationMinutes(r.lunchOut, r.lunchIn);
          return mins > lunchDurationLimit;
        });
        const completedLunches = empRecords.filter(r => r.lunchOut && r.lunchIn);
        const totalMins = completedLunches.reduce((sum, r) => sum + getLunchDurationMinutes(r.lunchOut, r.lunchIn), 0);
        const avgLunch = completedLunches.length > 0 ? Math.round(totalMins / completedLunches.length) : 0;
        const rate = presentCnt > 0 ? Math.round((breaches.length / presentCnt) * 100) : 0;
        return [
          emp.name,
          emp.role,
          `${presentCnt} Days`,
          `${breaches.length} breaches`,
          `${avgLunch} mins`,
          `${rate}%`
        ];
      });
    } else if (listTab === "days") {
      headCells = [["Employee Profile", "Role / Dept", "Recorded Status", "Clock In Details", "Lunch Break & Duration", "Clock Out", "Daily Logs / Notes"]];
      const focusDateStr = selectedDate.toISOString().split("T")[0];
      const dayAttendance = attendance.filter(a => a.date && a.date.startsWith(focusDateStr));

      bodyRows = filteredEmployees.map(emp => {
        const rec = dayAttendance.find(a => a.employeeId === emp.id);
        let lunchText = "No lunch break logged";
        if (rec && rec.lunchOut) {
          const duration = getLunchDurationMinutes(rec.lunchOut, rec.lunchIn);
          lunchText = `${rec.lunchOut} - ${rec.lunchIn || "Incomplete"}`;
          if (rec.lunchIn) {
            lunchText += ` (${duration}m)`;
            if (duration > lunchDurationLimit) {
              lunchText += ` *VIOLATION (+${duration - lunchDurationLimit}m)*`;
            }
          }
        }

        let checkInText = "-";
        if (rec && (rec.status === "present" || rec.status === "late" || rec.status === "half-day")) {
          checkInText = rec.checkIn || "09:00 AM";
          if (rec.status === "late") checkInText += " (LATE)";
          else checkInText += " (TIMELY)";
        }

        let checkOutText = "-";
        if (rec) {
          if (rec.checkOut) checkOutText = rec.checkOut;
          else if (rec.status === "present" || rec.status === "late" || rec.status === "half-day") checkOutText = "Active Shift";
        }

        return [
          emp.name,
          emp.role,
          rec ? STATUS_CONFIG[rec.status]?.label : "Unmarked",
          checkInText,
          lunchText,
          checkOutText,
          rec?.notes || "-"
        ];
      });
    } else if (listTab === "timeliness") {
      headCells = [["Employee Profile", "Role", "Days Present", "Late Arrivals", "Lunch Breaches", "Average Lunch Break Time", "Operational Rating"]];
      bodyRows = filteredEmployees.map(emp => {
        const empRecords = validAttendance.filter(a => a.employeeId === emp.id);
        const presentCount = empRecords.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
        const latesOfEmp = empRecords.filter(r => r.status === "late").length;
        const breachesCount = empRecords.filter(r => getLunchDurationMinutes(r.lunchOut, r.lunchIn) > lunchDurationLimit).length;
        const completedLunches = empRecords.filter(r => r.lunchOut && r.lunchIn);
        const totalLunchMins = completedLunches.reduce((sum, r) => sum + getLunchDurationMinutes(r.lunchOut, r.lunchIn), 0);
        const avgLunch = completedLunches.length > 0 ? Math.round(totalLunchMins / completedLunches.length) : 0;

        let ratingLabel = "🌟 Perfect Standard";
        if (latesOfEmp > 0 || breachesCount > 0) {
          const totalViolations = latesOfEmp * 1.5 + breachesCount;
          if (totalViolations <= 2) ratingLabel = "🟢 Highly Compliant";
          else if (totalViolations <= 5) ratingLabel = "🟡 Minor Violations";
          else if (totalViolations <= 9) ratingLabel = "🚨 Action Required";
          else ratingLabel = "💀 Severe Operational Deficit";
        }
        return [
          emp.name,
          emp.role,
          `${presentCount} Days`,
          `${latesOfEmp} times`,
          `${breachesCount} times`,
          `${avgLunch} mins`,
          ratingLabel
        ];
      });
    }

    autoTable(doc, {
      startY: 53,
      head: headCells,
      body: bodyRows,
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [51, 65, 85]
      },
      styles: {
        font: "helvetica",
        cellPadding: 2.8
      }
    });

    doc.save(`Attendance_Report_${listTab}_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handleDownloadAllDaysPDF = () => {
    // Generate a beautiful portrait multi-page PDF document, one page per day
    const doc = new jsPDF("portrait", "mm", "a4");
    let isFirstPage = true;

    // Filter dates in month/range that actually have records to generate a clean, condensed ledger
    const datesWithLogs = daysInMonth.filter(day => {
      const dayStr = day.toISOString().split("T")[0];
      return attendance.some(a => a.date && a.date.startsWith(dayStr));
    });

    if (datesWithLogs.length === 0) {
      alert("No attendance logs found in the selected time range/month to generate daily reports.");
      return;
    }

    datesWithLogs.forEach(day => {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      // Outer border frame
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.rect(10, 10, 190, 277);

      // Page Banner Header
      doc.setFillColor(30, 41, 59);
      doc.rect(14, 14, 182, 18, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text("DAILY COMPLIANCE & ATTENDANCE STATEMENT REPORT", 20, 25);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("GLOBAL OPERATIONS LEDGER", 190, 25, { align: "right" });

      // Daily Details
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(format(day, "EEEE, d MMMM yyyy").toUpperCase(), 14, 42);

      // Calculations for summary boxes
      const focusDateStr = day.toISOString().split("T")[0];
      const dayAttendance = attendance.filter(a => a.date && a.date.startsWith(focusDateStr));

      const totalActiveCount = employees.length;
      const dailyCountPresent = dayAttendance.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
      const dailyCountLate = dayAttendance.filter(r => r.status === "late").length;
      const dailyCountAbsent = dayAttendance.filter(r => r.status === "absent").length;
      const dailyCountLeave = dayAttendance.filter(r => r.status === "leave").length;
      const dailyCountHoliday = dayAttendance.filter(r => r.status === "holiday").length;
      const dailyLunchBreaches = dayAttendance.filter(r => {
        const mins = getLunchDurationMinutes(r.lunchOut, r.lunchIn);
        return mins > lunchDurationLimit;
      }).length;

      // Print Summary Card Grid in A4 Portrait representation
      doc.setFillColor(248, 250, 252);
      doc.rect(14, 48, 182, 14, "F");

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text(`Present: ${dailyCountPresent} / ${totalActiveCount}`, 20, 57);
      doc.text(`Late Arrivals: ${dailyCountLate}`, 65, 57);
      doc.text(`Lunch Violations: ${dailyLunchBreaches}`, 115, 57);
      doc.text(`Off-Duty/Abs: ${dailyCountAbsent + dailyCountLeave + dailyCountHoliday}`, 155, 57);

      // Horizontal separator line
      doc.setDrawColor(203, 213, 225);
      doc.line(14, 68, 196, 68);

      // Generate the Daily table
      const headCells = [["Employee Profile", "Recorded Status", "Clock In Detail", "Lunch Break / Breach", "Clock Out", "Daily Remarks"]];
      const bodyRows = employees.map(emp => {
        const rec = dayAttendance.find(a => a.employeeId === emp.id);
        
        let statusLabel = "Unmarked";
        if (rec) {
          statusLabel = STATUS_CONFIG[rec.status]?.label || rec.status.toUpperCase();
        }

        let checkInVal = "-";
        if (rec && (rec.status === "present" || rec.status === "late" || rec.status === "half-day")) {
          checkInVal = rec.checkIn || "09:00 AM";
          if (rec.status === "late") checkInVal += " (L)";
        }

        let lunchVal = "-";
        if (rec && rec.lunchOut) {
          const duration = getLunchDurationMinutes(rec.lunchOut, rec.lunchIn);
          lunchVal = `${rec.lunchOut} - ${rec.lunchIn || "Incomplete"}`;
          if (rec.lunchIn) {
            lunchVal += ` (${duration}m)`;
            if (duration > lunchDurationLimit) {
              lunchVal += ` *BREACH*`;
            }
          }
        }

        let checkOutVal = "-";
        if (rec) {
          if (rec.checkOut) {
            checkOutVal = rec.checkOut;
          } else if (rec.status === "present" || rec.status === "late" || rec.status === "half-day") {
            checkOutVal = "Active Shift";
          }
        }

        return [
          `${emp.name}\n(${emp.role})`,
          statusLabel,
          checkInVal,
          lunchVal,
          checkOutVal,
          rec?.notes || "-"
        ];
      });

      autoTable(doc, {
        startY: 72,
        head: headCells,
        body: bodyRows,
        theme: "striped",
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold"
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [30, 41, 59]
        },
        styles: {
          font: "helvetica",
          cellPadding: 2.5
        },
        columnStyles: {
          0: { cellWidth: 42 },
          3: { cellWidth: 42 }
        }
      });

      // Footer notice
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Operational Report Page - Period ${format(day, "yyyy-MM")}`, 14, 282);
      doc.text(`Global Operations Ledger System`, 196, 282, { align: "right" });
    });

    doc.save(`Complete_Daily_Attendance_Ledger_${selectedMonth}.pdf`);
  };
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

        {/* Action Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="flex bg-white p-2.5 rounded-2xl shadow-sm border border-gray-100 items-center justify-between">
            <button 
              onClick={() => setSelectedDate(prev => subDays(prev, 1))}
              className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-500 hover:text-gray-900"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 font-black text-gray-950 text-sm">
              <Calendar className="w-4 h-4 text-blue-600 animate-pulse" />
              {format(selectedDate, "EEEE, dd MMMM yyyy")}
            </div>
            <button 
              onClick={() => setSelectedDate(prev => addDays(prev, 1))}
              className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-500 hover:text-gray-900"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

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
                          <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                            {/* In Time */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-[9px] font-black text-gray-400 uppercase">In:</span>
                              <input 
                                type="time" 
                                value={record?.checkIn || ""} 
                                onChange={async (e) => await handleTimeFieldChange(emp.id!, "checkIn", e.target.value)}
                                className="bg-transparent border-none text-xs font-bold p-0.5 w-16 focus:ring-0 outline-none cursor-pointer"
                              />
                              {record?.checkIn && (
                                <button
                                  onClick={async () => await handleTimeFieldChange(emp.id!, "checkIn", "")}
                                  className="text-gray-350 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                  title="Clear check-in time"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <span className="text-gray-200">|</span>

                            {/* Lunch Out */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-[9px] font-black text-gray-400 uppercase">L.Out:</span>
                              <input 
                                type="time" 
                                value={record?.lunchOut || ""} 
                                onChange={async (e) => await handleTimeFieldChange(emp.id!, "lunchOut", e.target.value)}
                                className="bg-transparent border-none text-xs font-bold p-0.5 w-16 focus:ring-0 outline-none cursor-pointer"
                              />
                              {record?.lunchOut && (
                                <button
                                  onClick={async () => await handleTimeFieldChange(emp.id!, "lunchOut", "")}
                                  className="text-gray-350 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                  title="Clear lunch out time"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <span className="text-gray-200">-</span>

                            {/* Lunch In */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-[9px] font-black text-gray-400 uppercase">L.In:</span>
                              <input 
                                type="time" 
                                value={record?.lunchIn || ""} 
                                onChange={async (e) => await handleTimeFieldChange(emp.id!, "lunchIn", e.target.value)}
                                className="bg-transparent border-none text-xs font-bold p-0.5 w-16 focus:ring-0 outline-none cursor-pointer"
                              />
                              {record?.lunchIn && (
                                <button
                                  onClick={async () => await handleTimeFieldChange(emp.id!, "lunchIn", "")}
                                  className="text-gray-350 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                  title="Clear lunch in time"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <span className="text-gray-200">|</span>

                            {/* Clock Out */}
                            <div className="flex items-center gap-0.5">
                              <span className="text-[9px] font-black text-gray-400 uppercase">Out:</span>
                              <input 
                                type="time" 
                                value={record?.checkOut || ""} 
                                onChange={async (e) => await handleTimeFieldChange(emp.id!, "checkOut", e.target.value)}
                                className="bg-transparent border-none text-xs font-bold p-0.5 w-16 focus:ring-0 outline-none cursor-pointer"
                              />
                              {record?.checkOut && (
                                <button
                                  onClick={async () => await handleTimeFieldChange(emp.id!, "checkOut", "")}
                                  className="text-gray-350 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                  title="Clear clock out time"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">In Time</label>
                      {modalCheckIn && (
                        <button 
                          type="button"
                          onClick={() => setModalCheckIn("")}
                          className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input 
                      type="time" 
                      value={modalCheckIn}
                      onChange={(e) => setModalCheckIn(e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Lunch Out</label>
                      {modalLunchOut && (
                        <button 
                          type="button"
                          onClick={() => setModalLunchOut("")}
                          className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input 
                      type="time" 
                      value={modalLunchOut}
                      onChange={(e) => setModalLunchOut(e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Lunch In</label>
                      {modalLunchIn && (
                        <button 
                          type="button"
                          onClick={() => setModalLunchIn("")}
                          className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input 
                      type="time" 
                      value={modalLunchIn}
                      onChange={(e) => setModalLunchIn(e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Clock Out</label>
                      {modalCheckOut && (
                        <button 
                          type="button"
                          onClick={() => setModalCheckOut("")}
                          className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input 
                      type="time" 
                      value={modalCheckOut}
                      onChange={(e) => setModalCheckOut(e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-105 outline-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Clear All Times helper */}
                <div className="flex justify-between items-center bg-slate-50/50 p-2 rounded-xl border border-dashed border-slate-200">
                  <span className="text-[10px] font-bold text-slate-450 italic">Need to clear all records?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setModalCheckIn("");
                      setModalLunchOut("");
                      setModalLunchIn("");
                      setModalCheckOut("");
                    }}
                    className="text-[10px] font-black text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Clear All Times
                  </button>
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
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-zinc-900 p-2 rounded-[24px] shadow-xs border border-gray-100 dark:border-zinc-805/80 transition-colors">
          <div className="flex bg-slate-100 dark:bg-zinc-850 p-1 rounded-xl">
            <button
              onClick={() => setFilterType("month")}
              style={{ minWidth: "70px" }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-none cursor-pointer ${
                filterType === "month" 
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs font-extrabold" 
                  : "text-slate-450 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white bg-transparent"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterType("range")}
              style={{ minWidth: "100px" }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-none cursor-pointer ${
                filterType === "range" 
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs font-extrabold" 
                  : "text-slate-450 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-white bg-transparent"
              }`}
            >
              Date-to-Date
            </button>
          </div>

          {filterType === "month" ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-1.5 text-gray-400">
                <Filter className="w-3 h-3 text-gray-400" />
                <span className="text-[9px] font-black uppercase tracking-wider">Month:</span>
              </div>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="pr-8 pl-1 py-1.5 bg-transparent border-none focus:ring-0 font-bold text-xs text-gray-950 dark:text-white outline-none cursor-pointer"
              >
                {generateMonthsDropdown().map(m => (
                  <option key={m.value} value={m.value} className="dark:bg-zinc-900">{m.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-150 dark:border-zinc-850 rounded-xl font-bold text-xs text-gray-950 dark:text-white focus:ring-1 focus:ring-rose-100 outline-none cursor-pointer"
              />
              <span className="text-gray-400 text-xs font-bold">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-150 dark:border-zinc-850 rounded-xl font-bold text-xs text-gray-950 dark:text-white focus:ring-1 focus:ring-rose-100 outline-none cursor-pointer"
              />
            </div>
          )}

          <div className="h-6 w-[1px] bg-gray-150 dark:bg-zinc-800 hidden md:block" />

          <button 
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-[14px] font-bold text-xs border-none transition-colors active:scale-95 cursor-pointer"
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
        {/* Printable Section Header - Only visible when printing */}
        <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">GLOBAL OPERATIONS ATTENDANCE MODULE</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                Report Category: {listTab === "matrix" ? "Presence Heatmap Matrix" :
                                 listTab === "logs" ? "All Check-In & Check-Out Logs" :
                                 listTab === "lunch" ? "Lunch Overtime Breaches Report" :
                                 listTab === "days" ? `Daily Operations Audit for ${format(selectedDate, "EEEE, d MMMM yyyy")}` :
                                 "Monthly Timeliness & Breach Audit"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono font-bold">{format(new Date(), "yyyy-MM-dd HH:mm")}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Report Generated Successfully</p>
            </div>
          </div>
        </div>

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
            <button 
              onClick={() => setListTab("days")}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer",
                listTab === "days" ? "bg-white text-slate-950 shadow-xs" : "text-gray-500 hover:text-slate-950"
              )}
            >
              Day-by-Day Master Report
            </button>
            <button 
              onClick={() => setListTab("timeliness")}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer",
                listTab === "timeliness" ? "bg-white text-slate-950 shadow-xs" : "text-gray-500 hover:text-slate-950"
              )}
            >
              Monthly Lateness & Breach Audit
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input 
                type="text"
                placeholder="Search employee..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 hover:bg-gray-100/50 rounded-xl border-none outline-none text-xs font-bold placeholder:text-gray-400"
              />
            </div>

            <div className="flex items-center gap-1.5 print:hidden">
              <button
                onClick={() => window.print()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 shadow-2xs transition-all hover:scale-102 active:scale-98"
                title="Print current tab layout using browser print dialog"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Print Page</span>
                <span className="sm:hidden">Print</span>
              </button>

              <button
                onClick={handleDownloadPDF}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-gray-200 text-slate-800 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs hover:scale-102 active:scale-98"
                title="Generate and download a high-fidelity PDF document for the current tab"
              >
                <Download className="w-3.5 h-3.5 text-[#D12765]" />
                <span className="hidden sm:inline">Download PDF</span>
                <span className="sm:hidden">PDF</span>
              </button>

              <button
                onClick={handleDownloadAllDaysPDF}
                className="px-3.5 py-2 bg-[#D12765]/10 hover:bg-[#D12765]/20 text-[#D12765] border border-[#D12765]/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs hover:scale-102 active:scale-98"
                title="Download full multi-page PDF ledger: one separate page per day for all days of the month"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">All Days PDF</span>
                <span className="sm:hidden">All Days</span>
              </button>
            </div>
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
        ) : listTab === "lunch" ? (
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
                              className="p-2 hover:bg-red-50 text-gray-450 hover:text-red-650 rounded-xl transition-all border border-transparent hover:border-red-100 inline-flex items-center justify-center cursor-pointer"
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
        ) : listTab === "days" ? (
          /* "days" tab: DAY-BY-DAY MASTER REPORT WITH DATEWISE PAGINATION */
          <div className="space-y-6">
            {/* Beautiful Page Header with Date Wise Pagination */}
            <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-[24px] flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                onClick={() => setSelectedDate(prev => subDays(prev, 1))}
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-slate-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs hover:scale-102 active:scale-98"
              >
                <ChevronLeft className="w-4 h-4 shrink-0 text-slate-400" />
                <span>Previous Day</span>
              </button>

              <div className="text-center space-y-1">
                <span className="text-[9px] font-black tracking-widest text-[#D12765] uppercase block">Daily Operations Analytics</span>
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <h3 className="text-base font-black text-slate-900">
                    {format(selectedDate, "EEEE, d MMMM yyyy")}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setSelectedDate(prev => addDays(prev, 1))}
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-slate-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs hover:scale-102 active:scale-98"
              >
                <span>Next Day</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
              </button>
            </div>

            {/* Quick Stats Grid representing Daily Reports consolidated on one page */}
            {(() => {
              const focusDateStr = selectedDate.toISOString().split("T")[0];
              const dayAttendance = attendance.filter(a => a.date && a.date.startsWith(focusDateStr));

              const totalActiveCount = employees.length;
              const markedCount = dayAttendance.length;
              const dailyCountPresent = dayAttendance.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
              const dailyCountLate = dayAttendance.filter(r => r.status === "late").length;
              const dailyCountAbsent = dayAttendance.filter(r => r.status === "absent").length;
              const dailyCountLeave = dayAttendance.filter(r => r.status === "leave").length;
              const dailyCountHoliday = dayAttendance.filter(r => r.status === "holiday").length;

              // Compute Overtime breaches for lunch
              const dailyLunchBreaches = dayAttendance.filter(r => {
                const mins = getLunchDurationMinutes(r.lunchOut, r.lunchIn);
                return mins > lunchDurationLimit;
              }).length;

              return (
                <>
                  {/* Daily Analytics Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-emerald-50/60 border border-emerald-100/90 p-4 rounded-2xl flex flex-col justify-between space-y-1">
                      <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider block">Presence Status</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-emerald-950 font-mono">{dailyCountPresent}</span>
                        <span className="text-[10px] text-emerald-700 font-bold">/ {totalActiveCount} present</span>
                      </div>
                      <p className="text-[9px] font-medium text-emerald-600/90 leading-normal">
                        {dailyCountPresent === totalActiveCount ? "Perfect attendance today!" : `${totalActiveCount - dailyCountPresent} active staff off-duty.`}
                      </p>
                    </div>

                    <div className="bg-amber-50/60 border border-amber-100/90 p-4 rounded-2xl flex flex-col justify-between space-y-1">
                      <span className="text-[9px] font-black text-amber-800 uppercase tracking-wider block">Timeliness & Delay</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-amber-950 font-mono">{dailyCountLate}</span>
                        <span className="text-[10px] text-amber-700 font-bold">late arrivals</span>
                      </div>
                      <p className="text-[9px] font-medium text-amber-600/90 leading-normal">
                        Checked-in after threshold of {lateThreshold}.
                      </p>
                    </div>

                    <div className="bg-red-50/60 border border-red-100/90 p-4 rounded-2xl flex flex-col justify-between space-y-1">
                      <span className="text-[9px] font-black text-red-800 uppercase tracking-wider block">Lunch Overtime Breaches</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-red-950 font-mono">{dailyLunchBreaches}</span>
                        <span className="text-[10px] text-red-700 font-bold">overtime breaches</span>
                      </div>
                      <p className="text-[9px] font-medium text-red-650 leading-normal">
                        Exceeded policy limits of {lunchDurationLimit} minutes.
                      </p>
                    </div>

                    <div className="bg-purple-50/60 border border-purple-100/90 p-4 rounded-2xl flex flex-col justify-between space-y-1">
                      <span className="text-[9px] font-black text-purple-800 uppercase tracking-wider block">Not on Floor</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-purple-950 font-mono">{dailyCountAbsent + dailyCountLeave + dailyCountHoliday}</span>
                        <span className="text-[10px] text-purple-750 font-bold">off-duty total</span>
                      </div>
                      <p className="text-[9px] font-medium text-purple-600/90 leading-normal">
                        {dailyCountAbsent} Abs | {dailyCountLeave} Leave | {dailyCountHoliday} Hol.
                      </p>
                    </div>
                  </div>

                  {/* Comprehensive Single Date Table & Detailed Analysis */}
                  <div className="bg-white rounded-2xl border border-gray-150 shadow-2xs overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-150 px-5 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div>
                        <h4 className="text-xs font-black uppercase text-gray-500 tracking-wider">All-In-One Unified Day Report Ledger</h4>
                        <p className="text-[10px] text-gray-400 font-medium">Shows precise timelines, overtime breaches, and timeliness for all staff in a single dashboard screen.</p>
                      </div>
                      <div className="text-[10px] font-bold text-slate-500 bg-white border border-gray-150 px-3 py-1 rounded-full uppercase tracking-wider shadow-3xs">
                        Marked: {markedCount} / {totalActiveCount} Employees
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[750px]">
                        <thead>
                          <tr className="bg-gray-50/40 border-b border-gray-100">
                            <th className="px-6 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Employee Profile</th>
                            <th className="px-6 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Attendance Status</th>
                            <th className="px-6 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Clock In</th>
                            <th className="px-6 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Lunch Break Detail & Breach</th>
                            <th className="px-6 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Clock Out</th>
                            <th className="px-6 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Remarks / Logs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {employees.map(emp => {
                            const rec = dayAttendance.find(a => a.employeeId === emp.id);

                            // Calculate lunch duration details and check for breach
                            let lunchDuration = 0;
                            let excessMins = 0;
                            let hasBreached = false;

                            if (rec) {
                              lunchDuration = getLunchDurationMinutes(rec.lunchOut, rec.lunchIn);
                              if (lunchDuration > lunchDurationLimit) {
                                hasBreached = true;
                                excessMins = lunchDuration - lunchDurationLimit;
                              }
                            }

                            // Calculate late details
                            let isStaffLate = false;
                            if (rec && rec.status === "late") {
                              isStaffLate = true;
                            }

                            return (
                              <tr key={emp.id} className="hover:bg-slate-50/40 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-xs ring-2 ring-slate-100">
                                      {emp.name.charAt(0)}
                                    </div>
                                    <div>
                                      <span className="font-extrabold text-gray-900 text-sm block">{emp.name}</span>
                                      <span className="text-[8px] font-bold text-gray-450 uppercase leading-none block mt-0.5">{emp.role}</span>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-6 py-4">
                                  {rec ? (
                                    <span className={cn(
                                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wider border", 
                                      STATUS_CONFIG[rec.status].bg, 
                                      STATUS_CONFIG[rec.status].color
                                    )}>
                                      <span className={cn("w-1.5 h-1.5 rounded-full-stop rounded-full", STATUS_CONFIG[rec.status].dot)} />
                                      {STATUS_CONFIG[rec.status].label}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-slate-100 text-slate-400 border border-slate-200">
                                      Unmarked
                                    </span>
                                  )}
                                </td>

                                <td className="px-6 py-4">
                                  {rec && (rec.status === "present" || rec.status === "late" || rec.status === "half-day") ? (
                                    <div className="space-y-0.5">
                                      <span className="font-mono font-bold text-gray-800 text-xs flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                                        {rec.checkIn || "09:00 AM"}
                                      </span>
                                      {isStaffLate ? (
                                        <span className="text-[9px] font-bold text-amber-600 block">
                                          ⚠️ Late Arrival (After {lateThreshold})
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-medium text-emerald-600 block">
                                          🟢 Timely
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </td>

                                <td className="px-6 py-4">
                                  {rec && rec.lunchOut ? (
                                    <div className="space-y-1">
                                      <p className="text-[11px] font-mono font-semibold text-gray-650">
                                        {rec.lunchOut} - {rec.lunchIn || "Incomplete"}
                                      </p>
                                      {rec.lunchIn ? (
                                        <div className="flex flex-wrap items-center gap-1.55 gap-1.5">
                                          <span className="text-[10px] font-mono font-extrabold text-[#D12765]">
                                            {lunchDuration} mins break
                                          </span>
                                          {hasBreached && (
                                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-extrabold text-[8px] rounded uppercase tracking-wider">
                                              +{excessMins}m Overtime Breach
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-[9px] font-bold text-yellow-600 block">
                                          🟡 Out for lunch / Active Break
                                        </span>
                                      )}
                                    </div>
                                  ) : rec && (rec.status === "present" || rec.status === "late") ? (
                                    <span className="text-xs text-gray-400 italic">No break logged</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </td>

                                <td className="px-6 py-4">
                                  {rec && rec.checkOut ? (
                                    <span className="font-mono font-bold text-gray-800 text-xs flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                                      {rec.checkOut}
                                    </span>
                                  ) : rec && (rec.status === "present" || rec.status === "late" || rec.status === "half-day") ? (
                                    <span className="text-[9px] font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded">
                                      Active Shift
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </td>

                                <td className="px-6 py-4 text-xs font-semibold text-gray-500 max-w-xs truncate" title={rec?.notes}>
                                  {rec?.notes ? (
                                    <span className="italic">"{rec.notes}"</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          /* "timeliness" tab: MONTHLY TIMELINESS & BREACH AUDIT REPORT */
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-[24px] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Monthly Timeliness & Breach Audit Ledger</h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  Month Period: <strong className="text-[#D12765]">{format(new Date(selectedMonth + "-01"), "MMMM yyyy")}</strong> | Analyzes all check-in delays and lunch break violations.
                </p>
              </div>
              
              {/* Month Picker Selection */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black text-slate-400">Month Period:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="p-2 border border-slate-200 bg-white rounded-xl text-xs font-bold outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Monthly Timeliness Grid / Table */}
            <div className="bg-white rounded-2xl border border-gray-150 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-150">
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee Profile</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Days Present / Active</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Total Late Arrivals</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Lunch Overtime Breaches</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Average Lunch Break</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Analysis rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {employees.map(emp => {
                      const empRecords = validAttendance.filter(a => a.employeeId === emp.id);
                      
                      // Present count
                      const presentCount = empRecords.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
                      
                      // Lateness count
                      const latesOfEmp = empRecords.filter(r => r.status === "late").length;
                      
                      // Lunch breaches count
                      const breachesOfEmp = empRecords.filter(r => {
                        const mins = getLunchDurationMinutes(r.lunchOut, r.lunchIn);
                        return mins > lunchDurationLimit;
                      });
                      const breachesCount = breachesOfEmp.length;
                      
                      // Average lunch break
                      const completedLunches = empRecords.filter(r => r.lunchOut && r.lunchIn);
                      const totalLunchMins = completedLunches.reduce((sum, r) => sum + getLunchDurationMinutes(r.lunchOut, r.lunchIn), 0);
                      const avgLunch = completedLunches.length > 0 ? Math.round(totalLunchMins / completedLunches.length) : 0;

                      // Calculate compliance score
                      let ratingLabel = "🌟 Perfect Standard";
                      let ratingClass = "bg-emerald-50 text-emerald-800 border-emerald-100";
                      
                      if (latesOfEmp > 0 || breachesCount > 0) {
                        const totalViolations = latesOfEmp * 1.5 + breachesCount;
                        if (totalViolations <= 2) {
                          ratingLabel = "🟢 Highly Compliant";
                          ratingClass = "bg-teal-50 text-teal-800 border-teal-100";
                        } else if (totalViolations <= 5) {
                          ratingLabel = "🟡 Minor Violations";
                          ratingClass = "bg-amber-50 text-amber-800 border-amber-100";
                        } else if (totalViolations <= 9) {
                          ratingLabel = "🚨 Action Required";
                          ratingClass = "bg-rose-50 text-rose-800 border-rose-100";
                        } else {
                          ratingLabel = "💀 Severe Operational Deficit";
                          ratingClass = "bg-red-100 text-red-900 border-red-250";
                        }
                      }

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-xs">
                                {emp.name.charAt(0)}
                              </div>
                              <div>
                                <span className="font-extrabold text-gray-900 text-sm block">{emp.name}</span>
                                <span className="text-[8px] font-bold text-gray-450 uppercase leading-none block mt-0.5">{emp.role}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-center font-mono font-bold text-slate-750">
                            {presentCount} Days
                          </td>

                          <td className="px-6 py-4 text-center">
                            {latesOfEmp > 0 ? (
                              <span className="inline-flex flex-col items-center">
                                <span className="text-sm font-extrabold text-amber-605 font-mono text-amber-600">{latesOfEmp} times</span>
                                <span className="text-[8px] text-amber-500 uppercase font-black">Late Arrivals</span>
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                Perfect Timeliness
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-center">
                            {breachesCount > 0 ? (
                              <span className="inline-flex flex-col items-center">
                                <span className="text-sm font-extrabold text-red-600 font-mono">{breachesCount} time(s)</span>
                                <span className="text-[8px] text-red-500 uppercase font-black">Overtime breaks</span>
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                Zero Breaches
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-center font-mono font-bold text-gray-650">
                            {avgLunch > 0 ? (
                              <span>
                                {avgLunch} mins <span className="text-[9px] text-gray-400">avg</span>
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide border",
                              ratingClass
                            )}>
                              {ratingLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
