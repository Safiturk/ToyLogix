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
  nume_complet: "Stefan Turcanu",
  email: "cont@example.ro",
  telefon: "0700123456",
  nume_firma: "Toy Test SRL",
  rol: "user",
  status: "approved",
  is_active: true,
};
const billing = {
  legal_name: "Compania Stiinta SRL",
  tax_number: "RO12345",
  trade_register: "J40/123/2026",
  address_line1: "Strada Jucariilor 25",
  city: "Iasi",
  region: "Iasi",
  country: "Romania",
  postal_code: "700000",
  delivery_address: "Depozit Brasov, Strada Lunga 42",
  billing_email: "facturi@example.ro",
};
const products = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  nume_produs: `Jucarie educativa ${i + 1} - Stiinta si imaginatie`,
  cod_bara: `594123456${String(i).padStart(4, "0")}`,
  bucati_per_cutie: 12,
  pret_engros: 19.99,
  pret_retail: 29.99,
  stoc_actual: 10000,
  categorie: "Jucarii",
  brand: "ToyLogix",
  varsta_recomandata: "3+",
  material: "Lemn",
  descriere: "Jucarie pentru copii",
  imagini: [],
}));
const lines = [];
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
        : [{ field: "categorie", value: "Jucarii" }];
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
await page.setViewportSize({ width: 1900, height: 1000 });
await page.goto(`${baseUrl}/store`);
const trigger = page.locator("header").getByRole("button", { name: /^Cosul meu:/ });
const panel = page.getByRole("complementary", { name: "Cosul meu" });
await trigger.waitFor().catch(async (error) => { console.log((await page.locator("body").innerText()).slice(0, 2500)); console.log(errors); throw error; });
assert.equal(await panel.count(), 0, "Closed by default");
await trigger.click();
await panel.getByText("Cosul tau este gol").waitFor();
await page.waitForFunction(() => document.querySelector("header button[popoverTarget]")?.getAttribute("aria-expanded") === "true");
assert.equal(await panel.getByRole("button", { name: "Finalizeaza comanda" }).isDisabled(), true);
await trigger.click();
assert.equal(await panel.count(), 0, "Toggle closes");
const card = page.locator("article").filter({ has: page.getByRole("heading", { name: products[0].nume_produs, exact: true }) });
await card.getByRole("button", { name: "Adauga in cos", exact: true }).click();
await card.getByRole("button", { name: `Adauga o cutie: ${products[0].nume_produs}`, exact: true }).click();
await trigger.click();
assert.match(await panel.locator("output").innerText(), /2 cutii/);
assert.match(await panel.innerText(), /479,76/);
await panel.getByRole("button", { name: `Scade o cutie: ${products[0].nume_produs}`, exact: true }).click();
assert.match(await card.locator("output").innerText(), /1 cutie/);
assert.equal(await panel.isVisible(), true, "Internal clicks keep menu open");
await page.keyboard.press("Escape");
assert.equal(await panel.count(), 0, "Escape closes");
await trigger.click();
await page.getByRole("heading", { name: /Joaca incepe aici/ }).click();
assert.equal(await panel.count(), 0, "Outside click closes");
await page.reload();
await trigger.waitFor().catch(async (error) => { console.log((await page.locator("body").innerText()).slice(0, 2500)); console.log(errors); throw error; });
assert.equal(await panel.count(), 0);
await trigger.click();
assert.match(await panel.locator("output").innerText(), /1 cutie/);
async function checkAlignment() {
  const buttonBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  const contentEdge = await page.locator("main").evaluate((el) => el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight));
  assert.ok(Math.abs(buttonBox.x + buttonBox.width - contentEdge) < 2, "Trigger matches content edge");
  assert.ok(Math.abs(panelBox.x + panelBox.width - contentEdge) < 2, "Panel matches content edge");
  assert.ok(panelBox.y >= buttonBox.y + buttonBox.height, "Panel opens below trigger");
  assert.ok(panelBox.x >= 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await page.evaluate(()=>({width:innerWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right}))}))));
}
await checkAlignment();
await mkdir("artifacts/cart-ui", { recursive: true });
await page.screenshot({ path: "artifacts/cart-ui/dropdown-desktop.png" });
await page.keyboard.press("Escape");
await page.getByRole('button',{name:'Aspectul magazinului',exact:true}).click();
await page.getByRole('radio',{name:'Întunecat',exact:true}).check();
await page.getByText('Aspectul a fost salvat în contul tău.').waitFor();
await page.getByRole('button',{name:'Închide aspectul'}).click();
await trigger.click();
await page.screenshot({ path: "artifacts/cart-ui/dropdown-dark.png" });
await page.keyboard.press("Escape");
await page.getByRole('button',{name:'Aspectul magazinului',exact:true}).click();
await page.getByRole('radio',{name:'Luminos',exact:true}).check();
await page.getByText('Aspectul a fost salvat în contul tău.').waitFor();
await page.getByRole('button',{name:'Închide aspectul'}).click();
for (const width of [1280, 1024, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 900 });
  await trigger.click();
  await checkAlignment();
  if (width === 390) await page.screenshot({ path: "artifacts/cart-ui/dropdown-mobile.png" });
  await page.keyboard.press("Escape");
}
await page.setViewportSize({ width: 1280, height: 900 });
await page.getByRole("textbox", { name: "Cauta produse" }).fill("Jucarie");
await trigger.click();
await panel.getByRole("heading", { name: products[0].nume_produs, exact: true }).waitFor();
await page.keyboard.press("Escape");
await card.getByRole("button", { name: `Vezi detalii: ${products[0].nume_produs}` }).click();
const dialog = page.getByRole("dialog");
await dialog.getByRole("button", { name: /^Cosul meu:/ }).click();
await panel.getByRole("heading", { name: products[0].nume_produs, exact: true }).waitFor();
await page.keyboard.press("Escape");
assert.equal(await dialog.isVisible(), true, "Escape closes only cart inside details");
await dialog.getByRole("button", { name: "Inchide detaliile" }).click();
await page.goto(`${baseUrl}/category/jucarii`);
await trigger.waitFor().catch(async (error) => { console.log((await page.locator("body").innerText()).slice(0, 2500)); console.log(errors); throw error; });
assert.equal(await panel.count(), 0);
await trigger.click();
await panel.getByRole("heading", { name: products[0].nume_produs, exact: true }).waitFor();
await checkAlignment();
await panel.getByRole("button", { name: `Scade o cutie: ${products[0].nume_produs}`, exact: true }).click();
await panel.getByText("Cosul tau este gol").waitFor();
await page.keyboard.press("Escape");
await card.getByRole("button", { name: "Adauga in cos", exact: true }).click();
await trigger.click();
await panel.getByRole("link", { name: "Finalizeaza comanda" }).click();
await page.waitForURL("**/store/cart");
// Stock and every cart surface use boxes; pack size affects only piece totals.
products[0].stoc_actual = 20;
products[0].bucati_per_cutie = 1;
await page.evaluate(({ accountId, product }) => {
  localStorage.setItem(`toylogix-cart-v1:${accountId}`, JSON.stringify([{ product, boxes: 19 }]));
  window.dispatchEvent(new Event("toylogix-cart"));
}, { accountId: account.id, product: products[0] });
const quantity = page.getByRole("spinbutton", { name: `Cutii: ${products[0].nume_produs}` });
await quantity.waitFor();
assert.equal(await quantity.getAttribute("max"), "20");
await quantity.fill("21");
assert.equal(await quantity.inputValue(), "20");
await quantity.fill("-2");
assert.equal(await quantity.inputValue(), "20");
await page.goto(`${baseUrl}/store`);
await card.locator("output").waitFor();
assert.equal(await card.getByRole("button", { name: `Adauga o cutie: ${products[0].nume_produs}` }).isDisabled(), true);
await trigger.click();
assert.equal(await panel.getByRole("button", { name: `Adauga o cutie: ${products[0].nume_produs}` }).isDisabled(), true);
await page.keyboard.press("Escape");
const priceFilter = page.getByRole("spinbutton", { name: "Pret minim", exact: true });
await page.getByRole("button", { name: "Filtre +", exact: true }).click();
await priceFilter.fill("10");
await priceFilter.fill("-5");
assert.equal(await priceFilter.inputValue(), "10");
await priceFilter.press("-");
assert.equal(await priceFilter.inputValue(), "10");
await priceFilter.fill("0");
assert.equal(await priceFilter.inputValue(), "0");

