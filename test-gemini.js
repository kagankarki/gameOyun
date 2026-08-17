import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const keyMatch = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
const apiKey = keyMatch ? keyMatch[1].trim() : null;

if (!apiKey) {
    console.error("API Key not found in .env");
    process.exit(1);
}

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

const prompt = `Hoca bu bölümü yanlış olduğunu belirtti:
"Döngü indeksinde hata var."

Öğrenci hakkında şunu yazdı:
"Evet, i'yi 0'dan değil 1'den başlatmam gerekiyordu."

Sorulan soru: Bu öğrencinin yazısı, hoca'nın belirttiği yanlışı anladığını ve doğru bir açıklama yaptığını gösteriyor mu?

Cevapla SADECE bu JSON formatında:
{"valid": true/false, "feedback": "bir cümle açıklama (Türkçe)"}`;

console.log("Gemini 3.5 Flash API'ye istek atılıyor...");

fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
    })
})
.then(r => r.json())
.then(data => {
    if (data.error) {
        console.error("HATA GELDİ:", data.error);
    } else {
        console.log("BAŞARILI YANIT GELDİ:");
        console.log(data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data, null, 2));
    }
})
.catch(err => console.error("Ağ Hatası:", err));
