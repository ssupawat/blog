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
    .replace(/[^a-z0-9]+/g, "-")
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
    .replace(/\{\{tagline\}\}/g, config.tagline);
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
  const W = 1200, H = 630;
  const accent = "#06c";

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263 + 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) / 2147483648;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#f9f9f9"/>`;

  const cols = 24, rows = 14;
  const cw = W / cols, ch = H / rows;

  // Circles
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * cw;
      const cy = (y + 0.5) * ch;
      const r = hash(x * 7, y * 13) * cw * 0.55 + 5;
      const op = 0.12 + hash(x * 31, y * 17) * 0.35;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="${op.toFixed(2)}"/>`;
    }
  }

  // Connecting lines
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1 && hash(x, y) > 0.48) {
        svg += `<line x1="${(x + 0.5) * cw}" y1="${(y + 0.5) * ch}" x2="${(x + 1.5) * cw}" y2="${(y + 0.5) * ch}" stroke="${accent}" opacity="${(0.08 + hash(x * 19, y * 23) * 0.18).toFixed(2)}" stroke-width="1"/>`;
      }
      if (y < rows - 1 && hash(x * 3, y * 5) > 0.48) {
        svg += `<line x1="${(x + 0.5) * cw}" y1="${(y + 0.5) * ch}" x2="${(x + 0.5) * cw}" y2="${(y + 1.5) * ch}" stroke="${accent}" opacity="${(0.08 + hash(x * 11, y * 7) * 0.18).toFixed(2)}" stroke-width="1"/>`;
      }
    }
  }

  svg += `</svg>`;

  const svgPath = path.join(DIST_DIR, "_og.svg");
  const pngPath = path.join(DIST_DIR, "assets", "og-image.png");
  fs.writeFileSync(svgPath, svg);

  try {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    execSync(
      `"${chrome}" --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=${W},${H} --screenshot="${pngPath}" "file://${svgPath}"`,
      { stdio: "pipe", timeout: 10000 },
    );
    console.log("  Generated OG image");
  } catch {
    console.log("  OG image: Chrome not available, using existing PNG");
  }

  try { fs.unlinkSync(svgPath); } catch {}
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
<meta name="twitter:card" content="summary">
<style>
body{font-family:"Courier New","Courier",monospace;max-width:700px;margin:3rem auto;padding:0 1.5rem;background:#f9f9f9;color:#2d2d2d;line-height:1.7}
h1{font-size:1.3rem;font-weight:600}
.meta{color:#666;font-size:.9rem;margin-bottom:2rem}
a{color:#06c}
@media(prefers-color-scheme:dark){body{background:#1a1a1a;color:#e0e0e0}.meta{color:#999}a{color:#66b2ff}}
</style>
</head>
<body>
<h1>${escapeXml(p.title)}</h1>
<p class="meta">${escapeXml(p.date)}</p>
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

  copyAssets();

  generateOgImage();
  console.log("  Copied assets");

  console.log("Build complete!");
}

build();
