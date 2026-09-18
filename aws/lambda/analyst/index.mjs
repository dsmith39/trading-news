/**
 * Optional analyst endpoint. Forwards one prompt to the Claude API and returns
 * the text. Deployed only when you pass an API key at deploy time; without it
 * the stack has no LLM cost at all and the Analyst app simply stays dark.
 *
 * Env: ANTHROPIC_API_KEY, MODEL, MAX_TOKENS, SHARED_TOKEN
 */
const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.MODEL || "claude-haiku-4-5";
const MAX_TOKENS = Math.min(+(process.env.MAX_TOKENS || 900), 4000);
const MAX_PROMPT = 24000;

const reply = (code, obj) => ({
  statusCode: code,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj)
});

export const handler = async (event) => {
  if ((event.requestContext?.http?.method || "POST") === "OPTIONS") return reply(204, {});
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return reply(400, { error: "bad_json" }); }

  if (process.env.SHARED_TOKEN && body.token !== process.env.SHARED_TOKEN)
    return reply(403, { error: "forbidden" });

  const prompt = String(body.prompt || "").slice(0, MAX_PROMPT);
  if (prompt.length < 10) return reply(400, { error: "empty_prompt" });

  const r = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!r.ok) {
    const detail = await r.text();
    console.error("claude api " + r.status + ": " + detail.slice(0, 400));
    return reply(r.status === 429 ? 429 : 502, { error: r.status === 429 ? "rate_limited" : "upstream" });
  }
  const j = await r.json();
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  return reply(200, { text, model: j.model, usage: j.usage });
};
