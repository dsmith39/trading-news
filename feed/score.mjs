/**
 * The headline scorer, shared by the page and the scheduled feed.
 *
 * The block between the markers is byte-identical to the copy inside
 * os/index.html, and CI fails if they drift. Two copies exist because the page
 * is a single file with no build step and no imports, while the feed needs the
 * same scores server-side in order to record them against what prices did next.
 */
import { INSTRUMENTS } from "./instruments.mjs";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---8<--- shared scorer: keep byte-identical to feed/score.mjs ---8<--- */
const LEX_EQ=[
  [/record (high|quarter|revenue|backlog)/i,55],[/beats? (on|estimates|expectations)/i,55],
  [/tops? (estimates|expectations|views)/i,52],[/raises? (guidance|outlook|forecast|target)/i,62],
  [/upgrade[sd]?( to buy| to overweight)?/i,42],[/surge[sd]?|soar[sd]?|rallies|rally|jumps?/i,45],
  [/buyback|repurchase|dividend (hike|increase)/i,38],[/strong demand|demand (is )?(strong|robust)/i,44],
  [/approval|approved|cleared/i,26],[/partnership|landmark deal|wins? (contract|order)/i,34],
  [/ai (capex|spending) (up|rises|accelerat)/i,46],[/settles?( lawsuit)?|dismissed/i,24],
  [/(miss|missed) (on|estimates|expectations)/i,-55],[/cuts? (guidance|outlook|forecast)/i,-64],
  [/downgrade[sd]?/i,-42],[/plunge[sd]?|slump[sd]?|tumble[sd]?|sinks?|craters?/i,-48],
  [/layoffs?|job cuts|restructuring charge/i,-30],[/probe|investigation|antitrust|subpoena/i,-38],
  [/recall|halt(s|ed)? (production|shipments)/i,-40],[/short seller|accounting (issue|irregular)/i,-52],
  [/export (ban|curb|restriction)|blacklist|entity list/i,-50],[/outage|breach|hack(ed)?|ransomware/i,-34],
  [/chip (curb|ban|restriction)/i,-52],[/guidance (below|light|soft)/i,-50],
  [/tariff/i,-36],[/escalat(es|ion)|strikes?|invasion|conflict widens/i,-40],
  [/bankrupt|default|insolven/i,-60],[/capitulat|liquidation|margin call/i,-45]
];
const LEX_MACRO=[
  [/inflation (cool|ease|slow|fall|decelerat)/i,58],[/(cooler|softer|below) (than )?(expected|forecast|consensus)/i,52],
  [/rate cut|cuts? rates?|easing cycle|dovish/i,64],[/qt (ends|slows)|balance sheet (runoff ends)/i,44],
  [/disinflation|price pressures ease/i,50],[/soft landing/i,40],[/liquidity injection|stimulus/i,44],
  [/inflation (hot|accelerat|rise|jump|firm)/i,-58],[/(hotter|firmer|above) (than )?(expected|forecast|consensus)/i,-52],
  [/rate hike|hikes? rates?|hawkish|higher for longer/i,-64],[/yields? (surge|spike|jump|climb)/i,-46],
  [/dollar (surge|spike|strength)/i,-32],[/recession|contraction|hard landing/i,-44],
  [/credit (stress|event|spread widen)/i,-50],[/debt ceiling|shutdown|downgrade of us/i,-34],
  [/auction (tails?|weak|poor)/i,-30],[/jobs? (report )?(blowout|strong|beats)/i,-26],
  [/unemployment (rises|jumps)/i,22],[/claims (surge|jump|rise)/i,20]
];
const MEGACAP=[["NVDA",/\bnvidia\b|\bnvda\b/i,.26],["AAPL",/\bapple\b|\baapl\b/i,.14],
  ["MSFT",/\bmicrosoft\b|\bmsft\b/i,.16],["AMZN",/\bamazon\b|\bamzn\b/i,.12],
  ["AVGO",/\bbroadcom\b|\bavgo\b/i,.12],["META",/\bmeta\b|\bfacebook\b/i,.10],
  ["GOOGL",/\balphabet\b|\bgoogle\b/i,.11],["TSLA",/\btesla\b|\btsla\b/i,.09],
  ["AMD",/\bamd\b/i,.05],["NFLX",/\bnetflix\b/i,.04]];
