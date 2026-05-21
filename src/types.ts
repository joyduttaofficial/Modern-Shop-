export type TransactionType = "income" | "expense";
export type UserRole = "admin" | "accountant" | "sales";

export interface UserProfile {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface Employee {
  id?: string;
  name: string;
  role: string;
  salary: number;
  joinedDate: string;
  status: "active" | "inactive";
  documents?: { name: string; type: string; data: string }[];
  department?: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "half-day" | "leave" | "holiday";

export interface Attendance {
  id?: string;
  date: string; // ISO date string
  employeeId: string;
  status: AttendanceStatus;
  checkIn?: string; // HH:mm
  lunchOut?: string; // HH:mm
  lunchIn?: string; // HH:mm
  notes?: string;
}

export interface Transaction {
  id?: string;
  date: string;
  type: TransactionType;
  category: string;
  subCategory?: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  createdBy: string;
  employeeId?: string; // Link to employee for salary/advances
  supplierId?: string; // Link to supplier for payments
}

export interface Category {
  id?: string;
  name: string;
  type: TransactionType;
  icon?: string;
}

export interface Bank {
  id?: string;
  name: string;
  balance: number;
  lastUpdated: string;
}

export interface Supplier {
  id?: string;
  code: string; // e.g. BD092
  name: string;
  mobile?: string;
  email?: string;
  phone?: string;
  openingBalance: number;
  country: string;
  advanceAmount: number;
  totalAmount: number; // Total Purchases
  purchaseDue: number; // Due to supplier
  address?: string;
  status: "active" | "inactive";
  createdAt: string;
}

export interface SupplierTransaction {
  id?: string;
  supplierId: string;
  date: string; // ISO date string or YYYY-MM-DD
  type: "purchase" | "return" | "payment";
  refNo: string; // Purchase Invoice No, Return ref, Payment ref
  totalAmount: number; // Purchase total, Return total, Payment amount
  paidAmount?: number; // Paid at purchase time
  dueAmount?: number;  // Due after purchase
  paymentMethod?: string; // Cash, Bank name, etc.
  notes?: string;
  createdAt: string;
}
