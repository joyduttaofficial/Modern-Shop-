import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as dateFnsFormat } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function safeFormat(date: any, formatStr: string, fallback: string = ""): string {
  if (!date) return fallback;
  try {
    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else {
      d = new Date(date);
    }
    if (isNaN(d.getTime())) {
      return fallback;
    }
    return dateFnsFormat(d, formatStr);
  } catch (err) {
    return fallback;
  }
}