const HIGH_IMPACT=/fomc|fed |powell|cpi|pce|payroll|nfp|rate decision|nvidia earnings|jobs report|inflation report/i;
const MED_IMPACT=/ppi|retail sales|ism|claims|guidance|earnings|yield|tariff|opec|treasury|downgrade|upgrade/i;

function scoreHeadline(text,regime){
  const s=String(text||""); let eq=0,mac=0,hits=[];
  for(const [re,w] of LEX_EQ)   if(re.test(s)){eq+=w; hits.push([re.source.slice(0,28),w]);}
  for(const [re,w] of LEX_MACRO)if(re.test(s)){mac+=w; hits.push([re.source.slice(0,28),w]);}
  const negated=/\bnot\b|\bdenies\b|\bdespite\b|\bfails to\b/i.test(s);
  if(negated){eq*=-.55;mac*=-.55;}
  if(regime==="inverse") mac=-mac;                      /* good news is bad news */
  let entity=null,beta=1;
  for(const [t,re,w] of MEGACAP) if(re.test(s)){entity=t;beta=1+w*2.2;break;}
  const raw=(eq*beta*.62)+(mac*.72);
  const impact=HIGH_IMPACT.test(s)?3:MED_IMPACT.test(s)?2:1;
  return {score:Math.round(clamp(raw,-100,100)),impact,entity,
          channel:Math.abs(mac)>Math.abs(eq)?"macro":"equity",hits:hits.slice(0,4)};
}

/* Topic words match whole words, not substrings. "ai" inside "chairman" tagged
   a large share of the wire as Nvidia and Microsoft news, and "dow" inside
   "down" did the same to the Dow; both were invisible while topics only
   filtered a list on screen, and both started corrupting the record the moment
   the feed began writing scores down. The optional plural keeps "earnings" and
   "deliveries" reading as before. */
const TOPIC_RE=new Map();
function topicHit(text,topics){
  if(!topics||!topics.length) return false;
  const s=String(text||"");
  for(const t of topics){
    let re=TOPIC_RE.get(t);
    if(!re){re=new RegExp("\\b"+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"s?\\b","i");TOPIC_RE.set(t,re);}
    if(re.test(s)) return true;
  }
  return false;
}
/* ---8<--- end shared scorer ---8<--- */

export { scoreHeadline, LEX_EQ, LEX_MACRO, MEGACAP, HIGH_IMPACT, MED_IMPACT };

/**
 * Does this story plausibly reach this market? A mirror of the page's
 * touches(), which matches on the same fields under different names (the page
 * builds a view where `key` is `k`). Kept small deliberately: it is the one
 * piece of the page's news factor that has to run server-side, because a score
 * with no market attached cannot be measured against a price.
 */
export function touches(h, I) {
  if (topicHit(h.txt, I.topics)) return true;
  if (h.entity && I.kind === "stock") return h.entity.toLowerCase() === I.key;
  /* A megacap story reaches the indices that hold the megacaps - not crude,
     gold or the Nikkei, which were swept in while this only filtered a list. */
  if (h.entity && I.giants) return true;
  return false;
}

/** The same dedupe key headlines() uses, so a story is logged once, not once a pull. */
export const keyOf = txt => String(txt || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);

/** Score a pull's headlines and tag each with the markets it reaches. */
export function scoreAll(rows, regime) {
  return rows.map(h => {
    const s = scoreHeadline(h.txt, regime);
    const tagged = { ...h, entity: s.entity };
    return {
      k: keyOf(h.txt), txt: h.txt, src: h.src, ts: h.ts,
      score: s.score, impact: s.impact, channel: s.channel, entity: s.entity,
      mk: INSTRUMENTS.filter(i => touches(tagged, i)).map(i => i.key)
    };
  });
}
