/**
 * Rnote Provider Adapter — 小红书专精
 */

import { fetchWithTimeout } from "../../http-client.js";
import type { UGCReview } from "../../multi-source-service.js";
import type { ProviderContext } from "../types.js";
import { extractTips } from "../utils.js";

interface RnoteNote {
  note_id?: string;
  title?: string;
  desc?: string;
  liked_count?: number;
  user?: { nickname?: string };
}

interface RnoteResponse {
  code?: number;
  msg?: string;
  data?: { items?: RnoteNote[] };
}

export async function fetchRnote(
  keyword: string,
  ctx: ProviderContext,
  page = 1,
): Promise<UGCReview[]> {
  const url = new URL("/api/v1/xhs/search_notes", ctx.baseUrl);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "popularity_descending");

  const res = await fetchWithTimeout(url.toString(), {
    timeout: 15_000,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
  });

  if (!res.ok) throw new Error(`Rnote error: ${res.status}`);

  const body = (await res.json()) as RnoteResponse;
  if (body.code !== 0 && body.code !== 200) {
    throw new Error(`Rnote code: ${body.code}, msg: ${body.msg}`);
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
      likes: note.liked_count,
    },
  }));
}
