import * as cheerio from "cheerio";
import type { ParsedCard, ParsedArt, ParsedOshiSkill, ParsedQA, ParsedKeyword } from "../types";

const BASE_URL = "https://en.hololive-official-cardgame.com";

/** Replace non-breaking spaces and other Unicode whitespace with regular spaces */
function sanitize(text: string): string {
  return text.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ").trim();
}

function getDlValue($: cheerio.CheerioAPI, container: string, label: string): ReturnType<cheerio.CheerioAPI> | null {
  let result: ReturnType<cheerio.CheerioAPI> | null = null;
  $(`${container} dl dt`).each((_, dt) => {
    if ($(dt).text().trim().toLowerCase() === label.toLowerCase()) {
      const dd = $(dt).next("dd");
      if (dd.length) {
        result = dd;
      }
    }
  });
  return result;
}

function getDlText($: cheerio.CheerioAPI, container: string, label: string): string | null {
  const dd = getDlValue($, container, label);
  return dd ? sanitize(dd.text()) || null : null;
}

/** Map an img src containing arts_ or type_ to a color enum */
function imgSrcToColor(src: string): string {
  if (src.includes("_white")) return "WHITE";
  if (src.includes("_green")) return "GREEN";
  if (src.includes("_red")) return "RED";
  if (src.includes("_blue")) return "BLUE";
  if (src.includes("_purple")) return "PURPLE";
  if (src.includes("_yellow")) return "YELLOW";
  // arts_null / type_null = colorless/neutral
  if (src.includes("_null")) return "COLORLESS";
  return "COLORLESS";
}

/** Map kanji color characters to color enums */
const KANJI_COLOR_MAP: Record<string, string> = {
  "白": "WHITE",
  "緑": "GREEN",
  "赤": "RED",
  "青": "BLUE",
  "紫": "PURPLE",
  "黄": "YELLOW",
};

/** Extract colors from an alt tag containing kanji (e.g. "青赤" → ["BLUE", "RED"]) */
function colorsFromAlt(alt: string): string[] {
  const colors: string[] = [];
  for (const char of alt) {
    const color = KANJI_COLOR_MAP[char];
    if (color && !colors.includes(color)) {
      colors.push(color);
    }
  }
  return colors;
}

function extractColors($: cheerio.CheerioAPI): string[] {
  const colors: string[] = [];
  $(".info img[src*='type_']").each((_, img) => {
    const el = $(img);
    const alt = el.attr("alt") || "";
    // Parse colors from alt tag kanji (handles both single "赤" and combined "青赤")
    const altColors = colorsFromAlt(alt);
    if (altColors.length > 0) {
      for (const color of altColors) {
        if (!colors.includes(color)) {
          colors.push(color);
        }
      }
    } else {
      // Fallback to src-based parsing for arts images or missing alt tags
      const src = el.attr("src") || "";
      const mapped = imgSrcToColor(src);
      const color = mapped === "COLORLESS" ? "NEUTRAL" : mapped;
      if (!colors.includes(color)) {
        colors.push(color);
      }
    }
  });
  return colors.length > 0 ? colors : ["NEUTRAL"];
}

function extractTags($: cheerio.CheerioAPI): string[] {
  const tags: string[] = [];
  $(".info a[href*='cardsearch?keyword=%23']").each((_, el) => {
    const text = sanitize($(el).text());
    if (text) {
      tags.push(text.startsWith("#") ? text : `#${text}`);
    }
  });
  return [...new Set(tags)];
}

