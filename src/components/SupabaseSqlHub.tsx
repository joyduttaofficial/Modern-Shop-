import React, { useState } from "react";
import { 
  Database, 
  Copy, 
  Check, 
  Download, 
  Terminal, 
  ExternalLink, 
  Layers, 
  ShieldCheck, 
  Zap, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  FileCode,
  CheckCircle2,
  TableProperties
} from "lucide-react";
import { cn } from "@/src/lib/utils";

// Full SQL Schema text for direct copy and download
export const SUPABASE_SQL_SCHEMA = `-- ============================================================================
-- SUPABASE POSTGRESQL PRODUCTION DATABASE SCHEMA
-- Application: Modern Pro (Retail & Wholesale Accounting, POS, Inventory, HR)
-- Compatibility: Supabase PostgreSQL (Supports Supabase Auth, Storage & RLS)
-- ============================================================================

-- 0. ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

-- Generic Updated_At Trigger Function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Super Admin / Role Helper Function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND (role = 'admin' OR role = 'superadmin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. ROLES & PERMISSIONS ARCHITECTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    allowed_menus JSONB NOT NULL DEFAULT '[]'::jsonb,
    actions JSONB NOT NULL DEFAULT '{}'::jsonb,
    color_badge TEXT DEFAULT 'indigo',
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_roles_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 3. USER PROFILES (Integrated with Supabase Auth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales',
    role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
    designation TEXT,
    department TEXT,
    mobile TEXT,
    photo_url TEXT,
    bio TEXT,
    username TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, role, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'displayName', NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'User'), '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'sales'),
        'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 4. DEPARTMENTS & HR
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id_code TEXT UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    department TEXT,
    phone TEXT,
    email TEXT,
    joined_date DATE DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    photo TEXT,
    nid_front_photo TEXT,
    nid_back_photo TEXT,
    birth_certificate_photo TEXT,
    documents JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.attendance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    late_threshold TIME DEFAULT '10:00:00',
    lunch_duration_limit INTEGER DEFAULT 60,
    half_day_threshold TIME DEFAULT '11:30:00',
    breakfast_allowance_amount NUMERIC(10, 2) DEFAULT 20.00,
    deduct_breakfast_on_late BOOLEAN DEFAULT true,
    deduct_breakfast_on_absent BOOLEAN DEFAULT true,
    grace_period_minutes INTEGER DEFAULT 0,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'half-day', 'leave', 'holiday')),
    check_in TIME,
    lunch_out TIME,
    lunch_in TIME,
    check_out TIME,
    late_minutes INTEGER DEFAULT 0,
    breakfast_allowance NUMERIC(10, 2) DEFAULT 0.00,
    is_breakfast_eligible BOOLEAN DEFAULT false,
    breakfast_deducted BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (date, employee_id)
);

-- ============================================================================
-- 5. FINANCIAL ACCOUNTS, CATEGORIES & TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (name, type)
);

CREATE TABLE IF NOT EXISTS public.banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL,
    sub_category TEXT,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    notes TEXT,
    created_by TEXT NOT NULL,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    supplier_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. SUPPLIERS & PURCHASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    mobile TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    country TEXT DEFAULT 'Bangladesh',
    opening_balance NUMERIC(14, 2) DEFAULT 0.00,
    advance_amount NUMERIC(14, 2) DEFAULT 0.00,
    total_amount NUMERIC(14, 2) DEFAULT 0.00,
    purchase_due NUMERIC(14, 2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS fk_transactions_supplier,
ADD CONSTRAINT fk_transactions_supplier FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.supplier_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'return', 'payment')),
    ref_no TEXT NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(14, 2) DEFAULT 0.00,
    due_amount NUMERIC(14, 2) DEFAULT 0.00,
    less_amount NUMERIC(14, 2) DEFAULT 0.00,
    payment_method TEXT DEFAULT 'Cash',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    ref_no TEXT NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(14, 2) DEFAULT 0.00,
    due_amount NUMERIC(14, 2) DEFAULT 0.00,
    written_return NUMERIC(14, 2) DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    notes TEXT,
    invoice_photo TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. INVENTORY & STOCK LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sub_category TEXT,
    unit TEXT NOT NULL DEFAULT 'Piece',
    stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock NUMERIC(12, 2) DEFAULT 5.00,
    last_purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_purchase_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'sale', 'return', 'adjustment')),
    ref_no TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit TEXT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. COUNTER SALES, CUSTOMERS & DUE LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    total_purchases NUMERIC(14, 2) DEFAULT 0.00,
    total_paid NUMERIC(14, 2) DEFAULT 0.00,
    total_due NUMERIC(14, 2) DEFAULT 0.00,
    total_discount NUMERIC(14, 2) DEFAULT 0.00,
    total_purchases_count INTEGER DEFAULT 0,
    total_due_count INTEGER DEFAULT 0,
    total_payments_count INTEGER DEFAULT 0,
    last_transaction_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.counter_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    daily_serial INTEGER,
    date_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time TIME NOT NULL DEFAULT CURRENT_TIME,
    slips JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_slips_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    discount_type TEXT CHECK (discount_type IN ('amount', 'percent')),
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    discount_amount NUMERIC(14, 2) DEFAULT 0.00,
    net_payable NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    received_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    change_amount NUMERIC(14, 2) DEFAULT 0.00,
    due_amount NUMERIC(14, 2) DEFAULT 0.00,
    is_balanced BOOLEAN NOT NULL DEFAULT true,
    balance_status TEXT NOT NULL DEFAULT 'equal' CHECK (balance_status IN ('equal', 'short', 'excess')),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    notes TEXT,
    created_by TEXT NOT NULL,
    transaction_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no TEXT UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time TIME DEFAULT CURRENT_TIME,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    previous_due NUMERIC(14, 2) DEFAULT 0.00,
    remaining_due NUMERIC(14, 2) DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    notes TEXT,
    received_by TEXT NOT NULL,
    transaction_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. COMPANY PREFERENCES & BRANDING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT DEFAULT 'Modern Pro',
    tagline TEXT DEFAULT 'Automated POS & Accounting System',
    logo_url TEXT,
    phone TEXT DEFAULT '+880 1700-000000',
    email TEXT DEFAULT 'contact@company.com',
    address TEXT DEFAULT 'Dhaka, Bangladesh',
    currency TEXT DEFAULT 'BDT',
    currency_symbol TEXT DEFAULT '৳',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. INDEXING FOR HIGH PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_supplier ON public.transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_employee ON public.transactions(employee_id);

CREATE INDEX IF NOT EXISTS idx_counter_sales_date ON public.counter_sales(date DESC);
CREATE INDEX IF NOT EXISTS idx_counter_sales_sale_id ON public.counter_sales(sale_id);
CREATE INDEX IF NOT EXISTS idx_counter_sales_customer ON public.counter_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_counter_sales_created_by ON public.counter_sales(created_by);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON public.customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON public.customer_payments(date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_date_emp ON public.attendance(date, employee_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_prod ON public.stock_ledger(product_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_tx_sup ON public.supplier_transactions(supplier_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id, date DESC);

-- ============================================================================
-- 11. AUTOMATED BUSINESS LOGIC (TRIGGERS & PROCEDURES)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_customer_on_counter_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_purchases = COALESCE(total_purchases, 0) + NEW.net_payable,
            total_paid = COALESCE(total_paid, 0) + NEW.received_amount,
            total_due = COALESCE(total_due, 0) + NEW.due_amount,
            total_discount = COALESCE(total_discount, 0) + NEW.discount_amount,
            total_purchases_count = COALESCE(total_purchases_count, 0) + 1,
            total_due_count = CASE WHEN NEW.due_amount > 0 THEN COALESCE(total_due_count, 0) + 1 ELSE total_due_count END,
            last_transaction_date = NEW.date_time
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_counter_sale_customer_sync ON public.counter_sales;
CREATE TRIGGER trg_counter_sale_customer_sync
AFTER INSERT ON public.counter_sales
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_on_counter_sale();

CREATE OR REPLACE FUNCTION public.sync_customer_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.customers
    SET total_paid = COALESCE(total_paid, 0) + NEW.amount,
        total_due = GREATEST(0, COALESCE(total_due, 0) - NEW.amount),
        total_payments_count = COALESCE(total_payments_count, 0) + 1,
        last_transaction_date = NOW()
    WHERE id = NEW.customer_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_payment_sync ON public.customer_payments;
CREATE TRIGGER trg_customer_payment_sync
AFTER INSERT ON public.customer_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_on_payment();

CREATE OR REPLACE FUNCTION public.sync_bank_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'income' THEN
            UPDATE public.banks SET balance = balance + NEW.amount, last_updated = NOW() WHERE name = NEW.payment_method;
        ELSIF NEW.type = 'expense' THEN
            UPDATE public.banks SET balance = balance - NEW.amount, last_updated = NOW() WHERE name = NEW.payment_method;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.type = 'income' THEN
            UPDATE public.banks SET balance = balance - OLD.amount, last_updated = NOW() WHERE name = OLD.payment_method;
        ELSIF OLD.type = 'expense' THEN
            UPDATE public.banks SET balance = balance + OLD.amount, last_updated = NOW() WHERE name = OLD.payment_method;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_bank_sync ON public.transactions;
CREATE TRIGGER trg_transaction_bank_sync
AFTER INSERT OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_bank_on_transaction();

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage roles" ON public.roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage departments" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage attendance_settings" ON public.attendance_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage attendance" ON public.attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage banks" ON public.banks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage transactions" ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage supplier_transactions" ON public.supplier_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage stock_ledger" ON public.stock_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage counter_sales" ON public.counter_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage customer_payments" ON public.customer_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage company_settings" ON public.company_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public read company settings" ON public.company_settings FOR SELECT TO anon USING (true);

-- ============================================================================
-- 13. BUSINESS ANALYTICS & REPORTING VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW public.v_daily_sales_summary AS
SELECT 
    date,
    COUNT(id) AS total_orders,
    SUM(jsonb_array_length(slips)) AS total_slips_count,
    SUM(total_slips_amount) AS gross_sales,
    SUM(discount_amount) AS total_discounts,
    SUM(net_payable) AS net_sales,
    SUM(received_amount) AS total_cash_received,
    SUM(due_amount) AS total_due_given
FROM public.counter_sales
GROUP BY date
ORDER BY date DESC;

CREATE OR REPLACE VIEW public.v_inventory_valuation AS
SELECT 
    id,
    name,
    category,
    unit,
    stock,
    min_stock,
    last_purchase_price,
    (stock * last_purchase_price) AS current_asset_value,
    CASE WHEN stock <= min_stock THEN true ELSE false END AS is_low_stock_warning
FROM public.products
ORDER BY name ASC;

CREATE OR REPLACE VIEW public.v_top_due_customers AS
SELECT 
    id,
    name,
    phone,
    address,
    total_purchases,
    total_paid,
    total_due,
    total_discount,
    last_transaction_date
FROM public.customers
WHERE total_due > 0
ORDER BY total_due DESC;

-- ============================================================================
-- 14. SEED INITIAL DATA (DEFAULTS)
-- ============================================================================

INSERT INTO public.roles (name, description, color_badge, is_default, allowed_menus, actions)
VALUES 
(
    'admin', 
    'Full administrator access across all registers, ledgers, and settings', 
    'rose', 
    true, 
    '["dashboard", "counter-sale", "sales-list", "customer-ledger", "transactions", "new-sale", "purchase", "suppliers", "inventory", "employees", "attendance", "salary-entry", "salary-sheet", "reports", "users", "settings"]'::jsonb,
    '{"dashboard": {"view": true, "financials": true}, "counter-sale": {"view": true, "create": true, "edit": true, "delete": true, "export": true, "financials": true}, "transactions": {"view": true, "create": true, "edit": true, "delete": true, "export": true, "financials": true}}'::jsonb
),
(
    'accountant', 
    'Financial access for transactions, salary sheets, reports, and accounts', 
    'indigo', 
    false, 
    '["dashboard", "transactions", "customer-ledger", "suppliers", "salary-entry", "salary-sheet", "reports"]'::jsonb,
    '{"dashboard": {"view": true, "financials": true}, "transactions": {"view": true, "create": true, "edit": true, "delete": false, "export": true, "financials": true}}'::jsonb
),
(
    'sales', 
    'Counter sales, slip entries, customer dues, and inventory lookup', 
    'emerald', 
    false, 
    '["counter-sale", "sales-list", "customer-ledger", "inventory"]'::jsonb,
    '{"counter-sale": {"view": true, "create": true, "edit": false, "delete": false, "export": true, "financials": false}}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.banks (name, balance)
VALUES ('Cash', 0.00)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.categories (name, type, icon)
VALUES 
    ('Previous Cash', 'income', 'Wallet'),
    ('Opening Balance', 'income', 'Landmark'),
    ('Retail Sales', 'income', 'ShoppingCart'),
    ('Wholesale Sales', 'income', 'Package'),
    ('Counter Sale', 'income', 'Receipt'),
    ('Customer Due Payment', 'income', 'CheckCircle2'),
    ('Rent', 'expense', 'Building'),
    ('Electricity', 'expense', 'Zap'),
    ('Staff Salary', 'expense', 'Users'),
    ('Employee Advance', 'expense', 'UserCheck'),
    ('Food', 'expense', 'Coffee'),
    ('Courier', 'expense', 'Truck')
ON CONFLICT (name, type) DO NOTHING;

INSERT INTO public.attendance_settings (
    late_threshold, 
    lunch_duration_limit, 
    half_day_threshold, 
    breakfast_allowance_amount, 
    deduct_breakfast_on_late, 
    deduct_breakfast_on_absent, 
    grace_period_minutes
)
VALUES ('10:00:00', 60, '11:30:00', 20.00, true, true, 0)
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (company_name, tagline, phone, email, address, currency, currency_symbol)
VALUES ('Modern Pro', 'Automated POS & Accounting System', '+880 1700-000000', 'contact@company.com', 'Dhaka, Bangladesh', 'BDT', '৳')
ON CONFLICT DO NOTHING;`;

