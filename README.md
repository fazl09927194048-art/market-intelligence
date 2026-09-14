# Market Intelligence

Production-ready dark market dashboard for crypto and global market intelligence.

## Included
- Live crypto prices via server-side CoinGecko adapter
- Multi-source RSS news aggregation
- News deduplication and chronological ranking
- Searchable intelligence feed
- Live refresh every 60 seconds
- Market pulse / watchlist surface
- Mobile-first premium dark UI
- SEO metadata, sitemap and robots
- Server-side fetching so provider URLs are not exposed in the browser
- GitHub Actions production build check
- Vercel-ready Next.js App Router architecture

## Local development
```bash
npm install
npm run dev
```

## Production
Import this GitHub repository into Vercel. Vercel detects Next.js automatically and deploys the `main` branch on every push. No API key is required for the default public market/news adapters.

Optional paid providers can be added later as server-side environment variables. Never commit secrets.

## Important data note
Market and news feeds can be delayed, rate-limited or temporarily unavailable. The dashboard intentionally shows provider status and falls back safely instead of inventing live values. This product is informational and is not financial advice.

## Architecture
`app/page.tsx` → dashboard UI
`app/api/market/route.ts` → crypto market adapter
`app/api/news/route.ts` → RSS aggregation + normalization + deduplication
`app/api/health/route.ts` → health endpoint
`app/sitemap.ts` / `app/robots.ts` → SEO
`.github/workflows/ci.yml` → build verification
