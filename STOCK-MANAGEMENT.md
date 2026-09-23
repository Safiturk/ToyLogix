# Stok yönetimi

Sonraki hesap güvenliği çalışmasıyla birlikte nihai doğrulama: 48 test ve 7
eşzamanlılık senaryosu geçti; lint (iki mevcut uyarıyla), type-check ve 20 sayfalık
build başarılı. Aşağıdaki ilk stok tesliminin test sayıları tarihsel kayıttır.
Yeni admin MFA gereksinimleri ve ek migration için
[SECURITY-MANAGEMENT.md](./SECURITY-MANAGEMENT.md) belgesini okuyun.

## İlk tarama (23 Eylül 2026)

| Madde | Başlangıç durumu |
| --- | --- |
| 1–3 Hareket geçmişi, türleri ve zorunlu bilgiler | Yok |
| 4 Doğrudan stok değişikliğinin engellenmesi | Yok; admin ürün formu tüm nesneyi insert/update ediyor |
| 5–6 Transaction ve eşzamanlılık | Stok için RPC/kilit yok |
| 7 Negatif stok | Uygulama doğrulaması yok; temel tablo DDL'i depoda bulunmuyor |
| 8 Ters işlem | Yok |
| 9 Hareket filtreleri | Yok |
| 10 Arşivleme | Yok; ürünler fiziksel olarak siliniyor |
| 11 Kritik stok | Kısmen; `stoc_critic` eşiği ve sayaç var, detay/geçmiş bağlantısı yok |

Mevcut mimari Next.js istemci bileşenleri ve Supabase istemcisi kullanıyor.
Ürün tablosunun gerçek adı `produse`, stok alanı `stoc_actual`, kritik eşik
`stoc_critic`. Kimlikler `auth.users` ve `utilizatori.auth_user_id` ile eşleniyor.
Depodaki önceki migration hesap güvenliği ve RLS kurallarını oluşturuyor;
ilk ürün/kullanıcı tablo tanımları depoda yok.

## Uygulama raporu

Aşağıdaki durumlar yerel kod/migration teslimini gösterir. Canlı Supabase'e
migration uygulanmadı; GitHub'a gönderim ve Netlify yayını yapılmadı.

Kısaltmalar:

- **M:** `supabase/migrations/202609230001_stock_management.sql` (tek yeni migration).
- **DB testi:** `tests/stock-database.test.mjs`; yerel şema `tests/fixtures/legacy-schema.sql`.
- **Kural testi:** `tests/stock.test.mjs`.
- **Eşzamanlılık testi:** `tests/integration/stock-concurrency.mjs`.

