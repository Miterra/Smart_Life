# Smart Life Dashboard

> PWA mobile-first pour gérer ton équipe : tâches, calendrier, social, visuels, le tout avec **vraies notifications push iOS / Android / desktop** (Web Push VAPID natif, sans Firebase).

![Stack](https://img.shields.io/badge/stack-React_18-22d3ee?style=flat-square)
![Stack](https://img.shields.io/badge/Vite-5-e879f9?style=flat-square)
![Stack](https://img.shields.io/badge/Tailwind-3-22d3ee?style=flat-square)
![Stack](https://img.shields.io/badge/Supabase-Postgres+Realtime+Edge-3ecf8e?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-fbbf24?style=flat-square)

L'app est **publique** : si tu veux ta propre instance pour gérer le travail de ta team, fork ce repo, configure ton Supabase et c'est parti.

---

## ✨ Fonctionnalités

### 👥 Système de rôles à 4 niveaux

| Rôle | Voit | Peut faire |
|------|------|------------|
| **owner** | tout | tout + change les rôles + crée/supprime les groupes de visibilité |
| **admin** | tout | tout sauf changer un rôle vers `owner` |
| **manager** | ses tâches + celles de ses groupes | crée des tâches, crée des comptes user, assigne |
| **user** | ses tâches assignées | **uniquement** changer le statut (todo → en cours → terminé) |

Le **owner** définit qui voit quoi via des **groupes de visibilité**. Les RLS Postgres font respecter ces règles côté DB — pas seulement côté UI.

### 🔔 Notifications push (iOS / Android / desktop)

- **Web Push natif** (VAPID, AES-128-GCM RFC 8291). Pas de Firebase, pas de FCM, pas de dépendance externe.
- Edge Function `send-reminders` appelée chaque minute via **pg_cron** → envoie un push J-1 pour chaque tâche avec échéance, plus les insights `warning`/`danger` à tous les admins.
- **iOS 16.4+** supporté quand l'app est installée sur l'écran d'accueil (Safari → Partager → Sur l'écran d'accueil).
- Sync multi-device via Supabase Realtime : crée une tâche sur ton PC, elle apparaît instantanément sur ton iPhone.

### 📊 Dashboard

- Score de productivité animé (basé sur tâches récentes + retard)
- Snapshot social (Instagram, TikTok) avec delta J/J
- Mes tâches du jour
- Flux d'insights IA (warning, success, danger, info)

### ✅ Tâches

- CRUD complet avec urgence (Critique / Important / Tranquille) et statut (À faire / En cours / Terminé)
- Filtres rapides (Mes tâches, par statut)
- Assignation à un membre + visibilité par groupe
- Tap sur la pastille de statut pour cycler (todo → in_progress → done) — un `user` ne peut faire que ça sur ses tâches assignées (forcé par RLS + trigger Postgres)

### 📅 Agenda

- Vue mensuelle, deadlines colorées par urgence
- Détail du jour sélectionné

### 📈 Social

- Graphique 30 jours (Recharts) Instagram + TikTok
- Saisie manuelle des followers (ou branche un cron + API/scraper)

### 🪄 Visuels

- 3 modèles prédéfinis (Post motivationnel, Annonce, Réseau social)
- Génération en un tap, pas de prompt à écrire
- Galerie persistée dans Supabase (placeholder Picsum aujourd'hui — branche Gemini Nano-Banana / DALL-E / SD pour de la vraie génération)

---

## 🚀 Setup en 10 minutes

### 1. Cloner et installer

```bash
git clone https://github.com/Miterra/Smart_Life.git
cd Smart_Life
npm install
```

### 2. Créer un projet Supabase

Va sur [supabase.com](https://supabase.com) → New project. Récupère :
- **Project URL** (`https://xxx.supabase.co`)
- **anon key** (`eyJ…`)

### 3. Appliquer les migrations

Dans **Supabase SQL Editor**, exécute dans l'ordre :

1. `supabase/migrations/20260528_initial_schema.sql` — tables, RLS, triggers, premier inscrit = owner
2. `supabase/migrations/20260528_app_secrets_and_rpc.sql` — table sécurisée pour les clés VAPID
3. `supabase/migrations/20260528_schedule_reminders_cron.sql` — cron toutes les minutes (remplace `<PROJECT-REF>` par ton ref)

Active les extensions requises :

```sql
-- Database -> Extensions, active :
-- pg_cron, pg_net, pgcrypto
```

### 4. Générer les clés VAPID

```bash
npm run gen:vapid
```

Tu obtiens `VAPID_PUBLIC` et `VAPID_PRIVATE`. Copie la **publique** dans `.env.local`, et stocke les deux + le subject dans Supabase :

```sql
insert into private.app_secrets (key, value) values
  ('vapid_public',  '<la clé publique>'),
  ('vapid_private', '<la clé privée>'),
  ('vapid_subject', 'mailto:toi@example.com');
```

### 5. Déployer l'edge function

```bash
npx supabase login
npx supabase link --project-ref <PROJECT-REF>
npx supabase functions deploy send-reminders --no-verify-jwt
```

(`--no-verify-jwt` car elle est appelée par pg_cron, pas par un client authentifié.)

### 6. Configurer `.env.local`

```bash
cp .env.example .env.local
```

Renseigne :

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ…
VITE_VAPID_PUBLIC_KEY=B…
VITE_INSTAGRAM_HANDLE=ton_handle
VITE_TIKTOK_HANDLE=ton_handle
```

### 7. Lancer

```bash
npm run dev
```

→ ouvre [http://localhost:5173](http://localhost:5173).

**Le premier compte créé devient automatiquement `owner`.**

---

## 📱 Installer sur iPhone (pour recevoir les push)

iOS exige que la PWA soit **installée sur l'écran d'accueil** pour autoriser les Web Push.

1. Déploie l'app (Vercel, Netlify, Cloudflare Pages…) sur un domaine HTTPS
2. Ouvre l'URL dans **Safari** (pas Chrome) sur ton iPhone
3. Bouton **Partager** → **Sur l'écran d'accueil**
4. Lance l'app depuis l'icône
5. Va dans **Paramètres** → **Activer sur ce device**

Test : crée une tâche avec échéance dans ~24h05 (pour passer la fenêtre J-1 ±2 min) et attends le cron.

---

## 🚢 Déploiement

### Vercel / Netlify / Cloudflare Pages

- Build command : `npm run build`
- Output : `dist`
- Variables d'env : les 5 `VITE_…` de `.env.example`

Le service worker est généré automatiquement (`dist/sw.js`).

### Self-hosted

```bash
npm run build
# Sers /dist avec un serveur statique (nginx, Caddy, …)
```

---

## 🧠 Architecture

```
┌──────────────── Client (React + PWA) ────────────────┐
│  • Auth Supabase (email/password)                    │
│  • Realtime sur tasks / insights / social / profiles │
│  • Service Worker (public/sw.js) → push handler      │
└──────────────────────────────────────────────────────┘
            │ HTTPS + WebSocket
            ▼
┌──────────────── Supabase ────────────────┐
│  • Postgres                              │
│  • RLS strict (rôles + groupes)          │
│  • Trigger handle_new_user (1er = owner) │
│  • Trigger tasks_user_only_status        │
│  • pg_cron (toutes les minutes)          │
│  • Edge Function send-reminders          │
│    → Web Push VAPID natif (RFC 8291)     │
└──────────────────────────────────────────┘
            │ Web Push protocol
            ▼
┌─ Apple Push (iOS) / FCM (Android) / Mozilla autopush ─┐
│           Push affiché par le Service Worker          │
└───────────────────────────────────────────────────────┘
```

### Tables Supabase

| Table | Rôle |
|-------|------|
| `profiles` | extension de `auth.users` (rôle, nom, push_enabled) |
| `groups` + `group_members` | groupes de visibilité (qui voit les tâches de qui) |
| `tasks` | titre, description, échéance, urgence, statut, assigned_to, group_id |
| `social_history` | snapshot followers IG/TikTok par jour |
| `insights` | analyses IA (kind, tone, title, body) |
| `visuals` | visuels générés (template + URL) |
| `push_subscriptions` | un endpoint par device par user |
| `private.app_secrets` | VAPID keys (jamais exposé via PostgREST) |

### Sécurité

- **RLS sur 100% des tables publiques** — pas un seul `using (true)` permissif sur les tables sensibles.
- **Trigger `tasks_user_only_status`** : un `user` qui update sa tâche assignée ne peut changer **que** le statut (les autres colonnes sont restaurées à leur valeur précédente).
- **`get_vapid_config()`** est `SECURITY DEFINER`, exécutable uniquement par `service_role`.
- Le **premier inscrit** devient `owner` via trigger — pas de hack côté front à oublier.

---

## 🔧 Scripts

| Commande | Action |
|----------|--------|
| `npm run dev` | dev server Vite (port 5173, host 0.0.0.0 pour tester sur mobile) |
| `npm run build` | build production (dist/ + service worker) |
| `npm run preview` | preview du build |
| `npm run gen:vapid` | génère une paire de clés VAPID P-256 |

---

## 🗺️ Roadmap

- [ ] Branchement Gemini / OpenAI pour insights automatiques (déjà câblé côté DB, manque l'edge function)
- [ ] Génération d'images réelle (Nano-Banana / DALL-E / SDXL)
- [ ] Sync Instagram/TikTok via API officielle (Meta Graph) ou scraper
- [ ] Chat de groupe (table `messages` + Realtime + UI WhatsApp-like)
- [ ] Export `.ics` des deadlines pour le calendrier natif iOS
- [ ] Native iOS via Capacitor (au cas où Web Push iOS te suffit pas)

---

## 📄 Licence

MIT. Fork, modifie, déploie pour ton équipe — c'est fait pour ça.

---

## 🙏 Crédits

Stack : React + Vite + Tailwind + Supabase + Web Push natif (VAPID). Pas de Firebase, pas de FCM, pas de tracker.
