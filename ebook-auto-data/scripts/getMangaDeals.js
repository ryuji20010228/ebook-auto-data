import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";

const CANDIDATE_URLS = [
  "https://www.amazon.co.jp/s?i=digital-text&bbn=2291657051&rh=n%3A2291905051%2Cn%3A2291906051%2Cn%3A2291657051%2Cp_n_date%3A12035772011&s=featured-rank"
];

const LIMIT = 60;
const OUT = "deals_manga.json";

const yenToNumber = (text = "") => {
  const n = (text || "").replace(/[^\d]/g, "");
  return n ? Number(n) : null;
};

function normalize(str = "") {
  return String(str).replace(/\s+/g, " ").trim();
}

function toItem(raw) {
  return raw && raw.id && raw.title && raw.url
    ? {
        id: raw.id,
        title: normalize(raw.title),
        author: normalize(raw.author || ""),
        illustrator: normalize(raw.illustrator || ""),
        price_current: raw.price_current ?? null,
        price_list: raw.price_list ?? null,
        url: raw.url,
        cover: raw.cover || "",
        scraped_at: new Date().toISOString()
      }
    : null;
}

async function scrapeOne(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];
  const cards = $(
    'div.s-main-slot [data-component-type="s-search-result"][data-asin]'
  );

  cards.each((_, el) => {
    const $el = $(el);
    const asin = $el.attr("data-asin");
    if (!asin) return;
    const a = $el.find("h2 a.a-link-normal").first();
    const href = a.attr("href") || "";
    const url = href ? new URL(href, "https://www.amazon.co.jp").toString().split("?")[0] : "";
    const title = a.find("span").text() || $el.find("h2 span").text();
    const metaRow = $el.find(".a-row .a-size-base.a-color-secondary").first().text();
    let author = "";
    if (metaRow) author = metaRow.split("|")[0] || "";
    const priceCurrentText = $el.find(".a-price .a-offscreen").first().text();
    const strikeText = $el.find(".a-text-price .a-offscreen").first().text();
    const price_current = yenToNumber(priceCurrentText);
    const price_list = yenToNumber(strikeText);
    const img = $el.find("img.s-image").attr("src") || "";
    const raw = { id: asin, title, author, price_current, price_list, url, cover: img };
    const item = toItem(raw);
    if (item) items.push(item);
  });

  return items;
}

async function main() {
  const collected = [];
  for (const url of CANDIDATE_URLS) {
    try {
      const arr = await scrapeOne(url);
      for (const x of arr) {
        if (!collected.find((y) => y.id === x.id)) {
          collected.push(x);
          if (collected.length >= LIMIT) break;
        }
      }
      if (collected.length >= LIMIT) break;
    } catch (e) {
      console.error("scrape error:", url, e.message);
    }
  }

  collected.sort((a, b) => {
    const aPct = a.price_list ? Math.round((1 - (a.price_current ?? a.price_list) / a.price_list) * 100) : -1;
    const bPct = b.price_list ? Math.round((1 - (b.price_current ?? b.price_list) / b.price_list) * 100) : -1;
    return (bPct || -1) - (aPct || -1);
  });

  fs.writeFileSync(OUT, JSON.stringify(collected, null, 2) + "\n");
  console.log(`Updated ${OUT} with ${collected.length} items.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
