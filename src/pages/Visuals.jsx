import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Wand2, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react'
import { listVisuals, createVisual } from '../lib/repository'
import { supabase } from '../lib/supabase'
import { classNames, fmtShort } from '../lib/utils'

const TEMPLATES = [
  {
    id: 'motivation',
    label: 'Post motivationnel',
    accent: 'from-neon-cyan to-blue-400',
    prompts: [
      'Inspirational sunrise over mountains, minimal text overlay, modern typography',
      'Abstract neon gradient with motivational vibe, dark background',
      'Athlete silhouette at sunrise, dramatic light rays',
    ],
  },
  {
    id: 'announce',
    label: 'Annonce',
    accent: 'from-neon-magenta to-rose-400',
    prompts: [
      'Modern product launch banner with bold typography',
      'Event announcement, premium minimalist layout',
      'Sleek tech announcement, cyberpunk neon style',
    ],
  },
  {
    id: 'social',
    label: 'Réseau social',
    accent: 'from-neon-amber to-orange-400',
    prompts: [
      'Square Instagram post with vibrant gradient background',
      'Modern social media tile with brand colors',
      'Lifestyle Instagram post, soft pastels, premium look',
    ],
  },
]

const PICSUM = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/1024/1024`

export default function Visuals({ profile }) {
  const [visuals, setVisuals] = useState([])
  const [generating, setGenerating] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listVisuals(24)
      .then((v) => {
        setVisuals(v)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  const generate = async (template) => {
    setGenerating(template.id)
    try {
      const prompt = template.prompts[Math.floor(Math.random() * template.prompts.length)]
      const seed = `${template.id}-${Date.now()}`
      const image_url = PICSUM(seed) // placeholder déterministe (à remplacer par Gemini Nano-Banana / DALL-E etc.)
      const created = await createVisual({
        template: template.label,
        prompt,
        image_url,
        created_by: profile.id,
      })
      setVisuals([created, ...visuals])
    } catch (e) {
      alert(e.message)
    } finally {
      setGenerating(null)
    }
  }

  const remove = async (id) => {
    if (!confirm('Supprimer ce visuel ?')) return
    const { error } = await supabase.from('visuals').delete().eq('id', id)
    if (error) return alert(error.message)
    setVisuals(visuals.filter((v) => v.id !== id))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading text-2xl">Visuels</h1>
        <p className="text-xs text-ink-400 mt-1">
          Génère un visuel à partir d'un modèle. Pas de prompt à écrire.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <motion.button
            key={t.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => generate(t)}
            disabled={generating === t.id}
            className={classNames(
              'card p-4 text-left relative overflow-hidden disabled:opacity-60',
              'hover:bg-ink-800/80 transition',
            )}
          >
            <div
              className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-30 bg-gradient-to-br ${t.accent}`}
            />
            <Wand2 className={`w-5 h-5 mb-2 bg-gradient-to-br ${t.accent} bg-clip-text text-transparent`} />
            <p className="text-sm font-semibold text-white">{t.label}</p>
            <p className="text-[11px] text-ink-400 mt-1">Tap pour générer</p>
            {generating === t.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
                <Loader2 className="w-5 h-5 animate-spin text-neon-cyan" />
              </div>
            )}
          </motion.button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-6 px-1">
        <Sparkles className="w-4 h-4 text-neon-cyan" />
        <h2 className="heading text-sm font-bold uppercase tracking-wider">Galerie</h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-square rounded-xl bg-ink-800/40 animate-pulse" />
          ))}
        </div>
      ) : visuals.length === 0 ? (
        <div className="card p-8 text-center">
          <ImageIcon className="w-8 h-8 text-ink-500 mx-auto mb-2" />
          <p className="text-sm text-ink-400">
            Pas encore de visuel. Choisis un modèle ci-dessus.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visuals.map((v) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="card overflow-hidden group relative"
            >
              <img
                src={v.image_url}
                alt={v.template}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <div className="p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{v.template}</p>
                  <p className="text-[10px] text-ink-400">{fmtShort(v.created_at)}</p>
                </div>
                <button
                  onClick={() => remove(v.id)}
                  className="text-ink-400 hover:text-rose-400 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-ink-500 text-center mt-4 px-2 leading-relaxed">
        Les visuels actuels sont des placeholders. Branche une edge function vers Gemini
        Nano-Banana, DALL-E ou Stable Diffusion pour de la génération réelle.
      </p>
    </div>
  )
}
