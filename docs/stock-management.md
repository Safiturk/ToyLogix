# Stock management

Stock changes pass through the `record_stock_movement` RPC. Each movement has an actor, timestamp, quantity, and reason. Product edits use `update_product_with_stock` to save metadata and any stock adjustment in one transaction. The database records the difference as a count adjustment with reason `Ajustare manuală din editare produs`. Unchanged stock fields do not overwrite concurrent movements; changed balances are checked against the balance loaded when editing and conflicts abort the whole save.

## Rules

- Receipts and returns increase stock; withdrawals decrease it. Count adjustments record a difference, not a replacement balance.
- All quantity inputs accept positive whole amounts; count adjustments have an explicit add/subtract selector. The ledger retains signed differences for withdrawals, adjustments and reversals.
- Negative balances are rejected. Product-row locks serialize competing movements.
- Reversals create a compensating movement and preserve the original. A movement can be reversed only once.
- Products are archived rather than deleted. Archived products are hidden from customers and must be restored before further movements.
- The migration preserves existing balances as `opening_stock`. Reconciliation uses `stoc_actual = opening_stock + SUM(stock_movements.quantity)`.
- A new product starts at zero. A positive initial quantity is recorded as a separate receipt. If the receipt fails, the product remains and the form does not create a duplicate.

History filters include product, actor, movement type, and local calendar dates. The ending date is inclusive. After a network failure, check history before retrying: the database may have committed even if the response was lost.

## Migration and tests

Apply account security before `202609230001_stock_management.sql`. Invalid legacy balances or thresholds abort the migration instead of silently altering data. Release the matching UI with the schema.

Apply `20260928071201_product_edit_stock.sql` before releasing the editable product stock field. Stock product selectors query `produse` directly; they do not require the optional `inventory_products` view. Product loading failures are independent of movement history failures.

`20260929213650_product_numeric_limits.sql` adds table checks for nonnegative finite prices, positive pack sizes, nonnegative opening stock and optional legacy weight/volume columns. Existing stock and critical-threshold checks remain in force. Reconcile invalid legacy values explicitly before applying; the migration never guesses a corrected price. These checks cover both direct writes and product-edit RPCs.

Stock (`stoc_actual`) and cart quantities are measured in whole boxes: the cart is capped directly at `stoc_actual`, without dividing by `bucati_per_cutie`. Pack size is used only for total pieces and pricing. Stored excess is capped on reading and writing. Before preparing a request PDF, products are reloaded; quantities exceeding current stock are reduced and out-of-stock products are removed. Packaging changes update piece totals without reducing the box limit. A cart is a local request draft, not a stock reservation or database order.

`npm test` checks stock validation, permissions, rollback, reversals, and archiving in PGlite. `npm run test:concurrency` checks lock behavior using separate connections to a disposable PostgreSQL instance.

For deployments missing the admin dashboard objects, `20260929214926_restore_admin_audit_inventory.sql` independently restores `public.audit_logs`, `public.inventory_products` (a security-invoker view), and `public.admin_inventory_stats()`, then reloads the PostgREST schema cache. It does not enable the optional MFA rollout or change Storage policies. Audit reads use the existing administrator check; profile role/status/access changes and deletions are recorded prospectively by a private trigger. No historical entries are fabricated. `tests/admin-schema.test.mjs` verifies permissions, immutable audit records, inventory queries and repeat application.
