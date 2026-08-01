import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { marked } from "marked";
import config from "./blog.config.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, "content");
const TEMPLATE_DIR = path.join(__dirname, "templates");
const ASSETS_DIR = path.join(__dirname, "assets");
const DIST_DIR = path.join(__dirname, "dist");

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const frontmatter = {};
  const lines = match[1].split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return {
    ...frontmatter,
    content: match[2].trim(),
  };
}

function slugify(filename) {
  return filename
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scanContent() {
  // Check if content directory exists
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("No content directory found, starting with empty blog");
    return [];
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md"));

  const posts = files
    .map((file) => {
      const filepath = path.join(CONTENT_DIR, file);
      const content = fs.readFileSync(filepath, "utf-8");
      const parsed = parseFrontmatter(content);

      if (!parsed) {
        console.error(`Failed to parse ${file}`);
        return null;
      }

      return {
        slug: slugify(file),
        filename: file,
        ...parsed,
      };
    })
    .filter((post) => post !== null);

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function loadTemplate(name = "layout.html") {
  const templatePath = path.join(TEMPLATE_DIR, name);
  return fs.readFileSync(templatePath, "utf-8");
}

function renderPost(post) {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    description: post.description,
    content: marked(post.content),
  };
}

function loadAboutPage() {
  const aboutPath = path.join(__dirname, "about.md");
  const aboutContent = fs.readFileSync(aboutPath, "utf-8");
  const parsed = parseFrontmatter(aboutContent);
  return marked(parsed.content);
}

function renderSinglePage(posts) {
  const template = loadTemplate("app.html");

  // Convert posts to JSON for embedding in HTML
  const postsJson = JSON.stringify(posts.map(renderPost));

  // Load and convert about page
  const aboutHtml = loadAboutPage();
  const aboutJson = JSON.stringify(aboutHtml);

  // Embed config data (without about)
  const configJson = JSON.stringify({
    tagline: config.tagline,
    url: config.url,
    repo: config.repo,
    social: config.social,
  });

  return template
    .replace("{{posts}}", postsJson)
    .replace("{{about}}", aboutJson)
    .replace("{{config}}", configJson)
    .replace(/\{\{tagline\}\}/g, config.tagline)
    
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateFeeds(posts) {
  const siteUrl = (config.url || "").replace(/\/+$/, "");
  const title = config.title || "ssupawat";
  const rendered = posts.map(renderPost);

  // JSON Feed 1.1
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: siteUrl + "/",
    feed_url: siteUrl + "/feed.json",
    language: "en",
    items: rendered.map((p) => ({
      id: siteUrl + "/posts/" + p.slug + "/",
      url: siteUrl + "/posts/" + p.slug + "/",
      title: p.title,
      date_published: p.date,
      summary: p.description,
      content_html: p.content,
    })),
  };
  fs.writeFileSync(path.join(DIST_DIR, "feed.json"), JSON.stringify(feed, null, 2));

  // Atom 1.0
  const updated = rendered.length ? rendered[0].date : new Date().toISOString();
  const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${siteUrl}/"/>
  <link rel="self" href="${siteUrl}/atom.xml"/>
  <id>${siteUrl}/</id>
  <updated>${updated}</updated>
${rendered
      .map(
        (p) => `  <entry>
    <title>${escapeXml(p.title)}</title>
    <id>${siteUrl}/posts/${p.slug}/</id>
    <link href="${siteUrl}/posts/${p.slug}/"/>
    <updated>${p.date}</updated>
    <summary>${escapeXml(p.description)}</summary>
    <content type="html">${escapeXml(p.content)}</content>
  </entry>`,
      )
      .join("\n")}
</feed>`;
  fs.writeFileSync(path.join(DIST_DIR, "atom.xml"), atom);

  // Sitemap
  const urls = [siteUrl + "/"].concat(
    rendered.map((p) => siteUrl + "/posts/" + p.slug + "/"),
  );
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join("\n")}
</urlset>`;
  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), sitemap);

  console.log("  Generated feed.json, atom.xml, sitemap.xml");
}


function generateOgImage() {
  const svg = mondrianSVG(1200, 630, 77, 0, "", false);

  const svgPath = path.join(DIST_DIR, "_og.svg");
  const pngPath = path.join(__dirname, "assets", "og-image.png");
  fs.writeFileSync(svgPath, svg);

  try {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    execSync(
      `"${chrome}" --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1200,630 --screenshot="${pngPath}" "file://${svgPath}"`,
      { stdio: "pipe", timeout: 10000 },
    );
    console.log("  Generated OG image");
  } catch {
    console.log("  OG image: Chrome not available, using existing PNG");
  }

  try { fs.unlinkSync(svgPath); } catch {}
}

