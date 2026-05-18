/**
 * TikHub Provider Adapter — 多平台，签到送额度
 */

import { fetchWithTimeout } from "../../http-client.js";
import type { UGCReview } from "../../multi-source-service.js";
import type { ProviderContext } from "../types.js";
import { extractTips } from "../utils.js";

interface TikHubNote {
  note_id?: string;
  display_title?: string;
  note_card?: {
    desc?: string;
    interact_info?: { liked_count?: string };
    user?: { nickname?: string };
  };
}

interface TikHubResponse {
  code?: number;
  msg?: string;
  data?: { data?: TikHubNote[] };
}

export async function fetchTikHub(
  keyword: string,
  ctx: ProviderContext,
  page = 1,
): Promise<UGCReview[]> {
  const url = new URL("/api/v1/xiaohongshu/web/search_notes", ctx.baseUrl);
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

  if (!res.ok) throw new Error(`TikHub error: ${res.status}`);

  const body = (await res.json()) as TikHubResponse;
  if (body.code !== 200 && body.code !== 0) {
    throw new Error(`TikHub code: ${body.code}, msg: ${body.msg}`);
  }

  const items = body.data?.data ?? [];
  return items.map((note) => ({
    source: "xiaohongshu",
    summary: note.display_title ?? note.note_card?.desc ?? "小红书用户分享",
    rating: undefined,
    tips: extractTips(note.note_card?.desc ?? ""),
    meta: {
      noteId: note.note_id,
      author: note.note_card?.user?.nickname,
      likes: note.note_card?.interact_info?.liked_count
        ? Number.parseInt(note.note_card.interact_info.liked_count, 10)
        : undefined,
    },
  }));
}