| # | Durum | Değişen/eklenen dosyalar | Migration | Eklenen testler ve notlar |
| --- | --- | --- | --- | --- |
| 1. Hareket geçmişi | ✅ Yapıldı | M, `lib/stock-rules.ts`, `lib/stock.ts`, `app/admin/StockManagement.tsx` | M: `stock_movements` | DB: geçmiş, FK, denetim alanları; ürün FK'si mevcut `produse.id` alanına gider |
| 2. Ayrı işlem türleri | ✅ Yapıldı | M, `lib/stock-rules.ts`, `app/admin/StockManagement.tsx` | M: `stock_movement_type` enum, yön CHECK'i | DB + kural: beş tür; giriş/iade +, çıkış −, sayım farkı ±, ters işlem sunucuda hesaplanır |
| 3. Zorunlu bilgiler | ✅ Yapıldı | M, `lib/stock-rules.ts`, `app/admin/StockManagement.tsx` | M: NOT NULL, boş/yalnızca boşluk gerekçesi kontrolü | DB + kural: sıfır/kesirli/geçersiz miktar, boş gerekçe; tarih sunucu saati, kullanıcı `auth.uid()` |
| 4. Doğrudan değişiklik engeli | ✅ Yapıldı | M, `app/admin/page.tsx`, `lib/stock-rules.ts` | M: kolon yetkileri ve koruma trigger'ı | DB: doğrudan update/insert ve geçmiş kurcalama reddi; kural: eski ürün formu stok/bakiye/id alanlarını gönderemez |
| 5. Transaction bütünlüğü | ✅ Yapıldı | M, `lib/stock.ts` | M: `record_stock_movement` RPC + hareket trigger'ı | DB: hatalı kayıt ve iptal edilen transaction her iki yazmayı geri alır |
| 6. Eşzamanlılık | ✅ Yapıldı | M, eşzamanlılık testi | M: ürün üzerinde `SELECT … FOR UPDATE` | Ayrı PostgreSQL bağlantıları: iki çıkış, iki giriş, çift ters işlem, arşiv/işlem yarışı; arşiv UPDATE'i aynı satır kilidini alır |
| 7. Negatif stok kuralı | ✅ Yapıldı | M, `lib/stock-rules.ts`, `lib/stock.ts` | M: `stock_nonnegative` CHECK | DB + kural: sıfıra düşüş serbest, eksi bakiye ve tamsayı taşması yasak; UI açıklayıcı hata gösterir |
| 8. Ters işlem | ✅ Yapıldı | M, `lib/stock.ts`, `app/admin/StockManagement.tsx` | M: `reversal_of` FK/UNIQUE, `reversed_at`, değişmez geçmiş | DB: çift/zincir/farklı ürün ters işlemi ve yetersiz stok; orijinal kayıt korunur |
| 9. Filtreleme | ✅ Yapıldı | `lib/stock-rules.ts`, `lib/stock.ts`, `app/admin/StockManagement.tsx`, `app/admin/stock.module.css` | M: ürün/kullanıcı/tür/tarih indeksleri | Kural: tüm filtreler birlikte, tarih sınırları ve sayfalama; API'de filtrelenir, sayfa başına 50 kayıt; filtre değişiminde eski istek iptal edilir |
| 10. Arşivleme | ✅ Yapıldı | M, `lib/stock.ts`, `app/admin/ProductInventory.tsx`, `app/admin/page.tsx`, `app/admin/models.ts`, `app/store/Storefront.tsx` | M: `is_archived`, `archived_at`, katalog RLS | DB: geçmiş korunur, arşivli ürün müşteriye görünmez, stok işlemi reddedilir; admin aktif/arşivli/tümü ve yeniden etkinleştirme seçeneklerine sahiptir |
| 11. Kritik stok | ✅ Yapıldı | M, `app/admin/page.tsx`, `app/admin/models.ts`, `app/admin/StockManagement.tsx` | M: `critical_stock_level` üretilmiş kolon | DB: kritik eşik korunur/güncellenir; kritik liste → ürün detayı → geçmiş bağlantısı; yeni ayrı eşik kaynağı oluşturulmaz |

`package.json`, `package-lock.json` ve `pnpm-lock.yaml` test bağımlılıkları için;
`README.md` ve bu belge çalışma/kurulum/rapor için güncellenir.

## Kararlar ve kullanım

- Kullanıcının “projeye uygun olanı yap” yönlendirmesiyle mevcut bakiye korunur,
  negatif stok yasaklanır. Geçmiş için kişi, tarih veya gerekçe tahmin edilmez.
- Mevcut Romence adlar korunur: `products` karşılığı `produse`, `stock`
  karşılığı `stoc_actual`. `critical_stock_level`, mevcut `stoc_critic` değerinden
  üretilir; eşik ürün formundaki **Prag stoc critic** alanından değiştirilir.
- Yeni ürün önce sıfır stokla kaydedilir; ardından stok panelinden gerekçeli
  **Intrare** hareketi girilir. Sayım düzeltmesinde son stok değil fark girilir.
- Giriş, çıkış ve iade formunda miktar pozitif girilir. Çıkışı veri katmanı negatif
  işarete çevirir. RPC yön kurallarını ayrıca denetler.
- Hareket tarihi gerçek kayıt zamanıdır; kullanıcı tarafından geriye dönük
  değiştirilmez. Tarih filtresi tarayıcının yerel takvimini kullanır; bitiş günü
  dahildir, sorguda sonraki günün başlangıcı hariç tutulur.