function mondrianSVG(W, H, seed, pad, bg, invert) {
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263 + seed) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) / 2147483648;
  }

  const red = "#E2231A", blue = "#1D4F9C", yellow = "#F5D522";
  const fills = [red, red, blue, blue, yellow, yellow, red, blue];
  const line = "#111";
  const sw = pad < 10 ? 1.5 : 2;
  const lw = pad < 10 ? 0.5 : 1;
  const minSz = pad < 10 ? 4 : 20;

  let inner = "";
  if (invert) {
    inner += `<rect width="${W}" height="${H}" fill="${red}"/>`;
  } else {
    inner += `<rect width="${W}" height="${H}" fill="#FFF"/>`;
    inner += `<rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" fill="none" stroke="${line}" stroke-width="${sw}" opacity="0.95"/>`;
  }

  function split(x, y, w, h, depth, id) {
    if (depth > 3 || w < minSz * 2 || h < minSz * 2) {
      if (hash(id, 0) > 0.15) {
        const fill = invert ? bg || "#F4F5F3" : fills[Math.floor(hash(id, 3) * fills.length)];
        const op = 0.3 + hash(id, 1) * 0.55;
        inner += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${op.toFixed(2)}"/>`;
      }
      return;
    }
    const ratio = 0.3 + hash(id, 2) * 0.4;
    if (hash(id, 3) > 0.5) {
      const sx = x + w * ratio;
      inner += `<line x1="${sx}" y1="${y}" x2="${sx}" y2="${y + h}" stroke="${invert ? (bg || "#F4F5F3") : line}" stroke-width="${lw}" opacity="${invert ? 0.3 : 0.6}"/>`;
      split(x, y, sx - x, h, depth + 1, id * 2);
      split(sx, y, x + w - sx, h, depth + 1, id * 2 + 1);
    } else {
      const sy = y + h * ratio;
      inner += `<line x1="${x}" y1="${sy}" x2="${x + w}" y2="${sy}" stroke="${invert ? (bg || "#F4F5F3") : line}" stroke-width="${lw}" opacity="${invert ? 0.3 : 0.6}"/>`;
      split(x, y, w, sy - y, depth + 1, id * 2);
      split(x, sy, w, y + h - sy, depth + 1, id * 2 + 1);
    }
  }
  split(pad, pad, W - pad * 2, H - pad * 2, 0, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

function generateCover(seed) {
  return mondrianSVG(600, 315, seed, 6, "", false);
}

function generatePostPages(posts) {
  const siteUrl = (config.url || "").replace(/\/+$/, "");
  const title = config.title || "ssupawat";
  const rendered = posts.map(renderPost);

  const postsDir = path.join(DIST_DIR, "posts");
  fs.mkdirSync(postsDir, { recursive: true });

  rendered.forEach((p) => {
    const slugDir = path.join(postsDir, p.slug);
    fs.mkdirSync(slugDir, { recursive: true });

    // Seed from slug
    let seed = 0;
    for (let i = 0; i < p.slug.length; i++) seed = ((seed << 5) - seed + p.slug.charCodeAt(i)) | 0;
    seed = Math.abs(seed);

    const coverSvg = generateCover(seed);
    fs.writeFileSync(path.join(slugDir, "cover.svg"), coverSvg);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeXml(p.title)} — ${escapeXml(title)}</title>
<meta name="description" content="${escapeXml(p.description)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeXml(p.title)}">
<meta property="og:description" content="${escapeXml(p.description)}">
<meta property="og:image" content="${siteUrl}/assets/og-image.png">
<meta property="og:url" content="${siteUrl}/posts/${p.slug}/">
<meta name="twitter:card" content="summary_large_image">
<style>
body{font-family:"Inter",system-ui,-apple-system,sans-serif;max-width:700px;margin:3rem auto;padding:0 1.5rem;background:#F4F5F3;color:#151A21;line-height:1.7}
h1{font-size:1.3rem;font-weight:600}
.meta{color:#6B7280;font-size:.9rem;margin-bottom:1.5rem}
a{color:#2F6F6A}
.cover{margin-bottom:2rem}
.cover svg{max-width:100%;height:auto}
@media(prefers-color-scheme:dark){body{background:#151A21;color:#F4F5F3}.meta{color:#6B7280}a{color:#2F6F6A}}
</style>
</head>
<body>
<h1>${escapeXml(p.title)}</h1>
<p class="meta">${escapeXml(p.date)}</p>
<div class="cover">${coverSvg}</div>
<p>${escapeXml(p.description)}</p>
<p><a href="${siteUrl}/#/${p.slug}">Read more →</a></p>
</body>
</html>`;

    fs.writeFileSync(path.join(slugDir, "index.html"), html);
  });

  console.log(`  Generated ${rendered.length} post pages`);
}

function copyAssets() {
  const assetsDistDir = path.join(DIST_DIR, "assets");
  if (!fs.existsSync(assetsDistDir)) {
    fs.mkdirSync(assetsDistDir, { recursive: true });
  }

  // Copy all files from assets to dist/assets
  const files = fs.readdirSync(ASSETS_DIR);
  files.forEach((file) => {
    const srcPath = path.join(ASSETS_DIR, file);
    const stat = fs.statSync(srcPath);

    if (stat.isFile()) {
      fs.copyFileSync(srcPath, path.join(assetsDistDir, file));
    } else if (stat.isDirectory()) {
      // Recursively copy subdirectories (like images/)
      copyDirSync(srcPath, path.join(assetsDistDir, file));
    }
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function build() {
  console.log("Building blog...");

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const posts = scanContent();
  console.log(`Found ${posts.length} posts`);

  const indexHtml = renderSinglePage(posts);
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), indexHtml);
  console.log("  Generated index.html");

  generateFeeds(posts);
  generatePostPages(posts);

  generateOgImage();

  copyAssets();
  console.log("  Copied assets");

  console.log("Build complete!");
}

build();
