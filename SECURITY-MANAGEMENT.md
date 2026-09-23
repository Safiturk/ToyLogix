# Hesap güvenliği — uygulama ve doğrulama raporu

## Kapsam ve mevcut durum

Kod ve Supabase şeması önce okundu. Mevcut yapı Next.js 16 App Router ve
Supabase Auth/PostgreSQL kullanıyor. Gerçek tablolar `utilizatori` (kullanıcı
profili), `billing_profiles` (fatura bilgileri) ve `produse` (ürünler).
`public.users` ve `public.invoices` mevcut değil; ikinci kullanıcı sistemi veya
gereksiz fatura tablosu oluşturulmadı.

Önceden bulunanlar: e-posta/parola ile Auth girişi, kayıt/şifre yenileme ekranları,
pending/approved/rejected durumları, yönetici kontrolü, temel profil/faturalama
RLS kuralları ve `save_my_account` işlemi. Önceki stok çalışması ayrı migration,
RPC, arşivleme ve testler içeriyordu. Eksikler: audit, ayrı hesap kapatma/silme
işlemleri, 2FA, kalıcı deneme sınırları ve eski oturumdan bağımsız bağlantı kontrolü.

**Bu değişiklikler yereldir. Netlify yayını, GitHub push veya canlı migration
uygulaması yapılmadı.** Aşağıdaki “yapıldı” ifadeleri kod/migration ve yerel
testlerin tamamlandığını belirtir; canlı kullanıma alındığı anlamına gelmez.

## Madde bazında sonuç

Tüm veritabanı değişiklikleri `supabase/migrations/20260923210656_account_hardening.sql`
dosyasındadır. Ön koşulları sırasıyla `202609190001_account_security.sql` ve
`202609230001_stock_management.sql` migration'larıdır.

