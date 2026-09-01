# 🎯 Hatayı Yakala

**Gazi Üniversitesi × Prof. Dr. Tuncay Peker** — interaktif ders platformu.

> **Çalışmanın başlığı:** Nöroanatomi Eğitiminde Kasıtlı Hata Tespiti: Yapay Zekâ
> Asistanı Destekli Öğretimin Öğrenme, Bilgi Kalıcılığı ve Anatomik Hata
> Farkındalığı Üzerine Etkisinin Kontrollü Olarak Değerlendirilmesi
>
> Başlık tek bir yerde tanımlı: `src/lib/survey.ts` → `CALISMA_BASLIGI`.
> Anket formu, oturum raporu ve Excel çıktısı oradan besleniyor.

Hoca derste bilinçli olarak yanlış bilgiler verir; öğrenci hatayı fark ettiği anda
telefonundan **“HATA VAR”**a basıp ne olduğunu yazar. Doğru yakalarsa puan alır,
boşa basarsa ceza yer.

> **Öğrenci ders metnini HİÇBİR ZAMAN göremez.** Metni önceden okuyabilen öğrenci
> hataların nerede olduğunu da görürdü; oyunun tamamı buna dayanıyor. Bu yüzden
> tek kişilik “dersi aç ve oyna” modu kaldırıldı — metin yalnızca amfide,
> hocanın sesinden duyulur.

---

## ⚡ Hızlı Başlangıç

```bash
npm install
npm run dev
```

Tarayıcı otomatik açılır → `http://localhost:5173`

> **Firebase kurmadan da çalışır.** `.env` dosyası yoksa uygulama **DEMO MOD**’a düşer ve
> tüm verileri tarayıcının `localStorage`’ında tutar. Böylece hiçbir kurulum yapmadan
> her şeyi deneyebilirsin.

### İlk deneme için

1. `npm run dev`
2. **Kayıt Ol → Öğretim Üyesi** seç, kod olarak `gazi2026` gir.
3. Ders kartındaki **Amfi 2.0** → notu yapıştır → yanlış yerleri seçip işaretle →
   (istersen ön/son test sorularını yükle) → **Oturumu Aç**.
4. Çıkan **katılım kodunu** başka bir sekmede (ya da telefondan QR ile) `/amfi` adresine gir.
5. Hoca ekranında **Dersi Başlat** — metin sesli okunmaya başlar.

Sistemde hazır bir **örnek ders** (Anatomi — Üst Ekstremite Kemikleri) zaten yayında.

> **DEMO MOD uyarısı:** Firebase'siz çalışırken tüm sekmeler tek bir `localStorage`
> oturumunu paylaşır — aynı tarayıcıda aynı anda hem hoca hem öğrenci girişi
> yapılamaz. Gerçek denemede öğrenciler zaten kendi telefonlarından, hesapsız girer.

---

## 🔥 Firebase’e Bağlama

