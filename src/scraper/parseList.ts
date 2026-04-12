import * as cheerio from "cheerio";
import type { CardListItem } from "../types";

const BASE_URL = "https://en.hololive-official-cardgame.com";

export function parseCardList(html: string): CardListItem[] {
  const $ = cheerio.load(html);
  const cards: CardListItem[] = [];

  $("a[href*='/cardlist/?id=']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const idMatch = href.match(/id=(\d+)/);
    if (!idMatch) return;

    const img = $(el).find("img");
    const name = img.attr("alt") || img.attr("title") || "";
    let imageUrl = img.attr("src") || "";
    if (imageUrl && !imageUrl.startsWith("http")) {
      imageUrl = `${BASE_URL}${imageUrl}`;
    }

    cards.push({
      id: parseInt(idMatch[1], 10),
      name,
      imageUrl,
    });
  });

  return cards;
}