| Madde | Sonuç | Eklenen/değişen dosyalar | Testler ve notlar |
| --- | --- | --- | --- |
| 1. Yönetici, onaylı, bekleyen, reddedilen senaryoları | ✅ Yapıldı | `lib/security-rules.ts`, `lib/account.ts`, `app/components/AccessGate.tsx`, `app/components/AccountAccess.tsx`, `app/account/page.tsx` | `tests/security-rules.test.mjs`, `tests/account-security.test.mjs`: yönlendirme, onay, kapatma, MFA, süresi bitmiş/iptal edilmiş oturum. Bekleyen müşteri kendi profil/faturasını tamamlar; kataloğa giremez. |
| 2. Hesap/fatura RLS | ✅ Yapıldı | Yeni migration | İki kullanıcı arasında okuma/yazma izolasyonu, sahiplik aktarımı ve kendi rolünü yükseltme engeli. Admin müşteri detayını okuyabilir. `invoices` varsa yalnız doğrulanmış UUID `user_id` sahiplik şeması kabul edilir; bilinmeyen şemada migration durur. Opsiyonel fatura tablosu ayrıca test edildi. |
| 3. Rol/onay audit log | ✅ Yapıldı | Yeni migration, `app/admin/AuditHistory.tsx`, `app/admin/page.tsx` | Gerçek aktör/hedef UUID, action, önceki/yeni değer ve sunucu zamanı; UPDATE/DELETE/TRUNCATE engeli. Admin panelinde sayfalı geçmiş. |
| 4. Yetkinin anında etkili olması | ✅ Yapıldı | Yeni migration, `lib/auth-server.ts`, `app/api/admin/accounts/delete/route.ts`, AccessGate | Her DB isteğinde güncel profil + Auth oturumu + admin için doğrulanmış faktör kontrolü. Değişmeyen JWT ve açık bağlantıda rol iptali, oturum/faktör silinmesi test edildi. UI odakta/30 saniyede yenilenir; güvenlik UI zamanlamasına bağlı değildir. |
| 5. Silme/kapatma ayrımı | ✅ Yapıldı | Yeni migration, admin paneli, hesap silme endpoint'i | Ayrı `deactivate_account`, `delete_profile`, `prepare_account_deletion` ve sunucuda Auth silme. Kendi hesabını silme/kapatma engeli, FK davranışları ve profilin kendiliğinden yeniden oluşturulmaması test edildi. |
| 6. Gerçek e-posta ve hatalı bağlantı | ⚠️ Kısmen yapıldı | `app/api/auth/signup/route.ts`, `app/api/auth/reset/route.ts`, `app/components/CustomerAuth.tsx`, `AccountAccess.tsx`, `app/email-confirmed/page.tsx`, `lib/supabase.ts`, `lib/security-rules.ts` | Gerçek reset isteği Supabase tarafından kabul edildi; kullanıcı e-postanın ulaştığını doğruladı. Parola değiştirilmedi. Eski oturum, süresi dolmuş/kullanılmış bağlantı ve yanlış yönlendirme testleri geçti. Yeni kayıt doğrulama e-postasının teslimatı ve bağlantıdan parola değiştirme uçtan uca sınanmadı. |
| 7. Yönetici TOTP ve kurtarma kodları | ✅ Yapıldı (altyapı) | `app/account/security/page.tsx`, `app/api/auth/mfa/recover/route.ts`, yeni migration | QR/manual kurulum, 6 haneli doğrulama, AAL2 zorunluluğu, tek seferlik 10 kod; yalnız SHA-256 özeti saklanır. Yenileme eskileri iptal eder. Kod tekrarı ve eşzamanlı tüketim test edildi. Gerçek yönetici faktörlerine dokunulmadı; cihazla kurulum/doğrulama staging kontrolü bekliyor. |
| 8. Giriş/kayıt/reset rate limiting | ✅ Yapıldı (uygulama endpoint'leri) | `lib/auth-handler.ts`, `lib/auth-server.ts`, `lib/auth-client.ts`, `app/api/auth/{login,signup,reset}/route.ts`, migration, `.env.example` | Kalıcı atomik PostgreSQL sayacı, IP + normalize e-posta, 429/Retry-After, Origin kontrolü ve hata durumunda kapalı erişim. Sahte X-Forwarded-For ve paralel istekler test edildi. Doğrudan Supabase Auth çağrıları ayrıca sağlayıcının limitlerine tabidir; canlı sağlayıcı ayarları değiştirilmedi. |

## Erişim matrisi

| Hesap | Giriş sonrası | Kendi profil/faturası | Katalog | Yönetim |
| --- | --- | --- | --- | --- |
| E-postası doğrulanmamış | Doğrulama gerekli | Hayır | Hayır | Hayır |
| Onaylı müşteri | `/store` | Evet | Evet | Hayır |
| Bekleyen müşteri | `/account` | Evet | Hayır | Hayır |
| Onayı bekleyen admin | Giriş reddedilir; önce onay gerekir | Hayır | Hayır | Hayır |
| Reddedilmiş / erişimi kapalı / profili silinmiş | Giriş reddedilir | Hayır | Hayır | Hayır |
| Onaylı admin, AAL1 | `/account/security` | Yalnız 2FA için gerekli kendi profilini okuyabilir | Hayır | Hayır |
| Onaylı admin, geçerli AAL2 | `/admin` | Evet | Evet | Evet |

Kontroller imzalı JWT'yi tek başına yeterli saymaz: ilgili `auth.sessions`
kaydı, hesabın doğrulanması/yasaklanma durumu, güncel profil ve admin için
oturumla ilişkili doğrulanmış MFA faktörü sorgulanır. İptalden önce başlamış bir
veritabanı işlemi PostgreSQL işlem kurallarıyla tamamlanabilir; iptal commit
edildikten sonraki istekler eski JWT ile yetki kazanamaz.

## Hesap yaşam döngüsü ve verinin korunması

- **Erişimi kapat:** `is_active=false`. Auth, profil, faturalar ve geçmiş kalır.
  Yeniden açılması onay durumunu veya rolü değiştirmez.
- **Profili sil:** `utilizatori` satırı silinir. Auth ve fatura bilgileri korunur;
  profil olmadığından uygulama erişimi yoktur. `private.deleted_profiles`
  işareti, Auth güncellenince profilin yeniden yaratılmasını engeller. Bu işlem
  tüm kişisel verileri silme işlemi değildir. Sonradan Auth silmek gerekirse
  saklanan UUID ile güvenilir Auth yönetim süreci gerekir; profil listesindeki
  buton artık o kullanıcıyı içermez.
- **Hesabı sil:** Sunucu önce MFA/güncel admin yetkisini denetleyip hedef erişimini
  kapatır ve talebi audit'e kaydeder; sonra Supabase Admin API ile Auth'u siler.
  `utilizatori.auth_user_id` ve `billing_profiles.user_id` CASCADE, stok hareketi
  aktörü RESTRICT, varsa `invoices.user_id` RESTRICT kullanır. Fatura profili,
  düzenlenmiş faturadan farklıdır. Stok/fatura geçmişi varsa Auth silme reddedilir;
  erişimi kapatma kullanılabilir. Auth silme ayrı servis çağrısıdır: hata olursa
  erişim kapalı kalır ve UI başarısızlığı bildirir; dağıtık transaction iddiası yoktur.
- Audit UUID'leri bilerek FK değildir: Auth silinse de aktör/hedef tarihsel
  kimliği kaybolmaz. Servis/sistem kaynaklı olaylarda aktör null olabilir;
  hesap silme talebinin gerçek admin aktörü ayrı audit olayında kayıtlıdır.

## 2FA akışı

İlk admin girişi kurulum ekranına gider. Auth'un TOTP challenge/verify işlemi
başarılı olana kadar yönetim RLS ve stok RPC'leri kapalıdır. İlk kurulum mevcut
hesabın birinci faktörüne güvenir; canlı geçişte ilk kurulumu gerçek hesap sahibi
yapmalıdır. Doğrulanmış faktörü olan hesap tekrar kurulumla doğrulamayı atlayamaz.

Kurtarma kodları yalnız AAL2 admin oturumunda üretilebilir, ekranda bir kez
gösterilir; localStorage, log veya düz metin DB alanına yazılmaz. Kod kullanımı
hesap başına 10 dakikada 5 denemeyle sınırlandırılır. Doğru kod sunucuda mevcut
faktörleri kaldırıp oturumları kapatır. Kullanıcı yeniden giriş yapıp TOTP kurar;
kurtarma kodu AAL1 oturumuna yönetim yetkisi vermez. Sağlayıcı çağrısı yarıda
kalırsa kod tüketilmiş olabilir; hata mesajı bunu belirtir, başarı gösterilmez.

## Yapılandırma ve ileride canlıya geçiş

1. `.env.example` alanlarını güvenli sunucu ortamında tamamlayın. Yeni gerekli
   değerler `SUPABASE_SERVICE_ROLE_KEY`, en az 32 karakter rastgele
   `AUTH_RATE_LIMIT_SECRET` ve kanonik `AUTH_SITE_URL` değeridir. Servis anahtarını
   hiçbir `NEXT_PUBLIC_` değişkenine veya Git'e eklemeyin. Bu çalışmada yerel
   ortamda servis anahtarı bulunmadığı için gerçek sunucu Auth akışı devreye alınmadı.
2. Hedef veritabanında yedek/inceleme sonrası migration'ları sırayla uygulayın;
   yeni UI ile koordineli geçiş gerekir. Yerel Supabase/PostgreSQL testleri canlı
   migration yerine geçmez. Eski canlı UI zorunlu MFA ekranını içermediğinden
   hardening migration'ını tek başına canlıya uygulamak admin erişimini keser.
3. Supabase Site URL / izin verilen redirect listesi ile `AUTH_SITE_URL` aynı
   kanonik origin'i kullanmalı. `/email-confirmed` ve `/update-password` için
   tam adresleri ekleyin; SMTP ve e-posta doğrulaması etkin olmalı. Şablonlarda
   `{{ .ConfirmationURL }}` akışını koruyun. Auth doğrulama linkleri tek kullanımlıdır;
   reset ekranı ayrıca 30 dakikadan eski recovery oturumunu reddeder.
4. Normal kayıt ve reset ekranları Next sunucusundaki endpoint'leri çağırır.
   Limitler: login IP30/e-posta10 / 10 dakika; signup IP5/e-posta3 / saat;
   reset IP10/e-posta3 / saat. Anahtarlar HMAC ile anonimleştirilir. Sayaçlar
   PostgreSQL'de kalıcıdır; süreç yeniden başlatılması limiti sıfırlamaz. İki günden
   eski sayaçlar her çağrıda en fazla 100 satır temizlenir.
5. Netlify ortamında yalnız platformun `x-nf-client-connection-ip` başlığı
   kullanılır (`NETLIFY=true`). Diğer ortamlarda IP başlığına güvenilmez; ortak
   sunucu kovası kullanılır. Başka platformda gerçek istemci IP'si için güvenilir
   proxy adaptörü eklenmelidir. Kanonik origin dışından gelen formlar reddedilir.
6. Public Supabase Auth API'si erişilebilir olmaya devam eder: uygulama limitleri
   sağlayıcının [Auth limitlerinin](https://supabase.com/docs/guides/auth/rate-limits)
   yerine geçmez. Canlı sağlayıcı limitleri/CAPTCHA tercihi ayrıca yapılandırılmalı.
7. Staging'de yeni bir test müşterisiyle doğrulama e-postası, fresh/expired/reused
   link ve yeni parola girişini; test adminiyle TOTP/kurtarma ve hesap silme hata
   yollarını tarayıcıda doğrulayın. Gerçek yönetici hesabı üzerinde yıkıcı test yapmayın.

## Doğrulama kaydı

- `npm run lint`: hata yok; önceden bulunan iki `<img>` uyarısı devam ediyor.
- `npm run typecheck`: geçti.
- `npm run build`: geçti; 20 sayfa/route çıktısı üretildi. Üretim derlemesi
  yerelde başlatılarak altı hesap sayfasının HTTP 200 döndüğü; beş sunucu
  endpoint'inin servis anahtarı yokken 503/no-store ve GET için 405 döndüğü doğrulandı.
- `npm test`: 48 test geçti. Mevcut katalog ve hesap testleri korundu. Yeni
  test dosyaları `tests/security-rules.test.mjs`, `tests/account-security.test.mjs`;
  Auth metadata fixture'ı `tests/fixtures/security-auth.sql`.
- `npm run test:concurrency`: ayrı PostgreSQL bağlantılarıyla 7 senaryo geçti
  (4 stok, tek kullanımlık kurtarma kodu, ortak limit, açık oturumda rol iptali).
- Gerçek reset e-postası belirtilen test adresine ulaştı; kullanıcı doğruladı.
  Bu test eski canlı e-posta servisini sınadı, yeni yerel endpoint'in yayına
  alındığını göstermez. Parola değiştirme/yeni kayıt maili/TOTP tarayıcı uçtan uca
  testi yapılmadı. Tarayıcı bağlantısı teknik nedenle kullanılamadı.
- Supabase security advisor canlı şemada eski fonksiyonların anon/authenticated
  EXECUTE izinlerini ve kapalı sızdırılmış parola korumasını bildirdi. Yerel
  migration ilk grubu düzeltir; canlıya uygulanmadığı için canlı bulgular sürer.
  [Anon EXECUTE açıklaması](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [authenticated EXECUTE açıklaması](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
  [parola koruması](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

TOTP/AAL ve recovery AMR uygulaması resmi [MFA](https://supabase.com/docs/guides/auth/auth-mfa)
ve [JWT](https://supabase.com/docs/guides/auth/jwt-fields) belgeleriyle karşılaştırıldı.

Stok altyapısının 11 maddelik dosya/migration/test raporu
[STOCK-MANAGEMENT.md](./STOCK-MANAGEMENT.md) içindedir.