- Kullanıcı filtresinde mevcut hesaplar önerilir. Profili silinmiş hesaplar için
  geçmişteki Auth UUID'si kullanılabilir. FK nedeniyle hareketi olan Auth hesabı
  silinemez; kayıt sahibi kaybolmaz.
- Arşivlenmiş üründe stok işlemi veya ters işlem için önce yeniden etkinleştirme
  gerekir. Stok/hareket silme kullanıcı yetkilerine kapalıdır.
- Sayfa yüklenirken alınan bakiye yalnızca erken form doğrulaması içindir. Son
  karar kilit altındaki güncel veritabanı bakiyesiyle verilir.
- Bağlantı hatasında işlemin sonucu belirsiz olabilir. UI geçmişi yeniden yükler;
  yeniden göndermeden önce kaydı kontrol edin. RPC otomatik yeniden denenmez.
- Bakiye uzlaştırması: `stoc_actual = opening_stock + SUM(stock_movements.quantity)`.
  Ters çevrilen orijinal hareketler toplamdan çıkarılmaz; ters kayıt zaten etkisini
  dengeler. Başlangıç bakiyesi değiştirilemez.

## Migration ve doğrulama

1. Önce mevcut veritabanı yedeğini alın ve hesap güvenliği migration'ının
   uygulanmış olduğunu doğrulayın. Temel tablo DDL'i depoda bulunmadığından test
   fixture'ı canlı şemanın birebir kopyası değildir.
2. `202609230001_stock_management.sql` dosyasını hedef Supabase SQL Editor veya
   normal migration akışıyla uygulayın. Dosya kendi transaction'ını içerir.
   NULL/negatif/kesirli eski stok veya geçersiz eşik bulunursa işlem durur;
   veriler sessizce düzeltilmez. Bu değişiklikte canlı veritabanı değiştirilmedi.
3. Yeni UI'ı migration sonrasında çalıştırın. Eski UI doğrudan stok göndermeye
   çalışacağından veritabanı bunu reddeder; schema ve UI birlikte kullanılmalıdır.
4. `npm run lint`, `npm run typecheck`, `npm test`,
   `npm run test:concurrency`, `npm run build` çalıştırın.
5. Yönetici ile ürün seçip giriş/çıkış/iade/sayım/ters işlem deneyin; ürün,
   tarih, kullanıcı ve tür filtrelerini birlikte kullanın. Arşivleyip varsayılan
   katalogdan kaybolduğunu ve geçmişinin admin ekranında kaldığını doğrulayın.

Testler canlı bağlantı veya gerçek müşteri verisi kullanmaz. PGlite testi önce
önceki hesap migration'ını, sonra stok migration'ını çalıştırır; mevcut
`supabase/tests/account_security.sql` testini de aynen yürütür. Eşzamanlılık
testi ayrı, geçici yerel PostgreSQL sürecinde üç bağlantı açar; ikinci işlemin
gerçekten kilit beklediğini `pg_blocking_pids` ile doğrular. İş bitince süreç
durdurulur ve yalnızca bu test için oluşturulan geçici veritabanı temizlenir.

### Yerel doğrulama sonucu (23 Eylül 2026)

- `npm run lint`: başarılı; başlangıçta da bulunan iki `no-img-element` uyarısı devam ediyor.
- `npm run typecheck`: başarılı.
- `npm test`: 28 test başarılı; eski testler ve önceki hesap güvenliği SQL testi dahil.
- `npm run test:concurrency`: dört gerçek çok bağlantılı senaryo başarılı.
- `npm run build`: başarılı, 14 sayfa üretildi.
- Canlı şemaya uygulama ve gerçek hesapla tarayıcı kabul testi yapılmadı.
- Önceden değiştirilmiş `MobileAccountMenu.tsx` dosyasına dokunulmadı.
  `Storefront.tsx` içindeki mevcut değişiklikler korundu; yalnızca arşiv filtresi eklendi.
