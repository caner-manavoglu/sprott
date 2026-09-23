# Sprott

Ekip içi task takip uygulaması. NestJS REST API, Prisma ORM, PostgreSQL, React ve shadcn/ui.

## Kurulum

Node.js 22.12+ ve Docker gerekir.

```sh
npm install
cp .env.example .env
```

`.env` içinde `POSTGRES_PASSWORD` belirleyin ve aynı şifreyi `DATABASE_URL` içinde kullanın (özel karakterleri URL-encode edin). İlk kurulum için `ADMIN_PASSWORD` ve `USER_PASSWORD` en az 12 karakter olmalıdır.

```sh
npm run db:up
npm run db:deploy
npm run dev
```

- Uygulama: http://127.0.0.1:5173
- REST API: http://127.0.0.1:3000/api
- Swagger UI: http://127.0.0.1:3000/api/docs

Şema `db:deploy` ile kurulur. İlk açılışta veritabanı boşsa iki başlangıç hesabı oluşturulur: `admin@sprott.local` (yönetici), `personel@sprott.local` (kullanıcı). Şifreler `.env` dosyasındadır.

## Backend yapısı

```text
prisma/
  schema.prisma                 # 28 model, ilişkiler, @@map ile mevcut tablo adları
  migrations/0_init/migration.sql
server/
  prisma/                       # PrismaService ve paylaşılan bağlantı
  common/                       # DTO pipe/şemaları, CurrentUser, ParseId, oturum çerezi
  workspace/
    workspace.service.ts        # Oturum kullanıcısı, başlangıç verisi, pano ve gecikme sorguları
    access.service.ts           # Proje erişimi/yazma izni, görünür personel kapsamı
    notifier.service.ts         # Bildirim yazma, duyuru hedef kitlesi ve okundu kaydı
    activity-log.service.ts     # Salt eklenen etkinlik günlüğü
  tasks/
    dto/tasks.dto.ts            # CreateTaskDto, UpdateTaskDto, TaskCommentDto
    tasks.controller.ts         # HTTP rotaları, Swagger, DTO pipe
    tasks.service.ts            # İş kuralları ve Prisma sorguları
    tasks.module.ts             # Dependency injection
    tasks.schemas.ts           # Swagger yanıt/istek açıklamaları
  ...                           # Diğer modüller aynı controller/service düzeninde
```

Prisma'da entity karşılığı `schema.prisma` modelleridir; ayrıca TypeORM entity sınıfları tutulmaz. Tipler `npm run db:generate` ile `server/generated/prisma` içine üretilir (Git'e eklenmez). DTO'lar mevcut Zod bağımlılığıyla tanımlanır; `DtoPipe` istekleri çalışma anında doğrular ve dönüştürür (kimlikler number, boş form alanları null, multipart metinleri boolean/dizi). Servisler gövdeyi yeniden doğrulamaz; yalnızca veriye bağlı iş kurallarını uygular. Controller'lar `@CurrentUser()` ile oturum kullanıcısını, `@Param('id', ParseId)` ile doğrulanmış kimliği servise geçirir; servisler Express isteği almaz. Yetki kontrolü (`allow`) serviste kalır, çünkü bazı kurallar veriye bakmadan bilinemez. `tsx` decorator metadata üretimine bağımlı olmamak için pipe ve injection açıkça bağlanmıştır.

CRUD işlemleri Prisma model metotlarını kullanır. Çok tablolu raporlar, PostgreSQL JSON toplamaları, kilitler ve bazı atomik koşullu işlemler `server/prisma/sql.ts` üzerinden Prisma'nın parametreli SQL API'siyle çalışır: satır döndüren sorgular `query()`, döndürmeyenler `execute()` ile. Kullanıcı verisi SQL metnine eklenmez. `pg`, Prisma'nın PostgreSQL sürücüsü ve test/migration yardımcıları için kalır; controller'lar veritabanına erişmez.

### Oturum

Tarayıcı oturumu `httpOnly`, `SameSite=Strict` bir çerezde (`sprott_session`) taşınır; üretimde (`NODE_ENV=production`) `Secure` bayrağı da eklenir. JavaScript token'ı görmez. Girişte rol seçilmez, rol hesaptan okunur. `POST /api/login` yanıtı Swagger ve betikler için token'ı da döndürür; bu istemciler `Authorization: Bearer` başlığını kullanır. MCP uçları yalnızca kendi bearer token'larını kabul eder.

Pano yanıtı task yorumlarını içermez; task açıldığında `GET /api/tasks/:id/comments` ile yüklenir ve yorum işlemleri güncel yorum listesini döndürür. Canlı güncelleme (`/api/live`) pano değişikliklerini proje kimliğiyle yayar; başka projenin panosuna bakan istemci panosunu yeniden çekmez.

### Mevcut PostgreSQL veritabanını Prisma Migrate'e alma

`0_init`, önceki SQL migration'larının tamamını ve CHECK/foreign key/index tanımlarını korur. Eski uygulamanın tüm migration'ları uygulanmış bir veritabanında önce fark olmadığını doğrulayın, sonra baseline'ı uygulanmış olarak kaydedin:

```sh
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db:baseline
npm run db:deploy
```

Fark varsa baseline kaydetmeden önce farkı inceleyin. Bu adımlar mevcut kayıtları silmez; `db:baseline` yalnızca migration geçmişini başlatır ve bir kez çalıştırılır. Boş veritabanında baseline komutu kullanılmaz, yalnızca `db:deploy` çalıştırılır. Uygulama başlangıcında DDL çalıştırılmaz.

Sonraki model değişikliklerinde geliştirme veritabanında `npm run db:migrate -- --name degisiklik_adi`, ardından `npm run db:generate` çalıştırın. Oluşan SQL'i inceleyip migration klasörünü Git'e ekleyin; dağıtımda `npm run db:deploy` kullanın.

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
npm test         # geçici PostgreSQL şemalarında API + Prisma migration testleri
npm run build    # tip kontrolü + arayüz derlemesi
npm start        # derlenmiş arayüzü de sunan tek sunucu (:3000)
npm run db:down  # veritabanını durdurur, verileri silmez
npm run db:studio # Prisma model/veri arayüzü
```

Tarih hesapları (gecikme, rapor sayaçları) `shared/timezone.ts` içindeki `Europe/Istanbul` referansına göre yapılır.

HTTPS arkasında çalıştırırken `NODE_ENV=production` ve `APP_ORIGIN=https://alan-adiniz` ayarlayın. API loopback arayüzünde dinler ve ters vekil üzerinden sunulabilir.
