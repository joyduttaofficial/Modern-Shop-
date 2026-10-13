import { Router, Request, Response } from "express";
import { Pool } from "pg";

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Joy@398878j@db.qwqdjdvxzljuhyczemub.supabase.co:5432/postgres";

export const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
});

export const dbRouter = Router();

// Cache table columns from PostgreSQL information_schema
const tableColumnsCache: Record<string, Set<string>> = {};

function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
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

export function rowToCamel(row: Record<string, any>): Record<string, any> {
  if (!row || typeof row !== "object") return row;
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    res[k] = v;
    const camel = toCamel(k);
    if (camel !== k) {
      res[camel] = v;
    }
  }
  return res;
}

interface TableInfo {
  cols: Set<string>;
  types: Record<string, string>;
}

const tableInfoCache: Record<string, TableInfo> = {};
const inFlightTableInfo: Record<string, Promise<TableInfo>> = {};

async function getTableInfo(tableName: string): Promise<TableInfo> {
  if (tableInfoCache[tableName]) {
    return tableInfoCache[tableName];
  }
  if (inFlightTableInfo[tableName]) {
    return inFlightTableInfo[tableName];
  }
  inFlightTableInfo[tableName] = (async () => {
    try {
      const q = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      );
      const cols = new Set<string>(q.rows.map(r => r.column_name));
      const types: Record<string, string> = {};
      for (const r of q.rows) {
        types[r.column_name] = r.data_type;
      }
      const info = { cols, types };
      tableInfoCache[tableName] = info;
      return info;
    } finally {
      delete inFlightTableInfo[tableName];
    }
  })();
  return inFlightTableInfo[tableName];
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const info = await getTableInfo(tableName);
  return info.cols;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 1. GET /api/db/status - Overview of all tables & live connection check
dbRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const tables = [
      "roles",
      "banks",
      "categories",
      "employees",
      "counter_sales",
      "customer_payments",
      "customers",
      "suppliers",
      "supplier_transactions",
      "purchases",
      "transactions",
      "activity_notifications",
      "company_settings",
      "attendance",
      "products",
      "stock_ledger",
    ];
    // Run single combined query for speed
    const selectFragments = tables.map(t => `(SELECT COUNT(*) FROM public.${t}) AS "${t}"`).join(", ");
    const qRes = await pool.query(`SELECT ${selectFragments}`);
    const counts: Record<string, number> = {};
    if (qRes.rows.length > 0) {
      for (const t of tables) {
        counts[t] = parseInt(qRes.rows[0][t] || 0, 10);
      }
    }
    res.json({
      success: true,
      database: "Supabase PostgreSQL",
      host: "db.qwqdjdvxzljuhyczemub.supabase.co",
      counts,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Clear all activity notifications
dbRouter.post("/clear-all-notifications", async (_req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM public.activity_notifications");
    res.json({ success: true, message: "All activity notifications cleared." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// 2. GET /api/db/:table - Query records with filters, search, limit, and order
dbRouter.get("/:table", async (req: Request, res: Response) => {
  try {
    const rawTable = req.params.table;
    const tableName = normalizeTableName(rawTable);
    const validColumns = await getTableColumns(tableName);

    if (validColumns.size === 0) {
      // Table doesn't exist in PostgreSQL, return empty array
      return res.json([]);
    }

    // Special handling for company_settings: only return the single latest record
    if (tableName === "company_settings") {
      const qRes = await pool.query(
        "SELECT * FROM public.company_settings ORDER BY updated_at DESC LIMIT 1"
      );
      return res.json(qRes.rows.map(rowToCamel));
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5000;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const orderDir = String(req.query.orderDir || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

    let orderByCol = "created_at";
    if (req.query.orderBy) {
      const candidate = toSnake(String(req.query.orderBy));
      if (validColumns.has(candidate)) {
        orderByCol = candidate;
      }
    } else if (validColumns.has("date")) {
      orderByCol = "date";
    } else if (validColumns.has("timestamp")) {
      orderByCol = "timestamp";
    } else if (validColumns.has("created_at")) {
      orderByCol = "created_at";
    } else if (validColumns.has("id")) {
      orderByCol = "id";
    }

    // Build WHERE clause
    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Filter by employee_id, supplier_id, status, type, etc.
    for (const [key, val] of Object.entries(req.query)) {
      if (["limit", "offset", "orderBy", "orderDir", "search"].includes(key)) continue;
      const snakeKey = toSnake(key);
      if (validColumns.has(snakeKey) && val !== undefined && val !== "") {
        whereClauses.push(`${snakeKey} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const orderStr = validColumns.has(orderByCol) ? `ORDER BY ${orderByCol} ${orderDir}` : "";
    const limitStr = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : "";

    const queryStr = `SELECT * FROM public.${tableName} ${whereStr} ${orderStr} ${limitStr};`;
    const qRes = await pool.query(queryStr, values);

    const mapped = qRes.rows.map(rowToCamel);
    res.json(mapped);
  } catch (err: any) {
    console.error(`Error querying ${req.params.table}:`, err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 3. GET /api/db/:table/:id - Retrieve single record
dbRouter.get("/:table/:id", async (req: Request, res: Response) => {
  try {
    const rawTable = req.params.table;
    const tableName = normalizeTableName(rawTable);
    const id = req.params.id;

    const qRes = await pool.query(
      `SELECT * FROM public.${tableName} WHERE id::text = $1 LIMIT 1`,
      [id]
    );

    if (qRes.rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json(rowToCamel(qRes.rows[0]));
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 4. POST /api/db/:table - Insert single record
dbRouter.post("/:table", async (req: Request, res: Response) => {
  try {
    const rawTable = req.params.table;
    const tableName = normalizeTableName(rawTable);
    const { cols: validColumns, types: colTypes } = await getTableInfo(tableName);
    const body = req.body || {};

    if (validColumns.size === 0) {
      return res.status(400).json({ error: `Table public.${tableName} does not exist.` });
    }

    // Special handling for company_settings: update latest if exists, else insert
    if (tableName === "company_settings") {
      const existing = await pool.query("SELECT id FROM public.company_settings ORDER BY updated_at DESC LIMIT 1");
      if (existing.rows.length > 0) {
        const existingId = existing.rows[0].id;
        const setCols: string[] = [];
        const updateVals: any[] = [];
        let pIdx = 1;
        for (const [k, v] of Object.entries(body)) {
          const snakeK = toSnake(k);
          if (snakeK !== "id" && validColumns.has(snakeK)) {
            setCols.push(`${snakeK} = $${pIdx}`);
            pIdx++;
            updateVals.push(v);
          }
        }
        setCols.push(`updated_at = NOW()`);
        updateVals.push(existingId);
        const upRes = await pool.query(
          `UPDATE public.company_settings SET ${setCols.join(", ")} WHERE id = $${pIdx} RETURNING *`,
          updateVals
        );
        return res.status(200).json(rowToCamel(upRes.rows[0]));
      }
    }

    // Apply smart defaults for required NOT NULL columns if omitted
    if (tableName === "profiles") {
      if (!body.email) body.email = "modern@admin.com";
      if (!body.displayName && !body.display_name) body.display_name = "User";
      if (!body.role) body.role = "admin";
      if (!body.status) body.status = "active";
    } else if (tableName === "transactions") {
      if (!body.createdBy && !body.created_by) body.created_by = "admin";
      if (!body.type) body.type = "expense";
      if (!body.category) body.category = "General";
      if (body.amount === undefined || body.amount === null) body.amount = 0;
      if (!body.date) body.date = new Date().toISOString();
    } else if (tableName === "counter_sales") {
      if (!body.saleId && !body.sale_id) body.sale_id = `CS-${Date.now()}`;
      if (!body.createdBy && !body.created_by) body.created_by = "admin";
      if (!body.dateTime && !body.date_time) body.date_time = new Date().toISOString();
    } else if (tableName === "activity_notifications") {
      if (!body.userId && !body.user_id) body.user_id = "admin";
      if (!body.userName && !body.user_name) body.user_name = "User";
      if (!body.userEmail && !body.user_email) body.user_email = "user@system.local";
      if (!body.menuId && !body.menu_id) body.menu_id = "general";
      if (!body.menuLabel && !body.menu_label) body.menu_label = "General";
      if (!body.action) body.action = "create";
      if (!body.title) body.title = "Activity";
      if (!body.note) body.note = "Activity performed";
    } else if (tableName === "purchases") {
      if (!body.supplierName && !body.supplier_name) body.supplier_name = "General Supplier";
      if (!body.refNo && !body.ref_no) body.ref_no = `PUR-${Date.now()}`;
    } else if (tableName === "supplier_transactions") {
      if (!body.refNo && !body.ref_no) body.ref_no = `TX-${Date.now()}`;
      if (!body.type) body.type = "payment";
    } else if (tableName === "customer_payments") {
      if (!body.receivedBy && !body.received_by) body.received_by = "admin";
      if (!body.customerName && !body.customer_name) body.customer_name = "Customer";
    } else if (tableName === "suppliers") {
      if (!body.code) body.code = `S-${Date.now().toString().slice(-4)}`;
    }

    const cols: string[] = [];
    const placeholders: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [k, v] of Object.entries(body)) {
      const snakeK = toSnake(k);
      // If primary key is id and table uses UUID and provided value is not valid UUID, skip it so gen_random_uuid() triggers!
      if (snakeK === "id") {
        const idColType = colTypes["id"];
        if (idColType === "uuid" && typeof v === "string" && !UUID_REGEX.test(v)) {
          continue;
        }
      }

      if (validColumns.has(snakeK)) {
        cols.push(snakeK);
        placeholders.push(`$${paramIndex}`);
        paramIndex++;

        // Handle JSONB objects/arrays or numbers
        if (typeof v === "object" && v !== null && !(v instanceof Date)) {
          values.push(JSON.stringify(v));
        } else {
          values.push(v);
        }
      }
    }

    if (cols.length === 0) {
      return res.status(400).json({ error: "No valid columns provided in request body." });
    }

    // Support upsert on conflict
    let onConflict = "";
    if (tableName === "counter_sales" && body.saleId) {
      onConflict = `ON CONFLICT (sale_id) DO UPDATE SET updated_at = NOW()`;
    } else if (validColumns.has("id") && cols.includes("id")) {
      const updateFields = cols
        .filter(c => c !== "id")
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(", ");
      if (updateFields.length > 0) {
        onConflict = `ON CONFLICT (id) DO UPDATE SET ${updateFields}${validColumns.has("updated_at") ? ", updated_at = NOW()" : ""}`;
      } else {
        onConflict = `ON CONFLICT (id) DO NOTHING`;
      }
    }

    const insertSql = `
      INSERT INTO public.${tableName} (${cols.join(", ")})
      VALUES (${placeholders.join(", ")})
      ${onConflict}
      RETURNING *;
    `;

    const qRes = await pool.query(insertSql, values);
    const createdRow = rowToCamel(qRes.rows[0]);
    res.status(201).json(createdRow);
  } catch (err: any) {
    console.error(`Error inserting into ${req.params.table}:`, err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 5. PUT /api/db/:table/:id - Update or upsert record
dbRouter.put("/:table/:id", async (req: Request, res: Response) => {
  try {
    const rawTable = req.params.table;
    const tableName = normalizeTableName(rawTable);
    const { cols: validColumns, types: colTypes } = await getTableInfo(tableName);
    const id = req.params.id;
    const body = req.body || {};

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [k, v] of Object.entries(body)) {
      if (k === "id") continue;
      const snakeK = toSnake(k);
      if (validColumns.has(snakeK)) {
        setClauses.push(`${snakeK} = $${paramIndex}`);
        paramIndex++;
        if (typeof v === "object" && v !== null && !(v instanceof Date)) {
          values.push(JSON.stringify(v));
        } else {
          values.push(v);
        }
      }
    }

    if (validColumns.has("updated_at")) {
      setClauses.push(`updated_at = NOW()`);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    values.push(id);
    const idParam = `$${paramIndex}`;

    // Try update by id, and if counter_sales try sale_id too
    const updateSql = `
      UPDATE public.${tableName}
      SET ${setClauses.join(", ")}
      WHERE id::text = ${idParam} ${validColumns.has("sale_id") ? `OR sale_id = ${idParam}` : ""}
      RETURNING *;
    `;

    const qRes = await pool.query(updateSql, values);
    if (qRes.rows.length === 0) {
      // Upsert: record not found to update, insert it!
      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      let iIdx = 1;

      // Handle ID
      const idColType = colTypes["id"];
      if (idColType !== "uuid" || UUID_REGEX.test(id)) {
        insertCols.push("id");
        insertPlaceholders.push(`$${iIdx}`);
        insertValues.push(id);
        iIdx++;
      }

      for (const [k, v] of Object.entries(body)) {
        if (k === "id") continue;
        const snakeK = toSnake(k);
        if (validColumns.has(snakeK) && !insertCols.includes(snakeK)) {
          insertCols.push(snakeK);
          insertPlaceholders.push(`$${iIdx}`);
          iIdx++;
          if (typeof v === "object" && v !== null && !(v instanceof Date)) {
            insertValues.push(JSON.stringify(v));
          } else {
            insertValues.push(v);
          }
        }
      }

      // Smart defaults if inserting new row into profiles
      if (tableName === "profiles") {
        if (!insertCols.includes("email")) {
          insertCols.push("email");
          insertPlaceholders.push(`$${iIdx++}`);
          insertValues.push("modern@admin.com");
        }
        if (!insertCols.includes("display_name")) {
          insertCols.push("display_name");
          insertPlaceholders.push(`$${iIdx++}`);
          insertValues.push("User");
        }
        if (!insertCols.includes("role")) {
          insertCols.push("role");
          insertPlaceholders.push(`$${iIdx++}`);
          insertValues.push("admin");
        }
        if (!insertCols.includes("status")) {
          insertCols.push("status");
          insertPlaceholders.push(`$${iIdx++}`);
          insertValues.push("active");
        }
      }

      if (validColumns.has("created_at") && !insertCols.includes("created_at")) {
        insertCols.push("created_at");
        insertPlaceholders.push("NOW()");
      }
      if (validColumns.has("updated_at") && !insertCols.includes("updated_at")) {
        insertCols.push("updated_at");
        insertPlaceholders.push("NOW()");
      }

      const insSql = `
        INSERT INTO public.${tableName} (${insertCols.join(", ")})
        VALUES (${insertPlaceholders.join(", ")})
        RETURNING *;
      `;
      const insRes = await pool.query(insSql, insertValues);
      return res.status(200).json(rowToCamel(insRes.rows[0]));
    }

    res.json(rowToCamel(qRes.rows[0]));
  } catch (err: any) {
    console.error(`Error updating ${req.params.table}:`, err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 6. DELETE /api/db/:table/:id - Delete record
dbRouter.delete("/:table/:id", async (req: Request, res: Response) => {
  try {
    const rawTable = req.params.table;
    const tableName = normalizeTableName(rawTable);
    const validColumns = await getTableColumns(tableName);
    const id = req.params.id;

    const deleteSql = `
      DELETE FROM public.${tableName}
      WHERE id::text = $1 ${validColumns.has("sale_id") ? "OR sale_id = $1" : ""}
      RETURNING id;
    `;

    const qRes = await pool.query(deleteSql, [id]);
    res.json({ success: true, deletedCount: qRes.rowCount });
  } catch (err: any) {
    console.error(`Error deleting from ${req.params.table}:`, err);
    res.status(500).json({ error: err.message || String(err) });
  }
});
