import { getSupabase } from "./supabase";
import { 
  CounterSale, 
  Transaction, 
  CustomerProfile, 
  CustomerPayment, 
  Product, 
  Supplier, 
  SupplierTransaction,
  PurchaseModel,
  Employee, 
  Attendance,
  ActivityNotification,
  Bank,
  Category,
  RolePermission,
  UserProfile
} from "../types";

/**
 * Robust Supabase PostgreSQL client service.
 * Connects directly to Supabase via server-side PostgreSQL REST proxy (/api/db)
 * and falls back to Supabase JS client when configured.
 */

// Global event bus for real-time reactivity across components
export const SUPABASE_DATA_CHANGED_EVENT = "supabase-data-changed";

function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function normalizeTableName(collection: string): string {
  const map: Record<string, string> = {
    transactions: "transactions",
    employees: "employees",
    banks: "banks",
    categories: "categories",
    suppliers: "suppliers",
    supplierTransactions: "supplier_transactions",
    supplier_transactions: "supplier_transactions",
    purchases: "purchases",
    products: "products",
    stockLedger: "stock_ledger",
    stock_ledger: "stock_ledger",
    counterSales: "counter_sales",
    counter_sales: "counter_sales",
    customerPayments: "customer_payments",
    customer_payments: "customer_payments",
    customers: "customers",
    attendance: "attendance",
    attendanceSettings: "attendance_settings",
    attendance_settings: "attendance_settings",
    roles: "roles",
    profiles: "profiles",
    users: "profiles",
    companySettings: "company_settings",
    company_settings: "company_settings",
    settings: "company_settings",
    activityNotifications: "activity_notifications",
    activity_notifications: "activity_notifications",
    departments: "departments",
  };
  return map[collection] || toSnake(collection);
}

export function notifyDataChanged(table: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SUPABASE_DATA_CHANGED_EVENT, { detail: { table } }));
  }
}

/**
 * Universal query helper: fetches from /api/db/:table
 */
