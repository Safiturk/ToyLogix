// Run against npm run dev -- --port 3100. All account/product requests are mocked;
// no database writes, email delivery or real native share occurs.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const {jsPDF}=require('jspdf');
const receiptDoc=new jsPDF();receiptDoc.text('Payment receipt test',20,20);const receiptPdf=Buffer.from(receiptDoc.output('arraybuffer'));
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
const lines = products.map((product) => ({ product, boxes: 50 }));
const order={id:'77777777-7777-4777-8777-777777777777',code:'TLX-2026-0042',user_id:account.auth_user_id,status:'pending_review',total_cents:11994000,bank_iban:'RO49 BTRL 0000 1234 5678 9001',bank_beneficiary:'ToyLogix',bank_name:'Banca Transilvania',receipt_url:null,created_at:'2026-09-30T10:00:00Z',customer_email:account.email,company:{account,billing}};
const events=[{id:1,status:order.status,created_at:order.created_at,actor:account.auth_user_id}];
const addEvent=()=>events.push({id:events.length+1,status:order.status,created_at:new Date().toISOString(),actor:account.auth_user_id});
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
  if(url.pathname.includes('/storage/v1/object/sign/order-receipts/')){
   if(route.request().method()==='POST')await route.fulfill({json:{signedURL:'/object/sign/order-receipts/test/receipt.pdf?token=test'}});
   else await route.fulfill({body:receiptPdf,contentType:'application/pdf'});
   return;
  }

  if (legacyCatalog && url.pathname.includes("catalog_facets")) {
    await route.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find public.catalog_facets(p_category)" } });
    return;
  }
  if (legacyCatalog && url.searchParams.get("select") === "is_archived") {
    await route.fulfill({ status: 400, json: { code: "42703", message: "column produse.is_archived does not exist" } });
    return;
  }

  let body = [];
  if(url.pathname.endsWith('/b2b_orders')) { const filter=url.searchParams.get('status');const rows=!filter||filter.includes(order.status)?[order]:[];await route.fulfill({json:url.searchParams.has('id') ? order : rows,headers:{'content-range':`0-0/${rows.length}`,'access-control-expose-headers':'content-range'}});return; }
  if(url.pathname.endsWith('/b2b_order_lines')) { await route.fulfill({json:lines});return; }
  if(url.pathname.endsWith('/b2b_order_events')){await route.fulfill({json:events});return;}
  if(url.pathname.endsWith('/order_email_state')){await route.fulfill({json:{sent_at:null,pending_updates:0}});return;}
  if(url.pathname.endsWith('/order_inbox')){await route.fulfill({json:{unread:1,counts:{[order.status]:1},notifications:[{id:1,order_id:order.id,code:order.code,status:order.status,created_at:order.created_at,unread:true}],latest:[order]}});return;}
  if(url.pathname.endsWith('/mark_order_notifications_read')){await route.fulfill({json:null});return;}
  if(url.pathname.endsWith('/toylogix_is_admin')) {await route.fulfill({json:true});return;}
  if(url.pathname.endsWith('/transition_b2b_order')) {order.status=route.request().postDataJSON().p_status;addEvent();await route.fulfill({json:order});return;}

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


await context.route(baseUrl+'/api/orders',async route=>{
 assert.equal(route.request().postDataJSON().lines.length,10);
 await route.fulfill({json:{order,notificationPending:false}});
});
await context.route(baseUrl+'/api/orders/receipt',async route=>{order.receipt_url='test/receipt.pdf';order.status='payment_under_review';addEvent();await route.fulfill({json:{order}});});
await context.route(baseUrl+'/api/orders/notifications',route=>route.fulfill({json:{configured:true,missing:[],pending:1,ok:true}}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(baseUrl+'/store/cart');
 await page.getByRole('button',{name:'Trimite cererea de comanda',exact:true}).click();
 await page.waitForURL('**/store/orders?order=*');
 await page.getByRole('heading',{name:'Cerere inregistrata · TLX-2026-0042'}).waitFor();
 assert.ok(await page.getByText('RO49 BTRL 0000 1234 5678 9001',{exact:true}).isVisible());
 await page.getByRole('heading',{name:'Istoricul comenzii',exact:true}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test')});
 await page.getByText('Dovada a fost incarcata.',{exact:false}).waitFor();
 assert.ok(await page.getByText('Plata in curs de verificare',{exact:true}).first().isVisible());
 await mkdir('tmp/pdfs',{recursive:true});await page.screenshot({path:'tmp/pdfs/b2b-order-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 account.rol='admin';
 await page.goto(baseUrl+'/admin/orders');
 await page.getByRole('button',{name:'TLX-2026-0042',exact:true}).click();
 const proof=page.getByRole('region',{name:'Dovada platii',exact:true});
 await proof.getByText('Document incarcat',{exact:true}).waitFor();
 await proof.getByRole('link',{name:'Deschide documentul intr-o fila noua ↗',exact:true}).waitFor();
 assert.ok(await proof.locator('iframe[title="Previzualizare dovada platii PDF"]').isVisible());
 assert.ok(await proof.getByRole('link').getAttribute('href').then(href=>href.includes('/storage/v1/object/sign/order-receipts/')));
 const opened=page.waitForEvent('popup');await proof.getByRole('link').click();const receiptPage=await opened;await receiptPage.waitForLoadState();assert.ok(receiptPage.url().includes('/order-receipts/'));await receiptPage.close();
 await page.getByRole('button',{name:'Confirma plata',exact:true}).click();
 await page.getByText('Starea comenzii a fost actualizata.',{exact:true}).waitFor();
 assert.equal(order.status,'payment_confirmed');
 assert.equal(await page.getByRole('button',{name:'Confirma plata',exact:true}).count(),0);
 await page.getByRole('combobox',{name:'Filtreaza comenzile'}).selectOption('history');
 await page.getByRole('button',{name:order.code,exact:true}).waitFor();
 assert.ok(await page.getByText('Plata confirmata',{exact:true}).first().isVisible());
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'tmp/pdfs/b2b-order-admin.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('B2B checkout, optional receipt, Romanian admin actions and mobile layout passed.');
}finally{await browser.close();}
