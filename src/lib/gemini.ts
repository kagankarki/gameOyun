/**
 * Gemini — HAZIRLIK ekranında hocaya çoktan seçmeli 5 şıklı soru taslağı üretir.
 *
 * ÖNEMLİ: Ders sırasında Gemini'ye HİÇ gidilmez. Sorular oturum açılmadan
 * önce hazırlanıp `SessionSecret` içine yazılır. Böylece 150 öğrenci aynı
 * anda basınca ne gecikme olur ne de API kotası zorlanır; internet kopsa
 * bile ders yürür.
 */
import type { FollowUpQuestion } from './types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

export const isGeminiConfigured = Boolean(API_KEY)

export type Zorluk = 'kolay' | 'orta' | 'zor'

const ZORLUK_TARIFI: Record<Zorluk, string> = {
  kolay: 'Şıklar birbirinden açıkça ayrılsın; konuyu bilen öğrenci hemen bulsun.',
  orta: 'Çeldiriciler aynı bölgeden/sistemden yapılar olsun, dikkat gerektirsin.',
  zor: 'Çeldiriciler çok yakın komşu yapılar olsun; ayrım ince anatomik/tıbbi ayrıntıya dayansın.',
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

let cachedModels: string[] | null = null

/** Google API'den bu anahtar için aktif ve geçerli modelleri dinamik keşfeder */
async function getActiveModels(apiKey: string): Promise<string[]> {
  if (cachedModels && cachedModels.length > 0) return cachedModels

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data?.models)) {
        const supported = data.models
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => String(m.name).replace(/^models\//, ''))
          // Eski/kullanımdan kalkan modelleri ayıkla
          .filter((name: string) => !name.includes('2.5-flash') && !name.includes('vision'))
          // flash modellerini en başa al
          .sort((a: string, b: string) => {
            const aScore = a.includes('2.0-flash') ? 0 : a.includes('1.5-flash') ? 1 : a.includes('flash') ? 2 : 3
            const bScore = b.includes('2.0-flash') ? 0 : b.includes('1.5-flash') ? 1 : b.includes('flash') ? 2 : 3
            return aScore - bScore
          })

        if (supported.length > 0) {
          cachedModels = supported
          return supported
        }
      }
    }
  } catch (e) {
    console.warn('[gemini] Modeller dinamik alınamadı, varsayılanlar deneniyor:', e)
  }

  // Varsayılan güvenli liste
  return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
}

/** Modelin döndürdüğü ham metinden JSON nesnesini ayıklar */
function extractJson(text: string): Record<string, any> | null {
  if (!text || typeof text !== 'string') return null
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  // 1. Doğrudan parse dene
  try {
    return JSON.parse(cleaned)
  } catch {}

  // 2. İlk { ve son } arasını ayıkla
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {}
  }

  return null
}

/** Model çıktısını doğrula ve standart 5 şıklı soru nesnesine dönüştür */
function normalizeQuestion(parsed: any, zorluk: Zorluk): FollowUpQuestion | null {
  if (!parsed || typeof parsed !== 'object') return null

  // Soru metni
  const question = (parsed.question || parsed.soru || parsed.title || parsed.prompt || '').trim()
  if (!question) return null

  // Şıklar
  const rawOptions = parsed.options || parsed.choices || parsed.secenekler || parsed.siklar || parsed.answers
  let options: string[] = []

  if (Array.isArray(rawOptions)) {
    options = rawOptions.map((o) => String(o ?? '').trim()).filter(Boolean)
  } else if (rawOptions && typeof rawOptions === 'object') {
    options = Object.values(rawOptions).map((o) => String(o ?? '').trim()).filter(Boolean)
  }

  // Eğer options dizisi bulunamadıysa A, B, C, D, E anahtarlarını ara
  if (options.length < 2) {
    const keys = ['A', 'B', 'C', 'D', 'E', 'a', 'b', 'c', 'd', 'e']
    const collected = keys.map((k) => parsed[k]).filter(Boolean)
    if (collected.length >= 2) {
      options = collected.map((o) => String(o).trim())
    }
  }

  if (options.length < 2) return null

  // Şıkların başındaki "A)", "B.", "1-" gibi harf/sayı öneklerini temizle
  options = options.map((opt) => opt.replace(/^[A-Ea-e1-5][\).\-\:\s]+\s*/, '').trim())

  // Tam 5 şık garantile
  while (options.length < 5) {
    options.push('')
  }
  options = options.slice(0, 5)

  // Doğru şıkkı tespit et
  let correctIndex = 0
  const rawCorrect =
    parsed.correctIndex ??
    parsed.correct_index ??
    parsed.correctOption ??
    parsed.correctOptionLetter ??
    parsed.correctAnswer ??
    parsed.dogruCevap ??
    parsed.dogruSik ??
    parsed.answer ??
    0

  if (typeof rawCorrect === 'number') {
    // 1-5 arasında verilmişse 0-tabanlıya çek
    if (rawCorrect >= 1 && rawCorrect <= 5 && !parsed.hasOwnProperty('correctIndex')) {
      correctIndex = rawCorrect - 1
    } else {
      correctIndex = Math.min(Math.max(0, Math.round(rawCorrect)), options.length - 1)
    }
  } else if (typeof rawCorrect === 'string') {
    const trimmed = rawCorrect.trim().toUpperCase()
    if (['A', 'B', 'C', 'D', 'E'].includes(trimmed)) {
      correctIndex = trimmed.charCodeAt(0) - 65
    } else {
      // Şık metinleriyle eşleşiyor mu kontrol et
      const foundIdx = options.findIndex(
        (opt) =>
          opt &&
          (opt.toLowerCase() === rawCorrect.trim().toLowerCase() ||
            opt.toLowerCase().includes(rawCorrect.trim().toLowerCase()) ||
            rawCorrect.toLowerCase().includes(opt.toLowerCase())),
      )
      if (foundIdx !== -1) {
        correctIndex = foundIdx
      } else {
        const num = parseInt(trimmed, 10)
        if (!isNaN(num)) {
          correctIndex = num >= 1 && num <= 5 ? num - 1 : Math.min(Math.max(0, num), options.length - 1)
        }
      }
    }
  }

  return {
    question,
    options,
    correctIndex,
    bonus: 50,
    difficulty: zorluk,
  }
}