export async function fetchFromSupabase<T = any>(
  table: string, 
  options: { 
    limit?: number; 
    orderBy?: string; 
    orderDir?: "asc" | "desc";
    filter?: Record<string, any>;
  } = {}
): Promise<T[]> {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.orderBy) params.set("orderBy", options.orderBy);
    if (options.orderDir) params.set("orderDir", options.orderDir);
    if (options.filter) {
      for (const [k, v] of Object.entries(options.filter)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
    }

    const res = await fetch(`/api/db/${table}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch from /api/db/${table}: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // Silent fallback to client if configured
    try {
      const client = getSupabase();
      if (client) {
        const { data } = await client.from(table).select("*").limit(options.limit || 500);
        return (data as any) || [];
      }
    } catch {}
    return [];
  }
}

/**
 * Universal insert helper: posts to /api/db/:table
 */
export async function insertIntoSupabase<T = any>(table: string, record: any): Promise<T | null> {
  try {
    const res = await fetch(`/api/db/${table}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to insert into ${table}`);
    }
    const created = await res.json();
    notifyDataChanged(table);
    return created;
  } catch (err) {
    console.error(`insertIntoSupabase error for ${table}:`, err);
    return null;
  }
}

/**
 * Universal update helper: puts to /api/db/:table/:id
 */
export async function updateInSupabase<T = any>(table: string, id: string, updates: any): Promise<T | null> {
  try {
    const res = await fetch(`/api/db/${table}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to update in ${table}`);
    }
    const updated = await res.json();
    notifyDataChanged(table);
    return updated;
  } catch (err) {
    console.error(`updateInSupabase error for ${table}:`, err);
    return null;
  }
}

/**
 * Universal delete helper: deletes from /api/db/:table/:id
 */
export async function deleteFromSupabase(table: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/db/${table}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return false;
    notifyDataChanged(table);
    return true;
  } catch (err) {
    console.error(`deleteFromSupabase error for ${table}:`, err);
    return false;
  }
}

/**
 * Real-time reactive subscription: fetches immediately and refreshes on mutation events and periodic polling
 */
export function subscribeToSupabaseTable<T = any>(
  table: string,
  onData: (data: T[]) => void,
  options: { limit?: number; orderBy?: string; orderDir?: "asc" | "desc"; pollIntervalMs?: number } = {}
): () => void {
  let isMounted = true;
  const pollInterval = options.pollIntervalMs || 10000;

  const loadData = async () => {
    if (!isMounted) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const items = await fetchFromSupabase<T>(table, options);
    if (isMounted) {
      onData(items);
    }
  };

  // Initial load
  loadData();

  // Polling timer
  const intervalId = setInterval(loadData, pollInterval);

  // Event listener for instant reactivity on local mutations
  const handleMutation = (e: Event) => {
    const custom = e as CustomEvent;
    if (!custom.detail || custom.detail.table === table) {
      loadData();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener(SUPABASE_DATA_CHANGED_EVENT, handleMutation);
  }

  return () => {
    isMounted = false;
    clearInterval(intervalId);
    if (typeof window !== "undefined") {
      window.removeEventListener(SUPABASE_DATA_CHANGED_EVENT, handleMutation);
    }
  };
}

// ============================================================================
// TYPED CRUD HELPERS
// ============================================================================

// 1. TRANSACTIONS
export async function fetchTransactionsFromSupabase(limit = 2000): Promise<Transaction[]> {
  const rows = await fetchFromSupabase<any>("transactions", { limit, orderBy: "date", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    date: r.date || r.createdAt || new Date().toISOString(),
    type: r.type,
    category: r.category,
    subCategory: r.subCategory || r.sub_category,
    amount: Number(r.amount || 0),
    paymentMethod: r.paymentMethod || r.payment_method || "Cash",
    notes: r.notes || "",
    createdBy: r.createdBy || r.created_by,
    employeeId: r.employeeId || r.employee_id,
    supplierId: r.supplierId || r.supplier_id,
  }));
}

export async function saveTransactionToSupabase(tx: Partial<Transaction>): Promise<Transaction | null> {
  const row = {
    date: tx.date || new Date().toISOString(),
    type: tx.type || "expense",
    category: tx.category || "General",
    sub_category: tx.subCategory || (tx as any).sub_category || null,
    amount: Number(tx.amount || 0),
    payment_method: tx.paymentMethod || (tx as any).payment_method || "Cash",
    notes: tx.notes || "",
    created_by: tx.createdBy || (tx as any).created_by || "admin",
    employee_id: tx.employeeId || (tx as any).employee_id || null,
    supplier_id: tx.supplierId || (tx as any).supplier_id || null,
  };
  return insertIntoSupabase<Transaction>("transactions", row);
}

export async function deleteTransactionFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("transactions", id);
}

// 2. COUNTER SALES
export async function fetchCounterSalesFromSupabase(limit = 1000): Promise<CounterSale[]> {
  const rows = await fetchFromSupabase<any>("counter_sales", { limit, orderBy: "date_time", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    saleId: r.saleId || r.sale_id,
    dailySerial: r.dailySerial || r.daily_serial || 0,
    dateTime: r.dateTime || r.date_time,
    date: r.date,
    time: r.time,
    slips: typeof r.slips === "string" ? JSON.parse(r.slips) : (r.slips || []),
    totalSlipsAmount: Number(r.totalSlipsAmount || r.total_slips_amount || 0),
    discountType: r.discountType || r.discount_type,
    discountPercent: Number(r.discountPercent || r.discount_percent || 0),
    discountAmount: Number(r.discountAmount || r.discount_amount || 0),
    netPayable: Number(r.netPayable || r.net_payable || 0),
    receivedAmount: Number(r.receivedAmount || r.received_amount || 0),
    changeAmount: Number(r.changeAmount || r.change_amount || 0),
    dueAmount: Number(r.dueAmount || r.due_amount || 0),
    isBalanced: Boolean(r.isBalanced ?? r.is_balanced),
    balanceStatus: r.balanceStatus || r.balance_status || "equal",
    paymentMethod: r.paymentMethod || r.payment_method || "Cash",
    customerName: r.customerName || r.customer_name,
    customerPhone: r.customerPhone || r.customer_phone,
    customerAddress: r.customerAddress || r.customer_address,
    notes: r.notes,
    createdBy: r.createdBy || r.created_by || "admin",
    transactionId: r.transactionId || r.transaction_id,
    createdAt: r.createdAt || r.created_at || r.dateTime || new Date().toISOString(),
  }));
}

export async function saveCounterSaleToSupabase(sale: CounterSale): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const saleRow = {
      sale_id: sale.saleId,
      daily_serial: sale.dailySerial || 0,
      date_time: sale.dateTime || new Date().toISOString(),
      date: sale.date || new Date().toISOString().substring(0, 10),
      time: sale.time || "12:00:00",
      slips: sale.slips || [],
      total_slips_amount: Number(sale.totalSlipsAmount || 0),
      discount_type: sale.discountType || null,
      discount_percent: Number(sale.discountPercent || 0),
      discount_amount: Number(sale.discountAmount || 0),
      net_payable: Number(sale.netPayable || 0),
      received_amount: Number(sale.receivedAmount || 0),
      change_amount: Number(sale.changeAmount || 0),
      due_amount: Number(sale.dueAmount || 0),
      is_balanced: Boolean(sale.isBalanced),
      balance_status: sale.balanceStatus || "equal",
      payment_method: sale.paymentMethod || "Cash",
      customer_name: sale.customerName || null,
      customer_phone: sale.customerPhone || null,
      customer_address: sale.customerAddress || null,
      notes: sale.notes || null,
      created_by: sale.createdBy || "admin",
      transaction_id: sale.transactionId || null,
    };

    const res = await fetch("/api/db/counter_sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saleRow),
    });
    const created = await res.json();

    // Also auto-log transaction in Supabase
    if (Number(sale.receivedAmount) > 0) {
      await saveTransactionToSupabase({
        date: saleRow.date_time,
        type: "income",
        category: "Counter Sale",
        subCategory: "Retail Counter Slip",
        amount: Number(sale.receivedAmount),
        paymentMethod: sale.paymentMethod || "Cash",
        notes: `Counter Sale [${sale.saleId}] - প্রদেয়: ৳${sale.netPayable} | প্রাপ্ত: ৳${sale.receivedAmount} | বকেয়া: ৳${sale.dueAmount}`,
        createdBy: sale.createdBy || "admin",
      });
    }

    notifyDataChanged("counter_sales");
    notifyDataChanged("transactions");
    return { success: true, data: created };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export async function deleteCounterSaleFromSupabase(saleId: string): Promise<boolean> {
  return deleteFromSupabase("counter_sales", saleId);
}

// 3. EMPLOYEES
export async function fetchEmployeesFromSupabase(): Promise<Employee[]> {
  const rows = await fetchFromSupabase<any>("employees", { limit: 500, orderBy: "name", orderDir: "asc" });
  return rows.map(r => ({
    id: r.id,
    employeeIdCode: r.employeeIdCode || r.employee_id_code,
    name: r.name,
    role: r.role,
    salary: Number(r.salary || 0),
    department: r.department || "Sales",
    phone: r.phone,
    email: r.email,
    joinedDate: r.joinedDate || r.joined_date,
    status: r.status || "active",
    photo: r.photo,
    documents: typeof r.documents === "string" ? JSON.parse(r.documents) : (r.documents || []),
  }));
}

export async function saveEmployeeToSupabase(emp: Partial<Employee>): Promise<Employee | null> {
  const row = {
    employee_id_code: emp.employeeIdCode || (emp as any).employee_id_code || null,
    name: emp.name,
    role: emp.role || "Staff",
    salary: Number(emp.salary || 0),
    department: emp.department || "Sales",
    phone: emp.phone || null,
    email: emp.email || null,
    joined_date: emp.joinedDate || (emp as any).joined_date || new Date().toISOString(),
    status: emp.status || "active",
    photo: emp.photo || null,
    documents: emp.documents || [],
  };
  return insertIntoSupabase<Employee>("employees", row);
}

export async function deleteEmployeeFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("employees", id);
}

// 4. BANKS
export async function fetchBanksFromSupabase(): Promise<Bank[]> {
  const rows = await fetchFromSupabase<any>("banks", { limit: 100, orderBy: "name", orderDir: "asc" });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    balance: Number(r.balance || 0),
    lastUpdated: r.lastUpdated || r.last_updated,
  }));
}

export async function saveBankToSupabase(bank: Partial<Bank>): Promise<Bank | null> {
  const row = {
    name: bank.name,
    balance: Number(bank.balance || 0),
    last_updated: new Date().toISOString(),
  };
  if (bank.id) {
    return updateInSupabase<Bank>("banks", bank.id, row);
  }
  return insertIntoSupabase<Bank>("banks", row);
}

// 5. CATEGORIES
export async function fetchCategoriesFromSupabase(): Promise<Category[]> {
  const rows = await fetchFromSupabase<any>("categories", { limit: 200, orderBy: "name", orderDir: "asc" });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type || "income",
    icon: r.icon,
  }));
}

export async function saveCategoryToSupabase(cat: Partial<Category>): Promise<Category | null> {
  return insertIntoSupabase<Category>("categories", {
    name: cat.name,
    type: cat.type || "expense",
    icon: cat.icon || "Tag",
  });
}

// 6. SUPPLIERS & SUPPLIER TRANSACTIONS
export async function fetchSuppliersFromSupabase(): Promise<Supplier[]> {
  const rows = await fetchFromSupabase<any>("suppliers", { limit: 500, orderBy: "code", orderDir: "asc" });
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    mobile: r.mobile || r.phone,
    address: r.address,
    openingBalance: Number(r.openingBalance || r.opening_balance || 0),
    advanceAmount: Number(r.advanceAmount || r.advance_amount || 0),
    totalAmount: Number(r.totalAmount || r.total_amount || 0),
    purchaseDue: Number(r.purchaseDue || r.purchase_due || 0),
    status: r.status || "active",
    country: r.country || "Bangladesh",
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
  }));
}

export async function fetchSupplierTransactionsFromSupabase(): Promise<SupplierTransaction[]> {
  const rows = await fetchFromSupabase<any>("supplier_transactions", { limit: 2000, orderBy: "date", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    supplierId: r.supplierId || r.supplier_id,
    date: r.date,
    type: r.type,
    refNo: r.refNo || r.ref_no,
    totalAmount: Number(r.totalAmount || r.total_amount || 0),
    paidAmount: Number(r.paidAmount || r.paid_amount || 0),
    dueAmount: Number(r.dueAmount || r.due_amount || 0),
    lessAmount: Number(r.lessAmount || r.less_amount || 0),
    paymentMethod: r.paymentMethod || r.payment_method,
    notes: r.notes,
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
  }));
}

export async function saveSupplierToSupabase(sup: Partial<Supplier>): Promise<Supplier | null> {
  const row = {
    code: sup.code || `S-${Date.now().toString().slice(-4)}`,
    name: sup.name,
    mobile: sup.mobile || "",
    address: sup.address || "",
    opening_balance: Number(sup.openingBalance || 0),
    advance_amount: Number(sup.advanceAmount || 0),
    total_amount: Number(sup.totalAmount || 0),
    purchase_due: Number(sup.purchaseDue || 0),
    status: sup.status || "active",
  };
  if (sup.id) {
    return updateInSupabase<Supplier>("suppliers", sup.id, row);
  }
  return insertIntoSupabase<Supplier>("suppliers", row);
}

// 7. PURCHASES
export async function fetchPurchasesFromSupabase(): Promise<PurchaseModel[]> {
  const rows = await fetchFromSupabase<any>("purchases", { limit: 1000, orderBy: "date", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    supplierId: r.supplierId || r.supplier_id,
    supplierName: r.supplierName || r.supplier_name,
    date: r.date,
    refNo: r.refNo || r.ref_no,
    totalAmount: Number(r.totalAmount || r.total_amount || 0),
    paidAmount: Number(r.paidAmount || r.paid_amount || 0),
    dueAmount: Number(r.dueAmount || r.due_amount || 0),
    paymentMethod: r.paymentMethod || r.payment_method,
    notes: r.notes,
    items: typeof r.items === "string" ? JSON.parse(r.items) : (r.items || []),
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
  }));
}

// 8. CUSTOMERS & CUSTOMER PAYMENTS
export async function fetchCustomersFromSupabase(): Promise<CustomerProfile[]> {
  const rows = await fetchFromSupabase<any>("customers", { limit: 1000, orderBy: "name", orderDir: "asc" });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    totalPurchases: Number(r.totalPurchases || r.total_purchases || 0),
    totalPaid: Number(r.totalPaid || r.total_paid || 0),
    totalDue: Number(r.totalDue || r.total_due || 0),
    totalDiscount: Number(r.totalDiscount || r.total_discount || 0),
    totalPurchasesCount: Number(r.totalPurchasesCount || r.total_purchases_count || 0),
    totalDueCount: Number(r.totalDueCount || r.total_due_count || 0),
    totalPaymentsCount: Number(r.totalPaymentsCount || r.total_payments_count || 0),
    lastTransactionDate: r.lastTransactionDate || r.last_transaction_date,
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    updatedAt: r.updatedAt || r.updated_at || new Date().toISOString(),
  }));
}

export async function fetchCustomerPaymentsFromSupabase(): Promise<CustomerPayment[]> {
  const rows = await fetchFromSupabase<any>("customer_payments", { limit: 1000, orderBy: "created_at", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    receiptNo: r.receiptNo || r.receipt_no,
    customerId: r.customerId || r.customer_id,
    customerName: r.customerName || r.customer_name,
    customerPhone: r.customerPhone || r.customer_phone,
    customerAddress: r.customerAddress || r.customer_address,
    date: r.date,
    time: r.time,
    amount: Number(r.amount || 0),
    previousDue: Number(r.previousDue || r.previous_due || 0),
    remainingDue: Number(r.remainingDue || r.remaining_due || 0),
    paymentMethod: r.paymentMethod || r.payment_method,
    notes: r.notes,
    receivedBy: r.receivedBy || r.received_by,
    transactionId: r.transactionId || r.transaction_id,
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
  }));
}

export async function saveCustomerPaymentToSupabase(pay: Partial<CustomerPayment>): Promise<CustomerPayment | null> {
  const row = {
    receipt_no: pay.receiptNo || `RCP-${Date.now()}`,
    customer_name: pay.customerName || "Customer",
    customer_phone: pay.customerPhone || null,
    customer_address: pay.customerAddress || null,
    date: pay.date || new Date().toISOString().substring(0, 10),
    time: pay.time || "12:00:00",
    amount: Number(pay.amount || 0),
    previous_due: Number(pay.previousDue || 0),
    remaining_due: Number(pay.remainingDue || 0),
    payment_method: pay.paymentMethod || "Cash",
    notes: pay.notes || "",
    received_by: pay.receivedBy || "admin",
  };
  return insertIntoSupabase<CustomerPayment>("customer_payments", row);
}

// 9. COMPANY SETTINGS
export async function fetchCompanySettingsFromSupabase(): Promise<any> {
  const rows = await fetchFromSupabase<any>("company_settings", { limit: 1 });
  if (rows.length > 0) {
    const cs = rows[0];
    return {
      companyName: cs.companyName || cs.company_name || "Modern Cloth Store",
      companyTagline: cs.tagline || "Since : 1983 - POS & Inventory",
      companyLogoUrl: cs.logoUrl || cs.logo_url || "/logo.png",
      companyPhone: cs.phone || "+88 01711157698",
      companyEmail: cs.email || "modernclothstore1983@gmail.com",
      companyAddress: cs.address || "H.M.M Road Jashore 7400, Bangladesh",
      currency: cs.currency || "BDT",
      currencySymbol: cs.currencySymbol || cs.currency_symbol || "৳",
    };
  }
  return null;
}

export async function saveCompanySettingsToSupabase(settings: {
  companyName?: string;
  companyTagline?: string;
  companyLogoUrl?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  currency?: string;
  currencySymbol?: string;
}): Promise<any> {
  const row = {
    company_name: settings.companyName || "Modern Cloth Store",
    tagline: settings.companyTagline || "Since : 1983 - POS & Inventory",
    logo_url: settings.companyLogoUrl || "/logo.png",
    phone: settings.companyPhone || "+88 01711157698",
    email: settings.companyEmail || "modernclothstore1983@gmail.com",
    address: settings.companyAddress || "H.M.M Road Jashore 7400, Bangladesh",
    currency: settings.currency || "BDT",
    currency_symbol: settings.currencySymbol || "৳",
  };
  const res = await insertIntoSupabase("company_settings", row);
  notifyDataChanged("company_settings");
  return res;
}

// 10. ROLES & PERMISSIONS
export async function fetchRolesFromSupabase(): Promise<RolePermission[]> {
  const rows = await fetchFromSupabase<any>("roles", { limit: 100, orderBy: "name", orderDir: "asc" });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    allowedMenus: typeof r.allowedMenus === "string" ? JSON.parse(r.allowedMenus) : (r.allowedMenus || r.allowed_menus || []),
    actions: typeof r.actions === "string" ? JSON.parse(r.actions) : (r.actions || {}),
    colorBadge: r.colorBadge || r.color_badge || "indigo",
    description: r.description,
    isDefault: Boolean(r.isDefault ?? r.is_default),
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
  }));
}

export async function saveRoleToSupabase(role: Partial<RolePermission>): Promise<RolePermission | null> {
  const row = {
    name: role.name,
    allowed_menus: role.allowedMenus || [],
    actions: role.actions || {},
    color_badge: role.colorBadge || "indigo",
    description: role.description || "",
    is_default: Boolean(role.isDefault),
  };
  if (role.id) {
    return updateInSupabase<RolePermission>("roles", role.id, row);
  }
  return insertIntoSupabase<RolePermission>("roles", row);
}

export async function deleteRoleFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("roles", id);
}

// 11. ATTENDANCE
export async function fetchAttendanceFromSupabase(limit = 1000): Promise<Attendance[]> {
  const rows = await fetchFromSupabase<any>("attendance", { limit, orderBy: "date", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    employeeId: r.employeeId || r.employee_id,
    date: r.date,
    status: r.status,
    checkIn: r.checkIn || r.check_in,
    checkOut: r.checkOut || r.check_out,
    lunchOut: r.lunchOut || r.lunch_out,
    lunchIn: r.lunchIn || r.lunch_in,
    notes: r.notes,
  }));
}

export async function saveAttendanceToSupabase(att: Partial<Attendance>): Promise<Attendance | null> {
  const row = {
    employee_id: att.employeeId || (att as any).employee_id,
    date: att.date || new Date().toISOString().substring(0, 10),
    status: att.status || "present",
    check_in: att.checkIn || null,
    check_out: att.checkOut || null,
    lunch_out: att.lunchOut || null,
    lunch_in: att.lunchIn || null,
    notes: att.notes || null,
  };
  if (att.id) {
    return updateInSupabase<Attendance>("attendance", att.id, row);
  }
  return insertIntoSupabase<Attendance>("attendance", row);
}

export async function deleteAttendanceFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("attendance", id);
}

// Extra Helpers for Customer, Supplier & Banks
export async function saveCustomerToSupabase(cust: Partial<CustomerProfile>): Promise<CustomerProfile | null> {
  const row = {
    name: cust.name,
    phone: cust.phone || "",
    address: cust.address || "",
    total_purchases: Number(cust.totalPurchases || 0),
    total_paid: Number(cust.totalPaid || 0),
    total_due: Number(cust.totalDue || 0),
    total_discount: Number(cust.totalDiscount || 0),
    total_purchases_count: Number(cust.totalPurchasesCount || 0),
    total_due_count: Number(cust.totalDueCount || 0),
    total_payments_count: Number(cust.totalPaymentsCount || 0),
    last_transaction_date: cust.lastTransactionDate || new Date().toISOString(),
  };
  if (cust.id) {
    return updateInSupabase<CustomerProfile>("customers", cust.id, row);
  }
  return insertIntoSupabase<CustomerProfile>("customers", row);
}

export async function deleteCustomerFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("customers", id);
}

export async function deleteCustomerPaymentFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("customer_payments", id);
}

export async function savePurchaseToSupabase(p: Partial<PurchaseModel>): Promise<PurchaseModel | null> {
  const row = {
    supplier_id: p.supplierId || (p as any).supplier_id,
    supplier_name: p.supplierName || (p as any).supplier_name || "Supplier",
    date: p.date || new Date().toISOString().substring(0, 10),
    ref_no: p.refNo || `PUR-${Date.now()}`,
    total_amount: Number(p.totalAmount || 0),
    paid_amount: Number(p.paidAmount || 0),
    due_amount: Number(p.dueAmount || 0),
    payment_method: p.paymentMethod || "Cash",
    notes: p.notes || "",
    items: p.items || [],
  };
  if (p.id) {
    return updateInSupabase<PurchaseModel>("purchases", p.id, row);
  }
  return insertIntoSupabase<PurchaseModel>("purchases", row);
}

export async function deletePurchaseFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("purchases", id);
}

export async function saveSupplierTransactionToSupabase(st: Partial<SupplierTransaction>): Promise<SupplierTransaction | null> {
  const row = {
    supplier_id: st.supplierId || (st as any).supplier_id,
    date: st.date || new Date().toISOString().substring(0, 10),
    type: st.type || "payment",
    ref_no: st.refNo || `TX-${Date.now()}`,
    total_amount: Number(st.totalAmount || 0),
    paid_amount: Number(st.paidAmount || 0),
    due_amount: Number(st.dueAmount || 0),
    less_amount: Number(st.lessAmount || 0),
    payment_method: st.paymentMethod || "Cash",
    notes: st.notes || "",
  };
  if (st.id) {
    return updateInSupabase<SupplierTransaction>("supplier_transactions", st.id, row);
  }
  return insertIntoSupabase<SupplierTransaction>("supplier_transactions", row);
}

export async function deleteSupplierTransactionFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("supplier_transactions", id);
}

export async function deleteSupplierFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("suppliers", id);
}

export async function deleteCategoryFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("categories", id);
}

export async function deleteBankFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("banks", id);
}

// 12. ACTIVITY NOTIFICATIONS
export async function fetchActivityNotificationsFromSupabase(limit = 100): Promise<ActivityNotification[]> {
  const rows = await fetchFromSupabase<any>("activity_notifications", { limit, orderBy: "timestamp", orderDir: "desc" });
  return rows.map(r => ({
    id: r.id,
    userId: r.userId || r.user_id,
    userName: r.userName || r.user_name,
    userEmail: r.userEmail || r.user_email,
    userRole: r.userRole || r.user_role,
    userPhoto: r.userPhoto || r.user_photo,
    menuId: r.menuId || r.menu_id,
    menuLabel: r.menuLabel || r.menu_label,
    action: r.action,
    title: r.title,
    note: r.note,
    metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {}),
    timestamp: r.timestamp || r.created_at,
    readBy: typeof r.readBy === "string" ? JSON.parse(r.readBy) : (r.readBy || []),
    createdAt: r.createdAt || r.created_at,
  }));
}

export async function saveActivityNotificationToSupabase(notif: any): Promise<{ success: boolean; id?: string }> {
  try {
    const row = {
      user_id: notif.userId || notif.user_id || "admin",
      user_name: notif.userName || notif.user_name || "User",
      user_email: notif.userEmail || notif.user_email || "user@system.local",
      user_role: notif.userRole || notif.user_role || "user",
      user_photo: notif.userPhoto || notif.user_photo || null,
      menu_id: notif.menuId || notif.menu_id || "general",
      menu_label: notif.menuLabel || notif.menu_label || "General",
      action: notif.action || "create",
      title: notif.title || "Notification",
      note: notif.note || "",
      metadata: notif.metadata || {},
      timestamp: notif.timestamp || new Date().toISOString(),
      read_by: notif.readBy || notif.read_by || [],
    };
    const created = await insertIntoSupabase<any>("activity_notifications", row);
    notifyDataChanged("activity_notifications");
    return { success: true, id: created?.id };
  } catch {
    return { success: false };
  }
}

export async function deleteActivityNotificationFromSupabase(id: string): Promise<boolean> {
  return deleteFromSupabase("activity_notifications", id);
}

export async function markNotificationReadInSupabase(id: string, userId: string): Promise<boolean> {
  try {
    await updateInSupabase("activity_notifications", id, {
      is_read: true,
      read_by: [userId],
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearAllNotificationsInSupabase(): Promise<boolean> {
  try {
    const res = await fetch("/api/db/clear-all-notifications", { method: "POST" });
    notifyDataChanged("activity_notifications");
    return res.ok;
  } catch {
    return false;
  }
}
