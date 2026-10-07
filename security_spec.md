# Security Specification: Multi-User Role-Based Access Control (RBAC)

## 1. Data Invariants

1. **Identity & Authentication Invariant**: Unauthenticated clients (`request.auth == null`) can NEVER read or write any business data or user records.
2. **Role & Privilege Escalation Invariant**: A user with the `stock_viewer` role can NEVER promote themselves to `admin`. The `role` and `status` fields can ONLY be modified by an authenticated `admin`.
3. **Admin Account Protection Invariant**: The primary bootstrapped owner (`zeeeshanhaidar967@gmail.com`) cannot have their admin role revoked or account deleted by subordinate users.
4. **Stock Viewer Read-Only Invariant**: Users with `stock_viewer` role can ONLY read `/products` documents. They are mathematically blocked from writing, updating, or deleting any product or stock record.
5. **Private Business Isolation Invariant**: Sensitive financial, customer, sales, payment, return, and expense collections (`/customers`, `/sales`, `/payments`, `/returns`, `/stock_movements`, `/settings`) are strictly inaccessible to `stock_viewer` accounts (denied both `get` and `list`).
6. **Account Invalidation Invariant**: Any user account with `status: 'inactive'` is immediately revoked of all access, including stock viewing.
7. **Document ID Sanitization Invariant**: All document IDs must satisfy `^[a-zA-Z0-9_\\-]+$` and size <= 128 characters to prevent path traversal and injection attacks.
8. **Real-Time Data Integrity Invariant**: All writes must conform to strict schema types (e.g. positive prices, non-empty names, numeric stocks).

---

## 2. The "Dirty Dozen" Adversarial Payloads

Below are 12 adversarial test payloads designed to attack authorization, identity, and state invariants:

1. **Payload 1: Unauthenticated Product Scrape**
   - Operation: `GET /products/prod_101`
   - Auth: None (`request.auth = null`)
   - Target: Try reading catalog without logging in.
   - Expected: `PERMISSION_DENIED`

2. **Payload 2: Stock Viewer Accessing Customer Ledger**
   - Operation: `LIST /customers`
   - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
   - Target: Try dumping customer phone numbers and debt balances.
   - Expected: `PERMISSION_DENIED`

3. **Payload 3: Stock Viewer Accessing Sales & Profit Records**
   - Operation: `GET /sales/sale_999`
   - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
   - Target: Try reading total sale bills and gross profit.
   - Expected: `PERMISSION_DENIED`

4. **Payload 4: Stock Viewer Modifying Product Stock**
   - Operation: `UPDATE /products/prod_101` with `{ currentStock: 500 }`
   - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
   - Target: Try adjusting or forging inventory stock levels.
   - Expected: `PERMISSION_DENIED`

5. **Payload 5: Self-Role Escalation during Registration**
   - Operation: `CREATE /users/hacker_456` with `{ role: 'admin', status: 'active', name: 'Hacker', email: 'hacker@evil.com' }`
   - Auth: UID `hacker_456` (`email: hacker@evil.com`)
   - Target: Self-assign admin privileges on signup.
   - Expected: `PERMISSION_DENIED`

6. **Payload 6: Self-Role Escalation during Profile Update**
   - Operation: `UPDATE /users/viewer_123` with `{ role: 'admin' }`
   - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
   - Target: Normal stock viewer trying to toggle role to `admin`.
   - Expected: `PERMISSION_DENIED`

7. **Payload 7: Deactivated User Trying to Read Stock**
   - Operation: `GET /products/prod_101`
   - Auth: UID `suspended_user` (`status: 'inactive'`)
   - Target: Suspended/fired employee trying to read stock after dismissal.
   - Expected: `PERMISSION_DENIED`

8. **Payload 8: Stock Viewer Deleting a Product**
   - Operation: `DELETE /products/prod_101`
   - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
   - Target: Malicious deletion of catalog items.
   - Expected: `PERMISSION_DENIED`

9. **Payload 9: Non-Admin Accessing Settings / Master PIN**
   - Operation: `GET /settings/current`
   - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
   - Target: Reading owner PIN and backup settings.
   - Expected: `PERMISSION_DENIED`

10. **Payload 10: Non-Admin Creating a Customer Payment**
    - Operation: `CREATE /payments/pay_789` with `{ amount: 5000, customerId: 'c1' }`
    - Auth: UID `viewer_123` (`role: 'stock_viewer'`)
    - Target: Falsifying ledger payment records.
    - Expected: `PERMISSION_DENIED`

11. **Payload 11: Document ID Poisoning**
    - Operation: `CREATE /products/../../evil_doc` or string > 128 chars
    - Auth: Admin UID
    - Target: Path injection or denial of wallet resource attack.
    - Expected: `PERMISSION_DENIED`

12. **Payload 12: Negative Price or Malformed Product Payload**
    - Operation: `CREATE /products/p_invalid` with `{ name: '', purchasePrice: -50 }`
    - Auth: Admin UID
    - Target: Writing malformed inventory records without required fields.
    - Expected: `PERMISSION_DENIED`
