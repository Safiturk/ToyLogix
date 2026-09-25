# B2B order requests

Customers add whole boxes to the cart. Piece quantities use each product's box size, and totals use wholesale prices in RON with integer-cent arithmetic. Cart data is stored separately for each account in browser storage, without company details.

Before PDF generation, the app reloads product prices, packaging, and availability. Changed values refresh the cart; archived, deleted, or incomplete products must be removed before export. Company details come from the customer's existing account and billing profile. Missing fields are marked as unspecified and link back to the account form.

PDFs use jsPDF, AutoTable, the ToyLogix logo, and the bundled Noto Sans font. An order request does not create a database order, reserve stock, or confirm payment.

Email sharing downloads the PDF and opens the mail application; the customer attaches the file manually. Native file sharing is offered where supported, with cancellation and permission errors handled in the UI.

## Browser test

Install Playwright separately if needed (`npm install --no-save --package-lock=false playwright`) and ensure Microsoft Edge is available. Start the app on port 3100, then run:

```sh
npm run dev -- --port 3100
node tests/integration/order-request-browser.mjs
```

The test reads the public Supabase URL from `.env.local` and intercepts account/catalog requests with test fixtures. It sends no email and writes no live database records. PDFs and screenshots go to the ignored `tmp/pdfs` directory.
