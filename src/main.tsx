import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from "./contexts/LanguageContext.tsx";
import { jsPDF } from "jspdf";

// Detailed Bengali-to-English Romanizer Function to make PDFs readable
export function romanizeBengali(str: string): string {
  if (!str) return "";
  if (!/[\u0980-\u09FF]/.test(str)) return str;

  // Replace exact matches of common business / translation words first
  const exactTranslations: Record<string, string> = {
    "নগদ": "Cash",
    "বিকাশ": "Bkash",
    "রকেট": "Rocket",
    "নগদ ক্যাশ": "Cash",
    "ব্যাংক হিসাব": "Bank",
    "ডিপোজিট": "Deposit",
    "বেতন": "Salary",
    "সালাদ": "Salad",
    "ডাল": "Dal",
    "আলু": "Alu",
    "তেল": "Oil",
    "চাল": "Rice",
    "পিঁয়াজ": "Onion",
    "রসুন": "Garlic",
    "আদা": "Ginger",
    "মরিচ": "Chili",
    "হলুদ": "Turmeric",
    "চিনি": "Sugar",
    "লবণ": "Salt",
    "ডিম": "Egg",
    "দুধ": "Milk",
    "আটা": "Flour",
    "ময়দা": "Flour",
    "সুজি": "Semolina",
    "চা": "Tea",
    "কফি": "Coffee",
    "পানি": "Water",
    "ক্যাশ মেমো": "Cash Memo",
    "অ্যাডমিন": "Admin",
    "অ্যাকাউন্ট্যান্ট": "Accountant",
    "ম্যানেজার": "Manager",
    "বিক্রয় প্রতিনিধি": "Sales Rep",
    "স্টাফ": "Staff",
    "কর্মচারী": "Employee",
    "উপস্থিতি": "Attendance",
    "অনুপস্থিতি": "Absent",
    "ছুটি": "Leave",
    "পে-রোল": "Payroll",
    "অগ্রিম": "Advance",
    "মাসিক": "Monthly",
    "দৈনিক": "Daily",
    "ক্রয়": "Purchase",
    "বিক্রয়": "Sales",
    "আজকের": "Today's",
    "পূর্বের": "Previous",
    "মোট": "Total",
    "ব্যয়": "Expense",
    "খরচ": "Expense",
    "আয়": "Income",
    "কোড": "Code",
    "তারিখ": "Date",
    "অবস্থা": "Status",
    "সম্পন্ন": "Completed",
    "বকেয়া": "Due",
    "বাকি": "Due",
    "পরিশোধ": "Paid",
    "অগ্রিম ব্যালেন্স": "Advance",
    "হিসাব": "Account",
    "অনবোর্ড": "Onboard",
    "রোল": "Role",
    "পদবী": "Designation",
    "বিভাগ": "Dept",
    "নাম": "Name",
    "মোবাইল": "Mobile",
    "মজুরি": "Wages",
    "উপстоя": "Present",
    "বিলম্ব": "Late",
    "হাফ ডে": "Half Day",
    "सरकारी ছুটি": "Holiday",
    "বার": "Day"
  };

  let word = str;
  for (const [bn, eng] of Object.entries(exactTranslations)) {
    const regex = new RegExp(bn, 'g');
    word = word.replace(regex, eng);
  }

  // Phonetic letter mapping for individual glyphs/letters/junctors
  const map: [RegExp, string][] = [
    // Conjuncts and complex modifiers
    [/জ্ঞ/g, "ggyo"],
    [/ক্ষ/g, "kh"],
    [/ষ্ণ/g, "shn"],
    [/হ্ম/g, "hm"],
    [/ক্র/g, "kr"],
    [/ত্র/g, "tr"],
    [/গ্র/g, "gr"],
    [/প্র/g, "pr"],
    [/ভ্র/g, "bhr"],
    [/ম্র/g, "mr"],
    [/শ্র/g, "shr"],
    [/স্প/g, "sp"],
    [/স্ট/g, "st"],
    [/ক্ট/g, "kt"],
    [/ঙ্ক/g, "nk"],
    [/ঙ্গ/g, "ng"],
    [/ম্ন/g, "mn"],
    [/ম্প/g, "mp"],
    [/ম্ভ/g, "mbh"],
    [/ন্দ/g, "nd"],
    [/ন্ত/g, "nt"],
    [/ঞ্চ/g, "nch"],
    [/ঞ্ছ/g, "nchh"],
    [/ঞ্জ/g, "nj"],
    [/ল্ট/g, "lt"],
    [/ল্ড/g, "ld"],
    [/ল্প/g, "lp"],
    [/ল্ফ/g, "lf"],
    [/ল্ব/g, "lb"],
    [/ল্ম/g, "lm"],
    [/ল্ল/g, "ll"],
    [/প্ত/g, "pt"],
    [/প্স/g, "ps"],
    [/ওয/g, "w"],
    [/ওয়/g, "w"],
    [/য়/g, "y"],

    // Vowels
    [/অ/g, "o"],
    [/আ/g, "a"],
    [/ই/g, "i"],
    [/ঈ/g, "i"],
    [/উ/g, "u"],
    [/ঊ/g, "u"],
    [/ঋ/g, "ri"],
    [/এ/g, "e"],
    [/ঐ/g, "oi"],
    [/ও/g, "o"],
    [/ঔ/g, "ou"],

    // Vowel Signs (Kar)
    [/া/g, "a"],
    [/ি/g, "i"],
    [/ী/g, "i"],
    [/ু/g, "u"],
    [/ূ/g, "u"],
    [/ৃ/g, "ri"],
    [/ে/g, "e"],
    [/ৈ/g, "oi"],
    [/ো/g, "o"],
    [/ৌ/g, "ou"],
    [/ৗ/g, "o"],

    // Consonants
    [/ক/g, "k"],
    [/খ/g, "kh"],
    [/গ/g, "g"],
    [/ঘ/g, "gh"],
    [/ঙ/g, "ng"],
    [/চ/g, "ch"],
    [/ছ/g, "chh"],
    [/জ/g, "j"],
    [/ঝ/g, "jh"],
    [/ঞ/g, "n"],
    [/ট/g, "t"],
    [/ঠ/g, "th"],
    [/ড/g, "d"],
    [/ঢ/g, "dh"],
    [/ণ/g, "n"],
    [/ত/g, "t"],
    [/থ/g, "th"],
    [/দ/g, "d"],
    [/ধ/g, "dh"],
    [/ন/g, "n"],
    [/প/g, "p"],
    [/ফ/g, "f"],
    [/ব/g, "b"],
    [/ভ/g, "bh"],
    [/ম/g, "m"],
    [/য/g, "z"],
    [/র/g, "r"],
    [/ল/g, "l"],
    [/শ/g, "sh"],
    [/ष/g, "sh"],
    [/স/g, "s"],
    [/হ/g, "h"],
    [/ড়/g, "r"],
    [/ঢ়/g, "r"],
    [/ৎ/g, "t"],

    // Other symbols and signs
    [/ং/g, "ng"],
    [/ঃ/g, "h"],
    [/ঁ/g, "n"],
    [/্য/g, "y"],
    [/্র/g, "r"],
    [/র্/g, "r"],
    [/্/g, ""],

    // Bangla Digits
    [/০/g, "0"],
    [/১/g, "1"],
    [/২/g, "2"],
    [/৩/g, "3"],
    [/৪/g, "4"],
    [/৫/g, "5"],
    [/৬/g, "6"],
    [/৭/g, "7"],
    [/৮/g, "8"],
    [/৯/g, "9"],
    [/৳/g, "BDT "]
  ];

  for (const [regex, replacement] of map) {
    word = word.replace(regex, replacement);
  }

  return word.replace(/\b\w/g, c => c.toUpperCase());
}

