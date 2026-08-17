/**
 * Gemini Free API — öğrencinin yanlış bloğu hakkında yazdığı notun
 * doğruluğunu kontrol eder.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'

export interface ValidationResult {
  valid: boolean
  feedback: string
}

/**
 * Hoca belirttiği yanlışı öğrenci doğru anlamış mı?
 *
 * @param wrongExplanation — Hoca'nın "Bu yanlış çünkü..." yazısı
 * @param studentNote — Öğrenci'nin yazdığı kısa not
 */
export async function validateStudentNote(
  wrongExplanation: string,
  studentNote: string,
): Promise<ValidationResult> {
  if (!API_KEY) {
    console.error('VITE_GEMINI_API_KEY tanımlı değil')
    return { valid: false, feedback: 'Gemini anahtarı eksik. Yöneticiye sor.' }
  }

  const prompt = `Hoca bu bölümü yanlış olduğunu belirtti:
"${wrongExplanation}"

Öğrenci hakkında şunu yazdı:
"${studentNote}"

Sorulan soru: Bu öğrencinin yazısı, hoca'nın belirttiği yanlışı anladığını ve doğru bir açıklama yaptığını gösteriyor mu?

Cevapla SADECE bu JSON formatında:
{"valid": true/false, "feedback": "bir cümle açıklama (Türkçe)"}

Yanıt:`;

  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3, // Düşük, net cevap
          topP: 0.8,
          topK: 10,
          maxOutputTokens: 256,
        },
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('[gemini] API hatası:', err)
      return { valid: false, feedback: `API hatası: ${err.error?.message || 'bilinmiyor'}` }
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // JSON'u çıkar — Gemini bazen "```json ... ```" ile sarabilir
    const jsonMatch = text.match(/\{[^{}]*"valid"[^{}]*\}/)
    if (!jsonMatch) {
      console.error('[gemini] JSON parse hatası:', text)
      return { valid: false, feedback: 'Gemini cevap veremiyor.' }
    }

    const result = JSON.parse(jsonMatch[0])
    return {
      valid: result.valid === true,
      feedback: result.feedback || 'Geri bildirim yok.',
    }
  } catch (err) {
    console.error('[gemini] İstek hatası:', err)
    return { valid: false, feedback: 'Bağlantı hatası. Tekrar dene.' }
  }
}
