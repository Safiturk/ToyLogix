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
let savedTheme;
let failSave = false;
let writes = 0;
const browser = await chromium.launch({ headless: true, channel: "msedge" });

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
await context.routeWebSocket(
  `${supabaseUrl.replace("https:", "wss:").replace("http:", "ws:")}/**`,
  (socket) => socket.close(),
);
const mockBackend = async (route) => {
  const url = new URL(route.request().url());

  if (legacyCatalog && url.pathname.includes("catalog_facets")) {
    await route.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find public.catalog_facets(p_category)" } });
    return;
  }
  if (legacyCatalog && url.searchParams.get("select") === "is_archived") {
    await route.fulfill({ status: 400, json: { code: "42703", message: "column produse.is_archived does not exist" } });
    return;
  }

  if (url.pathname.endsWith('/auth/v1/user') && route.request().method() === 'PUT') {
    writes++;
    if (failSave) { await route.fulfill({status:500,json:{msg:'offline'}}); return; }
    savedTheme = route.request().postDataJSON().data.catalog_theme;
    await route.fulfill({json:{id:account.auth_user_id,email:account.email,email_confirmed_at:'2026-01-01',aud:'authenticated',role:'authenticated',user_metadata:{catalog_theme:savedTheme}}});
    return;
  }
  let body = [];
  if (url.pathname.endsWith("/auth/v1/user"))
    body = {
      user_metadata: { catalog_theme: savedTheme },
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
};
await context.route(`${supabaseUrl}/**`, mockBackend);
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
    if (!localStorage.getItem(storageKey)) localStorage.setItem(
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
page.on('pageerror', e => errors.push(e.message));
await mkdir('artifacts/petrol-theme', { recursive: true });
await page.setViewportSize({width:1440,height:1000});
await page.goto(`${baseUrl}/store`);
await page.getByRole('button',{name:'Meniul contului'}).click();
await page.getByRole('button', {name:'Aspectul magazinului',exact:true}).click();
const picker = page.getByRole('dialog', {name:'Aspectul magazinului'});
await picker.getByRole('button', {name:/Petrol/}).click();
await picker.getByText('Aspectul a fost salvat în contul tău.').waitFor();
assert.equal(savedTheme,'petrol');
assert.equal(writes,1);
await picker.getByRole('button',{name:'Închide aspectul'}).click();
await page.locator('[data-theme="petrol"] header').first().waitFor();
await page.locator('article').first().waitFor();
await page.screenshot({path:'artifacts/petrol-theme/desktop.png',fullPage:true});
await page.getByRole('button',{name:'Adauga in cos',exact:true}).first().click();
await page.getByRole('button',{name:/^Cosul meu:/}).click();
const cartPanel=page.getByRole('complementary',{name:'Cosul meu'});
await cartPanel.waitFor();
assert.equal(await cartPanel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(26, 33, 30)');
await page.screenshot({path:'artifacts/petrol-theme/cart.png'});
await page.reload();
await page.locator('[data-theme="petrol"] header').first().waitFor();
assert.equal(writes,1,'reload does not write preferences');
await page.goto(`${baseUrl}/store/cart`);
await page.getByRole('heading',{name:/Cosul/}).first().waitFor();
assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 22, 21)');
await page.goto(`${baseUrl}/store`);
await page.setViewportSize({width:390,height:844});
await page.getByRole('button',{name:'Meniul contului'}).click();
await page.getByRole('button',{name:'Aspectul magazinului',exact:true}).click();
await picker.waitFor();
await page.screenshot({path:'artifacts/petrol-theme/mobile-picker.png'});
await picker.getByRole('button',{name:/Clasic/}).click();
await picker.getByText('Aspectul a fost salvat în contul tău.').waitFor();
await picker.getByRole('radio',{name:'Întunecat',exact:true}).check();
await picker.getByText('Aspectul a fost salvat în contul tău.').waitFor();
assert.equal(savedTheme,'dark');
await picker.getByRole('button',{name:/Petrol/}).click();
await picker.getByText('Aspectul a fost salvat în contul tău.').waitFor();
await picker.getByRole('button',{name:'Închide aspectul'}).click();
await page.locator('article').first().waitFor();
await page.screenshot({path:'artifacts/petrol-theme/mobile.png',fullPage:true});
for(const width of [320,390,768,1440]) {
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`no overflow at ${width}`);
}
await page.getByRole('button',{name:'Meniul contului'}).click();
await page.getByRole('button',{name:'Aspectul magazinului',exact:true}).click();
failSave=true;
await picker.getByRole('button',{name:/Clasic/}).click();
await picker.getByText(/Salvarea în cont a eșuat/).waitFor();
failSave=false;
await picker.getByRole('button',{name:/Petrol/}).click();
await picker.getByText('Aspectul a fost salvat în contul tău.').waitFor();
// A new browser has no local preference cache and restores account metadata.
const savedSession = await page.evaluate((ref)=>localStorage.getItem('sb-'+ref+'-auth-token'),ref);
const otherDevice = await browser.newContext();
await otherDevice.route(`${supabaseUrl}/**`,mockBackend);
await otherDevice.routeWebSocket(`${supabaseUrl.replace('https:','wss:').replace('http:','ws:')}/**`,socket=>socket.close());
await otherDevice.addInitScript(({ref,savedSession})=>localStorage.setItem('sb-'+ref+'-auth-token',savedSession),{ref,savedSession});
const otherPage=await otherDevice.newPage();
await otherPage.goto(`${baseUrl}/store`);
await otherPage.locator('[data-theme="petrol"] header').first().waitFor();
assert.equal(await otherPage.evaluate(id=>localStorage.getItem('toylogix-theme:'+id),account.auth_user_id),null,'uses account metadata without a device cache');
await otherDevice.close();
assert.deepEqual(errors,[]);
await browser.close();
console.log('PASS: account save, reload, classic modes, mobile picker, cart styling, save failure/retry and responsive widths');

