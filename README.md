# art.

Personal site — writing, projects, demos. Built with vanilla JavaScript, no framework.

## Features

- **Markdown posts** with YAML frontmatter — title, description, date, tags
- **Tags** — per-post tags with YAML array frontmatter, shown on posts and in the post list
- **Hash-based SPA** — single `index.html`, no server routing
- **Client-side search** — filters posts by title, description, and body on each keystroke
- **Prev/next navigation** between posts
- **Share button** — copies canonical URL or opens native share sheet
- **Algorithmic cover art** — Mondrian-style recursive subdivision, unique per post
- **Per-post OG pages** — static HTML at `/posts/<slug>/` for social previews
- **JSON Feed, Atom, Sitemap** — generated at build time
- **Dark mode** — respects system preference, toggled from nav, persisted
- **Thai language support** — Noto Sans Thai, Unicode-aware slugifier
- **Two-font system** — Inter for prose, JetBrains Mono for metadata
- **Material Symbols** for icons, with SVG brand logos (GitHub, Facebook)
- **Live reload** in dev via Vite

## Stack

```
content/          → Markdown posts with frontmatter
templates/        → app.html (SPA shell)
assets/           → style.css, favicon, OG image
build.js          → static generator (Node, no dependencies beyond marked)
blog.config.js    → single config file for site, social, OG
vite.config.js    → dev server with live reload
```

`build.js` reads content, renders Markdown with `marked`, generates `dist/index.html` (embedded posts JSON + SPA), per-post OG pages, feeds, sitemap, and rasterizes the OG image via Chrome headless.

## Getting Started

```bash
npm install
npm run dev        # → http://localhost:3000
npm run build      # → dist/
```

Changes to `content/`, `templates/`, `assets/`, or `blog.config.js` trigger auto-rebuild and reload.

## Creating Content

```markdown
---
title: "Your Post Title"
description: "Brief summary"
date: "2025-08-01"
tags:
  - tag1
  - tag2
---

Your content here. Markdown, code blocks, whatever.
```

## Configuration

All in `blog.config.js`:

- `site` — name, tagline, URL, repo
- `social` — GitHub, Facebook links
- `og` — OG image seed and dimensions

## Deploy

GitHub Actions builds and deploys to Pages on every push to `main`.
