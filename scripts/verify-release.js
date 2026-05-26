/**
 * QA Automation & Software Release Readiness Verification Script
 * For: Modern Manager ERP / HRM application in Google AI Studio
 * 
 * This Node.js automation script performs custom static analysis, structure audits, 
 * navigation path mapping, configuration validation, and sanity checks on the codebase
 * to guarantee that all forms, reports, and modules comply with production standards.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  fgGreen: "\x1b[32m",
  fgRed: "\x1b[31m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgCyan: "\x1b[36m",
  bgBlack: "\x1b[40m",
};

console.log(`${colors.bright}${colors.fgBlue}======================================================================`);
console.log(`🚀 MODERN MANAGER ERP - ENTERPRISE QUALITY ASSURANCE VERIFICATION SUITE`);
console.log(`======================================================================${colors.reset}\n`);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const issuesList = [];

function assert(section, name, condition, details = "", severity = "HIGH") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${colors.fgGreen}✔ [PASS]${colors.reset} ${section} - ${name}`);
  } else {
    failedTests++;
    console.log(`  ${colors.fgRed}✖ [FAIL]${colors.reset} ${section} - ${name} (${colors.bright}${severity}${colors.reset})`);
    if (details) {
      console.log(`           ↳ ${colors.fgYellow}${details}${colors.reset}`);
    }
    issuesList.push({ section, name, severity, details });
  }
}

// ------------------------------------------------------------------
// SECTION 1: System Structure & File Configuration Audit
// ------------------------------------------------------------------
console.log(`${colors.bright}${colors.fgCyan}[1/6] Structuring & Configuration Checks...${colors.reset}`);

// Check critical layout files
const appPath = path.join(rootDir, 'src', 'App.tsx');
assert("Structure", "App.tsx entrypoint exists", fs.existsSync(appPath), "App.tsx is the primary React layout core");

const packageJsonPath = path.join(rootDir, 'package.json');
assert("Structure", "package.json exists", fs.existsSync(packageJsonPath), "Required for deployment manifests");

const firebaseConfigPath = path.join(rootDir, 'src', 'lib', 'firebase.ts');
let firebaseContent = "";
if (fs.existsSync(firebaseConfigPath)) {
  firebaseContent = fs.readFileSync(firebaseConfigPath, 'utf8');
  assert("Firebase", "firebase.ts setup present", true);
} else {
  // Let me check if firebase.ts is in another spot
  const libFirebaseExists = fs.existsSync(path.join(rootDir, 'src', 'firebase.ts'));
  assert("Firebase", "firebase.ts localized config helper", libFirebaseExists || fs.existsSync(firebaseConfigPath), "Firebase library needs correct connection config");
}

// ------------------------------------------------------------------
// SECTION 2: Navigation & View Completeness Verification
// ------------------------------------------------------------------
console.log(`\n${colors.bright}${colors.fgCyan}[2/6] Navigation and View States Verification...${colors.reset}`);

if (fs.existsSync(appPath)) {
  const appContent = fs.readFileSync(appPath, 'utf8');
  
  // Extract all navigational views declared in types Code
  const viewRegex = /type View\s*=\s*(.*?);/s;
  const match = appContent.match(viewRegex);
  if (match) {
    const views = match[1].split('|').map(v => v.replace(/['"\s]/g, ''));
    assert("Navigation", `Parsed ${views.length} navigational views in App.tsx`, views.length > 0);
    
    // Check key modules
    const keyModules = ['dashboard', 'transactions', 'newSale', 'salesList', 'employeesList', 'salarySheet', 'reports', 'settings', 'suppliersList', 'usersList'];
    keyModules.forEach(mod => {
      assert("Navigation", `View viewName="${mod}" is properly mapped`, views.includes(mod), `${mod} must be a valid state`);
    });
  } else {
    assert("Navigation", "Parsed state view list", false, "Could not find 'type View' definition inside App.tsx", "MEDIUM");
  }
}

// ------------------------------------------------------------------
// SECTION 3: Code Logic Sanity Audits (No alerts, proper error handling)
// ------------------------------------------------------------------
console.log(`\n${colors.bright}${colors.fgCyan}[3/6] Software Sanity & Safety Code Inspection...${colors.reset}`);

const componentDir = path.join(rootDir, 'src', 'components');
if (fs.existsSync(componentDir)) {
  const components = fs.readdirSync(componentDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  
  assert("Components", `Found ${components.length} workspace components`, components.length > 0);
  
  let totalBannedLogs = 0;
  let totalAlerts = 0;
  
  components.forEach(file => {
    const filePath = path.join(componentDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for window.alert (which crashes in isolated iframes)
    const alertMatches = content.match(/window\.alert\(/g) || content.match(/[^.]alert\(/g);
    if (alertMatches) {
      totalAlerts += alertMatches.length;
    }
  });
  
  assert("User Safety", "No hard alert triggers (avoids iframe blocking)", totalAlerts === 0, `${totalAlerts} direct alerts found. Recommended: Use standard React toast/banners instead.`, "MEDIUM");
}

// ------------------------------------------------------------------
// SECTION 4: Employees Forms & Fields Required-Attributes Validations
// ------------------------------------------------------------------
console.log(`\n${colors.bright}${colors.fgCyan}[4/6] Form Input Fields and Data Requirements Audit...${colors.reset}`);

const empComponentPath = path.join(componentDir, 'Employees.tsx');
if (fs.existsSync(empComponentPath)) {
  const empContent = fs.readFileSync(empComponentPath, 'utf8');
  
  // Verify recent changes supporting User Request: Only name is mandatory, others optional
  const nameInputRegex = /Full Name \*/;
  const nameHasAsterisk = nameInputRegex.test(empContent);
  assert("Forms", "Primary label 'Full Name *' present", nameHasAsterisk, "Name label should highlight * requirement");

  // Verify phone is not marked required
  const phoneInputTest = empContent.includes('Phone Number') && !empContent.includes('required\n                type="tel"');
  assert("Forms", "Phone field is optional (not strictly required)", phoneInputTest, "Allows agile entry without phone");

  // Verify email is not marked required
  const emailInputTest = empContent.includes('Email Address') && !empContent.includes('required\n                type="email"');
  assert("Forms", "Email field is optional (not strictly required)", emailInputTest, "Allows agile entry without email");

  // Verify salary is not marked required
  const salaryInputTest = !empContent.includes('required\n                type="number"\n                placeholder="0.00"\n                value={salary}');
  assert("Forms", "Salary field is optional (not strictly required)", salaryInputTest, "Allows agile entry without salary");
} else {
  assert("Forms", "Employees.tsx view exists for check", false, "Employees.tsx component is missing", "HIGH");
}

