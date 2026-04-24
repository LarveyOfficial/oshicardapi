const TCG_HEADERS = { "User-Agent": "oshicardapi/1.0" };

export interface TCGPrice {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
}

async function fetchTCGBoosters(): Promise<{ results: { name: string; groupId: number }[] }> {
  const res = await fetch("https://tcgcsv.com/tcgplayer/87/groups", { headers: TCG_HEADERS });
  return res.json();
}

async function fetchTCGProducts(boosterId: number): Promise<{
  results: {
    name: string;
    productId: number;
    extendedData?: Array<{ name: string; displayName: string; value: string }>;
  }[];
}> {
  const res = await fetch(`https://tcgcsv.com/tcgplayer/87/${boosterId}/products`, {
    headers: TCG_HEADERS,
  });
  return res.json();
}

async function fetchTCGPrices(boosterId: number): Promise<{ results: TCGPrice[] }> {
  const res = await fetch(`https://tcgcsv.com/tcgplayer/87/${boosterId}/prices`, {
    headers: TCG_HEADERS,
  });
  return res.json();
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
    if (splitName.length > 1) {
      const setName = splitName[1].trim();
      const boosterId = boosters.results.find((booster: { name: string; groupId: number }) =>
        booster.name.includes(setName)
      )?.groupId;
      if (boosterId) setIds.push(boosterId);
    }
  }

  let productId: number | undefined;
  let foundSetId: number | undefined;

  for (const setId of setIds) {
    const products = await fetchTCGProducts(setId);
    const cardProductId = products.results.find(
      (product: {
        name: string;
        productId: number;
        extendedData?: Array<{ name: string; displayName: string; value: string }>;
      }) =>
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
  const price = prices.results.find(
    (price: { productId: number }) => price.productId === productId
  );

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
