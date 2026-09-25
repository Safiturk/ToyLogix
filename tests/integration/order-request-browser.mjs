// Run against npm run dev -- --port 3100. All account/product requests are mocked;
// no database writes, email delivery or real native share occurs.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3100";
const legacyCatalog = process.env.LEGACY_CATALOG === "true";
const env = await readFile(".env.local", "utf8");
const supabaseUrl = env.match(
  /^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m,
)?.[1];
assert.ok(supabaseUrl);
const ref = new URL(supabaseUrl).hostname.split(".")[0];
const account = {
  id: 98765,
  auth_user_id: "00000000-0000-4000-8000-000000000001",
  nume_complet: "Ștefan Țurcanu",
  email: "cont@example.ro",
  telefon: "0700123456",
  nume_firma: "Toy Test SRL",
  rol: "user",
  status: "approved",
  is_active: true,
};
const billing = {
  legal_name: "Compania Știință SRL",
  tax_number: "RO12345",
  trade_register: "J40/123/2026",
  address_line1: "Strada Jucăriilor 25",
  city: "Iași",
  region: "Iași",
  country: "România",
  postal_code: "700000",
  delivery_address: "Depozit Brașov, Strada Lungă 42",
  billing_email: "facturi@example.ro",
};
const products = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  nume_produs: `Jucărie educativă ${i + 1} - Știință și imaginație`,
  cod_bara: `594123456${String(i).padStart(4, "0")}`,
  bucati_per_cutie: 12,
  pret_engros: 19.99,
  pret_retail: 29.99,
  stoc_actual: 10000,
  categorie: "Jucării",
  brand: "ToyLogix",
  varsta_recomandata: "3+",
  material: "Lemn",
  descriere: "Jucărie pentru copii",
  imagini: [],
}));
const lines = products.map((product) => ({ product, boxes: 50 }));
const browser = await chromium.launch({ headless: true, channel: "msedge" });

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
await context.routeWebSocket(
  `${supabaseUrl.replace("https:", "wss:").replace("http:", "ws:")}/**`,
  (socket) => socket.close(),
);
await context.route(`${supabaseUrl}/**`, async (route) => {
  const url = new URL(route.request().url());

  if (legacyCatalog && url.pathname.includes("catalog_facets")) {
    await route.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find public.catalog_facets(p_category)" } });
    return;
  }
  if (legacyCatalog && url.searchParams.get("select") === "is_archived") {
    await route.fulfill({ status: 400, json: { code: "42703", message: "column produse.is_archived does not exist" } });
    return;
  }

  let body = [];
  if (url.pathname.endsWith("/auth/v1/user"))
    body = {
      id: account.auth_user_id,
      email: account.email,
      email_confirmed_at: "2026-01-01T00:00:00Z",
      aud: "authenticated",
      role: "authenticated",
    };
  else if (url.pathname.endsWith("/utilizatori")) body = account;
  else if (url.pathname.endsWith("/billing_profiles")) body = billing;
  else if (url.pathname.endsWith("/produse")) {
    body = url.searchParams.get("limit") === "0" ? [] : products;
    if (url.searchParams.get("select")?.startsWith("id,") && Number(url.searchParams.get("offset")) > 0) body = [];
    if (url.searchParams.get("id")?.startsWith("eq."))
      body = products.find(
        (p) => p.id === Number(url.searchParams.get("id").slice(3)),
      );
  } else if (url.pathname.includes("catalog_facets"))
    body =
      Number(url.searchParams.get("offset")) > 0
        ? []
        : [{ field: "categorie", value: "Jucării" }];
  await route.fulfill({
    json: body,
    headers: {
      "content-range": "0-9/10",
      "access-control-expose-headers": "content-range",
    },
  });
});
await context.addInitScript(
  ({ account, lines, ref }) => {
    const storageKey = `sb-${ref}-auth-token`;
    const token =
      btoa(JSON.stringify({ alg: "HS256" })) +
      "." +
      btoa(
        JSON.stringify({
          sub: account.auth_user_id,
          exp: Math.floor(Date.now() / 1000) + 86400,
          role: "authenticated",
        }),
      ) +
      ".signature";
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        access_token: token,
        refresh_token: "test-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        token_type: "bearer",
        user: { id: account.auth_user_id, email: account.email },
      }),
    );
    localStorage.setItem("user_session", JSON.stringify(account));
    if (!localStorage.getItem("test-seeded")) {
      localStorage.setItem(
        `toylogix-cart-v1:${account.id}`,
        JSON.stringify(lines),
      );
      localStorage.setItem("test-seeded", "yes");
    }
  },
  { account, lines, ref },
);