function extractArts($: cheerio.CheerioAPI): ParsedArt[] {
  const arts: ParsedArt[] = [];

  // Arts are in divs with class containing "arts" (e.g., "sp arts", "arts")
  // but NOT "sp skill" or "oshi skill"
  $(".cardlist-Detail div[class*='arts']").each((_, el) => {
    const div = $(el);
    // Skip if it's a skill div
    if (div.attr("class")?.includes("skill")) return;

    const paragraphs = div.find("p");
    if (paragraphs.length < 2) return;

    // First p is "Arts" label, second p contains the arts data
    const artsP = paragraphs.eq(1);
    const span = artsP.find("> span").first();

    // Extract art name and damage from the span
    // Format: [cost icons] ArtName [space] Damage[+bonus]
    const spanText = sanitize(span.text());

    // The art name is the text content after cost icons, damage is at the end
    // Pattern: "Everyone Together　70+紫+50" or "Alo~na!　30" or "Peacock Dance　100+"
    const artMatch = spanText.match(/(.+?)\s*[　\s]+(\d+\+?)(?:[白緑赤青紫黄].*)?$/);
    let name = "";
    let damage: string | null = null;

    if (artMatch) {
      name = artMatch[1].replace(/^[◇白緑赤青紫黄]+/, "").trim();
      damage = artMatch[2];
    } else {
      // No damage number - might be a special art
      name = spanText.replace(/^[◇白緑赤青紫黄]+/, "").trim();
    }

    // Extract cost from img src attributes within the span — map to color names
    // Collect ALL icons (no dedup) to preserve costs like [RED, COLORLESS, COLORLESS]
    const costParts: string[] = [];
    span.find("img[src*='arts_']").each((_, img) => {
      const src = $(img).attr("src") || "";
      // Skip tokkou (bonus damage) images
      if (src.includes("tokkou")) return;
      costParts.push(imgSrcToColor(src));
    });

    // Extract bonus damage from tokkou images (e.g. tokkou_50_white.png, alt="白+50" or "青赤+50")
    const damageBonuses: { amount: string; colors: string[] }[] = [];
    span.find("img[src*='tokkou']").each((_, img) => {
      const alt = $(img).attr("alt") || "";
      // Alt format: "白+50" or "青赤+50" — kanji color(s) followed by +amount
      const bonusMatch = alt.match(/([白緑赤青紫黄]+)\+(\d+\+?)/);
      if (bonusMatch) {
        const bonusColors = colorsFromAlt(bonusMatch[1]);
        if (bonusColors.length > 0) {
          damageBonuses.push({ amount: `+${bonusMatch[2]}`, colors: bonusColors });
        }
      }
    });

    // Effect text is the text content of the p after the span
    const fullText = sanitize(artsP.text());
    const spanEnd = fullText.indexOf(spanText) + spanText.length;
    const effectText = fullText.substring(spanEnd).trim() || null;

    if (name) {
      arts.push({
        name,
        damage,
        cost: costParts.length > 0 ? costParts : null,
        effectText,
        damageBonuses,
      });
    }
  });

  return arts;
}

/** Map a texticon img src/alt to a keyword type enum. */
function keywordTypeFromImg(src: string, alt: string): string | null {
  // Primary match: texticon filenames (e.g., collabEF.png, bloomEF.png, gift.png)
  if (src.includes("collabEF")) return "COLLAB";
  if (src.includes("bloomEF")) return "BLOOM";
  if (/\/gift\./i.test(src)) return "GIFT";

  // Fallback: derive from alt tag ("Collab Effect", "Bloom Effect", "Gift")
  const altUpper = alt.toUpperCase();
  if (altUpper.includes("COLLAB")) return "COLLAB";
  if (altUpper.includes("BLOOM")) return "BLOOM";
  if (altUpper.includes("GIFT")) return "GIFT";

  // Unknown keyword type — capture first word of alt so new types still round-trip
  if (alt.trim()) {
    return alt.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9_]/g, "");
  }
  return null;
}

/**
 * Extract structured keywords (Gift, Collab Effect, Bloom Effect, ...).
 * Each keyword lives in its own div.keyword inside .cardlist-Detail.
 * The second <p> contains an <img> identifying the type followed by
 * "Title\u3000 Description" text. Title and description are separated by a
 * full-width space (U+3000) in the raw HTML.
 */
function extractKeywords($: cheerio.CheerioAPI): ParsedKeyword[] {
  const keywords: ParsedKeyword[] = [];

  $(".cardlist-Detail div.keyword").each((_, el) => {
    const div = $(el);
    const paragraphs = div.find("p");
    if (paragraphs.length < 2) return;

    const dataP = paragraphs.eq(1);
    const img = dataP.find("img").first();
    const src = img.attr("src") || "";
    const alt = img.attr("alt") || "";
    const type = keywordTypeFromImg(src, alt);
    if (!type) return;

    // We must split on the raw U+3000 before sanitize() collapses it.
    // Walk text nodes following the img and split on the first U+3000.
    let titleRaw = "";
    let descriptionRaw = "";
    let sawImg = false;
    let inDescription = false;

    dataP.contents().each((__, node) => {
      if (node.type === "tag" && (node as { name?: string }).name === "img") {
        sawImg = true;
        return;
      }
      if (!sawImg) return;

      const text =
        node.type === "text"
          ? (node as unknown as { data: string }).data
          : $(node as unknown as cheerio.BasicAcceptedElems<never>).text();
      if (!text) return;

      if (inDescription) {
        descriptionRaw += text;
      } else {
        const idx = text.indexOf("\u3000");
        if (idx >= 0) {
          titleRaw += text.substring(0, idx);
          descriptionRaw += text.substring(idx + 1);
          inDescription = true;
        } else {
          titleRaw += text;
        }
      }
    });

    const title = sanitize(titleRaw);
    const description = sanitize(descriptionRaw);
    if (!title) return;

    keywords.push({ type, title, description });
  });

  return keywords;
}

