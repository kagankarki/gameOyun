# 🎯 Hatayı Yakala

**Gazi Üniversitesi × Prof. Dr. Tuncay Peker** — interaktif ders platformu.

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
3. Ders kartındaki **Amfi 2.0** → notu yapıştır → yanlış yerleri seçip işaretle → **Oturumu Aç**.
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
    ├── AmfiSetup.tsx         Amfi 2.0 hazırlık — not + yanlış işaretleme
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
