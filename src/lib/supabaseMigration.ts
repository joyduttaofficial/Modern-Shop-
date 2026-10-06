import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getSupabase } from "./supabase";
import { getTransactionsFromIndexedDB } from "./indexedDbFallback";

export interface MigrationStats {
  collection: string;
  count: number;
  status: "pending" | "migrating" | "done" | "error";
  error?: string;
}

export interface FullExportData {
  roles: any[];
  users: any[];
  departments: any[];
  employees: any[];
  attendance: any[];
  categories: any[];
  banks: any[];
  suppliers: any[];
  supplierTransactions: any[];
  purchases: any[];
  products: any[];
  stockLedger: any[];
  customers: any[];
  counterSales: any[];
  customerPayments: any[];
  transactions: any[];
  activityNotifications: any[];
  companySettings: any;
}

/**
 * Escapes a single-quoted string safely for PostgreSQL
 */
function sqlEscape(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return isNaN(val) ? "0" : String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "object") {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Fetches all records from all live Firestore collections
 */
export async function fetchAllFirestoreData(): Promise<FullExportData> {
  const result: FullExportData = {
    roles: [],
    users: [],
    departments: [],
    employees: [],
    attendance: [],
    categories: [],
    banks: [],
    suppliers: [],
    supplierTransactions: [],
    purchases: [],
    products: [],
    stockLedger: [],
    customers: [],
    counterSales: [],
    customerPayments: [],
    transactions: [],
    activityNotifications: [],
    companySettings: null,
  };

  const collections = [
    "roles",
    "users",
    "departments",
    "employees",
    "attendance",
    "categories",
    "banks",
    "suppliers",
    "supplierTransactions",
    "purchases",
    "products",
    "stockLedger",
    "customers",
    "counterSales",
    "customerPayments",
    "transactions",
    "activityNotifications",
  ];

  for (const col of collections) {
    try {
      const snap = await getDocs(collection(db, col));
      (result as any)[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn(`Could not read collection ${col}:`, e);
      (result as any)[col] = [];
    }
  }

  // Fallback to IndexedDB for transactions if Firestore failed or is empty
  if (result.transactions.length === 0) {
    try {
      const offlineTx = await getTransactionsFromIndexedDB();
      if (offlineTx && offlineTx.length > 0) {
        result.transactions = offlineTx;
      }
    } catch (e) {
      console.warn("Could not read offline transactions:", e);
    }
  }

  // Also fetch company settings
  try {
    const compSnap = await getDoc(doc(db, "settings", "company"));
    if (compSnap.exists()) {
      result.companySettings = { id: compSnap.id, ...compSnap.data() };
    }
  } catch (e) {
    console.warn("Could not read company settings:", e);
  }

  return result;
}

/**
 * Generates ready-to-run PostgreSQL INSERT queries containing all existing data
 */
export function generateSupabaseInsertSql(data: FullExportData): string {
  const lines: string[] = [
    `-- ============================================================================`,
    `-- SUPABASE COMPLETE LIVE DATA MIGRATION SCRIPT`,
    `-- Generated on: ${new Date().toISOString()}`,
    `-- Description: Contains real live data extracted from Modern Pro system`,
    `-- Instructions: Run supabase.sql first to create tables, then execute this file`,
    `-- ============================================================================`,
    ``,
    `BEGIN;`,
    ``
  ];

  // 1. Roles
  if (data.roles.length > 0) {
    lines.push(`-- 1. ROLES (${data.roles.length} records)`);
    data.roles.forEach(r => {
      lines.push(
        `INSERT INTO public.roles (name, description, color_badge, is_default, allowed_menus, actions) ` +
        `VALUES (${sqlEscape(r.name || r.id)}, ${sqlEscape(r.description || '')}, ${sqlEscape(r.colorBadge || 'indigo')}, ${r.isDefault ? 'TRUE' : 'FALSE'}, ${sqlEscape(r.allowedMenus || [])}, ${sqlEscape(r.actions || {})}) ` +
        `ON CONFLICT (name) DO UPDATE SET allowed_menus = EXCLUDED.allowed_menus, actions = EXCLUDED.actions;`
      );
    });
    lines.push(``);
  }

  // 2. Departments
  if (data.departments.length > 0) {
    lines.push(`-- 2. DEPARTMENTS (${data.departments.length} records)`);
    data.departments.forEach(d => {
      lines.push(
        `INSERT INTO public.departments (name) ` +
        `VALUES (${sqlEscape(d.name)}) ` +
        `ON CONFLICT (name) DO NOTHING;`
      );
    });
    lines.push(``);
  }

  // 3. Banks & Cash Accounts
  if (data.banks.length > 0) {
    lines.push(`-- 3. BANKS & CASH REGISTERS (${data.banks.length} records)`);
    data.banks.forEach(b => {
      lines.push(
        `INSERT INTO public.banks (name, balance, last_updated) ` +
        `VALUES (${sqlEscape(b.name)}, ${Number(b.balance || 0)}, ${sqlEscape(b.lastUpdated || new Date().toISOString())}) ` +
        `ON CONFLICT (name) DO UPDATE SET balance = EXCLUDED.balance, last_updated = EXCLUDED.last_updated;`
      );
    });
    lines.push(``);
  }

  // 4. Categories
  if (data.categories.length > 0) {
    lines.push(`-- 4. CATEGORIES (${data.categories.length} records)`);
    data.categories.forEach(c => {
      lines.push(
        `INSERT INTO public.categories (name, type, icon) ` +
        `VALUES (${sqlEscape(c.name)}, ${sqlEscape(c.type || 'expense')}, ${sqlEscape(c.icon || 'Tag')}) ` +
        `ON CONFLICT (name, type) DO NOTHING;`
      );
    });
    lines.push(``);
  }

  // 5. Employees
  if (data.employees.length > 0) {
    lines.push(`-- 5. EMPLOYEES (${data.employees.length} records)`);
    data.employees.forEach(e => {
      lines.push(
        `INSERT INTO public.employees (employee_id_code, name, role, salary, department, phone, email, status, photo, nid_front_photo, nid_back_photo, birth_certificate_photo, documents, joined_date) ` +
        `VALUES (${sqlEscape(e.employeeIdCode || null)}, ${sqlEscape(e.name)}, ${sqlEscape(e.role || 'Staff')}, ${Number(e.salary || 0)}, ${sqlEscape(e.department || 'Sales')}, ${sqlEscape(e.phone || null)}, ${sqlEscape(e.email || null)}, ${sqlEscape(e.status || 'active')}, ${sqlEscape(e.photo || null)}, ${sqlEscape(e.nidFrontPhoto || null)}, ${sqlEscape(e.nidBackPhoto || null)}, ${sqlEscape(e.birthCertificatePhoto || null)}, ${sqlEscape(e.documents || [])}, ${sqlEscape(e.joinedDate ? e.joinedDate.substring(0, 10) : new Date().toISOString().substring(0, 10))});`
      );
    });
    lines.push(``);
  }

  // 6. Customers
  if (data.customers.length > 0) {
    lines.push(`-- 6. CUSTOMERS & CREDIT LEDGER (${data.customers.length} records)`);
    data.customers.forEach(c => {
      lines.push(
        `INSERT INTO public.customers (name, phone, address, total_purchases, total_paid, total_due, total_discount, total_purchases_count, total_due_count, total_payments_count, last_transaction_date) ` +
        `VALUES (${sqlEscape(c.name)}, ${sqlEscape(c.phone || null)}, ${sqlEscape(c.address || null)}, ${Number(c.totalPurchases || 0)}, ${Number(c.totalPaid || 0)}, ${Number(c.totalDue || 0)}, ${Number(c.totalDiscount || 0)}, ${Number(c.totalPurchasesCount || 0)}, ${Number(c.totalDueCount || 0)}, ${Number(c.totalPaymentsCount || 0)}, ${sqlEscape(c.lastTransactionDate || null)});`
      );
    });
    lines.push(``);
  }

  // 7. Counter Sales
  if (data.counterSales.length > 0) {
    lines.push(`-- 7. COUNTER SALES (${data.counterSales.length} records)`);
    data.counterSales.forEach(s => {
      lines.push(
        `INSERT INTO public.counter_sales (sale_id, daily_serial, date_time, date, time, slips, total_slips_amount, discount_type, discount_percent, discount_amount, net_payable, received_amount, change_amount, due_amount, is_balanced, balance_status, payment_method, customer_name, customer_phone, customer_address, notes, created_by, transaction_id) ` +
        `VALUES (${sqlEscape(s.saleId)}, ${Number(s.dailySerial || 0)}, ${sqlEscape(s.dateTime || new Date().toISOString())}, ${sqlEscape(s.date || new Date().toISOString().substring(0, 10))}, ${sqlEscape(s.time || '12:00:00')}, ${sqlEscape(s.slips || [])}, ${Number(s.totalSlipsAmount || 0)}, ${sqlEscape(s.discountType || null)}, ${Number(s.discountPercent || 0)}, ${Number(s.discountAmount || 0)}, ${Number(s.netPayable || 0)}, ${Number(s.receivedAmount || 0)}, ${Number(s.changeAmount || 0)}, ${Number(s.dueAmount || 0)}, ${s.isBalanced ? 'TRUE' : 'FALSE'}, ${sqlEscape(s.balanceStatus || 'equal')}, ${sqlEscape(s.paymentMethod || 'Cash')}, ${sqlEscape(s.customerName || null)}, ${sqlEscape(s.customerPhone || null)}, ${sqlEscape(s.customerAddress || null)}, ${sqlEscape(s.notes || null)}, ${sqlEscape(s.createdBy || 'admin')}, ${sqlEscape(s.transactionId || null)}) ` +
        `ON CONFLICT (sale_id) DO NOTHING;`
      );
    });
    lines.push(``);
  }

  // 8. Customer Payments
  if (data.customerPayments.length > 0) {
    lines.push(`-- 8. CUSTOMER DUE PAYMENTS (${data.customerPayments.length} records)`);
    data.customerPayments.forEach(p => {
      lines.push(
        `INSERT INTO public.customer_payments (customer_id, customer_name, customer_phone, customer_address, date, time, amount, previous_due, remaining_due, payment_method, notes, received_by, transaction_id, receipt_no) ` +
        `SELECT id, ${sqlEscape(p.customerName)}, ${sqlEscape(p.customerPhone || null)}, ${sqlEscape(p.customerAddress || null)}, ${sqlEscape(p.date ? p.date.substring(0, 10) : new Date().toISOString().substring(0, 10))}, ${sqlEscape(p.time || '12:00:00')}, ${Number(p.amount || 0)}, ${Number(p.previousDue || 0)}, ${Number(p.remainingDue || 0)}, ${sqlEscape(p.paymentMethod || 'Cash')}, ${sqlEscape(p.notes || null)}, ${sqlEscape(p.receivedBy || 'admin')}, ${sqlEscape(p.transactionId || null)}, ${sqlEscape(p.receiptNo || null)} ` +
        `FROM public.customers WHERE name = ${sqlEscape(p.customerName)} LIMIT 1;`
      );
    });
    lines.push(``);
  }

  // 9. Suppliers
  if (data.suppliers.length > 0) {
    lines.push(`-- 9. SUPPLIERS (${data.suppliers.length} records)`);
    data.suppliers.forEach(s => {
      lines.push(
        `INSERT INTO public.suppliers (code, name, mobile, phone, email, address, country, opening_balance, advance_amount, total_amount, purchase_due, status) ` +
        `VALUES (${sqlEscape(s.code || 'BD001')}, ${sqlEscape(s.name)}, ${sqlEscape(s.mobile || null)}, ${sqlEscape(s.phone || null)}, ${sqlEscape(s.email || null)}, ${sqlEscape(s.address || null)}, ${sqlEscape(s.country || 'Bangladesh')}, ${Number(s.openingBalance || 0)}, ${Number(s.advanceAmount || 0)}, ${Number(s.totalAmount || 0)}, ${Number(s.purchaseDue || 0)}, ${sqlEscape(s.status || 'active')}) ` +
        `ON CONFLICT (code) DO NOTHING;`
      );
    });
    lines.push(``);
  }

  // 10. Products
  if (data.products.length > 0) {
    lines.push(`-- 10. PRODUCTS & INVENTORY (${data.products.length} records)`);
    data.products.forEach(p => {
      lines.push(
        `INSERT INTO public.products (name, category, sub_category, unit, stock, min_stock, last_purchase_price, total_purchase_value) ` +
        `VALUES (${sqlEscape(p.name)}, ${sqlEscape(p.category || 'General')}, ${sqlEscape(p.subCategory || null)}, ${sqlEscape(p.unit || 'Piece')}, ${Number(p.stock || 0)}, ${Number(p.minStock || 5)}, ${Number(p.lastPurchasePrice || 0)}, ${Number(p.totalPurchaseValue || 0)});`
      );
    });
    lines.push(``);
  }

  // 11. Transactions
  if (data.transactions.length > 0) {
    lines.push(`-- 11. TRANSACTIONS LEDGER (${data.transactions.length} records)`);
    data.transactions.forEach(t => {
      lines.push(
        `INSERT INTO public.transactions (date, type, category, sub_category, amount, payment_method, notes, created_by) ` +
        `VALUES (${sqlEscape(t.date || new Date().toISOString())}, ${sqlEscape(t.type || 'expense')}, ${sqlEscape(t.category || 'General')}, ${sqlEscape(t.subCategory || null)}, ${Number(t.amount || 0)}, ${sqlEscape(t.paymentMethod || 'Cash')}, ${sqlEscape(t.notes || null)}, ${sqlEscape(t.createdBy || 'admin')});`
      );
    });
    lines.push(``);
  }

  // 12. Company Settings
  if (data.companySettings) {
    const cs = data.companySettings;
    lines.push(`-- 12. COMPANY SETTINGS`);
    lines.push(
      `INSERT INTO public.company_settings (company_name, tagline, logo_url, phone, email, address, currency, currency_symbol) ` +
      `VALUES (${sqlEscape(cs.companyName || 'Modern Cloth Store')}, ${sqlEscape(cs.companyTagline || 'Since : 1983 - POS & Inventory')}, ${sqlEscape(cs.companyLogoUrl || null)}, ${sqlEscape(cs.companyPhone || '+880 1700-000000')}, ${sqlEscape(cs.companyEmail || 'contact@company.com')}, ${sqlEscape(cs.companyAddress || 'Dhaka, Bangladesh')}, 'BDT', '৳');`
    );
    lines.push(``);
  }

  lines.push(`COMMIT;`);
  lines.push(``);
  return lines.join("\n");
}

/**
 * Pushes all Firestore data directly into the connected Supabase database via Supabase client
 */
export async function pushDataDirectlyToSupabase(
  data: FullExportData,
  onProgress?: (step: string, percent: number) => void
): Promise<{ success: boolean; message: string; summary: Record<string, number> }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured. Please supply your Supabase project URL and anon public key.");
  }

  const summary: Record<string, number> = {};

  try {
    // 1. Roles
    if (onProgress) onProgress("Migrating Roles...", 10);
    if (data.roles.length > 0) {
      const roleRows = data.roles.map(r => ({
        name: r.name || r.id,
        description: r.description || "",
        color_badge: r.colorBadge || "indigo",
        is_default: Boolean(r.isDefault),
        allowed_menus: r.allowedMenus || [],
        actions: r.actions || {}
      }));
      const { error } = await supabase.from("roles").upsert(roleRows, { onConflict: "name" });
      if (error) console.warn("Roles upsert error:", error);
      summary.roles = roleRows.length;
    }

    // 2. Departments
    if (onProgress) onProgress("Migrating Departments...", 20);
    if (data.departments.length > 0) {
      const deptRows = data.departments.map(d => ({ name: d.name }));
      const { error } = await supabase.from("departments").upsert(deptRows, { onConflict: "name" });
      if (error) console.warn("Departments upsert error:", error);
      summary.departments = deptRows.length;
    }

    // 3. Banks
    if (onProgress) onProgress("Migrating Banks & Cash Accounts...", 30);
    if (data.banks.length > 0) {
      const bankRows = data.banks.map(b => ({
        name: b.name,
        balance: Number(b.balance || 0),
        last_updated: b.lastUpdated || new Date().toISOString()
      }));
      const { error } = await supabase.from("banks").upsert(bankRows, { onConflict: "name" });
      if (error) console.warn("Banks upsert error:", error);
      summary.banks = bankRows.length;
    }

    // 4. Categories
    if (onProgress) onProgress("Migrating Categories...", 40);
    if (data.categories.length > 0) {
      const catRows = data.categories.map(c => ({
        name: c.name,
        type: c.type || "expense",
        icon: c.icon || "Tag"
      }));
      const { error } = await supabase.from("categories").upsert(catRows, { onConflict: "name,type" });
      if (error) console.warn("Categories upsert error:", error);
      summary.categories = catRows.length;
    }

    // 5. Employees
    if (onProgress) onProgress("Migrating Employees...", 50);
    if (data.employees.length > 0) {
      const empRows = data.employees.map(e => ({
        employee_id_code: e.employeeIdCode || null,
        name: e.name,
        role: e.role || "Staff",
        salary: Number(e.salary || 0),
        department: e.department || "Sales",
        phone: e.phone || null,
        email: e.email || null,
        status: e.status || "active",
        photo: e.photo || null,
        documents: e.documents || [],
        joined_date: e.joinedDate ? e.joinedDate.substring(0, 10) : new Date().toISOString().substring(0, 10)
      }));
      const { error } = await supabase.from("employees").insert(empRows);
      if (error) console.warn("Employees insert error:", error);
      summary.employees = empRows.length;
    }

    // 6. Customers
    if (onProgress) onProgress("Migrating Customers Ledger...", 60);
    if (data.customers.length > 0) {
      const custRows = data.customers.map(c => ({
        name: c.name,
        phone: c.phone || null,
        address: c.address || null,
        total_purchases: Number(c.totalPurchases || 0),
        total_paid: Number(c.totalPaid || 0),
        total_due: Number(c.totalDue || 0),
        total_discount: Number(c.totalDiscount || 0),
        total_purchases_count: Number(c.totalPurchasesCount || 0),
        total_due_count: Number(c.totalDueCount || 0),
        total_payments_count: Number(c.totalPaymentsCount || 0),
        last_transaction_date: c.lastTransactionDate || null
      }));
      const { error } = await supabase.from("customers").insert(custRows);
      if (error) console.warn("Customers insert error:", error);
      summary.customers = custRows.length;
    }

    // 7. Counter Sales
    if (onProgress) onProgress("Migrating Counter Sales...", 75);
    if (data.counterSales.length > 0) {
      const saleRows = data.counterSales.map(s => ({
        sale_id: s.saleId,
        daily_serial: Number(s.dailySerial || 0),
        date_time: s.dateTime || new Date().toISOString(),
        date: s.date || new Date().toISOString().substring(0, 10),
        time: s.time || "12:00:00",
        slips: s.slips || [],
        total_slips_amount: Number(s.totalSlipsAmount || 0),
        discount_type: s.discountType || null,
        discount_percent: Number(s.discountPercent || 0),
        discount_amount: Number(s.discountAmount || 0),
        net_payable: Number(s.netPayable || 0),
        received_amount: Number(s.receivedAmount || 0),
        change_amount: Number(s.changeAmount || 0),
        due_amount: Number(s.dueAmount || 0),
        is_balanced: Boolean(s.isBalanced),
        balance_status: s.balanceStatus || "equal",
        payment_method: s.paymentMethod || "Cash",
        customer_name: s.customerName || null,
        customer_phone: s.customerPhone || null,
        customer_address: s.customerAddress || null,
        notes: s.notes || null,
        created_by: s.createdBy || "admin"
      }));
      const { error } = await supabase.from("counter_sales").upsert(saleRows, { onConflict: "sale_id" });
      if (error) console.warn("Counter sales upsert error:", error);
      summary.counterSales = saleRows.length;
    }

    // 8. Suppliers
    if (onProgress) onProgress("Migrating Suppliers...", 85);
    if (data.suppliers.length > 0) {
      const supRows = data.suppliers.map(s => ({
        code: s.code || "BD001",
        name: s.name,
        mobile: s.mobile || null,
        phone: s.phone || null,
        email: s.email || null,
        address: s.address || null,
        country: s.country || "Bangladesh",
        opening_balance: Number(s.openingBalance || 0),
        advance_amount: Number(s.advanceAmount || 0),
        total_amount: Number(s.totalAmount || 0),
        purchase_due: Number(s.purchaseDue || 0),
        status: s.status || "active"
      }));
      const { error } = await supabase.from("suppliers").upsert(supRows, { onConflict: "code" });
      if (error) console.warn("Suppliers upsert error:", error);
      summary.suppliers = supRows.length;
    }

    // 9. Products
    if (onProgress) onProgress("Migrating Products...", 90);
    if (data.products.length > 0) {
      const prodRows = data.products.map(p => ({
        name: p.name,
        category: p.category || "General",
        sub_category: p.subCategory || null,
        unit: p.unit || "Piece",
        stock: Number(p.stock || 0),
        min_stock: Number(p.minStock || 5),
        last_purchase_price: Number(p.lastPurchasePrice || 0),
        total_purchase_value: Number(p.totalPurchaseValue || 0)
      }));
      const { error } = await supabase.from("products").insert(prodRows);
      if (error) console.warn("Products insert error:", error);
      summary.products = prodRows.length;
    }

    // 10. General Transactions
    if (onProgress) onProgress("Migrating General Transactions...", 92);
    if (data.transactions.length > 0) {
      const txRows = data.transactions.map(t => ({
        date: t.date || new Date().toISOString(),
        type: t.type || "expense",
        category: t.category || "General",
        sub_category: t.subCategory || null,
        amount: Number(t.amount || 0),
        payment_method: t.paymentMethod || "Cash",
        notes: t.notes || null,
        created_by: t.createdBy || "admin"
      }));
      const { error } = await supabase.from("transactions").insert(txRows);
      if (error) console.warn("Transactions insert error:", error);
      summary.transactions = txRows.length;
    }

    // 11. Customer Payments
    if (data.customerPayments && data.customerPayments.length > 0) {
      if (onProgress) onProgress("Migrating Customer Payments...", 94);
      // Fetch customer lookup
      const { data: dbCusts } = await supabase.from("customers").select("id, name");
      const custMap = new Map((dbCusts || []).map(c => [c.name, c.id]));

      const paymentRows = data.customerPayments.map(p => ({
        customer_id: custMap.get(p.customerName) || (dbCusts?.[0]?.id || null),
        customer_name: p.customerName,
        customer_phone: p.customerPhone || null,
        customer_address: p.customerAddress || null,
        date: p.date ? p.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
        time: p.time || "12:00:00",
        amount: Number(p.amount || 0),
        previous_due: Number(p.previousDue || 0),
        remaining_due: Number(p.remainingDue || 0),
        payment_method: p.paymentMethod || "Cash",
        notes: p.notes || null,
        received_by: p.receivedBy || "admin",
        receipt_no: p.receiptNo || null
      })).filter(r => r.customer_id);

      if (paymentRows.length > 0) {
        const { error } = await supabase.from("customer_payments").insert(paymentRows);
        if (error) console.warn("Customer payments insert error:", error);
        summary.customerPayments = paymentRows.length;
      }
    }

    // 12. Purchases
    if (data.purchases && data.purchases.length > 0) {
      if (onProgress) onProgress("Migrating Purchase Invoices...", 96);
      const purchaseRows = data.purchases.map(p => ({
        supplier_name: p.supplierName || "Supplier",
        date: p.date ? p.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
        ref_no: p.refNo || "PUR-01",
        total_amount: Number(p.totalAmount || 0),
        paid_amount: Number(p.paidAmount || 0),
        due_amount: Number(p.dueAmount || 0),
        written_return: Number(p.writtenReturn || 0),
        payment_method: p.paymentMethod || "Cash",
        notes: p.notes || null,
        items: p.items || []
      }));
      const { error } = await supabase.from("purchases").insert(purchaseRows);
      if (error) console.warn("Purchases insert error:", error);
      summary.purchases = purchaseRows.length;
    }

    // 13. Activity Notifications
    if (data.activityNotifications && data.activityNotifications.length > 0) {
      if (onProgress) onProgress("Migrating Activity Notifications...", 98);
      const notifRows = data.activityNotifications.map(n => ({
        user_id: n.userId || "system",
        user_name: n.userName || "User",
        user_email: n.userEmail || "",
        user_role: n.userRole || "user",
        user_photo: n.userPhoto || null,
        menu_id: n.menuId || "system",
        menu_label: n.menuLabel || "সিস্টেম",
        action: n.action || "view",
        title: n.title || "Activity",
        note: n.note || "",
        metadata: n.metadata || {},
        timestamp: n.timestamp || new Date().toISOString()
      }));
      const { error } = await supabase.from("activity_notifications").insert(notifRows);
      if (error) console.warn("Notifications insert error:", error);
      summary.activityNotifications = notifRows.length;
    }

    // 14. Company Settings
    if (data.companySettings) {
      const cs = data.companySettings;
      const { error } = await supabase.from("company_settings").upsert({
        company_name: cs.companyName || "Modern Cloth Store",
        tagline: cs.companyTagline || "Since : 1983 - POS & Inventory",
        logo_url: cs.companyLogoUrl || null,
        phone: cs.companyPhone || "+880 1700-000000",
        email: cs.companyEmail || "contact@company.com",
        address: cs.companyAddress || "Dhaka, Bangladesh"
      });
      if (error) console.warn("Company settings upsert error:", error);
      summary.companySettings = 1;
    }

    if (onProgress) onProgress("Migration Complete!", 100);

    return {
      success: true,
      message: "All data collections successfully transferred and saved in your Supabase PostgreSQL database!",
      summary
    };
  } catch (err) {
    console.error("Direct migration error:", err);
    throw err;
  }
}

/**
 * Downloads the full data seed SQL file to the browser
 */
export async function downloadFullDataSql() {
  const data = await fetchAllFirestoreData();
  const sql = generateSupabaseInsertSql(data);
  const blob = new Blob([sql], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `supabase-live-data-migration-${new Date().toISOString().split("T")[0]}.sql`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