1. [Firebase Console](https://console.firebase.google.com)’da yeni proje aç.
2. **Authentication → Sign-in method → E-posta/Şifre**’yi etkinleştir.
3. **Firestore Database** oluştur (production mode).
4. **Proje Ayarları → Genel → Web uygulaması ekle** ve çıkan config değerlerini kopyala.
5. Proje kökünde `.env.example` dosyasını `.env` olarak kopyala ve değerleri yapıştır:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=projen.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=projen
VITE_FIREBASE_STORAGE_BUCKET=projen.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234:web:abcd
VITE_TEACHER_CODE=gazi2026
```

6. `firestore.rules` dosyasının içeriğini **Firestore → Kurallar** sekmesine yapıştır ve yayınla.
7. `npm run dev` — sağ üstteki “DEMO MOD” rozeti kaybolduysa canlı moddasın.

### Firestore koleksiyonları

| Koleksiyon | Açıklama |
|---|---|
| `users` | `{ uid, name, email, role: 'teacher' \| 'student', createdAt }` |
| `lessons` | `{ id, title, subject, description, teacherId, teacherName, blocks[], isLive, ... }` |
| `sessions` | Canlı amfi oturumu — `{ code, phase, mode, version, segments[], wrongBlocks[], ... }` |
| `participants` | Amfiye koddan katılan öğrenciler — `{ sessionId, name, studentId?, score, hits, misses, falseAlarms }` |
| `studentNotes` | Amfi 2.0'da öğrencinin yazdığı not — `{ blockIndex, text, status, geminiFeedback }` |
| `ratings` | Ders sonu 5 yıldız — `{ sessionId, participantId, stars, comment }` |
| `buzzes` | Amfi 1.0 zil kayıtları |

`blocks[]` içindeki her eleman: `{ id, text, isWrong, correction?, points? }`

---

## 🎙️ Amfi Modu — canlı ders

Öğrenciler hesap açmadan, QR ya da 6 haneli kodla katılır. İki sürüm var:

### Amfi 1.0 — Zil (`Amfi v1` düğmesi)

Ders notu blok blok sesli okunur; öğrenci hatayı **duyduğu an** telefonundaki
büyük butona basar. Puan, tepki hızına göre hesaplanır.

### Amfi 2.0 — Not Yazma (`Amfi 2.0` düğmesi)

1. Hoca `Amfi 2.0` → ders notunu yapıştırır. Metin cümle/paragraf **parçalarına** bölünür.
2. Yanlış olan yeri fareyle seçer, “neden yanlış” açıklamasını yazar.
3. Oturum açılır; parçalar sırayla sesli okunur.
4. Öğrencinin telefonunda **hiçbir metin yoktur** — sadece dinler. Hatayı duyduğu an
   **“HATA VAR”a basar**, kutu açılır, **ne olduğunu yazar**.
5. Not, hoca cihazından **anında Gemini'ye** gider; doğruysa puan aynı saniyede işlenir.
6. Okuma bitince 20 sn yazma toleransı verilir, sonra bölüm **kendiliğinden kapanır**.
7. Ders bitince öğrenciler dersi **5 yıldız** üzerinden değerlendirir; hoca ortalamayı
   ve yorumları oturum raporunda görür.

### Ses Kaydıyla Ders Anlatma

Hazırlık ekranındaki **DERS SES KAYDI** bölümüne bir ses dosyası (MP3 · M4A ·
WAV · OGG) yüklersen ders yapay zekâ sesiyle değil **o kayıtla** anlatılır.
Yükledikten sonra **kaydın metnini not alanına yapıştırman** gerekiyor: öğrenci
“HATA VAR”a bastığında hangi hataya denk geldiği, kaydın o andaki ilerlemesinden
hesaplanıyor (ses %40'ındaysa metnin de %40'ındayız).

Dosya **hocanın cihazında**, tarayıcının IndexedDB'sinde saklanır — Firestore'a
gitmez. Sebebi basit: ses dosyaları 1 MB'lık doküman sınırına sığmaz ve sesi
zaten yalnızca hoca bilgisayarı çalıyor, öğrencinin telefonuna hiç gitmiyor.
Bunun bedeli: **dersi aynı tarayıcıdan açman gerekir.** Başka bir cihazdan
açarsan host ekranı uyarır ve dosyayı yeniden seçme imkânı verir.

### Metinde Arama

Hem ders düzenleyicide hem amfi hazırlık ekranında **METİNDE ARA** kutusu var.
Uzun notu satır satır okumak yerine ifadeyi yazıp sonuca tıklarsın; o aralık
metinde seçili hâle gelir ve işaretleme formu açılır. Zaten işaretli yerler
`İŞARETLİ` etiketiyle görünür.

### Hata İşaretleme

**İstediğin kadar tuzak ekleyebilirsin** — sayı sınırı yok. Üç şey buna engel
oluyordu, üçü de düzeltildi:

- İşaretler metin düzenlendiğinde kayboluyordu. Artık yazı kaydıysa işaret kendi
  metnini yeni konumunda bulup oraya taşınıyor; gerçekten silinenler de sessizce
  düşmek yerine ekranda bildiriliyor.
- İşaretleme düğmesi sebebini söylemeden kapanıyordu. Artık neden basılamadığı
  düğmenin altında yazıyor; seçim mevcut bir tuzakla çakışıyorsa **Çakışan Tuzağı
  Sil** düğmesi çıkıyor.
- 5 şıklı soru zorunlu görünüyordu. **İsteğe bağlı**: bölüm varsayılan olarak
  kapalı, tuzak soru olmadan da eklenir. Soru istersen *Soru Ekle* ile açılır.

Arama sonuçlarındaki **TUZAK YAP** düğmesiyle, metinde fareyle cümle avlamadan
doğrudan tuzak kurabilirsin — eşleşmenin geçtiği cümlenin tamamı seçilir.

### Ön Test → Ders → Son Test

Hazırlık ekranında **iki soru yükleme bölümü** var: `ÖN TEST · DERSTEN ÖNCE` ve
`SON TEST · DERSTEN SONRA`. Ders akışı şu sıraya oturur:

1. **Lobi** — öğrenciler koddan katılır.
2. **Ön test** — hoca `Ön Testi Başlat` der; öğrencinin telefonunda oyun yerine
   soru kâğıdı açılır. Kâğıtlar geldikçe hoca cihazı anında notlar.
3. **Ders** — `Ön Testi Bitir` → lobi → `Dersi Başlat`. Normal hata yakalama oyunu.
4. **Son test** — `Dersi Bitir` dendiğinde ders kapanmaz, **son test açılır**.
   `Son Testi Bitir · Dersi Kapat` ile oturum biter.

İki test de boş bırakılabilir; o zaman o adım hiç görünmez ve akış eskisi gibi işler.

**Soru yükleme biçimi.** Word'den/soru bankasından kopyalanan metin doğrudan
yapıştırılabilir ya da `.txt` / `.json` dosyası yüklenebilir:

```
1) Humerus hangi bölgenin kemiğidir?
A) Ön kol
B) Kol
C) El bileği
Cevap: B
```

Doğru şık `Cevap: B` satırıyla ya da şıkkın başına `*` konarak işaretlenir
(`*B) Kol`). JSON biçimi de kabul edilir:
`[{ "question": "...", "options": ["..."], "correctIndex": 1 }]`.
Yüklenen her soru ekranda düzeltilebilir; yeşil harf doğru cevabı gösterir.

**Cevaplar nerede duruyor?** Doğru şıklar hocaya özel `sessionSecrets`
dokümanında kalır. Test açıldığında sorular öğrenci tarafına **doğru şıkları
sökülmüş hâlde** yazılır, test kapanınca oturumdan silinir — konsolu açan
öğrenci cevapları göremez. Puanlamayı hoca cihazı yapar.

**Sonuç.** Hoca oturum raporunda ve `/hoca/sonuclar/...` ekranında
`ön test % → son test % → kazanım` tablosunu görür; Excel raporuna
`On Test - Son Test` sekmesi olarak da düşer. Öğrenci ders sonunda kendi
ön/son test yüzdesini ve değişimini görür.

**Mod seçimi:** *Sesli Okuma* (TTS okur) ya da *Sessiz Mod* (metin perdede durur,
pencereyi hoca açıp kapatır).

**Puanlama:** doğru not `+100 + hız bonusu (≤30)` · boşa/yanlış not `−40` ·
hiç yazmamak `0` (“kaçırdın” olarak işaretlenir).

Hız bonusu **butona bastığı ana** göre hesaplanır, notu gönderdiği ana göre değil —
ölçtüğümüz şey yazma hızı değil, hatayı fark etme hızı.

> Doğrulamayı **yalnızca hoca cihazı** yapar. 150 telefon kendi puanını yazsaydı
> hem tutarsız olurdu hem de Firestore kuralları buna izin vermiyor.

Gemini anahtarı yoksa notlar geçersiz sayılır — anahtarı `.env`'e koymayı unutma.

---

## 🧠 Puanlama

| Durum | Etki |
|---|---|
| Hatalı bloğa bastı (**yakaladı**) | `+ blok puanı` (varsayılan 100) |
| Doğru bloğa bastı (**boşa basma**) | `− 40` |
| Hatalı bloğu kaçırdı | `0` + “kaçırdın” uyarısı |

Toplam puan hiçbir zaman 0’ın altına düşmez. Sıralama tüm derslerin toplamına göre hesaplanır.

Klavye kısayolları: `Boşluk` = yanlış bildir · `Enter` / `→` = devam.

---

## 🎨 3D Arayüz

- **WebGL sahne** (`src/components/Scene3D.tsx`) — three.js + react-three-fiber ile
  bozunan çekirdek, yüzen kristaller, parıltılar ve fareyi takip eden kamera.
- **TiltCard** — fareye göre gerçek perspektifle eğilen, içeriği `translateZ` ile
  yüzeyden kaldırılmış kartlar.
- **Button3D** — kenar derinliği olan, basınca gerçekten çöken butonlar.
- **Ders akışı** — her blok 3B döner geçişle sahneye girer.
- WebGL desteklenmeyen cihazlarda otomatik olarak CSS arka planına düşer (`SceneBoundary`).

---

## 📁 Klasör Yapısı

```
src/
├── components/     Scene3D, TiltCard, Button3D, Navbar, Toast, Loader, Logo
├── context/        AuthContext — oturum yönetimi
├── lib/
│   ├── api.ts      Tüm veri işlemleri (Firebase ↔ demo mod otomatik seçimi)
│   ├── firebase.ts Firebase başlatma
│   ├── store.ts    Demo mod deposu (localStorage)
│   ├── seed.ts     Örnek ders
│   ├── types.ts    Tip tanımları
│   └── utils.ts    Yardımcılar
└── pages/
    ├── Landing.tsx           Tanıtım sayfası
    ├── Login.tsx             Giriş / kayıt (rol seçimli)
    ├── TeacherDashboard.tsx  Hoca paneli
    ├── LessonEditor.tsx      Ders notu + hata işaretleme
    ├── LiveResults.tsx       Blok bazlı canlı analiz
    ├── StudentLessons.tsx    Öğrenci girişi — "Derse Katıl" (kod) + geçmiş
    ├── Leaderboard.tsx       Sıralama + podyum (amfi puanlarından)
    ├── AmfiJoin.tsx          Koddan katılım (hesapsız) → v1/v2 ekranını seçer
    ├── AmfiHost.tsx          Amfi 1.0 hoca/projeksiyon (zil)
    ├── AmfiPlay.tsx          Amfi 1.0 öğrenci (zil)
    ├── AmfiSetup.tsx         Amfi 2.0 hazırlık — not + yanlış + ön/son test yükleme
    ├── AmfiHostV2.tsx        Amfi 2.0 hoca/projeksiyon (TTS + canlı puanlama)
    └── AmfiPlayV2.tsx        Amfi 2.0 öğrenci (not yazma)
```

---

## 📦 Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | `dist/` klasörüne üretim derlemesi |
| `npm run preview` | Derlemeyi yerelde önizle |
| `npm run typecheck` | TypeScript kontrolü |

---

## 🚀 Yayına Alma

```bash
npm run build
```

`dist/` klasörünü Firebase Hosting, Vercel veya Netlify’a yükle.
SPA olduğu için sunucuda **tüm yolları `index.html`’e yönlendirmeyi** unutma.

Firebase Hosting için:

```bash
npm i -g firebase-tools
firebase login
firebase init hosting     # public dizin: dist, SPA: Yes
npm run build && firebase deploy
```
