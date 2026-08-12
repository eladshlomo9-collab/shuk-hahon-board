# בורד פעילות AI

אפליקציית ניהול בורדים/משימות (בסגנון monday.com) עם מעקב התייעלות AI ארגוני — React + Vite + Supabase + Tailwind, עברית/RTL.

- **Repo**: https://github.com/eladshlomo9-collab/shuk-hahon-board
- **Production**: https://shuk-hahon-board.netlify.app

## פיתוח מקומי

```bash
npm install
npm run dev
```

צריך קובץ `.env` (לא ב-git) עם:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## מבנה

- `src/` — קוד האפליקציה (React)
- `db/` — סכמת Supabase (`schema.sql`) ומיגרציות נפרדות (`add-*.sql`)
- `supabase/functions/` — Edge Functions (יצירת משתמש, איפוס סיסמה)
- `scripts/` — סקריפטי בדיקה/דיבאג מול Supabase (דורשים `.env` + `TEST_EMAIL`/`TEST_PASSWORD`)

## פריסה

```bash
npm run build
npx netlify deploy --prod --dir=dist --site 9dec62d1-3676-4f51-8924-a78f6b6c064a
```
