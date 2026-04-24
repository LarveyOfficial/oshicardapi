const TCG_HEADERS = { "User-Agent": "oshicardapi/1.0" };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const LAST_UPDATED_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface TCGPrice {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type BoosterResult = { name: string; groupId: number };
type ProductResult = {
  name: string;
  productId: number;
  extendedData?: Array<{ name: string; displayName: string; value: string }>;
};

let lastUpdatedCache: CacheEntry<string> | null = null;
let boostersCache: CacheEntry<BoosterResult[]> | null = null;
const productsCache = new Map<number, CacheEntry<ProductResult[]>>();
const pricesCache = new Map<number, CacheEntry<TCGPrice[]>>();

function isExpired<T>(entry: CacheEntry<T>): boolean {
  return Date.now() > entry.expiresAt;
}

function makeEntry<T>(value: T): CacheEntry<T> {
  return { value, expiresAt: Date.now() + CACHE_TTL_MS };
}

export async function fetchLastUpdated(bypassCache = false): Promise<string> {
  if (!bypassCache && lastUpdatedCache && !isExpired(lastUpdatedCache)) return lastUpdatedCache.value;
  const res = await fetch("https://tcgcsv.com/last-updated.txt", { headers: TCG_HEADERS });
  const value = (await res.text()).trim();
  lastUpdatedCache = { value, expiresAt: Date.now() + LAST_UPDATED_TTL_MS };
  return value;
}

async function fetchTCGBoosters(): Promise<BoosterResult[]> {
  if (boostersCache && !isExpired(boostersCache)) return boostersCache.value;
  const res = await fetch("https://tcgcsv.com/tcgplayer/87/groups", { headers: TCG_HEADERS });
  const data: { results: BoosterResult[] } = await res.json();
  boostersCache = makeEntry(data.results);
  return data.results;
}

async function fetchTCGProducts(boosterId: number): Promise<ProductResult[]> {
  const cached = productsCache.get(boosterId);
  if (cached && !isExpired(cached)) return cached.value;
  const res = await fetch(`https://tcgcsv.com/tcgplayer/87/${boosterId}/products`, {
    headers: TCG_HEADERS,
  });
  const data: { results: ProductResult[] } = await res.json();
  productsCache.set(boosterId, makeEntry(data.results));
  return data.results;
}

async function fetchTCGPrices(boosterId: number): Promise<TCGPrice[]> {
  const cached = pricesCache.get(boosterId);
  if (cached && !isExpired(cached)) return cached.value;
  const res = await fetch(`https://tcgcsv.com/tcgplayer/87/${boosterId}/prices`, {
    headers: TCG_HEADERS,
  });
  const data: { results: TCGPrice[] } = await res.json();
  pricesCache.set(boosterId, makeEntry(data.results));
  return data.results;
}

export async function getCardPrice(
  cardNumber: string,
  rarity: string,
  setNames: string[]
): Promise<TCGPrice | null> {
  const boosters = await fetchTCGBoosters();

  const setIds: number[] = [];
  for (const set of setNames) {
    const splitName = set.split(" – ");
    const rawSetName = (splitName.length > 1 ? splitName[1] : splitName[0]).trim();
    const setName = rawSetName === "PROMO CARDS" ? "hololive OFFICIAL CARD GAME Promos" : rawSetName;
    const boosterId = boosters.find((booster) => booster.name.includes(setName))?.groupId;
    if (boosterId) setIds.push(boosterId);
  }

  let productId: number | undefined;
  let foundSetId: number | undefined;

  for (const setId of setIds) {
    const products = await fetchTCGProducts(setId);
    const cardProductId = products.find(
      (product) =>
        product.extendedData?.some((data) => data.name === "Number" && data.value === cardNumber) &&
        product.name.includes(`(${rarity})`)
    )?.productId;

    if (cardProductId) {
      productId = cardProductId;
      foundSetId = setId;
      break;
    }
  }

  if (!productId || !foundSetId) return null;

  const prices = await fetchTCGPrices(foundSetId);
  const price = prices.find((p) => p.productId === productId);

  if (price) return price;

  return {
    productId,
    lowPrice: null,
    midPrice: null,
    highPrice: null,
    marketPrice: null,
    directLowPrice: null,
  };
}
