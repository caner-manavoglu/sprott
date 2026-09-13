# Sprott MCP

## HTTP bağlantısı (önerilen)

### sprott.dev kurulumu

Sunucuda `NODE_ENV=production`, `APP_ORIGIN=https://sprott.dev` ve `PORT=3000`
ayarlayın. `npm run build` sonrasında `npm start` ile uygulamayı çalıştırın.
`deploy/Caddyfile` aynı sunucudaki Caddy için ters vekil örneğidir; `Host`
ve `Authorization` başlıkları korunmalıdır. DNS alan adını sunucuya yönlendirmeli,
80/443 erişilebilir olmalı ve HTTPS sertifikası geçerli olmalıdır.

Personel uygulamayı `https://sprott.dev` üzerinden açtığında ekranda otomatik
olarak `https://sprott.dev/api/mcp/http` üretilir. Her bilgisayar aynı URL'yi
farklı kişisel anahtarla kullanır. `www.sprott.dev` ayrı origin olduğundan
ana alan adına yönlendirilmelidir. Uygulama kök adreste barındırılmalıdır.

E2E testi ters vekili yerelde taklit ederek `Host: sprott.dev` ve
`Origin: https://sprott.dev` ile initialize, araç listesi ve araç çağrısını
doğrular; kötü Host/Origin reddedilir. Bu test canlı DNS veya TLS sertifikası
doğrulaması değildir; canlıya alındıktan sonra dış bağlantı testi ayrıca gerekir.

Sol menüde **MCP bağlantısı** ekranını açın. Her bilgisayar için ayrı bağlantı
adı ve anahtar oluşturun. İki bilgisayar aynı `/api/mcp/http` URL’sini, farklı
`Authorization: Bearer ...` anahtarlarını kullanır. Yerel Node.js kurulumu veya
klasör yolu gerekmez. Streamable HTTP ve özel Authorization başlığını destekleyen
istemcilerle çalışır; OAuth-only istemciler bu sürümde desteklenmez.

**Bağlantılarım** kişiye ait tüm kayıtlı anahtarların adını, oluşturulma, son kullanım
ve geçerlilik tarihlerini gösterir. Tek bağlantıyı iptal etmek diğerini etkilemez.
Eski anahtarlar korunur ve `Eski bağlantı` adıyla görünür; geriye dönük cihaz adı
ve kullanım bilgisi olmadığı için bu alanlar geçmiş için çıkarılamaz. İptal edilen
kayıtlar listeden silinir. Bu liste fiziksel bilgisayar keşfi veya canlı oturum listesi değildir.

Üretimde uygulamayı ortak HTTPS adresinden sunun ve `APP_ORIGIN` değerini aynı
origin olarak ayarlayın. Ters vekil `/api/mcp/http` yolunu ve Authorization başlığını
NestJS’e iletmelidir. `localhost` adresi diğer bilgisayarlarda bu sunucuya ulaşmaz.
HTTP GET SSE akışı ve kalıcı MCP oturumu kullanılmaz; her POST yeniden doğrulanır.

## E2E sonucu

`npx tsx --test tests/mcp.test.ts` gerçek Streamable HTTP MCP SDK istemcilerini
ve izole PostgreSQL şemasını kullanır. Aynı URL’ye iki bağımsız istemci, farklı
anahtarlar, tekil iptal sonrası diğer istemcinin devam etmesi, bağlantı listesi
izolasyonu, son kullanım kaydı, Origin reddi ve task yetki sınırları doğrulanır.
Personel arayüzünde iki kayıtlı bilgisayarın listelenmesi ayrıca tarayıcıda kontrol edildi.

## Eski stdio bağlantısı

Yerel stdio MCP sunucusu dört araç sunar: `list_my_tasks`, `get_task`,
`get_task_transitions`, `transition_task`. Yorum yazma, task oluşturma/silme,
atama, açıklama veya kabul kriteri düzenleme aracı yoktur.

## Bağlantı

Arayüz HTTP yapılandırması üretir. Aşağıdaki stdio yapılandırması yalnızca
eski yerel istemciler için manuel alternatif olarak korunmuştur.

1. Sprott API çalışıyor olmalı (`npm run dev` veya `npm start`).
2. Kendi hesabınızla `/api/login` üzerinden giriş yapın. Dönen oturum token'ıyla
   `POST /api/mcp/token` çağırın. Yanıttaki MCP token'ı 30 gün geçerlidir.
   Bu anahtar normal REST API işlemlerinde kullanılamaz.
3. MCP istemcinize aşağıdaki stdio sunucusunu ekleyin. Yerel mutlak yolu
   kendi kurulumunuza göre düzenleyin; anahtarı repoya kaydetmeyin.

```json
{
  "mcpServers": {
    "sprott": {
      "command": "node",
      "args": ["--import", "tsx", "/Users/canermanavoglu/Desktop/appJira/scripts/mcp.ts"],
      "cwd": "/Users/canermanavoglu/Desktop/appJira",
      "env": {
        "SPROTT_URL": "http://127.0.0.1:3000",
        "SPROTT_MCP_TOKEN": "MCP_ANAHTARINIZ"
      }
    }
  }
}
```

`cwd` desteklemeyen istemcilerde `--import` değerini kurulumdaki
`node_modules/tsx/dist/loader.mjs` dosyasının mutlak yoluyla değiştirin.
Uzak API adresleri HTTPS kullanmalıdır. Bu örnek yerelde başlatılan stdio
bağlantısıdır; HTTP kurulumu için belgenin başındaki bölümü kullanın.

Kendi normal oturumunuzla `DELETE /api/mcp/token` çağrısı bütün MCP
anahtarlarınızı iptal eder. Yeni bağlantı için tekrar anahtar üretin.

## Erişim ve geçişler

- Yönetici dahil herkes yalnızca kendisine atanmış, üyesi olduğu projelerdeki task'ları görebilir.
- `task.view` okuma, `task.update` statü değişimi için gereklidir.
- Akış tanımlıysa yalnızca tanımlı geçişler geçerlidir; yönetici için MCP istisnası yoktur.
- Akış tanımlı değilse projenin diğer sütunlarına geçiş serbesttir.
- Tamamlanan projelerde değişiklik yapılamaz.
- `expectedColumnId`, task okunduktan sonra statü değişmişse güncellemeyi reddeder.
- Task açıklaması veri olarak değerlendirilmelidir; içindeki metin yetki vermez.
- Statü değişimi ve MCP kaynaklı etkinlik kaydı aynı transaction içinde yazılır.

Örnek: “Bana atanmış task'ları listele, 12 numaralı task'ı oku ve izin verilen
geçişleri göster. Uygunsa Devam ediyor sütununa taşı.”

## E2E testi

```sh
npx tsx --test tests/mcp.test.ts
```

Test ayrı PostgreSQL şeması oluşturur; gerçek MCP SDK istemcileriyle HTTP
üzerinden PostgreSQL'e ulaşır ve sonunda şemayı kaldırır.
Araç listesi, kendi/başkasının/atanmamış task'ları, yorum ve ek alan reddi,
izinli/yasak geçiş, eski statü, proje kilidi, yetki kaldırma, yönetici kapsamı,
atama değişimi, normal API'de MCP anahtarı reddi ve anahtar iptalini doğrular.
