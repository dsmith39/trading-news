/**
 * What this console can read.
 *
 * Each instrument declares how the world reaches it. `drivers` is the heart of
 * it: which of the tracked series move this thing, and in which direction. A
 * falling dollar lifts crude and bitcoin; a weakening yen lifts the Nikkei
 * because it lifts exporters; rising yields press on the Nasdaq because they
 * press on the multiple. Those are different sentences about the same tape, and
 * they are the reason one scoring engine can serve several markets.
 *
 * Sign convention: +1 means "this series going up is good for this instrument".
 */

/** Series fetched for context whether or not they are traded directly. */
export const SERIES = {
  vx:  { sym: "^VIX",       name: "Fear gauge",     d: 2 },
  tnx: { sym: "^TNX",       name: "US 10-year",     d: 3 },
  dxy: { sym: "DX-Y.NYB",   name: "US dollar",      d: 2 },
  jpy: { sym: "JPY=X",      name: "Dollar / yen",   d: 3 },
  eur: { sym: "EURUSD=X",   name: "Euro / dollar",  d: 4 },
};

export const INSTRUMENTS = [
  /* ---- US index futures ---------------------------------------------- */
  { key:"nq", name:"Nasdaq 100", short:"NQ", sym:"NQ=F", kind:"future", ccy:"USD",
    pt:20, tick:0.25, d:2, micro:{name:"MNQ", pt:2}, options:"QQQ",
    drivers:{ tnx:-1, dxy:-0.6, vx:-1 },
    topics:["nasdaq","tech","fed","inflation","megacap"],
    note:"Long-duration tech. Rates and the dollar press on the multiple." },

  { key:"es", name:"S&P 500", short:"ES", sym:"ES=F", kind:"future", ccy:"USD",
    pt:50, tick:0.25, d:2, micro:{name:"MES", pt:5}, options:"SPY",
    drivers:{ tnx:-0.7, dxy:-0.5, vx:-1 },
    topics:["s&p","fed","inflation","earnings"],
    note:"Broader and less rate-sensitive than the Nasdaq." },

  { key:"rty", name:"Russell 2000", short:"RTY", sym:"RTY=F", kind:"future", ccy:"USD",
    pt:50, tick:0.1, d:1, micro:{name:"M2K", pt:5}, options:"IWM",
    drivers:{ tnx:-1.2, dxy:-0.3, vx:-1 },
    topics:["small cap","credit","fed"],
    note:"Small caps carry floating-rate debt, so they feel yields hardest." },

  { key:"ym", name:"Dow 30", short:"YM", sym:"YM=F", kind:"future", ccy:"USD",
    pt:5, tick:1, d:0, micro:{name:"MYM", pt:0.5}, options:"DIA",
    drivers:{ tnx:-0.5, dxy:-0.7, vx:-0.9 },
    topics:["dow","industrials","tariff"],
    note:"Industrial and multinational. A strong dollar hurts overseas earnings." },

  /* ---- international --------------------------------------------------- */
  { key:"nkd", name:"Nikkei 225", short:"NKD", sym:"NIY=F", kind:"future", ccy:"JPY",
    pt:5, tick:5, d:0, options:null,
    drivers:{ jpy:+1, vx:-0.8, tnx:-0.2 },
    topics:["japan","boj","yen","carry trade"],
    note:"A weaker yen lifts Japanese exporters. A hawkish BOJ strengthens the "+
         "yen, unwinds the carry trade, and that selling reaches US tech too." },

  /* ---- commodities ------------------------------------------------------ */
  { key:"cl", name:"Crude oil", short:"CL", sym:"CL=F", kind:"future", ccy:"USD",
    pt:1000, tick:0.01, d:2, micro:{name:"MCL", pt:100}, options:"USO",
    drivers:{ dxy:-1, vx:-0.4 },
    topics:["opec","crude","supply","sanctions","inventories"],
    note:"Priced in dollars, so a weaker dollar lifts it mechanically." },

  { key:"gc", name:"Gold", short:"GC", sym:"GC=F", kind:"future", ccy:"USD",
    pt:100, tick:0.1, d:1, micro:{name:"MGC", pt:10}, options:"GLD",
    drivers:{ dxy:-1, tnx:-0.8, vx:+0.4 },
    topics:["gold","real rates","safe haven","central bank"],
    note:"The one here that often likes fear. Rising real yields are its enemy." },

  /* ---- FX --------------------------------------------------------------- */
  { key:"eurusd", name:"Euro / dollar", short:"EURUSD", sym:"EURUSD=X", kind:"fx", ccy:"USD",
    pt:125000, tick:0.00005, d:5, options:null,
    drivers:{ dxy:-1, tnx:-0.3 },
    topics:["ecb","euro","dollar","fed"],
    note:"The dollar's mirror. Rate differentials drive it more than growth." },

  { key:"usdjpy", name:"Dollar / yen", short:"USDJPY", sym:"JPY=X", kind:"fx", ccy:"JPY",
    pt:125000, tick:0.005, d:3, options:null,
    drivers:{ tnx:+1, vx:-0.6 },
    topics:["boj","yen","carry trade","intervention"],
    note:"Tracks the US-Japan yield gap. Falls hard when carry trades unwind." },

  /* ---- crypto ----------------------------------------------------------- */
  { key:"btc", name:"Bitcoin", short:"BTC", sym:"BTC-USD", kind:"crypto", ccy:"USD",
    pt:1, tick:1, d:0, options:"IBIT",
    drivers:{ dxy:-0.8, vx:-1, tnx:-0.5 },
    topics:["bitcoin","crypto","etf","regulation","halving"],
    note:"Trades as the high-beta end of risk appetite, and never closes." },

  { key:"eth", name:"Ethereum", short:"ETH", sym:"ETH-USD", kind:"crypto", ccy:"USD",
    pt:1, tick:0.5, d:2, options:"ETHA",
    drivers:{ dxy:-0.8, vx:-1, tnx:-0.5 },
    topics:["ethereum","crypto","etf","staking"],
    note:"Follows bitcoin, with more torque in both directions." },

  { key:"sol", name:"Solana", short:"SOL", sym:"SOL-USD", kind:"crypto", ccy:"USD",
    pt:1, tick:0.01, d:2, options:null,
    drivers:{ dxy:-0.6, vx:-1.2 },
    topics:["solana","crypto","altcoin"],
    note:"Higher beta again. Thin enough that single headlines move it." },

  /* ---- single stocks, for options ---------------------------------------- */
  { key:"nvda", name:"Nvidia", short:"NVDA", sym:"NVDA", kind:"stock", ccy:"USD",
    pt:100, tick:0.01, d:2, options:"NVDA",
    drivers:{ tnx:-0.6, vx:-1 },
    topics:["nvidia","ai","semiconductor","data center","export controls"],
    note:"The single largest idiosyncratic driver of the Nasdaq." },

  { key:"aapl", name:"Apple", short:"AAPL", sym:"AAPL", kind:"stock", ccy:"USD",
    pt:100, tick:0.01, d:2, options:"AAPL",
    drivers:{ tnx:-0.5, dxy:-0.4, vx:-0.9 },
    topics:["apple","iphone","china","services"],
    note:"Large overseas revenue, so the dollar and China both matter." },

  { key:"msft", name:"Microsoft", short:"MSFT", sym:"MSFT", kind:"stock", ccy:"USD",
    pt:100, tick:0.01, d:2, options:"MSFT",
    drivers:{ tnx:-0.6, vx:-0.9 },
    topics:["microsoft","azure","ai","cloud","openai"],
    note:"Cloud and AI capex are the lines that move it." },

  { key:"tsla", name:"Tesla", short:"TSLA", sym:"TSLA", kind:"stock", ccy:"USD",
    pt:100, tick:0.01, d:2, options:"TSLA",
    drivers:{ tnx:-0.8, vx:-1.3 },
    topics:["tesla","ev","robotaxi","musk","deliveries"],
    note:"The highest-beta megacap, and the most headline-driven." },
];

export const byKey = k => INSTRUMENTS.find(i => i.key === k);
export const DEFAULT_KEY = "nq";

/** Everything that needs a quote pulled: instruments plus context series. */
export function allSymbols() {
  const out = {};
  for (const i of INSTRUMENTS) out[i.key] = i.sym;
  for (const [k, v] of Object.entries(SERIES)) if (!out[k]) out[k] = v.sym;
  return out;
}
