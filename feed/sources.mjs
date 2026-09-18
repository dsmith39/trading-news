/**
 * Free, key-free news sources for Nasdaq-100 futures.
 * `tier` mirrors the OS source weighting: 1.0 = primary wire or the issuer
 * itself, lower = aggregator or commentary.
 */
export const RSS = [
  { src: "Federal Reserve", tier: 1.0, url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { src: "Federal Reserve", tier: 1.0, url: "https://www.federalreserve.gov/feeds/speeches.xml" },
  { src: "BLS",             tier: 1.0, url: "https://www.bls.gov/feed/bls_latest.rss" },
  { src: "Treasury",        tier: 1.0, url: "https://home.treasury.gov/news/press-releases/feed" },
  { src: "CNBC",            tier: 0.85, url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { src: "CNBC",            tier: 0.85, url: "https://www.cnbc.com/id/19854910/device/rss/rss.html" },
  { src: "MarketWatch",     tier: 0.80, url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { src: "Yahoo Finance",   tier: 0.70, url: "https://finance.yahoo.com/news/rssindex" }
];

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

/** Yahoo chart endpoints — free and key-free. Keys match the OS quote model. */
export const QUOTES = {
  nq:  "NQ=F",  es: "ES=F",     rty: "RTY=F", vx: "^VIX",
  tnx: "^TNX",  dxy: "DX-Y.NYB", gc: "GC=F",  cl: "CL=F", btc: "BTC-USD"
};
export const chartUrl = (sym, range = "2d", interval = "5m") =>
  "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) +
  "?range=" + range + "&interval=" + interval + "&includePrePost=true";
