/**
 * Free, key-free news sources for Nasdaq-100 futures.
 * `tier` mirrors the OS source weighting: 1.0 = primary wire or the issuer
 * itself, lower = aggregator or commentary.
 */
export const RSS = [
  { src: "Federal Reserve", tier: 1.00, url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { src: "Federal Reserve", tier: 1.00, url: "https://www.federalreserve.gov/feeds/speeches.xml" },
  { src: "SEC",             tier: 1.00, url: "https://www.sec.gov/news/pressreleases.rss" },
  { src: "WSJ",             tier: 1.00, url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  { src: "CNBC",            tier: 0.85, url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { src: "CNBC",            tier: 0.85, url: "https://www.cnbc.com/id/19854910/device/rss/rss.html" },
  { src: "MarketWatch",     tier: 0.80, url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { src: "Yahoo Finance",   tier: 0.70, url: "https://finance.yahoo.com/news/rssindex" },
  { src: "Nasdaq",          tier: 0.70, url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" }
];
/* Deliberately absent: bls.gov and home.treasury.gov. BLS blocks datacenter IPs
   (so it 403s from Lambda) and Treasury's feed path no longer resolves. The
   Google News queries below pick up the same releases within a minute or two. */

/**
 * Google News search feeds. No key, no quota headaches, and they surface the
 * single-name stories that actually move NQ. Each query becomes one feed.
 */
export const QUERIES = [
  { src: "Reuters", tier: 1.0,  q: 'site:reuters.com (Nasdaq OR "Federal Reserve" OR inflation OR yields)' },
  { src: "Other",   tier: 0.65, q: '"Nasdaq 100" OR "Nasdaq futures"' },
  { src: "Other",   tier: 0.65, q: "Nvidia OR Microsoft OR Apple OR Broadcom earnings OR guidance" },
  { src: "Other",   tier: 0.65, q: "FOMC OR CPI OR PCE OR payrolls OR Treasury yields" }
];
export const googleNews = q =>
  "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=en-US&gl=US&ceid=US:en";

/* Symbols now live in instruments.mjs, which also declares what moves each
   market. chartUrl is shared by every one of them. */
export const chartUrl = (sym, range = "2d", interval = "5m") =>
  "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) +
  "?range=" + range + "&interval=" + interval + "&includePrePost=true";