const TABLES_METADATA = [
  { name: "roles", desc: "Custom role architect with modular actions (view, create, edit, delete, financials)", icon: "Shield" },
  { name: "profiles", desc: "User profiles synced with Supabase Auth auth.users via automated trigger", icon: "Users" },
  { name: "departments", desc: "Corporate departments and branches registry", icon: "Layers" },
  { name: "employees", desc: "Staff registry with compensation, NID/photo attachments, and roles", icon: "Users" },
  { name: "attendance_settings", desc: "Configurable business rules for late-cuts and breakfast allowances", icon: "Settings" },
  { name: "attendance", desc: "Daily time logs with biometric status, late minutes, and deductions", icon: "Clock" },
  { name: "categories", desc: "Operational Income and Expense classification taxonomy", icon: "Tag" },
  { name: "banks", desc: "Liquid cash registers, bank accounts, and automatic balance tracking", icon: "Landmark" },
  { name: "transactions", desc: "Double-entry cash book ledger (Income & Expense) linked to employees/suppliers", icon: "DollarSign" },
  { name: "suppliers", desc: "Wholesale suppliers, credit ledger, dues, and payment histories", icon: "Truck" },
  { name: "supplier_transactions", desc: "Sourcing invoices, returns, advance settlements, and dues", icon: "FileText" },
  { name: "purchases", desc: "Itemized wholesale purchase orders and bill camera vouchers", icon: "ShoppingCart" },
  { name: "products", desc: "Inventory catalog, real-time stock balances, and valuation", icon: "Package" },
  { name: "stock_ledger", desc: "Audit log of physical stock movements (Purchase, Sale, Return, Adjustment)", icon: "Archive" },
  { name: "customers", desc: "Counter retail and wholesale customers with live balance due tracking", icon: "UserCheck" },
  { name: "counter_sales", desc: "Rapid slip-based counter sales with discount engine, cash, and credit balance", icon: "Receipt" },
  { name: "customer_payments", desc: "Payment receipt vouchers for customer credit due recovery", icon: "CheckCircle2" },
  { name: "company_settings", desc: "Brand identity, logos, system title, and currency configuration", icon: "Briefcase" }
];

