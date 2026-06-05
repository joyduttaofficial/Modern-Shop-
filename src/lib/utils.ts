import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { PurchaseModel, SupplierTransaction, Supplier } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function computeDynamicPurchases(
  purchases: PurchaseModel[],
  supplierTransactions: SupplierTransaction[],
  suppliers: Supplier[]
): PurchaseModel[] {
  // Map to hold payments and returns for each supplier
  const supplierPaymentsMap = new Map<string, number>();
  const supplierReturnsMap = new Map<string, number>();

  supplierTransactions.forEach((tx) => {
    if (tx.type === "payment") {
      const current = supplierPaymentsMap.get(tx.supplierId) || 0;
      supplierPaymentsMap.set(tx.supplierId, current + (tx.totalAmount || 0));
    } else if (tx.type === "return") {
      const isAutoCompanion = tx.refNo?.startsWith("RET-PUR-") || tx.notes?.includes("Auto adjustment on purchase");
      const isDueAdjusted = tx.notes?.includes("Automatically adjusted from due") || tx.paymentMethod === "Due Adjusted";
      if (!isAutoCompanion && isDueAdjusted) {
        const current = supplierReturnsMap.get(tx.supplierId) || 0;
        supplierReturnsMap.set(tx.supplierId, current + (tx.totalAmount || 0));
      }
    }
  });

  // Group purchases by supplier to process each supplier's account independently
  const purchasesBySupplier = new Map<string, PurchaseModel[]>();
  purchases.forEach((p) => {
    if (!p.id) return;
    if (!purchasesBySupplier.has(p.supplierId)) {
      purchasesBySupplier.set(p.supplierId, []);
    }
    purchasesBySupplier.get(p.supplierId)!.push({ ...p });
  });

  const updatedPurchasesMap = new Map<string, PurchaseModel>();

  purchasesBySupplier.forEach((pList, supplierId) => {
    // Sort oldest first (FIFO billing)
    pList.sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    const supplier = suppliers.find((s) => s.id === supplierId);
    let opBal = supplier?.openingBalance || 0;

    const payPool = supplierPaymentsMap.get(supplierId) || 0;
    const retPool = supplierReturnsMap.get(supplierId) || 0;
    let totalPool = payPool + retPool;

    // Deduct the pool to clear supplier's opening balance first (if any)
    if (opBal > 0) {
      if (totalPool >= opBal) {
        totalPool -= opBal;
        opBal = 0;
      } else {
        opBal -= totalPool;
        totalPool = 0;
      }
    }

    // Now distribute remaining payment pool across purchases chronologically (FIFO)
    pList.forEach((p) => {
      // If we have general payments left, apply them to reduce purchase due amount
      if (totalPool > 0) {
        const origDue = p.dueAmount;
        if (totalPool >= origDue) {
          totalPool -= origDue;
          p.paidAmount = p.paidAmount + origDue;
          p.dueAmount = 0;
        } else {
          p.paidAmount = p.paidAmount + totalPool;
          p.dueAmount = origDue - totalPool;
          totalPool = 0;
        }
      }
      if (p.id) updatedPurchasesMap.set(p.id, p);
    });
  });

  // Re-map the original purchases back to retain their original presentation order
  return purchases.map((originalPurchase) => {
    if (originalPurchase.id && updatedPurchasesMap.has(originalPurchase.id)) {
      return updatedPurchasesMap.get(originalPurchase.id)!;
    }
    return originalPurchase;
  });
}


const NUMBN = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function formatNumberDirect(num: number | string): string {
  if (num === undefined || num === null) return "";
  const str = String(num);
  const isBn = typeof window !== "undefined" && localStorage.getItem("selected_language") === "bn";
  if (!isBn) return str;
  return str.replace(/[0-9]/g, (digit) => NUMBN[parseInt(digit, 10)]);
}

export function formatCurrency(amount: number) {
  const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  const isBn = typeof window !== "undefined" && localStorage.getItem("selected_language") === "bn";
  
  const formattedEn = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  if (isBn) {
    return "৳" + formatNumberDirect(formattedEn);
  }
  return "৳" + formattedEn;
}
