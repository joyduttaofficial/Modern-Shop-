-- ============================================================================
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
    actions JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"sales": {"view": true, "create": true, "edit": false, "delete": false, "financials": false}}
    color_badge TEXT DEFAULT 'indigo',
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_roles_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.roles IS 'Custom role architect with granular module permissions & actions';

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

-- Trigger to automatically create a Profile entry when a new Auth user signs up
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

-- Attendance Policies & Rules
CREATE TABLE IF NOT EXISTS public.attendance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    late_threshold TIME DEFAULT '10:00:00',
    lunch_duration_limit INTEGER DEFAULT 60, -- minutes
    half_day_threshold TIME DEFAULT '11:30:00',
    breakfast_allowance_amount NUMERIC(10, 2) DEFAULT 20.00,
    deduct_breakfast_on_late BOOLEAN DEFAULT true,
    deduct_breakfast_on_absent BOOLEAN DEFAULT true,
    grace_period_minutes INTEGER DEFAULT 0,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Attendance Log
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
ON CONFLICT DO NOTHING;
