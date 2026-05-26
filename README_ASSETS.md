# Как обновлять настоящие картинки и цены

Я убрал сгенерированные SVG-заглушки. Проект теперь сначала берёт `skin.image` из `skins.js`, то есть локальный файл из `assets/skins/`.

Чтобы скачать настоящие Steam/CS2 картинки и прописать их в `skins.js`, запусти из корня проекта:

```bash
node tools/download-real-assets-and-prices.js
```

Скрипт:
- берёт реальные ссылки на картинки из ByMykel CSGO-API;
- скачивает изображения в `assets/skins/`;
- прописывает локальные пути в `skins.js`;
- пытается обновить цены через Steam Community Market.

Если Steam начнёт ограничивать запросы, картинки всё равно будут скачаны, а цены обновятся частично — скрипт можно запустить повторно.

## Best 2000+ skins database

I added a proper database loader:

1. Browser first tries `data/skins.json`.
2. If it does not exist, it loads real skin names/images from ByMykel CSGO-API at runtime.
3. To generate a local 2000+ database, run:

```bash
node tools/build-best-skins-db.mjs --limit=3000
```

For actual current prices:

```bash
CSGOSKINS_API_KEY=YOUR_KEY node tools/build-best-skins-db.mjs --limit=5000 --csgoskins-prices
```

Free but slow Steam fallback:

```bash
node tools/build-best-skins-db.mjs --limit=2500 --steam-prices
```

The generated `data/skins.json` is used automatically by the site.
