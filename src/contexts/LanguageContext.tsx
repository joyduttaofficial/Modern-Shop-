import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "bn";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translateValue: (text: string) => string;
  formatNumber: (num: number | string) => string;
  formatDate: (dateStr: string | Date | undefined) => string;
  formatCurrency: (amount: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// A deep dictionary mapping the full system strings from English to Bangla
const dictionary: Record<string, string> = {
  // Navigation & Menus
  "Modern Pro": "মডার্ন প্রো",
  "Automated POS": "স্বয়ংক্রিয় পস",
  "Dashboard": "ড্যাশবোর্ড",
  "Transactions": "লেনদেন",
  "Quick Cash Memo": "ক্যাশ মেমো",
  "Sales Ledger": "বিক্রয় খতিয়ান",
  "Invoices & Sales": "ইনভয়েস ও বিক্রয়",
  "New Sale": "নতুন বিক্রয়",
  "Staff & Payroll": "স্টাফ ও পে-রোল",
  "New Employee": "নতুন কর্মচারী",
  "Salary Sheet": "বেতন বাট্টা তালিকা",
  "Employees List": "কর্মচারী তালিকা",
  "Salary Entry": "বেতন ভুক্তি",
  "Add Attendance": "উপস্থিতি দিন",
  "Attendance List": "উপস্থিতি বই",
  "Suppliers & Purchase": "সরবরাহকারী ও ক্রয়",
  "New Supplier": "নতুন সরবরাহকারী",
  "Suppliers List": "সরবরাহকারী খতিয়ান",
  "New Purchase": "নতুন ক্রয়",
  "Purchase List": "ক্রয় খতিয়ান",
  "Reports": "প্রতিবেদন সূচী",
  "daily": "দৈনিক বিবরণী",
  "bank": "ব্যাংক বিবরণী",
  "salary": "বেতন বিবরণী",
  "supplier": "সরবরাহকারী খতিয়ান",
  "purchase": "ক্রয় খতিয়ান",
  "attendance": "উপস্থিতি বিবরণী",
  "transactions": "লেনদেন খতিয়ান",
  "inventory": "ইনভেন্টরি",
  "Settings": "সিস্টেম সেটিংস",
  "Users Manager": "ব্যবহারকারী ব্যবস্থাপক",
  "Pre-Register User": "নতুন আমন্ত্রণ",
  "Users List": "ব্যবহারকারী তালিকা",
  "Roles List": "ভূমিকা তালিকা",
  "Profile View": "প্রোফাইল কার্ড",
  "Sign Out Securely": "নিরাপদে লগআউট",
  "Access Badge": "পদবী ব্যাজ",

  // Dashboard translations
  "Sales Snapshot": "বিক্রয় চিত্র",
  "Today's Sales": "আজকের বিক্রয়",
  "Active cash & ledger banks": "সক্রিয় ক্যাশ ও ব্যাংক সমূহ",
  "Quick Overview": "সংক্ষিপ্ত বিবরণ",
  "Incomes": "মোট আয়",
  "Expenses": "মোট ব্যয়",
  "Active Employees": "সক্রিয় স্টাফ",
  "Overview & Summary Stats": "সারসংক্ষেপ ও পরিসংখ্যান",
  "Total Revenue": "মোট রাজস্ব",
  "Total Expenses": "মোট খরচ",
  "Net Profit": "নিট লাভ",
  "Total Transactions": "মোট লেনদেন সংখ্যা",
  "Balance Sheet": "ব্যালেন্স শিট",
  "Recent Transactions": "সবশেষ লেনদেন সমূহ",
  "Register Transaction": "লেনদেন নিবন্ধন করুন",
  "Amount": "পরিমাণ",
  "Register": "নিবন্ধন",
  "Payment Method": "পেমেন্ট পদ্ধতি",
  "Select Bank / Account": "ব্যাংক / হিসাব সিলেক্ট করুন",
  "Category": "ক্যাটাগরি",
  "Select Category": "ক্যাটাগরি সিলেক্ট করুন",
  "Sub-Category": "সাব-ক্যাটাগরি",
  "Optional notes": "ঐচ্ছিক মন্তব্য",
  "Income": "আয়",
  "Expense": "ব্যয়",
  "Time": "সময়",
  "Actions": "পদক্ষেপ",
  "No transactions registered today": "আজ কোনো লেনদেন নথিভুক্ত করা হয়নি",
  "Bank Accounts Overview": "ব্যাংক হিসাবসমূহের বিবরণী",
  "Bank Accounts": "ব্যাংক হিসাবসমূহ",
  "Balance": "ব্যালেন্স",
  "Total Cash Available": "মোট নগদ তহবিল",
  "Weekly Income stream vs Expenses flow": "সাপ্তাহিক আয় বনাম ব্যয় প্রবাহ",

  // Sales/POS translations
  "New Cash Memo & Customer Bill": "নতুন ক্যাশ মেমো ও গ্রাহক বিল",
  "Select Customer Category": "গ্রাহক ক্যাটাগরি সিলেক্ট করুন",
  "Retail Customer": "খুচরা গ্রাহক",
  "Wholesale Buyer": "পাইকারি ক্রেতা",
  "Customer Information": "গ্রাহক বিবরণ",
  "Customer Name": "গ্রাহকের নাম",
  "Mobile Number": "মোবাইল নম্বর",
  "Optional Email": "ঐচ্ছিক ইমেইল",
  "Company / Shop Name": "কোম্পানি / দোকানের নাম",
  "Address": "ঠিকানা",
  "Cart Items": "কার্ট আইটেম",
  "Add Custom Item to Bill": "বিলে নতুন আইটেম যুক্ত করুন",
  "Product / Service Description": "পণ্য / সেবার বিবরণ",
  "Unit Price": "একক মূল্য",
  "Quantity": "পরিমাণ",
  "Add to Cart": "কার্টে যোগ করুন",
  "Invoice Ledger Summary": "হিসাব সংক্ষিপ্তকরণ",
  "Invoice Total": "চালান মোট",
  "Special Discount": "বিশেষ ছাড়",
  "Previous Unpaid Due": "পূর্ববর্তী বকেয়া",
  "Grand Payable Total": "সর্বমোট প্রদেয়",
  "Amount Collected (Cash Paid)": "প্রাপ্ত অর্থ (নগদ গ্রহণ)",
  "Net Due Balance": "বাকী বা বকেয়া ব্যালেন্স",
  "Deposit To Bank": "ব্যাংকে জমা করুন",
  "Select Deposit Account": "জমা হিসাব নির্বাচন করুন",
  "Save Memo & Disburse Ledger": "মেমো সংরক্ষণ করুন ও লেজার আপডেট করুন",
  "Invoice Saved Successfully": "চালানটি সফলভাবে সংরক্ষিত হয়েছে!",
  "Discount": "ছাড়",
  "Payable": "প্রদেয়",
  "Paid": "পরিশোধিত",
  "Due": "বকেয়া",
  "In Invoice No": "চালান নং",
  "Total": "মোট",
  "Price": "মূল্য",
  "Item": "আইটেম",
  "Product": "পণ্য",
  "Cart is empty. Add items first.": "কার্ট খালি! প্রথমে আইটেম যোগ করুন।",

  // Sales List view
  "Daily Consolidated Sales Records": "দৈনিক সমন্বিত বিক্রয় রেকর্ড তালিকা",
  "Filtered Range Summary": "ফিল্টার করা রেঞ্জ সারসংক্ষেপ",
  "Total Staff Sales": "মোট স্টাফ বিক্রয়",
  "Total Wholesale Sales": "মোট পাইকারি বিক্রয়",
  "Total Deposits Cash": "মোট ডিপোজিটের পরিমাণ",
  "Grand Total Sales": "সর্বমোট বিক্রয়",
  "Status": "অবস্থা",
  "Download CSV Ledger": "সিএসভি লেজার ডাউনলোড করুন",
  "Sales Status": "বিক্রয় অবস্থা",
  "Day": "বার",
  "Date": "তারিখ",
  "Edit Invoice Date": "চালান তারিখ পরিবর্তন",
  "Completed": "সম্পন্ন",
  "Pending": "বকেয়া রয়েছে",

  // New Sale View
  "Staff Sales Entry": "স্টাফ বিক্রয় এন্ট্রি",
  "Sales Officers": "বিক্রয় কর্মী",
  "Employee Name": "কর্মচারীর নাম",
  "Total Sale": "মোট বিক্রয়",
  "Wholesale": "পাইকারি",
  "Total Deposit": "বাকি বিক্রয়",
  "Due Sales": "বাকি বিক্রয়",
  "Grand Total": "সর্বমোট",
  "Daily sales recorded successfully!": "দৈনিক বিক্রয় সফলভাবে রেকর্ড করা হয়েছে!",
  "Transactions ledger has been synchronized for the select date.": "নির্বাচিত তারিখের জন্য ট্রানজেকশন লেজার সিঙ্ক করা হয়েছে।",
  "Sales Date": "বিক্রয় তারিখ",
  "save": "সংরক্ষণ করুন",
  "saving...": "সংরক্ষণ হচ্ছে...",
  "Loading active staff roster...": "সক্রিয় স্টাফ তালিকা লোড হচ্ছে...",
  "No active employees exist in the \"Sales\" department.": "বিক্রয় বা 'Sales' বিভাগে কোনো সক্রিয় কর্মচারী নেই।",
  "Go to the Employees tab and set their department to Sales.": "কর্মচারী ট্যাবে যান এবং তাদের বিভাগ 'Sales' হিসাবে সেট করুন।",

  // Sales Hub / List View
  "Sales Hub": "বিক্রয় খতিয়ান সূচী",
  "Audit log of counter sales & store ledger": "বিক্রয় ও কাউন্টার ক্যাশ লেজারের বিস্তারিত নিরীক্ষা খতিয়ান",
  "Counter Sales": "কাউন্টার বিক্রয়",
  "Deposited Cash": "বাকি বিক্রয়",
  "Aggregate Revenue": "সর্বমোট বিক্রয় রাজস্ব",
  "Filter staff name, day...": "স্টাফের নাম, বার দিয়ে খুঁজুন...",
  "Clear active filters": "ফিল্টার বাতিল করুন",
  "Gathering daily sales logs...": "দৈনিক বিক্রয় রেকর্ড লোড হচ্ছে...",
  "No matching daily sales records exist.": "ম্যাচিং কোনো বিক্রয় রেকর্ড পাওয়া যায়নি।",
  "Create a record in the New Sale tab first.": "প্রথমে 'নতুন বিক্রয়' ট্যাবে একটি রেকর্ড প্রবিষ্ট করুন।",
  "Breakdown of Staff Counter Sales": "স্টাফ ভিত্তিক বিক্রয় ব্রেকডাউন",
  "No individual employee sales registered for this day (Only wholesale or legacy entries exist).": "এই দিনের জন্য কোনো স্টাফের নির্দিষ্ট বিক্রয় নেই (শুধু পাইকারি রেকর্ড রয়েছে)।",
  "Daily Reconciliation": "দৈনিক খতিয়ান মিলাকরণ ও সমন্বয়",
  "Summed Staff Sales": "স্টাফদের মোট বিক্রয়",
  "Wholesale Entry": "পাইকারি সেলস্",
  "Deposit Deductions": "বাকি কর্তন বা সমন্বয়",
  "Grand Ledger Total": "সর্বমোট খতিয়ান ব্যালেন্স",
  "Export CSV Ledger": "সিএসভি লেজার ডাউনলোড করুন (CSV)",
  "Edit this ledger": "এই দিন সংস্কার করুন",
  "Purge daily ledger": "এই দিন মুছে ফেলুন",
  "Edit": "সম্পাদনা",
  "Delete": "মুছে ফেলুন",

  // Employees & Payroll
  "Add New Staff Profile": "নতুন কর্মচারী প্রোফাইল যুক্ত করুন",
  "Upload Contract Documents": "চুক্তিপত্র ফাইল আপলোড করুন",
  "Full Name": "পূর্ণ নাম",
  "Employee Role / Designation": "পদবী বা দায়িত্ব",
  "Monthly Salary": "মাসিক বেতন",
  "Joined Date": "যোগদানের তারিখ",
  "Optional Department": "ঐচ্ছিক বিভাগ",
  "Choose files": "ফাইল নির্বাচন করুন",
  "Drop files here or click to upload": "ফাইলটি এখানে টেনে আনুন অথবা ক্লিক করে আপলোড করুন",
  "Saved documents": "সংরক্ষিত নথিপত্র",
  "Save Profile & Onboard": "প্রোফাইল সংরক্ষণ ও অনবোর্ড",
  "Employee roster directory": "স্টাফ রোস্টার ডিরেক্টরি",
  "Salary Status": "বেতন বিবরণ",
  "Contact Details": "যোগাযোগের বিবরণ",
  "Department": "বিভাগ",
  "Advance Accrued": "দাবিকৃত অগ্রিম গ্রাস",
  "Documents": "নথিপত্র",
  "Action": "পদক্ষেপ",
  "Terminate Connection": "চাকুরী অবসান করুন",
  "Re-engage Employee": "পুনরায় নিয়োগ করুন",
  "Active": "সক্রিয়",
  "Inactive": "নিষ্ক্রিয়",

  // Attendance
  "Daily Shift Attendance Sheet": "দৈনিক ডিউটি উপস্থিতি খাতা",
  "Save Attendance Logs": "উপস্থিতি বই সংরক্ষণ করুন",
  "Select Attendance Register Date": "উপস্থিতি খাতার তারিখ সিলেক্ট করুন",
  "Check In": "প্রবেশ সময়",
  "Lunch Out": "মধ্যাহ্নভোজ প্রস্থান",
  "Lunch In": "মধ্যাহ্নভোজ প্রবেশ",
  "Notes / Remarks": "মন্তব্য / টীকা",
  "Monthly Attendance Matrix Ledger": "মাসিক উপস্থিতি ম্যাট্রিক্স খতিয়ান",
  "Month Ledger Sheets": "উপস্থিতি মাসের তালিকা",
  "Present": "উপস্থিত",
  "Late": "বিলম্বিত",
  "Half Day": "অর্ধদিবস",
  "Absent": "অনুপস্থিত",
  "On Leave": "ছুটিতে",
  "Holiday": "ছুটির দিন",
  "Present Count": "উপস্থিত সংখ্যা",
  "Attendance status updated!": "উপস্থিতি খাতা আপডেট করা হয়েছে!",

  // Salary Entry / Monthly Payroll Sheets
  "Disburse Monthly Payroll Register": "মাসিক পে-রোল শীট বিতরণ খাতা",
  "Salary Roll month": "পে-রোল বিতরণের মাস",
  "Select Ledger Source Bank": "বেতন নিষ্কাশনের উৎস ব্যাংক",
  "Basic Wage": "মূল বেতন",
  "Disburse Wages & Ledger Post": "বেতন বিতরণ ও লেজার পোস্টিং সম্পন্ন করুন",
  "Payroll Saved Successfully!": "পে-রোল বা বেতন শীট সফলভাবে সংরক্ষিত হয়েছে!",
  "Monthly Disbursed Payroll Logs": "মাসিক বিতরণকৃত বেতনের সাধারণ খতিয়ান",
  "Employee Wage Base": "কর্মচারীর দৈনিক বেতনের পরিমাণ",
  "Paid Wages": "প্রদত্ত বেতন",
  "Advance Allowed": "প্রদত্ত অগ্রিম",
  "Notes": "টাকা প্রদানের টীকা",

  // Suppliers & Purchases
  "Onboard Wholesaler / Supplier": "পাইকারি সরবরাহকারী অনবোর্ড করুন",
  "Opening Account Balance": "হিসাবের প্রারম্ভিক জের",
  "Country / Origin": "জেলা বা আদি দেশ",
  "Phone Line": "ফোন নম্বর",
  "Email Connection": "ইমেইল অ্যাকাউন্ট",
  "Suppliers general Ledger balance sheets": "সরবরাহকারী তালিকা ও সাধারণ লেজার হিসাব",
  "Supplier Code": "সরবরাহকারী কোড",
  "Opening Bal": "প্রারম্ভিক ব্যালেন্স",
  "Purchases Total": "মোট ক্রয়কৃত পণ্য",
  "Payments Total": "মোট পরিশোধকৃত অর্থ",
  "Due to Supplier": "সরবরাহকারী প্রাপ্য",
  "Advance with Supplier": "অগ্রিম ব্যালেন্স",
  "Purchase & Suppliers Invoice Books": "ক্রয় খতিয়ান ও স্টক তালিকা খাতা",
  "Invoice / Reference No": "চালান / রেফারেন্স নং",
  "Sub Total": "সাব-টোটাল",
  "Total Disbursed": "পরিশোধিত তহবিল",
  "Due Remaining": "বাকি বকেয়া",
  "Purchase Items": "ক্রয়কৃত আইটেম বিবরণ",
  "Add Item to Purchase Invoice": "ক্রয় চালানে আইটেম যোগ করুন",
  "Record Purchase Ledger and Stock Books": "ক্রয় চালানের তথ্য এবং স্টক বইতে সংরক্ষণ করুন",
  "Return Invoice Balance Sheets": "পণ্য ফেরত সংক্রান্ত খতিয়ান",
  "Return Code / Ref": "ফেরত কোড / রেফারেন্স",
  "Return Items Information": "ফেরত আইটেমের তথ্য",
  "Record Returns Ledger Book": "পণ্য ফেরতের বিবরণ খতিয়ানে সংরক্ষণ করুন",

  // Reports
  "Analytical Ledger Reports": "বিশ্লেষণাত্মক ব্যবসায়িক খতিয়ান ও বিবরণী",
  "Daily Overview & Statement Preview": "দৈনিক সংক্ষিপ্ত বিবরণ ও প্রতিবেদন প্রিভিউ",
  "Download Daily PDF Summary": "আজকের পিডিএফ প্রতিবেদন নামান (PDF)",
  "Select Statement Target Date": "বিবরণীর নির্দিষ্ট দিন নির্বাচন করুন",
  "Select Base Reports Tab": "প্রধান বিবরণী ক্যাটাগরি সিলেক্ট করুন",
  "General Income & Expense Statement": "সাধারন আয় এবং ব্যয় বিবরণী",
  "Attendance Status Directory": "স্টাফ উপস্থিতি খতিয়ান ডিরেক্টরি",
  "Employee Payroll Records": "কর্মচারী বেতন খতিয়ান ডিরেক্টরি",
  "Investment & Purchase Log": "পণ্য ক্রয় ও বিনিয়োগ বিবরণী",
  "Date Range for System CSV Export": "সিস্টেম সিএসভি খতিয়ান নামানোর সময়সীমা",
  "Start Date": "শুরুর তারিখ",
  "End Date": "শেষের তারিখ",
  "Export CSV Records": "সিএসভি খতিয়ান নামান (CSV)",
  "No data recorded in target segment for today.": "আজ এই শাখায় কোনো লেনদেনের তথ্য পাওয়া যায়নি।",

  // Settings
  "Shop settings & Base tables setup": "দোকানের পরিচালনা সেটিংস ও প্রাথমিক টেবিলসমূহ",
  "Product Categories setup": "পণ্য ও ব্যয়ের সামগ্রিক বিভাগ (Categories)",
  "Category label": "বিভাগের নাম",
  "Save Category": "বিভাগ সংরক্ষণ করুন",
  "Financial Bank Ledger Accounts Setup": "আর্থিক ব্যাংক ও খতিয়ান নগদ হিসাবসমূহ",
  "Account Alias / Name": "হিসাবের নাম বা উৎস",
  "Starting Reserve Balance": "প্রারম্ভিক তহবিল রিজার্ভ",
  "Register New Account": "নতুন হিসাব নিবন্ধন করুন",
  "Delete Category": "ক্যাটাগরি মুছে ফেলুন",
  "Delete Account": "হিসাব মুছে ফেলুন",

  // Users Manager
  "Staff Access Provisions & Accounts Management": "স্টাফদের প্রবেশাধিকার ও অ্যাকাউন্টসমূহ ব্যবস্থাপনা",
  "Staff Profile Provision": "নতুন কর্মকর্তা নিবন্ধন",
  "Authorized email": "অনুমোদিত ইমেইল ঠিকানা",
  "Authorized designation": "অনুমোদিত পদবী",
  "Store staff role type": "স্টাফ সিস্টেম পারমিশন রোল",
  "Provision Staff Access Card": "কর্মকর্তা এক্সেস কার্ড প্রদান করুন",
  "User Access Status & Directory": "ব্যবহারকারী নিরাপত্তা ও প্রোফাইল ডিরেক্টরি",
  "No user profiles registered": "কোনো ব্যবহারকারী প্রোফাইল পাওয়া যায়নি",
  "Status Active": "সক্রিয়",
  "Status Inactive": "অনিবন্ধিত",
  "Role Permission Policies Configuration": "রোল ভিত্তিক কাস্টম সিকিউরিটি রুল নির্ধারণ",
  "Select Role to configure": "ভূমিকা (Role) সিলেক্ট করুন",
  "Allowed Views & Menus": "অনুমোদিত ভিউ এবং পেজসমূহ",
  "Save Rule Policy": "ভূমিকা সিকিউরিটি রুল সংরক্ষণ করুন",
  "My Profile Card": "আমার প্রোফাইল কার্ড",
  "Display name": "ব্যবহারকারীর নাম",
  "My Biography Notes": "আমার ব্যক্তিগত ডায়েরি",
  "Update Registry Settings": " Registry তথ্য আপডেট করুন",
  "Welcome back, click profile to update display card info": "স্বাগতম, আপনার প্রোফাইল কার্ডের তথ্য আপডেট করতে ক্লিক করুন",

  // Simple and Common Words for translation output values
  "Cash": "নগদ ক্যাশ",
  "Bank": "ব্যাংক হিসাব",
  "Salary": "কর্মচারী বেতন",
  "Salary Paid": "বেতন পরিশোধ",
  "Advance Paid": "অগ্রিম প্রদান",
  "Purchase Payment": "ক্রয় বাবদ দাম পরিশোধ",
  "Purchase Return": "ক্রয়কৃত পণ্য ফেরত",
  "Sales Deposit": "বিক্রয় ডিপোজিট",
  "Sales Invoice Amount": "বিক্রয় চালান মূল্য",
  "Income Entry": "আয় খাত",
  "Expense Entry": "ব্যয় খাত",
  "Food": "খাবার খরচ",
  "Rent": "দোকান ভাড়া",
  "Utility": "বিদ্যুৎ ও ইউটিলিটি বিল",
  "Wages": "দৈনিক মজুরি",
  "Bonus": "উৎসব বোনাস",
  "Commission": "কমিশন",
  "Office Supplies": "অফিস সামগ্রী",
  "Investment": "ব্যবসায়িক বিনিয়োগ",
  "Others": "অন্যান্য খাত",
  "admin": "অ্যাডমিন (Admin)",
  "accountant": "অ্যাকাউন্ট্যান্ট (Accountant)",
  "sales": "বিক্রয় প্রতিনিধি (Sales)",
  "salesman": "বিক্রয়কর্মী",
  "manager": "ব্যবস্থাপক",
  "clerk": "করণিক",
  "cashier": "ক্যাশিয়ার",

  // Errors and Success Common
  "Please fill in all required credentials.": "সবগুলো ঘর সঠিকভাবে পূরণ করা বাধ্যতামূলক।",
  "Please enter your display name.": "অনুগ্রহ করে আপনার নাম টাইপ করুন।",
  "Password must be at least 6 characters long.": "পাসওয়ার্ড ন্যূনতম ৬ অক্ষর বিশিষ্ট হতে হবে।",
  "Account created successfully! Auto-signing you in...": "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে! স্বয়ংক্রিয়ভাবে প্রবেশ করানো হচ্ছে...",
  "Success! Access granted.": "সফল হয়েছে! এক্সেস অনুমতি প্রদান করা হলো।",
  "Invalid email address or incorrect password.": "ভুল ইমেইল ঠিকানা বা পাসওয়ার্ড দেওয়া হয়েছে।",
  "This email is already registered. Try signing in instead.": "এই ইমেইলটি ইতিমধ্যেই নিবন্ধিত। সাইন-ইন করার চেষ্টা করুন।",
  "Please enter a valid email address.": "অনুগ্রহ করে একটি সঠিক ইমেইল এড্রেস প্রদান করুন।"
};

const NUMBN = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const MONTHS_BN: Record<string, string> = {
  "January": "জানুয়ারি", "February": "ফেব্রুয়ারি", "March": "মার্চ",
  "April": "এপ্রিল", "May": "মে", "June": "জুন", "July": "জুলাই",
  "August": "আগস্ট", "September": "সেপ্টেম্বর", "October": "অক্টোবর",
  "November": "নভেম্বর", "December": "ডিসেম্বর"
};
const DAYS_BN: Record<string, string> = {
  "Sunday": "রবিবার", "Monday": "সোমবার", "Tuesday": "মঙ্গলবার",
  "Wednesday": "বুধবার", "Thursday": "বৃহস্পতিবার", "Friday": "শুক্রবার",
  "Saturday": "শনিবার"
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("selected_language");
    return (saved === "bn" ? "bn" : "en") as Language;
  });

  const setLanguage = (lang: Language) => {
    localStorage.setItem("selected_language", lang);
    setLanguageState(lang);
    window.location.reload();
  };

  // Main UI translation function
  const t = (key: string): string => {
    if (language === "bn" && dictionary[key]) {
      return dictionary[key];
    }
    return key;
  };

  // Deep value translation (Translates DB values like 'Salary', 'Cash', 'Food' safely to Bangla for display or PDF outputs)
  const translateValue = (text: string): string => {
    if (!text) return "";
    if (language !== "bn") return text;
    
    // Check if the exact key exists
    if (dictionary[text]) {
      return dictionary[text];
    }

    // Handle partial values if text is a phrase
    let translated = text;
    for (const [eng, bn] of Object.entries(dictionary)) {
      if (eng.length > 3 && translated.includes(eng)) {
        translated = translated.split(eng).join(bn);
      }
    }
    return translated;
  };

  // Digit conversion to Bangla digits
  const formatNumber = (num: number | string): string => {
    if (num === undefined || num === null) return "";
    const str = String(num);
    if (language !== "bn") return str;

    return str.replace(/[0-9]/g, (digit) => NUMBN[parseInt(digit, 10)]);
  };

  // Currency Converter
  const formatCurrency = (amount: number): string => {
    const formattedAmount = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);

    if (language === "bn") {
      return "৳" + formatNumber(formattedAmount);
    }
    return "৳" + formattedAmount;
  };

  // Dynamic Date localizer. Handles formats, month translations, and day names
  const formatDate = (dateStr: string | Date | undefined): string => {
    if (!dateStr) return "";
    try {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      if (isNaN(d.getTime())) return String(dateStr);

      const day = d.getDate();
      const year = d.getFullYear();
      
      const weekdaysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const monthsEn = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
      ];
      
      const weekday = weekdaysEn[d.getDay()];
      const month = monthsEn[d.getMonth()];

      if (language === "bn") {
        const bnDay = formatNumber(day);
        const bnYear = formatNumber(year);
        const bnMonth = MONTHS_BN[month] || month;
        const bnWeekday = DAYS_BN[weekday] || weekday;

        // Custom responsive output: e.g. "রবিবার, ২৪ মে ২০২৬"
        return `${bnWeekday}, ${bnDay} ${bnMonth} ${bnYear}`;
      } else {
        return `${weekday}, ${month} ${day}, ${year}`;
      }
    } catch {
      return String(dateStr);
    }
  };

  // Automatic global DOM translation helper to support 100% translations in all non-adapted views
  useEffect(() => {
    if (language !== "bn") return;

    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentNode as HTMLElement;
        if (parent) {
          const tagName = parent.tagName?.toUpperCase();
          if (["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "NOSCRIPT"].includes(tagName)) {
            return;
          }
          if (parent.isContentEditable) {
            return;
          }
        }

        const text = node.nodeValue?.trim();
        if (text && dictionary[text]) {
          node.nodeValue = dictionary[text];
        } else if (text) {
          // Handle numbers specifically
          if (/^\d+(\.\d+)?$/.test(text)) {
            node.nodeValue = text.replace(/[0-9]/g, (digit) => NUMBN[parseInt(digit, 10)]);
            return;
          }

          let translated = text;
          let changed = false;
          for (const [eng, bn] of Object.entries(dictionary)) {
            if (eng.length > 3 && translated.includes(eng)) {
              translated = translated.split(eng).join(bn);
              changed = true;
            }
          }
          if (changed) {
            node.nodeValue = translated;
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          const placeholder = el.getAttribute("placeholder");
          if (placeholder && dictionary[placeholder]) {
            el.setAttribute("placeholder", dictionary[placeholder]);
          }
        }
        const title = el.getAttribute("title");
        if (title && dictionary[title]) {
          el.setAttribute("title", dictionary[title]);
        }
        node.childNodes.forEach(translateNode);
      }
    };

    translateNode(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          translateNode(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateValue, formatNumber, formatDate, formatCurrency }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
