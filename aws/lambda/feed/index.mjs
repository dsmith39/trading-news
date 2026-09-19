/**
 * Scheduled feed builder. Pulls the free RSS and quote endpoints and writes
 * feed.json next to the OS in the site bucket. The browser then picks it up
 * on its own — no paste, no key, no server to keep alive.
 *
 * It also appends to history.json: the price of every instrument at this
 * moment, and any headline not seen before with the score the lexicon gave it.
 * That file is what makes the bias score measurable rather than merely
 * plausible — see feed/history.mjs for why the returns are not stored.
 *
 * Env: SITE_BUCKET, FEED_KEY (default "feed.json"), HISTORY_KEY (default
 * "history.json"), HISTORY off when set to "0"
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { snapshot } from "./core.mjs";
import { scoreAll } from "./score.mjs";
import { appendPull, EMPTY } from "./history.mjs";

const s3 = new S3Client({});
const KEY = process.env.FEED_KEY || "feed.json";
const HIST_KEY = process.env.HISTORY_KEY || "history.json";

/**
 * Read, append, write. Deliberately wrapped so that nothing here can fail the
 * run: feed.json is the product and is already written by the time this is
 * called, while this file is instrumentation.
 *
 * The read refuses to guess. S3 answers a request for a missing object with
 * AccessDenied rather than NoSuchKey when the caller cannot list the bucket,
 * and this role deliberately cannot — so "the object is not there" and "I am no
 * longer allowed to read it" arrive as the same error. Treating that as the
 * first run would quietly throw the record away on every pull, which is why
 * deploy.sh creates the file and anything but NoSuchKey stops here instead.
 */
async function recordHistory(snap) {
  let prev;
  try {
    const got = await s3.send(new GetObjectCommand({ Bucket: process.env.SITE_BUCKET, Key: HIST_KEY }));
    prev = JSON.parse(await got.Body.transformToString());
  } catch (e) {
    if (e.name !== "NoSuchKey") {
      throw new Error("cannot read " + HIST_KEY + " (" + e.name + ": " + e.message +
        ") — refusing to start a new history over the old one");
    }
    prev = EMPTY;
    console.log("no history yet — starting one");
  }
  const hist = appendPull(prev, snap, scoreAll(snap.headlines));
  await s3.send(new PutObjectCommand({
    Bucket: process.env.SITE_BUCKET,
    Key: HIST_KEY,
    Body: JSON.stringify(hist),
    ContentType: "application/json",
    /* Nothing reads this in a hurry, and it is large. */
    CacheControl: "public, max-age=600, must-revalidate"
  }));
  return hist.px.length + " pulls, " + hist.hl.length + " headlines on record";
}

export const handler = async () => {
  const started = Date.now();
  const snap = await snapshot();

  /* A pull where every feed failed would blank the wire — keep the last good
     snapshot instead of publishing an empty one. */
  if (!snap.headlines.length && !Object.keys(snap.quotes).length) {
    console.error("nothing fetched — leaving the previous snapshot in place");
    return { statusCode: 503, body: "empty pull" };
  }

  await s3.send(new PutObjectCommand({
    Bucket: process.env.SITE_BUCKET,
    Key: KEY,
    Body: JSON.stringify(snap),
    ContentType: "application/json",
    CacheControl: "public, max-age=60, must-revalidate"
  }));

  if (process.env.HISTORY !== "0") {
    try { console.log(await recordHistory(snap)); }
    catch (e) { console.error("history not updated — " + e.name + ": " + e.message); }
  }

  const msg = snap.headlines.length + " headlines, " + Object.keys(snap.quotes).length +
    " quotes in " + ((Date.now() - started) / 1000).toFixed(1) + "s";
  console.log(msg);
  return { statusCode: 200, body: msg };
};