// A fresh database response must override an old cart snapshot before a PDF is prepared.
products[0].stoc_actual = 7;
await page.goto(`${baseUrl}/store/cart`);
await page.waitForFunction(() => document.querySelector('input[type="number"]')?.value === "7");
assert.equal(await quantity.getAttribute("max"), "7");
products[0].stoc_actual = 20;
products[0].bucati_per_cutie = 6;
await page.reload();
await page.waitForFunction(() => document.querySelector('input[type="number"]')?.max === "20");
assert.equal(await quantity.inputValue(), "7");
await quantity.fill("21");
assert.equal(await quantity.inputValue(), "20");
await page.getByText("Cantitate: 120 bucati", { exact: true }).waitFor();
products[0].stoc_actual = 0;
await page.reload();
await page.getByRole("heading", { name: "Cosul este gol." }).waitFor();
await page.goto(`${baseUrl}/store`);
await card.getByRole("button", { name: "Adauga in cos", exact: true }).waitFor();
assert.equal(await card.getByRole("button", { name: "Adauga in cos", exact: true }).isDisabled(), true);
assert.deepEqual(errors, []);
await browser.close();
console.log("PASS: cart UI regression, stock caps on all cart controls, typed negative values, zero price filter, fresh stock/pack changes and unavailable products");