function extractOshiSkills($: cheerio.CheerioAPI): ParsedOshiSkill[] {
  const skills: ParsedOshiSkill[] = [];

  // Oshi Skill: div.oshi.skill
  $(".cardlist-Detail div.oshi.skill").each((_, el) => {
    const paragraphs = $(el).find("p");
    if (paragraphs.length < 2) return;
    const text = sanitize(paragraphs.eq(1).text());
    const parsed = parseSkillText(text, "oshi");
    if (parsed) skills.push(parsed);
  });

  // SP Oshi Skill: div.sp.skill
  $(".cardlist-Detail div.sp.skill").each((_, el) => {
    // Make sure this is an SP skill div, not an SP arts div
    const cls = $(el).attr("class") || "";
    if (cls.includes("arts")) return;

    const paragraphs = $(el).find("p");
    if (paragraphs.length < 2) return;
    const text = sanitize(paragraphs.eq(1).text());
    const parsed = parseSkillText(text, "sp_oshi");
    if (parsed) skills.push(parsed);
  });

  return skills;
}

function extractQA($: cheerio.CheerioAPI): ParsedQA[] {
  const qna: ParsedQA[] = [];
  $(".cardlist-Detail_QA .qa-List_Item").each((_, el) => {
    const qText = $(el).find(".qa-List_Txt-Q").first();
    const aText = $(el).find(".qa-List_Txt-A").first();
    if (qText.length && aText.length) {
      // Remove the leading "Q"/"A" span text and sanitize
      const question = sanitize(qText.text().replace(/^Q/, "").trim());
      const answer = sanitize(aText.text().replace(/^A/, "").trim());
      if (question && answer) {
        qna.push({ question, answer });
      }
    }
  });
  return qna;
}

function parseSkillText(text: string, skillType: string): ParsedOshiSkill | null {
  if (!text) return null;

  // Format: [holo Power：-N]SkillName[1/Turn]Effect text
  const costMatch = text.match(/\[holo\s*Power[：:]\s*(-?\d+)\]/i);
  const usageMatch = text.match(/\[(\d+\/(?:Turn|Game))\]/i);

  let name = "";
  let effectText = text;

  if (costMatch && usageMatch) {
    const afterCost = text.indexOf(costMatch[0]) + costMatch[0].length;
    const beforeUsage = text.indexOf(usageMatch[0]);
    name = text.substring(afterCost, beforeUsage).trim();
    effectText = text.substring(beforeUsage + usageMatch[0].length).trim();
  } else if (costMatch) {
    const afterCost = text.indexOf(costMatch[0]) + costMatch[0].length;
    const remaining = text.substring(afterCost).trim();
    name = remaining;
    effectText = remaining;
  } else {
    name = text.substring(0, 50);
    effectText = text;
  }

  return {
    skillType,
    name: name || "Unknown",
    cost: costMatch ? costMatch[1] : null,
    usageLimit: usageMatch ? usageMatch[1] : null,
    effectText,
  };
}

