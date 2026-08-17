/**
 * Yükleniyor — belge satır satır taranıyor hissi.
 * Üç satır sırayla koyulaşır; hareket azaltma tercihinde sabit kalır.
 */
export default function Loader({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6">
      <div className="flex flex-col items-center">
        <div className="file-card w-44 p-5" aria-hidden>
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-mark" />
            <span className="label">İNCELENİYOR</span>
          </div>
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2.5 rounded-sm bg-paper-deep"
                style={{
                  width: ['100%', '82%', '64%'][i],
                  animation: 'inkspread 1.1s ease-in-out infinite alternate',
                  animationDelay: `${i * 0.18}s`,
                  transformOrigin: 'left',
                }}
              />
            ))}
          </div>
        </div>

        <p role="status" className="mt-6 text-center text-sm text-ink-muted">
          {label}
        </p>
      </div>
    </div>
  )
}
