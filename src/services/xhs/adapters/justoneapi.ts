/**
 * JustOneAPI Provider Adapter — 多平台聚合
 */

import { fetchWithTimeout } from "../../http-client.js";
import type { UGCReview } from "../../multi-source-service.js";
import type { ProviderContext } from "../types.js";
import { extractTips } from "../utils.js";

interface JustOneApiNote {
  note_id?: string;
  title?: string;
  desc?: string;
  liked_count?: string | number;
  user?: { nickname?: string };
}

interface JustOneApiResponse {
  code?: number;
  msg?: string;
  data?: { items?: JustOneApiNote[] };
}

export async function fetchJustOneApi(
  keyword: string,
  ctx: ProviderContext,
  page = 1,
): Promise<UGCReview[]> {
  const url = new URL("/api/xiaohongshu/search-note/v3", ctx.baseUrl);
  url.searchParams.set("token", ctx.token);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "popularity_descending");

  const res = await fetchWithTimeout(url.toString(), {
    timeout: 15_000,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`JustOneAPI error: ${res.status}`);

  const body = (await res.json()) as JustOneApiResponse;
  if (body.code !== 0 && body.code !== 200) {
    throw new Error(`JustOneAPI code: ${body.code}, msg: ${body.msg}`);
  }

  const items = body.data?.items ?? [];
  return items.map((note) => ({
    source: "xiaohongshu",
    summary: [note.title, note.desc].filter(Boolean).join(" — ") || "小红书用户分享",
    rating: undefined,
    tips: extractTips(note.desc ?? note.title ?? ""),
    meta: {
      noteId: note.note_id,
      author: note.user?.nickname,
      likes:
        typeof note.liked_count === "string"
          ? Number.parseInt(note.liked_count, 10)
          : note.liked_count,
    },
  }));
}