const page = await context.newPage();

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(msg.text());
});
await page.goto(`${baseUrl}/store/cart`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});

const pdfButton = page.getByRole("button", {
  name: "Generează PDF-ul comenzii",
});
await pdfButton.waitFor({ timeout: 30000 }).catch(async (error) => {
  console.log(await page.locator("body").innerText());
  console.log(errors);
  throw error;
});
await page.waitForFunction(
  () =>
    !Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Generează PDF-ul comenzii",
    )?.disabled,
  { timeout: 60000 },
);
assert.match(await page.locator("main").innerText(), /500 cutii/);
assert.match(await page.locator("main").innerText(), /119\.940,00/);
assert.match(await page.locator("main").innerText(), /Compania Știință SRL/);
assert.equal(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  true,
);
await mkdir("tmp/pdfs", { recursive: true });
await page.screenshot({ path: "tmp/pdfs/cart-mobile.png", fullPage: true });
const downloadPromise = page.waitForEvent("download");
await pdfButton.click();
await (await downloadPromise).saveAs("tmp/pdfs/order-500-boxes.pdf");
await page.getByLabel("E-mail destinatar").fill("destinatar@example.ro");
const mail = new URL(
  await page
    .getByRole("link", { name: "Deschide din nou" })
    .getAttribute("href"),
);
assert.match(mail.searchParams.get("subject"), /Compania Știință SRL/);
assert.match(mail.searchParams.get("body"), /Total cutii: 500/);
assert.match(mail.searchParams.get("body"), /Voi atașa PDF-ul/);
const emailDownload = page.waitForEvent("download");
await page.getByRole("button", { name: "Trimite prin e-mail" }).click();
await emailDownload;
assert.match(await page.locator("main").innerText(), /Atașează-l manual/);
await page.evaluate(() => {
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: () => true,
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (data) => {
      window.__shared = {
        name: data.files[0].name,
        type: data.files[0].type,
        size: data.files[0].size,
        title: data.title,
      };
    },
  });
});
await page
  .getByRole("button", { name: "Partajează PDF-ul", exact: true })
  .click();
assert.equal(
  await page.evaluate(() => window.__shared.type),
  "application/pdf",
);
assert.ok(await page.evaluate(() => window.__shared.size > 1000));
await page.evaluate(() => {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async () => {
      throw new DOMException("Cancel", "AbortError");
    },
  });
});
await page
  .getByRole("button", { name: "Partajează PDF-ul", exact: true })
  .click();
await page.getByText("Partajare anulată. PDF-ul rămâne descărcat.").waitFor();
await page.evaluate(() => {
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: () => false,
  });
});
await page
  .getByRole("button", { name: "Partajează PDF-ul", exact: true })
  .click();
await page.getByText(/Partajarea fișierelor nu este disponibilă/).waitFor();
await page.getByRole("spinbutton").first().fill("51");
assert.match(await page.locator("main").innerText(), /501 cutii/);
await page.reload();
await page.getByRole("spinbutton").first().waitFor();
assert.equal(await page.getByRole("spinbutton").first().inputValue(), "51");
await page
  .getByRole("button", { name: /^Elimină / })
  .first()
  .click();
