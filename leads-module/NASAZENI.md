# Nasazení Hektaria Leads Module

## 1. Supabase — databáze (5 min)

1. Jdi na https://supabase.com → "Start your project"
2. Vytvoř nový projekt: název `hektaria-leads`, zvol region `eu-central-1`
3. Settings → Database → **Connection string** → záložka **URI**
4. Zkopíruj URL ve tvaru: `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`
5. Toto je tvůj `DATABASE_URL`

## 2. Vercel — nasazení (10 min)

### Možnost A — přes GitHub (doporučeno)
1. Vlož `leads-module/` do GitHub repozitáře (nebo celý `Hektaria program/`)
2. Jdi na https://vercel.com → "Add New Project" → Import z GitHubu
3. **Root Directory** nastav na `leads-module`
4. Přidej Environment Variables:
   ```
   DATABASE_URL        = <z Supabase>
   ANTHROPIC_API_KEY   = sk-ant-...
   CRON_SECRET         = <vygeneruj: openssl rand -hex 32>
   NEXT_PUBLIC_APP_URL = https://<tvoje-app>.vercel.app
   ```
5. Deploy → získáš URL jako `hektaria-leads.vercel.app`

### Možnost B — přes Vercel CLI
```bash
npm i -g vercel
cd "leads-module"
vercel
# při dotazu na root dir: . (current)
vercel env add DATABASE_URL
vercel env add ANTHROPIC_API_KEY
vercel env add CRON_SECRET
vercel --prod
```

## 3. Migrace databáze

Po nasazení spusť jednorázově:
```bash
# lokálně (potřebuješ Node.js)
DATABASE_URL="<supabase-url>" npx prisma migrate deploy

# nebo přes Vercel CLI
vercel env pull .env.local
npx prisma migrate deploy
```

Alternativně přes Supabase SQL editor — spusť obsah z `prisma/migrations/`.

## 4. Připojení platformy

V `hektaria-platform.html` změň v JS sekci konstanta:
```js
const API_BASE = 'https://hektaria-leads.vercel.app';
```

Pak všechna volání `fetch('/api/...')` nahraď `fetch(API_BASE + '/api/...')`.

## 5. CORS

V `next.config.ts` přidej:
```js
async headers() {
  return [{
    source: '/api/:path*',
    headers: [
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
    ],
  }];
}
```

## 6. Ověření

- `GET https://hektaria-leads.vercel.app/api/leads` → prázdné pole `[]`
- `GET https://hektaria-leads.vercel.app/api/dashboard/stats` → KPI data
- `POST https://hektaria-leads.vercel.app/api/jobs/daily` s hlavičkou `Authorization: Bearer <CRON_SECRET>` → spustí první import z RUIAN
