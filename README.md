# Sprott

Ekip içi task takip uygulaması. NestJS REST API, PostgreSQL, React ve shadcn/ui.

## Kurulum

Node.js 22+ ve Docker gerekir.

```sh
npm install
cp .env.example .env
```

`.env` içinde `POSTGRES_PASSWORD` belirleyin ve aynı şifreyi `DATABASE_URL` içinde kullanın (özel karakterleri URL-encode edin). İlk kurulum için `ADMIN_PASSWORD` ve `USER_PASSWORD` en az 12 karakter olmalıdır.

```sh
npm run db:up
npm run dev
```

- Uygulama: http://127.0.0.1:5173
- REST API: http://127.0.0.1:3000/api
- Swagger UI: http://127.0.0.1:3000/api/docs

İlk açılışta şema ve iki başlangıç hesabı oluşturulur: `admin@sprott.local` (yönetici), `personel@sprott.local` (kullanıcı). Şifreler `.env` dosyasındadır.

## Modüller

| Modül | Kapsam |
|---|---|
| Projeler | Proje oluşturma, üyelik, planlama tarihleri, tamamlanan projede salt okunur pano |
| Pano | Sürükle-bırak kanban, sütun yönetimi, task türü (task/bug/story/epic/sub-task/feature) ve önceliği |
| Task | Açıklama, raporlayan, atanan, tarihler, dosya ekleri, yorumlar ve `@` etiketleme |
| Akış | Proje bazlı sütun geçiş kuralları; kural yoksa tüm geçişler serbest |
| Kullanıcı & Grup | Hesap yönetimi, gruplar, grup yöneticileri |
| Yetkiler | Modül bazlı yetkiler; her istekte sunucuda kontrol edilir |
| Bildirimler | Atama, tamamlanma, yorum, etiketlenme ve duyuru bildirimleri |
| Duyurular | Görselli duyurular, grup bazlı hedefleme, okundu takibi; zorunlu duyurular okunana kadar girişte gösterilir |
| PR’lar | Pull request kaydı, çok task’a bağlama, onaylandı işaretleme; tamamlandıya taşımada açık PR uyarısı |
| Raporlar | Kişi ve proje bazlı atanan / tamamlanan / bug / geciken sayıları |
| Günlük | Salt okunur etkinlik günlüğü: task açma, statü ve atama değişimi, yorum, silme |

## Güvenlik

Şifreler scrypt ile özetlenir; oturum token'ları 12 saat geçerlidir ve veritabanında yalnızca SHA-256 özetleri tutulur. Yetkiler her istekte sunucuda doğrulanır. Arayüz aynı bearer token'ı kullanır.

## Komutlar

```sh
npm run dev      # API + arayüz (watch)
npm test         # gerçek PostgreSQL üzerinde geçici şemada API testleri
npm run build    # tip kontrolü + arayüz derlemesi
npm start        # derlenmiş arayüzü de sunan tek sunucu (:3000)
npm run db:down  # veritabanını durdurur, verileri silmez
```

Tarih hesapları (gecikme, rapor sayaçları) `shared/timezone.ts` içindeki `Europe/Istanbul` referansına göre yapılır.

HTTPS arkasında çalıştırırken `NODE_ENV=production` ve `APP_ORIGIN=https://alan-adiniz` ayarlayın. API loopback arayüzünde dinler ve ters vekil üzerinden sunulabilir.