assert.equal(await page.getByRole("spinbutton").count(), 9);
await page.waitForFunction(
  () =>
    !Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Generează PDF-ul comenzii",
    )?.disabled,
);
await page.setViewportSize({ width: 1440, height: 1000 });
await page.screenshot({ path: "tmp/pdfs/cart-desktop.png", fullPage: true });
await page.getByRole("button", { name: "Golește coșul" }).click();
await page.getByText("Coșul este gol.").waitFor();
await page.reload();
await page.getByText("Coșul este gol.").waitFor();
await page.goto(`${baseUrl}/store`);
await page
  .getByRole("button", { name: "Adaugă în coș", exact: true })
  .first()
  .click({ timeout: 20000 })
  .catch(async (error) => {
    console.log(await page.locator("body").innerText());
    throw error;
  });
await page.getByRole("link", { name: /Coșul meu · 1 cutii/ }).waitFor();
await page
  .getByRole("button", { name: /^Vezi detalii:/ })
  .first()
  .click();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Adaugă în coș", exact: true })
  .click();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Închide detaliile" })
  .click();
await page.getByRole("link", { name: /Coșul meu · 2 cutii/ }).waitFor();
// Missing data must remain exportable, with an explicit prompt to complete the account.
billing.tax_number = "";
billing.trade_register = "";
await page.getByRole("link", { name: /Coșul meu · 2 cutii/ }).click();
await page.getByText(/Unele date lipsesc/).waitFor();
assert.equal(await page.getByText("Nespecificat", { exact: true }).count(), 2);
// Revalidate stale prices before enabling exports and synchronize the visible cart.
products[0].pret_engros = 25;
await page.reload();
await page.getByText(/Coșul a fost actualizat/).waitFor();
await page.waitForFunction(
  () =>
    !Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Generează PDF-ul comenzii",
    )?.disabled,
);
assert.match(await page.locator("main").innerText(), /600,00/);
await page.evaluate(() => {
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: () => true,
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async () => {
      throw new DOMException("Blocked", "NotAllowedError");
    },
  });
});
await page
  .getByRole("button", { name: "Partajează PDF-ul", exact: true })
  .click();
await page.getByText(/Partajarea nu a reușit/).waitFor();
assert.deepEqual(errors, []);
console.log(
  "PASS: 10 products, 500 boxes, account mapping, missing data, price refresh, PDF download, mailto, share success/cancel/denied/unsupported, edit/remove/clear, reload persistence, card/detail add, mobile overflow and desktop screenshots.",
);
await page.goto(`${baseUrl}/store`);
await page.getByRole("button", { name: "Adaugă în coș", exact: true }).first().waitFor();
await page.locator("#catalog").scrollIntoViewIfNeeded();
const cartLink = page.getByRole("link", { name: /Coșul meu/ });
const cartBounds = await cartLink.boundingBox();
assert.ok(cartBounds && cartBounds.y >= 0 && cartBounds.y + cartBounds.height < 844);
await page.setViewportSize({ width: 390, height: 844 });
await page.locator("#catalog").scrollIntoViewIfNeeded();
const mobileCartBounds = await cartLink.boundingBox();
assert.ok(mobileCartBounds && mobileCartBounds.y >= 0 && mobileCartBounds.y + mobileCartBounds.height < 844);
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await page.goto(`${baseUrl}/category/jucarii`);
await page.getByRole("button", { name: "Adaugă în coș", exact: true }).first().waitFor();
await page.goto(`${baseUrl}/store`);
await context.route(`${supabaseUrl}/rest/v1/rpc/catalog_facets*`, route =>
  route.fulfill({ status: 403, json: { code: "42501", message: "permission denied" } }));
await page.reload();
await page.getByText("Filtrele nu pot fi încărcate.", { exact: false }).waitFor();
await page.getByRole("button", { name: "Adaugă în coș", exact: true }).first().waitFor();
assert.equal(await cartLink.count(), 1);
console.log("PASS: catalog and cart remain available when facet loading fails; cart stays visible while scrolling.");
await browser.close();
