# Market Intelligence

A dark, mobile-first market intelligence dashboard for crypto and global markets.

## Current foundation
- Next.js App Router + TypeScript
- Premium responsive dark UI
- Market overview cards
- Breaking/important news surface
- Market signal panel
- Health API endpoint
- Server-side provider architecture ready to extend

## Run locally
```bash
npm install
npm run dev
```

## Data architecture
The UI is intentionally separated from data providers. The next layer should add multiple RSS/API adapters for crypto, equities, commodities, forex and macro news, normalize every story into a common schema, deduplicate by canonical URL/title similarity, rank by recency + relevance + impact, and cache results server-side.

Optional provider credentials belong in `.env.local` and must never be committed.

## Roadmap
1. Multi-source live news ingestion
2. Coin/market price adapters and charts
3. Search, filters and asset pages
4. Watchlists and alerts
5. News sentiment/impact scoring
6. SEO, sitemap and OpenGraph pages
7. Automated CI/build checks