// Monkey patch jsPDF routines to guarantee zero unicode artifacts/boxes
const originalText = jsPDF.prototype.text;
jsPDF.prototype.text = function(text: any, x: any, y: any, options: any) {
  if (typeof text === 'string') {
    text = romanizeBengali(text);
  } else if (Array.isArray(text)) {
    text = text.map(t => typeof t === 'string' ? romanizeBengali(t) : t);
  }
  return originalText.call(this, text, x, y, options);
};

const originalGetTextWidth = jsPDF.prototype.getTextWidth;
jsPDF.prototype.getTextWidth = function(text: string) {
  if (typeof text === 'string') {
    text = romanizeBengali(text);
  }
  return originalGetTextWidth.call(this, text);
};

const originalGetStringUnitWidth = (jsPDF.prototype as any).getStringUnitWidth;
if (originalGetStringUnitWidth) {
  (jsPDF.prototype as any).getStringUnitWidth = function(text: string) {
    if (typeof text === 'string') {
      text = romanizeBengali(text);
    }
    return originalGetStringUnitWidth.call(this, text);
  };
}

// Safe confirm & alert fallbacks for sandboxed iframes
const originalConfirm = window.confirm;
window.confirm = function (message?: string): boolean {
  try {
    return originalConfirm.call(window, message);
  } catch (e) {
    console.warn("window.confirm was blocked by sandbox. Defaulting to true.", e);
    return true; // Default to true inside sandboxed iframes to prevent blocking user deletions/edits
  }
};

const originalAlert = window.alert;
window.alert = function (message?: any): void {
  try {
    originalAlert.call(window, message);
  } catch (e) {
    console.warn("window.alert was blocked by sandbox. Message:", message, e);
  }
};

// Suppress benign WebSocket/HMR errors to prevent full-screen unhandled rejection popups
window.addEventListener('error', (event) => {
  const msg = event?.message || "";
  if (
    msg.includes('WebSocket') ||
    msg.includes('websocket') ||
    msg.includes('vite') ||
    msg.includes('HMR')
  ) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason;
  if (reason) {
    const msg = typeof reason === 'string' ? reason : (reason.message || '');
    if (
      msg.includes('WebSocket') ||
      msg.includes('websocket') ||
      msg.includes('vite') ||
      msg.includes('HMR')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
