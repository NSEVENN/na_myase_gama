# skins.json

Run this from the project root to build a 2000+ item database with real images:

```bash
node tools/build-best-skins-db.mjs --limit=3000
```

For actual prices, use one of these:

```bash
# Best quality, needs CSGOSKINS.GG key
CSGOSKINS_API_KEY=YOUR_KEY node tools/build-best-skins-db.mjs --limit=5000 --csgoskins-prices

# Free fallback, very slow because Steam rate-limits
node tools/build-best-skins-db.mjs --limit=2500 --steam-prices
```
