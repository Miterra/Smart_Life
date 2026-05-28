import { Loader2 } from 'lucide-react'

export default function Splash({ label = 'Chargement…' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ink-300">
      <div className="relative">
        <div className="absolute inset-0 bg-neon-cyan/30 blur-2xl rounded-full" />
        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center font-display font-bold text-ink-950 text-xl">
          S
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {label}
      </div>
    </div>
  )
}
