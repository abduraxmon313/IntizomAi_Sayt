# IntizomAI sayti — intizom.app

IntizomAI Telegram boti (`IntizomAi_Bot_Pro_Copy`) va iOS/Android ilovasi (`IntizomAi_ilova`)
uchun rasmiy landing sahifa.

## Tuzilma

```
server.js            tashqi kutubxonasiz Node statik server (Railway uchun)
railway.json         Railway: start buyrug'i va /healthz tekshiruvi
public/
  index.html         bosh sahifa (SEO meta, Open Graph, JSON-LD)
  privacy.html       /privacy — maxfiylik siyosati
  404.html
  styles.css, main.js
  robots.txt, sitemap.xml, site.webmanifest
  assets/            logo, ikonkalar, og-image.png (ijtimoiy tarmoq preview)
  fonts/             Inter (woff2, OFL litsenziyasi)
```

Server nima qiladi:

- `public/` ni xotiraga o'qiydi, brotli/gzip bilan oldindan siqadi, ETag va keshlash sarlavhalarini qo'yadi.
- `www.intizom.app` → `intizom.app`, `http` → `https` (301).
- `*.up.railway.app` manziliga `X-Robots-Tag: noindex` qo'yadi, shunda Google faqat `intizom.app` ni indekslaydi.
- Xavfsizlik sarlavhalari: CSP, HSTS, X-Frame-Options va boshqalar.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Majburiy | Izoh |
|---|---|---|
| `APP_STORE_URL` | yo'q | App Store havolasi (`https://apps.apple.com/...`). Bo'sh bo'lsa tugma "Tez kunda" ko'rinadi va kanalga olib boradi. |
| `PLAY_STORE_URL` | yo'q | Google Play havolasi (`https://play.google.com/store/apps/details?id=uz.intizomai.intizom_ai`). Bo'sh bo'lsa "Tez kunda". |
| `CANONICAL_HOST` | yo'q | Asosiy domen, default `intizom.app`. |
| `PORT` | yo'q | Railway o'zi beradi. |

Havola qo'shilgandan keyin Railway'da **Redeploy** qilish kifoya, kodni o'zgartirish shart emas.

## Lokal ishga tushirish

```bash
node server.js            # http://localhost:3000
```

## Railway'ga deploy

1. Railway → **New Project** → **Deploy from GitHub repo** → `abduraxmon313/IntizomAi_Sayt`.
2. Railway `package.json` va `railway.json` ni o'zi topadi, qo'shimcha sozlama kerak emas.
3. Service → **Settings → Networking → Generate Domain**: `xxx.up.railway.app` manzilida sayt ochilishini tekshiring.

## intizom.app domenini ulash (name.com)

1. Railway → Service → **Settings → Networking → Custom Domain** → `intizom.app` qo'shing.
   Keyin yana bittasini qo'shing: `www.intizom.app`.
2. Railway har biri uchun yozuvlarni ko'rsatadi: CNAME manzili (`xxxx.up.railway.app`) va
   `_railway-verify` TXT yozuvi.
3. name.com → **Manage DNS Records**:
   - Hozirgi bo'sh `A` yozuvi (`intizom.app`, javobi yo'q) bo'lsa — o'chiring.
   - **Asosiy domen** (`intizom.app`): Type **ANAME**, Host bo'sh, Answer — Railway bergan `xxxx.up.railway.app`.
     (Asosiy domenga oddiy CNAME qo'yib bo'lmaydi, shuning uchun ANAME ishlatiladi.)
   - **www**: Type **CNAME**, Host `www`, Answer — Railway bergan `www` uchun manzil.
   - **TXT**: Railway ko'rsatgan har bir `_railway-verify...` yozuvini Host va qiymati bilan aynan qo'shing.
4. 5–30 daqiqada (ba'zan 48 soatgacha) Railway yashil belgi qo'yadi va SSL sertifikatini o'zi chiqaradi.

## Google'da birinchi chiqish uchun

Sayt texnik jihatdan tayyor: sarlavha va tavsifda "IntizomAI / Intizom AI", `canonical`,
`sitemap.xml`, `robots.txt`, Organization/WebSite/SoftwareApplication/FAQ tuzilgan ma'lumotlari.
Domen ishga tushgandan keyin qilinadigan ishlar:

1. [Google Search Console](https://search.google.com/search-console) → **Domain** turi bilan `intizom.app` qo'shing.
   Google bergan TXT yozuvini name.com DNS'iga qo'shing va **Verify** bosing.
2. **Sitemaps** → `https://intizom.app/sitemap.xml` yuboring.
3. **URL Inspection** → `https://intizom.app/` → **Request indexing**.
4. Saytga havolalar qo'ying: Telegram kanal (@Intizom_AI) tavsifi, bot tavsifi (`/setdescription`, BotFather),
   App Store va Google Play sahifalaridagi "Website" maydoni, Instagram bio. Bular Google'ga brend
   aynan shu sayt ekanini ko'rsatadi.
5. Bot repodagi `/privacy` o'rniga App Store / Google Play'da `https://intizom.app/privacy` ni ko'rsatish mumkin.

"intizomai" — noyob brend nomi, shuning uchun indekslangandan keyin odatda bir necha kun–2 hafta ichida
birinchi o'ringa chiqadi. Google aniq muddatni kafolatlamaydi.
