/**
 * Scheduled feed builder. Pulls the free RSS and quote endpoints and writes
 * feed.json next to the OS in the site bucket. The browser then picks it up
 * on its own — no paste, no key, no server to keep alive.
 *
 * Env: SITE_BUCKET, FEED_KEY (default "feed.json")
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { snapshot } from "./core.mjs";

const s3 = new S3Client({});
const KEY = process.env.FEED_KEY || "feed.json";

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

  const msg = snap.headlines.length + " headlines, " + Object.keys(snap.quotes).length +
    " quotes in " + ((Date.now() - started) / 1000).toFixed(1) + "s";
  console.log(msg);
  return { statusCode: 200, body: msg };
};
