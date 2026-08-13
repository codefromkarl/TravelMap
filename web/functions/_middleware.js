/** Block sensitive and debugging artifacts before Pages static asset fallback. */

const BLOCKED_PATH = /(?:^|\/)(?:\.dev\.vars(?:\.|$)|\.env(?:\.|$)|config\.local\.js$|[^/]+\.map$)/i;

export async function onRequest(context) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(context.request.url).pathname);
  } catch {
    return new Response("Bad request", {
      status: 400,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }

  if (BLOCKED_PATH.test(pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return context.next();
}