export function parseCardDetail(
  html: string,
  listItem: { id: number; name: string; imageUrl: string }
): ParsedCard {
  const $ = cheerio.load(html);
  const detail = $(".cardlist-Detail");

  // Card name
  const name = sanitize(detail.find("h1.name").first().text()) || listItem.name;

  // Card number
  const cardNumber = detail.find("p.number span").first().text().trim() || "";

  // Card type from info dl
  const rawType = getDlText($, ".info", "Card Type") || "";
  let cardType = "holomem";
  const typeLower = rawType.toLowerCase();
  if (typeLower.includes("oshi")) {
    cardType = "oshi";
  } else if (typeLower.includes("support")) {
    cardType = "support";
  } else if (typeLower.includes("cheer")) {
    cardType = "cheer";
  }

  // Buzz holomem detection
  const isBuzz = typeLower.includes("buzz");
  if (isBuzz && cardType !== "holomem") {
    cardType = "holomem";
  }

  // Support subtype and LIMITED modifier
  // Raw type examples: "Support・Item・LIMITED", "Support・Fan", "Support・Event・LIMITED"
  let supportType: string | null = null;
  let isLimited = false;
  if (cardType === "support") {
    const parts = rawType.split("・").map((p) => p.trim());
    // parts[0] = "Support", parts[1] = subtype, parts[2] = "LIMITED" (optional)
    if (parts.length >= 2) {
      supportType = parts[1]; // Item, Staff, Mascot, Fan, Event
    }
    isLimited = parts.some((p) => p.toUpperCase() === "LIMITED");
  }

  // Colors
  const colors = extractColors($);

  // Rarity
  const rarity = getDlText($, ".info", "Rarity") || "";

  // Set names — source may list multiple sets separated by newlines
  const rawSetName = getDlText($, ".info", "Card Set");
  const setNames: string[] = rawSetName
    ? rawSetName.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  // Illustrator
  const illustrator = sanitize(detail.find("p.ill-name span").first().text()) || null;

  // Image URL
  let imageUrl = listItem.imageUrl;
  if (!imageUrl) {
    const mainImg = detail.find(".img img").first();
    const src = mainImg.attr("src") || "";
    imageUrl = src.startsWith("http") ? src : src ? `${BASE_URL}${src}` : "";
  }

  // HP (holomem)
  const hpText = getDlText($, ".info", "HP");
  const hp = hpText ? parseInt(hpText, 10) : null;

  // Life (oshi)
  const lifeText = getDlText($, ".info", "LIFE") || getDlText($, ".info", "Life");
  const life = lifeText ? parseInt(lifeText, 10) : null;

  // Bloom level
  const bloomLevel = getDlText($, ".info", "Bloom Level");

  // Baton pass - extract from img src, map to color names array
  const batonPassDd = getDlValue($, ".info", "Baton Pass");
  let batonPass: string[] | null = null;
  if (batonPassDd) {
    const colors: string[] = [];
    batonPassDd.find("img[src*='arts_']").each((_, img) => {
      const src = $(img).attr("src") || "";
      colors.push(imgSrcToColor(src));
    });
    batonPass = colors.length > 0 ? colors : null;
  }

  // Extra text (e.g., "You may include any number of this holomem in the deck")
  // Lives in <div class="extra"><p>Extra</p><p>text</p></div>
  let extraText: string | null = null;
  const extraDiv = detail.find("div.extra");
  if (extraDiv.length) {
    const paragraphs = extraDiv.find("p");
    if (paragraphs.length >= 2) {
      extraText = sanitize(paragraphs.eq(1).text()) || null;
    }
  }
  // Fallback: try dl/dt/dd
  if (!extraText) {
    extraText = getDlText($, ".info", "Extra") || getDlText($, ".cardlist-Detail", "Extra") || null;
  }

  // Special text (ability text, deck rules)
  let specialText: string | null = null;
  if (cardType === "support") {
    const abilityText = getDlText($, ".info", "Ability Text");
    if (abilityText) {
      specialText = abilityText;
    }
  }

  // Ability text for holomem might be in "Ability Text" dt
  const abilityText = getDlText($, ".info", "Ability Text");

  // Release date from products section
  const releaseDate = getDlText($, ".cardlist-Detail_Products", "Release Date");

  // Tags
  const tags = extractTags($);

  // Arts (holomem)
  const arts = extractArts($);

  // Keywords (Gift, Collab Effect, Bloom Effect, ...) — stored as structured data
  const keywords = extractKeywords($);

  // If holomem has ability text but no arts captured it
  if (abilityText && cardType === "holomem" && arts.length === 0) {
    specialText = abilityText;
  }

  // Oshi skills
  const oshiSkills = cardType === "oshi" ? extractOshiSkills($) : [];

  // Q&A
  const qna = extractQA($);

  return {
    id: listItem.id,
    cardNumber,
    name,
    cardType,
    colors,
    rarity,
    setNames,
    releaseDate,
    illustrator,
    imageUrl,
    cardUrl: `${BASE_URL}/cardlist/?id=${listItem.id}`,
    hp: hp && !isNaN(hp) ? hp : null,
    bloomLevel,
    batonPass,
    life: life && !isNaN(life) ? life : null,
    isBuzz,
    supportType,
    isLimited,
    specialText,
    extraText,
    arts,
    oshiSkills,
    tags,
    qna,
    keywords,
  };
}