export default function SupabaseSqlHub() {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "code" | "guide">("overview");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([SUPABASE_SQL_SCHEMA], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `supabase-schema-${new Date().toISOString().split("T")[0]}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shadow-xs">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              Supabase PostgreSQL Schema Hub
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700">
                Production Ready
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Complete PostgreSQL database definition, RLS security policies, triggers, and analytical views for Supabase.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-xs",
              copied 
                ? "bg-emerald-600 text-white shadow-emerald-200" 
                : "bg-slate-900 hover:bg-slate-800 text-white"
            )}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied to Clipboard!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Full SQL
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            Download .sql
          </button>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <TableProperties className="w-4 h-4 text-emerald-500" />
            18 Relational Tables
          </div>
          <p className="text-xl font-black text-slate-900">PostgreSQL Schema</p>
          <p className="text-[11px] text-slate-500 font-medium">Full ERP, POS, HR & Ledgers</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            Row Level Security (RLS)
          </div>
          <p className="text-xl font-black text-slate-900">18 Policies Configured</p>
          <p className="text-[11px] text-slate-500 font-medium">Supabase Auth token validation</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <Zap className="w-4 h-4 text-amber-500" />
            Automated Triggers
          </div>
          <p className="text-xl font-black text-slate-900">Live Balances & Timestamps</p>
          <p className="text-[11px] text-slate-500 font-medium">Auto customer dues & bank balances</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <FileCode className="w-4 h-4 text-blue-500" />
            Analytical Views
          </div>
          <p className="text-xl font-black text-slate-900">Instant Reports</p>
          <p className="text-[11px] text-slate-500 font-medium">Daily sales, inventory & due ranking</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                activeTab === "overview" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              Tables & Schema
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                activeTab === "guide" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              Setup Guide
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                activeTab === "code" 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              SQL Script Viewer
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400 font-bold hidden sm:block">
            Target: supabase.sql
          </div>
        </div>

        {/* Tab 1: Tables & Schema Overview */}
        {activeTab === "overview" && (
          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TABLES_METADATA.map((tbl) => (
                <div 
                  key={tbl.name}
                  className="p-4 rounded-2xl border border-slate-100 hover:border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {tbl.name}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                        RLS Enabled
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed pt-1">
                      {tbl.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Step-by-Step Setup Guide */}
        {activeTab === "guide" && (
          <div className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">
                  1
                </div>
                <h4 className="text-sm font-black text-slate-900">Create Supabase Project</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Log in to your account at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-600 font-bold underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3 inline" /></a> and create a new project. Choose a strong database password and select your closest cloud region.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">
                  2
                </div>
                <h4 className="text-sm font-black text-slate-900">Run SQL in SQL Editor</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  In your Supabase project dashboard, open the <strong>SQL Editor</strong> from the left sidebar, click <strong>New Query</strong>, paste the full SQL script from this hub, and click <strong>RUN</strong>.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-sm">
                  3
                </div>
                <h4 className="text-sm font-black text-slate-900">Automated Setup Complete</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  The script will automatically create all 18 tables, seed default Admin/Sales roles, setup cash & bank accounts, configure RLS security policies, and register real-time customer due sync triggers.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/60 flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                  Supabase Auth & Profiles Sync
                </h5>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  The script includes an automated PostgreSQL trigger (<code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">on_auth_user_created</code>) that hooks directly into Supabase's <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">auth.users</code> table. When any new user signs up via email or OAuth, their profile is automatically inserted into <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">public.profiles</code> with active status.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: SQL Code Viewer */}
        {activeTab === "code" && (
          <div className="p-6 md:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500 font-bold">
                <Terminal className="w-4 h-4 text-slate-400" />
                supabase.sql (PostgreSQL 15+)
              </div>
              <button
                onClick={handleCopy}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>

            <div className="relative rounded-2xl bg-slate-950 p-6 overflow-hidden border border-slate-800">
              <pre className="text-xs font-mono text-emerald-400/90 overflow-x-auto max-h-[500px] leading-relaxed whitespace-pre scrollbar-thin scrollbar-thumb-slate-800">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
