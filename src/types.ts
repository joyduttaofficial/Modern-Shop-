export type TransactionType = "income" | "expense";
export type UserRole = string; // standard "admin" | "accountant" | "sales" or custom roles

export interface UserProfile {
  id?: string;
  uid?: string; // Optinal as invited users won't have a UID until they sign in
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  photoURL?: string;
  mobile?: string;
  designation?: string;
  department?: string;
  status?: "active" | "inactive";
  bio?: string;
  username?: string;
  password?: string;
}

export interface RolePermission {
  id?: string;
  name: string;
  allowedMenus: string[];
  description?: string;
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
  phone?: string;
  email?: string;
  photo?: string | null;
  nidFrontPhoto?: string | null;
  nidBackPhoto?: string | null;
  birthCertificatePhoto?: string | null;
  employeeIdCode?: string;
}

export interface Department {
  id?: string;
  name: string;
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
  checkOut?: string; // HH:mm
  notes?: string;
  breakfastAllowance?: number; // 20 or 0 (নাস্তার টাকা)
  isBreakfastEligible?: boolean; // true if checked in <= lateThreshold (১০:০০ এর আগে আসলে প্রাপ্য)
  lateMinutes?: number; // কত মিনিট লেট হয়েছে
  breakfastDeducted?: boolean; // লেট বা অনুপস্থিত হওয়ার কারণে নাস্তার টাকা কাটা গেছে কিনা
}

export interface AttendanceSettings {
  lateThreshold: string; // e.g. "10:00"
  lunchDurationLimit: number; // e.g. 60 mins
  halfDayThreshold: string; // e.g. "11:30"
  breakfastAllowanceAmount: number; // e.g. 20 (ডিফল্ট ২০ টাকা)
  deductBreakfastOnLate: boolean; // e.g. true (১০টার পরে আসলে নাস্তার টাকা কাটা যাবে)
  deductBreakfastOnAbsent: boolean; // e.g. true (অনুপস্থিত থাকলে নাস্তা কাটা যাবে)
  gracePeriodMinutes?: number; // e.g. 0
  lastUpdated?: string;
  updatedBy?: string;
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
  lessAmount?: number; // Add Less / Discount amount deducted from due
  paymentMethod?: string; // Cash, Bank name, etc.
  notes?: string;
  createdAt: string;
}

export interface PurchaseItem {
  productName: string;
  category: string;
  subCategory: string;
  unit: "Yard" | "Meter" | "Roll" | "Piece" | "Pair" | "Dozen";
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

export interface Product {
  id?: string;
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  stock: number;
  lastPurchasePrice: number;
  totalPurchaseValue: number; // calculated as stock * lastPurchasePrice or similar
  createdAt: string;
  updatedAt: string;
  minStock?: number;
}

export interface StockLedgerEntry {
  id?: string;
  productId: string;
  productName: string;
  date: string;
  type: "purchase" | "sale" | "return" | "adjustment";
  refNo: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  supplierId?: string;
  supplierName?: string;
  notes?: string;
  createdAt: string;
}

export interface PurchaseModel {
  id?: string;
  supplierId: string;
  supplierName: string;
  date: string;
  refNo: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  writtenReturn?: number;
  paymentMethod: string;
  notes?: string;
  invoicePhoto?: string; // base64 representation
  items?: PurchaseItem[]; // itemized purchase entries
  createdAt: string;
}

export interface SlipItem {
  slipNo: number;
  amount: number;
  notes?: string;
}

export interface CounterSale {
  id?: string;
  saleId: string; // Day-based sequential ID e.g. CS-260928-01 (দিন অনুযায়ী)
  customerId?: string; // Optional day-based customer token/ID
  dailySerial?: number; // e.g. 1, 2, 3 for that day
  dateTime: string; // ISO date-time string
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  slips: SlipItem[];
  totalSlipsAmount: number;
  discountType?: "amount" | "percent"; // Discount mode (ফিক্সড টাকা বা শতকরা %)
  discountPercent?: number; // e.g. 5 for 5%
  discountAmount?: number; // Discount subtracted from total (টোটাল থেকে মাইনাস)
  netPayable?: number; // totalSlipsAmount - discountAmount
  receivedAmount: number;
  changeAmount: number;
  dueAmount: number;
  isBalanced: boolean; // true if netPayable === receivedAmount (সমান সমান)
  balanceStatus: "equal" | "short" | "excess"; // "equal" = সমান সমান
  paymentMethod: string;
  customerName?: string;
  customerPhone?: string; // Optional mobile / phone
  customerAddress?: string; // Optional address
  notes?: string;
  createdBy: string;
  transactionId?: string;
  createdAt: string;
}

export interface CustomerProfile {
  id?: string;
  name: string;
  phone?: string;
  address?: string;
  totalPurchases: number;
  totalPaid: number;
  totalDue: number;
  totalDiscount: number;
  lastTransactionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPayment {
  id?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  date: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  receivedBy: string;
  transactionId?: string;
  createdAt: string;
}