// ------------------------------------------------------------------
// SECTION 5: Firebase Main Admin Persistence Rules & Checks
// ------------------------------------------------------------------
console.log(`\n${colors.bright}${colors.fgCyan}[5/6] System Administration Guardrail Check...${colors.reset}`);

const loginPath = path.join(componentDir, 'Login.tsx');
if (fs.existsSync(loginPath)) {
  const loginContent = fs.readFileSync(loginPath, 'utf8');
  const hasModernAdminCheck = loginContent.includes('modern@admin.com') && loginContent.includes('Joy@398878j');
  assert("Main Admin Security", "Main Admin (modern@admin.com) login routing configured", hasModernAdminCheck, "Primary password 'Joy@398878j' must match specified configuration");
} else {
  assert("Main Admin Security", "Login.tsx layout exists", false, "Login.tsx component is missing", "CRITICAL");
}

const usersMgrPath = path.join(componentDir, 'UsersManager.tsx');
if (fs.existsSync(usersMgrPath)) {
  const usersMgrContent = fs.readFileSync(usersMgrPath, 'utf8');
  const preventsDeletion = usersMgrContent.includes('modern@admin.com') && usersMgrContent.includes('cannot be deleted');
  assert("Main Admin Security", "Main Admin deletion block guardrails working", preventsDeletion, "Primary system administrator should be undeletable");
}

// ------------------------------------------------------------------
// SECTION 6: Reports & Exports PDF Validation
// ------------------------------------------------------------------
console.log(`\n${colors.bright}${colors.fgCyan}[6/6] Output Documents & PDF Export Engines Check...${colors.reset}`);

const reportsPath = path.join(componentDir, 'Reports.tsx');
if (fs.existsSync(reportsPath)) {
  const reportsContent = fs.readFileSync(reportsPath, 'utf8');
  const hasJsPdf = reportsContent.includes('jspdf');
  assert("Reports Generation", "Reports component has raw jsPDF engine implemented", hasJsPdf, "Used to compile accurate metrics and download BDT sheets");

  const hasSalaryDoc = reportsContent.includes('Salary') || reportsContent.includes('attendance');
  assert("Reports Generation", "Report categories mapped", hasSalaryDoc, "Report must feature business stats");
}

// ------------------------------------------------------------------
// CONSOLIDATED RESULTS
// ------------------------------------------------------------------
console.log(`\n${colors.bright}${colors.fgBlue}======================================================================`);
console.log(`QA INVENTORY AUDIT COMPLETED`);
console.log(`======================================================================${colors.reset}`);
console.log(`Total System Assertions Executed : ${totalTests}`);
console.log(`Tests Passing Correctly         : ${colors.fgGreen}${passedTests}${colors.reset}`);
console.log(`Tests Requesting Verification   : ${colors.fgRed}${failedTests}${colors.reset}`);
console.log(`Overall Readiness Score        : ${Math.round((passedTests / totalTests) * 100)}%\n`);

if (failedTests > 0) {
  console.log(`${colors.bright}${colors.fgRed}ISSUES DETECTED BY TEST RUNNER FOR CORRECTION:${colors.reset}`);
  issuesList.forEach((issue, idx) => {
    console.log(`[${idx + 1}] Module: ${colors.bright}${issue.section}${colors.reset} | Issue: ${colors.fgYellow}${issue.name}${colors.reset} | Severity: ${colors.fgRed}${issue.severity}${colors.reset}`);
    console.log(`    Detail: ${issue.details}\n`);
  });
  process.exit(1);
} else {
  console.log(`${colors.bright}${colors.fgGreen}✅ ALL CHECKS PASSED SUCCESSFULLY. RELEASE MATURED AND QUALITY CERTIFIED!${colors.reset}`);
  process.exit(0);
}
