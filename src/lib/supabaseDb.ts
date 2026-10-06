import { getSupabase, isSupabaseConfigured } from "./supabase";
import { 
  CounterSale, 
  Transaction, 
  CustomerProfile, 
  CustomerPayment, 
  Product, 
  Supplier, 
  Employee, 
  Attendance,
  ActivityNotification 
} from "../types";

/**
 * Service for executing direct PostgreSQL CRUD operations on Supabase
 */

// ============================================================================
// COUNTER SALES
// ============================================================================

export async function saveCounterSaleToSupabase(sale: CounterSale): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "Supabase client is not configured" };

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

    const { data, error } = await supabase
      .from("counter_sales")
      .upsert(saleRow, { onConflict: "sale_id" })
      .select()
      .single();

    if (error) {
      console.warn("Supabase counter_sales error:", error);
      return { success: false, error: error.message };
    }

    // 1. If receivedAmount > 0, log income transaction in transactions table
    if (Number(sale.receivedAmount) > 0) {
      const txRow = {
        date: saleRow.date_time,
        type: "income",
        category: "Counter Sale",
        sub_category: "Retail Counter Slip",
        amount: Number(sale.receivedAmount),
        payment_method: sale.paymentMethod || "Cash",
        notes: `Counter Sale [${sale.saleId}] - ${sale.slips?.length || 0} Slips | প্রদেয়: ৳${sale.netPayable} | প্রাপ্ত: ৳${sale.receivedAmount} | বকেয়া: ৳${sale.dueAmount}`,
        created_by: sale.createdBy || "admin",
      };
      const { data: txData } = await supabase.from("transactions").insert(txRow).select().single();
      if (txData && txData.id) {
        await supabase.from("counter_sales").update({ transaction_id: txData.id }).eq("sale_id", sale.saleId);
      }
    }

    // 2. If customer specified, update or create in customers table
    if (sale.customerName && sale.customerName.trim()) {
      const cName = sale.customerName.trim();
      const { data: existingCust } = await supabase
        .from("customers")
        .select("*")
        .eq("name", cName)
        .maybeSingle();

      if (existingCust) {
        await supabase
          .from("customers")
          .update({
            total_purchases: Number(existingCust.total_purchases || 0) + Number(sale.netPayable || 0),
            total_paid: Number(existingCust.total_paid || 0) + Number(sale.receivedAmount || 0),
            total_due: Number(existingCust.total_due || 0) + Number(sale.dueAmount || 0),
            total_discount: Number(existingCust.total_discount || 0) + Number(sale.discountAmount || 0),
            total_purchases_count: Number(existingCust.total_purchases_count || 0) + 1,
            total_due_count: Number(sale.dueAmount || 0) > 0 ? Number(existingCust.total_due_count || 0) + 1 : Number(existingCust.total_due_count || 0),
            last_transaction_date: saleRow.date_time,
          })
          .eq("id", existingCust.id);
      } else {
        await supabase.from("customers").insert({
          name: cName,
          phone: sale.customerPhone || null,
          address: sale.customerAddress || null,
          total_purchases: Number(sale.netPayable || 0),
          total_paid: Number(sale.receivedAmount || 0),
          total_due: Number(sale.dueAmount || 0),
          total_discount: Number(sale.discountAmount || 0),
          total_purchases_count: 1,
          total_due_count: Number(sale.dueAmount || 0) > 0 ? 1 : 0,
          total_payments_count: Number(sale.receivedAmount || 0) > 0 ? 1 : 0,
          last_transaction_date: saleRow.date_time,
        });
      }
    }

    return { success: true, data };
  } catch (err) {
    console.error("saveCounterSaleToSupabase failed:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteCounterSaleFromSupabase(saleId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "Supabase client is not configured" };

  try {
    const { data: saleData } = await supabase
      .from("counter_sales")
      .select("*")
      .eq("sale_id", saleId)
      .maybeSingle();

    if (saleData) {
      // Revert customer balance if applicable
      if (saleData.customer_name) {
        const { data: cust } = await supabase
          .from("customers")
          .select("*")
          .eq("name", saleData.customer_name)
          .maybeSingle();

        if (cust) {
          await supabase
            .from("customers")
            .update({
              total_purchases: Math.max(0, Number(cust.total_purchases || 0) - Number(saleData.net_payable || 0)),
              total_paid: Math.max(0, Number(cust.total_paid || 0) - Number(saleData.received_amount || 0)),
              total_due: Math.max(0, Number(cust.total_due || 0) - Number(saleData.due_amount || 0)),
            })
            .eq("id", cust.id);
        }
      }

      // Delete matching transaction if any
      if (saleData.transaction_id) {
        await supabase.from("transactions").delete().eq("id", saleData.transaction_id);
      }
    }

    const { error } = await supabase.from("counter_sales").delete().eq("sale_id", saleId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// TRANSACTIONS
// ============================================================================

export async function saveTransactionToSupabase(tx: Transaction): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "Supabase client is not configured" };

  try {
    const txRow = {
      date: tx.date || new Date().toISOString(),
      type: tx.type || "expense",
      category: tx.category || "General",
      sub_category: tx.subCategory || null,
      amount: Number(tx.amount || 0),
      payment_method: tx.paymentMethod || "Cash",
      notes: tx.notes || null,
      created_by: tx.createdBy || "admin",
    };

    const { data, error } = await supabase.from("transactions").insert(txRow).select().single();
    if (error) return { success: false, error: error.message };

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteTransactionFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "Supabase client is not configured" };

  try {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// CUSTOMER PAYMENTS (DUE CLEARANCE)
// ============================================================================

export async function saveCustomerPaymentToSupabase(payment: CustomerPayment): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "Supabase client is not configured" };

  try {
    const paymentRow = {
      customer_id: payment.customerId,
      customer_name: payment.customerName,
      customer_phone: payment.customerPhone || null,
      customer_address: payment.customerAddress || null,
      date: payment.date || new Date().toISOString().substring(0, 10),
      time: payment.time || "12:00:00",
      amount: Number(payment.amount || 0),
      previous_due: Number(payment.previousDue || 0),
      remaining_due: Number(payment.remainingDue || 0),
      payment_method: payment.paymentMethod || "Cash",
      notes: payment.notes || null,
      received_by: payment.receivedBy || "admin",
      receipt_no: payment.receiptNo || null,
      transaction_id: payment.transactionId || null,
    };

    const { data, error } = await supabase.from("customer_payments").insert(paymentRow).select().single();
    if (error) return { success: false, error: error.message };

    // Record in transactions
    const txRow = {
      date: new Date().toISOString(),
      type: "income",
      category: "Customer Due Payment",
      sub_category: "Credit Realization",
      amount: Number(payment.amount),
      payment_method: payment.paymentMethod || "Cash",
      notes: `Due Payment received from ${payment.customerName} (Receipt: ${payment.receiptNo || "N/A"})`,
      created_by: payment.receivedBy || "admin",
    };
    await supabase.from("transactions").insert(txRow);

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// ACTIVITY NOTIFICATIONS
// ============================================================================

export async function saveActivityNotificationToSupabase(notification: ActivityNotification): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "Supabase client is not configured" };

  try {
    const row = {
      user_id: notification.userId || "system",
      user_name: notification.userName || "User",
      user_email: notification.userEmail || "",
      user_role: notification.userRole || "user",
      user_photo: notification.userPhoto || null,
      menu_id: notification.menuId,
      menu_label: notification.menuLabel,
      action: notification.action,
      title: notification.title,
      note: notification.note,
      metadata: notification.metadata || {},
      is_read: false,
      timestamp: notification.timestamp || new Date().toISOString(),
    };

    const { error } = await supabase.from("activity_notifications").insert(row);
    if (error) {
      console.warn("Supabase activity_notifications insert warning:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// FETCH HELPERS
// ============================================================================

export async function fetchSupabaseCounterSales(): Promise<CounterSale[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("counter_sales")
      .select("*")
      .order("date_time", { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      saleId: r.sale_id,
      dailySerial: r.daily_serial,
      dateTime: r.date_time,
      date: r.date,
      time: r.time,
      slips: r.slips || [],
      totalSlipsAmount: Number(r.total_slips_amount || 0),
      discountType: r.discount_type,
      discountPercent: Number(r.discount_percent || 0),
      discountAmount: Number(r.discount_amount || 0),
      netPayable: Number(r.net_payable || 0),
      receivedAmount: Number(r.received_amount || 0),
      changeAmount: Number(r.change_amount || 0),
      dueAmount: Number(r.due_amount || 0),
      isBalanced: Boolean(r.is_balanced),
      balanceStatus: r.balance_status,
      paymentMethod: r.payment_method,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerAddress: r.customer_address,
      notes: r.notes,
      createdBy: r.created_by,
      transactionId: r.transaction_id,
      createdAt: r.created_at
    }));
  } catch (e) {
    console.warn("fetchSupabaseCounterSales error:", e);
    return [];
  }
}

export async function fetchSupabaseCustomers(): Promise<CustomerProfile[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      address: r.address,
      totalPurchases: Number(r.total_purchases || 0),
      totalPaid: Number(r.total_paid || 0),
      totalDue: Number(r.total_due || 0),
      totalDiscount: Number(r.total_discount || 0),
      totalPurchasesCount: Number(r.total_purchases_count || 0),
      totalDueCount: Number(r.total_due_count || 0),
      totalPaymentsCount: Number(r.total_payments_count || 0),
      lastTransactionDate: r.last_transaction_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } catch (e) {
    console.warn("fetchSupabaseCustomers error:", e);
    return [];
  }
}

export async function fetchSupabaseTransactions(): Promise<Transaction[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      date: r.date,
      type: r.type,
      category: r.category,
      subCategory: r.sub_category,
      amount: Number(r.amount || 0),
      paymentMethod: r.payment_method,
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: r.created_at
    }));
  } catch (e) {
    console.warn("fetchSupabaseTransactions error:", e);
    return [];
  }
}

export async function fetchSupabaseActivityNotifications(): Promise<ActivityNotification[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("activity_notifications")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      userRole: r.user_role,
      userPhoto: r.user_photo,
      menuId: r.menu_id,
      menuLabel: r.menu_label,
      action: r.action,
      title: r.title,
      note: r.note,
      metadata: r.metadata || {},
      timestamp: r.timestamp,
      createdAt: r.created_at,
      readBy: r.read_by || []
    }));
  } catch (e) {
    console.warn("fetchSupabaseActivityNotifications error:", e);
    return [];
  }
}