export interface GenerateResult {
  question?: FollowUpQuestion
  modelUsed?: string
  error?: string
}

/**
 * Hatayı yakalayan öğrenciye sorulacak 5 şıklı soruyu üretir.
 * Hoca sonucu görür, düzeltebilir ve onaylar — doğrudan kaydedilmez.
 */
export async function generateFollowUp(args: GenerateArgs): Promise<GenerateResult> {
  if (!API_KEY) {
    return { error: 'Gemini anahtarı tanımlı değil. Soruyu elle yazabilirsin.' }
  }

  const prompt = `Sen bir tıp / anatomi eğitmenine yardım eden uzmansın.

Ders: ${args.lessonTitle ?? 'Ders'}
Metinde KASITLI olarak yanlış okunan ifade: "${args.wrongText}"
Bu neden yanlış: ${args.explanation}
Doğrusu: ${args.correction || '(belirtilmemiş)'}

Bu hatayı yakalayan öğrenciye soracağımız çoktan seçmeli bir soru hazırla.
Soru, öğrencinin bu bilginin doğrusunu veya gerekçesini bilip bilmediğini ölçsün (Örn: "Okunan ifadedeki yanlış bilgiye göre doğrusu aşağıdakilerden hangisidir?").
Zorluk derecesi: ${args.zorluk}. ${ZORLUK_TARIFI[args.zorluk]}
Şıklar: Tam 5 şık (A, B, C, D, E) olmalı. Şıklardan yalnızca BİRİ doğru, diğer 4'ü mantıklı çeldiriciler olmalı.
Şıklar kısa ve öz olsun (en fazla 8 kelime), mobil ekranda tek satırda rahat okunsun.
Türkçe yaz. Tıbbi ve anatomik terimleri orijinal / Latince bırak.

ÖNEMLİ KURALLAR:
1. Doğru cevabı seçenekler arasında rastgele bir konuma koy (her zaman A olmasın; A, B, C, D veya E olabilir).
2. "correctIndex" alanına doğru şıkkın 0-tabanlı indeksini yaz (A=0, B=1, C=2, D=3, E=4).
3. "correctOptionLetter" alanına doğru harfi yaz ("A", "B", "C", "D" veya "E").

Aşağıdaki JSON şemasında geçerli bir JSON döndür:
{
  "question": "Soru metni buraya",
  "options": [
    "A şıkkı metni",
    "B şıkkı metni",
    "C şıkkı metni",
    "D şıkkı metni",
    "E şıkkı metni"
  ],
  "correctIndex": 1,
  "correctOptionLetter": "B"
}`

  const candidateModels = await getActiveModels(API_KEY)
  let lastError = ''

  for (const model of candidateModels) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        lastError = err?.error?.message ?? `Model ${model} hatası: ${response.status}`
        continue
      }

      const data = await response.json()
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      const parsed = extractJson(text)
      const questionObj = normalizeQuestion(parsed, args.zorluk)

      if (questionObj) {
        return { question: questionObj, modelUsed: model }
      }

      console.warn(`[gemini] ${model} çıktısı parse edilemedi:`, text)
      lastError = 'Soru formatı tam çözümlenemedi.'
    } catch (err) {
      console.error(`[gemini] ${model} istek hatası:`, err)
      lastError = (err as Error).message || 'Bağlantı hatası.'
    }
  }

  return { error: `Soru üretilemedi (${lastError}). Şıkları elle doldurabilirsin.` }
}
