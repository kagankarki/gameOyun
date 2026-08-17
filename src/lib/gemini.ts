/**
 * Gemini — HAZIRLIK ekranında hocaya çoktan seçmeli soru taslağı üretir.
 *
 * ÖNEMLİ: Ders sırasında Gemini'ye HİÇ gidilmez. Sorular oturum açılmadan
 * önce hazırlanıp `SessionSecret` içine yazılır. Böylece 150 öğrenci aynı
 * anda basınca ne gecikme olur ne de API kotası zorlanır; internet kopsa
 * bile ders yürür.
 */
import type { FollowUpQuestion } from './types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const MODEL = 'gemini-3.5-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export const isGeminiConfigured = Boolean(API_KEY)

export type Zorluk = 'kolay' | 'orta' | 'zor'

const ZORLUK_TARIFI: Record<Zorluk, string> = {
  kolay: 'Şıklar birbirinden açıkça ayrılsın; konuyu bilen öğrenci hemen bulsun.',
  orta: 'Çeldiriciler aynı bölgeden/sistemden yapılar olsun, dikkat gerektirsin.',
  zor: 'Çeldiriciler çok yakın komşu yapılar olsun; ayrım ince anatomik ayrıntıya dayansın.',
}

export interface GenerateArgs {
  /** Derste yanlış okunan ifade */
  wrongText: string
  /** Hocanın "bu yanlış çünkü…" açıklaması */
  explanation: string
  /** Doğrusu */
  correction: string
  zorluk: Zorluk
  /** Bağlam — dersin adı */
  lessonTitle?: string
}

/** Modelin döndürdüğü ham metinden ilk JSON nesnesini ayıklar */
function extractJson(text: string): unknown | null {
  const fenced = text.replace(/```json|```/g, '')
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(fenced.slice(start, end + 1))
  } catch {
    return null
  }
}

export interface GenerateResult {
  question?: FollowUpQuestion
  error?: string
}

/**
 * Hatayı yakalayan öğrenciye sorulacak soruyu üretir.
 * Hoca sonucu görür, düzeltebilir ve onaylar — doğrudan kaydedilmez.
 */
export async function generateFollowUp(args: GenerateArgs): Promise<GenerateResult> {
  if (!API_KEY) {
    return { error: 'Gemini anahtarı tanımlı değil. Soruyu elle yazabilirsin.' }
  }

  const prompt = `Sen bir anatomi eğitmenine yardım eden asistansın.

Ders: ${args.lessonTitle ?? 'Anatomi'}
Derste KASITLI olarak yanlış okunan ifade: "${args.wrongText}"
Bu neden yanlış: ${args.explanation}
Doğrusu: ${args.correction || '(belirtilmemiş)'}

Bu hatayı fark eden öğrenciye soracağımız TEK bir çoktan seçmeli soru yaz.
Soru, öğrencinin hatayı gerçekten anlayıp anlamadığını ölçsün — ezber değil.
Tam 4 şık olsun, yalnızca biri doğru.
Zorluk: ${args.zorluk}. ${ZORLUK_TARIFI[args.zorluk]}
Şıklar kısa olsun (en fazla 6 kelime), telefonda okunacak.
Türkçe yaz. Anatomik terimleri Latince bırak.

SADECE şu JSON'u döndür, başka hiçbir şey yazma:
{"question":"...","options":["...","...","...","..."],"correctIndex":0}`

  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 512 },
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return { error: `Gemini hatası: ${err?.error?.message ?? response.status}` }
    }

    const data = await response.json()
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const parsed = extractJson(text) as
      | { question?: string; options?: string[]; correctIndex?: number }
      | null

    if (!parsed?.question || !Array.isArray(parsed.options) || parsed.options.length < 2) {
      return { error: 'Gemini beklenen biçimde cevap vermedi. Tekrar dene.' }
    }

    const options = parsed.options.map((o) => String(o)).slice(0, 5)
    const correctIndex = Math.min(
      Math.max(0, Number(parsed.correctIndex ?? 0)),
      options.length - 1,
    )

    return {
      question: {
        question: String(parsed.question),
        options,
        correctIndex,
        bonus: 50,
      },
    }
  } catch (err) {
    console.error('[gemini] istek hatası:', err)
    return { error: 'Bağlantı hatası. Tekrar dene.' }
  }
}
