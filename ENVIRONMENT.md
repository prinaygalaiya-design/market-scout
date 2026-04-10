# Environment Variables

All variables belong in `.env.local` for local development and in the Vercel project's **Environment Variables** settings for production.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string — get from [Neon](https://neon.tech), [Supabase](https://supabase.com), or any Postgres provider. Format: `postgresql://user:pass@host/db?sslmode=require` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key — get from [console.anthropic.com](https://console.anthropic.com). Used by `/api/analyse` and `/api/cron` for 4-stage market debate. |
| `CRON_SECRET` | Yes | An arbitrary secret string you choose. Vercel passes it as `Authorization: Bearer <secret>` when triggering `/api/cron`. Also used by `/api/init` as `?secret=`. |
| `FINNHUB_API_KEY` | No | Reserved for future real-time data integration — get from [finnhub.io](https://finnhub.io). Not used yet. |
