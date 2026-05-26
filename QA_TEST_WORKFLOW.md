# Modern Manager ERP — Software Quality Assurance Manual
## Enterprise Release-to-Production Test Suite & QA Automation Guide

This document defines the professional structured QA testing workflow, automation guidance, and manual validation scripts for **Modern Manager ERP**, a full-featured Business Suite, HRM, and Accounting app built inside Google AI Studio.

---

### Part 1: Automated Test Verification Commands

You can run automated validation using the custom code test suite developed for immediate server and codebase audits.

#### 1. Launch Code Linter & Type Safety Check
```bash
npm run lint
```
*Evaluates TypeScript static compile constraints, unhandled exports, and parameter mismatches without launching the browser.*

#### 2. Local QA Sanity Verification Script
Run our custom release validation script which audits route configurations, system configurations, form rules, and administrator state security:
```bash
node scripts/verify-release.js
```
*Output parses component layouts and checks constraints for production safety scores.*

---

### Part 2: Manual System Navigation and Functionality Matrix

For end-to-end (E2E) regression testing before a major deployment, execute the following manual tests across our primary view structures:

| Suite ID | Navigation Route / Module | Scope of Interactive Actions | Verification Objective | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **NAV-01** | **Main Dashboard View** | Expand/collapse the main sidebar menu rails. Toggle Light/Dark mode via the layout header sun/moon. | Verify layout responsiveness, custom state transitions, and smooth rendering of widgets. | Sidebar toggles with motion/react layout animation; dashboard stats cards load dynamically. |
| **NAV-02** | **Sales Hub Group** | Click **New Sale Entry**, fill out elements, and click **Sales List / Ledger**. | Confirm route navigation and state matching of secondary tabs or view structures. | Entry records update active stats, and transition seamlessly without app crashes. |
| **NAV-03** | **Employee Hub Group** | Transition between **Add New Employee** view and **Employees List**. | Ensure tab layouts preserve form field values on casual navigation switches. | The respective view loads quickly; visual tables populate employees with custom details. |
| **NAV-04** | **HRM Administration** | Navigate between **Salary Entry**, **Salary Sheet**, and **Attendance List**. | Check security access restrictions depending on user permissions configuration. | Only authenticated administrative roles can edit salary calculations and BDT entries. |

---

### Part 3: Form, Field, and Data Validation Rules

#### 1. Employee Registration Form Check (Agile Requirements)
To support modern streamlined workflows, only the **Full Name** field is mandatory. Testing guidelines:

*   **Field Validation Rules:**
    *   **Full Name (Input text):** **REQUIRED**. Must display an asterisk `*` indicating mandatory registration. Entering empty or space-only values must trigger HTML and state level validation errors.
    *   **Phone Number (tel):** *Optional*. Allows alphabetic or numeric formats. Empty string submissions allowed.
    *   **Email Address (email):** *Optional*. Strict format validation (`foo@bar.com`) is only enforced *if* the user types into the field.
    *   **Monthly Salary (number):** *Optional*. Interpreted as BDT Currency. Defaults gracefully to `0` inside database logs if omitted by the registrar.
*   **Agile Path Validation Test Cases:**
    *   *Test Case 1.1:* Submit only "Full Name" (e.g. `Anwar Hossain`) and keep other inputs completely empty. **Result: PASS!** Profile created, ID codes auto-allocated, database linked.
    *   *Test Case 1.2:* Submit with email field populated but missing standard format `anwar-hossain`. **Result: FAIL!** Form validation requires valid email format.

#### 2. Login Credential Validation Logic
*   **Admin Bypass Check:**
    *   *Target ID:* `modern@admin.com`
    *   *Target Password:* `Joy@398878j`
    *   Upon first sign-in, the system automatically checks for the existence of this record in Firebase Auth. If not present, the system securely creates the administrative record, populates Firestore profiles, matches role access directly to `admin`, and forces login access.

---

### Part 4: Office Document Components and Report Engine Validation

Modern Manager utilizes custom **jsPDF** and **html2canvas** renderers to compile client-side exports for corporate printing. Use this regression test suite to ensure pristine report logic:

1.  **Tabular Integrity Checklist (Reports View):**
    *   Open and review **Accounting & Sales Ledger**. Verify alignment of columns (Date, Voucher ID, Customer/Employee Name, BDT Debit, BDT Credit).
    *   Verify calculation formulas:
        $$\text{Current Net Ledger Profit} = \text{Total Income} - \text{Total Expenses (Purchases + Handled Salary)}$$
2.  **Export & Layout Rendering Review:**
    *   Click **Export to PDF** on the Sales List or Salary Sheet.
    *   Check document orientation (Landscape is prioritized for high-density tabular spreadsheets).
    *   Verify calculated headers do not overflow. If lines wrap awkwardly due to long dynamic filenames, verify PDF AutoTable font downscaling scales them appropriately.

---

### Part 5: Feature Modernization Analysis & Security Architecture

1.  **Firebase Security Guardrails & Preventative Actions:**
    *   **Deletion Restriction:** No program, user, or sub-admin can delete the main administrator profile (`modern@admin.com`) inside Firestore. The deletion query checks the email value first and halts execution if targeted.
    *   **Modification Block:** Editing controls block editing of `modern@admin.com` attributes by standard workers, preserving system-wide ownership.
2.  **Performance Optimization Guidelines:**
    *   The app's lazy initialization pattern checks database connections on-demand, preventing blocking cold-starts during server crashes.
    *   Local dark-mode presets are handled inside local client-side memory (`localStorage`) to avoid network-round trips on app boot actions.
