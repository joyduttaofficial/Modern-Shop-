# Implementation Plan: Clean Header & Remove User-Specific Calculation Filter

Remove the Offline Storage & Sync indicator button from the global navigation header and completely remove user-specific calculation filtering from the Dashboard.

---

### User Confirmed Decisions
1. **Remove the Offline Storage and Sync button from the header**:
   - The IndexedDB button (`Cloud Synced` / `Offline (IndexedDB)` / `Sync` button) in the top-right header of `App.tsx` will be removed.
   - Offline transactions will continue to persist quietly in the background without cluttering the main navigation header.
2. **Completely remove user-specific calculation filtering from Dashboard**:
   - The entire **Multi-User Calculation & Input Filter Scope Bar** (`Store-Wide Total Calculation / Select User` bar) at the top of the Dashboard will be removed.
   - All calculations across the Dashboard (sales, expenses, profit, bank balances, customer dues, counter sales) will permanently reflect clean, aggregated store-wide business figures.

---

### Proposed Changes

#### 1. Global Header (`src/App.tsx`)
- Remove the IndexedDB offline storage badge and manual sync button group (`lines ~966-1006`) from the header navigation bar.
- Maintain the notification center, theme toggle, and language switcher neatly aligned in the header.

#### 2. Dashboard UI & Logic (`src/components/Dashboard.tsx`)
- Remove the JSX element for the **Multi-User Calculation & Input Filter Scope Bar** (`lines ~1249-1327`).
- Clean up the `selectedUserFilter` state, dropdown handlers, and user-specific filtering branches so that transactions and counter sales always calculate as store-wide aggregate metrics.

---

### Verification Plan
- Run `npm run lint` (`lint_applet`) to verify no unused variables or type errors.
- Run `npm run build` (`compile_applet`) to ensure clean compilation.
- Verify in dev server that the header bar is clean and the Dashboard displays directly without the filter bar.
