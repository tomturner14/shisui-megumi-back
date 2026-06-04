// src/routes/products.ts
import { Router } from "express";
import { sendError } from "../lib/errors.js";

const router = Router();

const STOREFRONT_URL = process.env.SHOPIFY_STOREFRONT_URL!;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;

async function callSF(query: string, variables?: Record<string, unknown>) {
  const r = await fetch(STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  return r;
}

/** 一覧 */
router.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!STOREFRONT_URL || !STOREFRONT_TOKEN) {
    return sendError(res, "DB_ERROR", "Shopify 設定が不足しています");
  }

  const query = `
    query Products {
      products(first: 20) {
        edges {
          node {
            id
            handle
            title
            description
            featuredImage { url }
            variants(first: 1) { edges { node { id price { amount } availableForSale } } }
          }
        }
      }
    }
  `;

  try {
    const r = await callSF(query);
    if (!r.ok) return sendError(res, "DB_ERROR", `Shopify 応答エラー (${r.status})`);
    const json = await r.json();

    const items = (json?.data?.products?.edges ?? []).map((e: any) => {
      const v = e?.node?.variants?.edges?.[0]?.node;

      return {
        id: e?.node?.id,
        handle: e?.node?.handle,
        title: e?.node?.title,
        description: e?.node?.description ?? "",
        image: e?.node?.featuredImage?.url ?? "",
        price: Number(v?.price?.amount ?? 0),
        firstVariantId: v?.id ?? null,
        available: Boolean(v?.availableForSale ?? false),
      };
    });

    return res.json(items);
  } catch {
    return sendError(res, "DB_ERROR");
  }
});

/** 単品（handle で取得） */
router.get("/:handle", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!STOREFRONT_URL || !STOREFRONT_TOKEN) {
    return sendError(res, "DB_ERROR", "Shopify 設定が不足しています");
  }

  const handle = String(req.params.handle ?? "");
  if (!handle) return sendError(res, "VALIDATION", "handle が不正です");

  const query = `
    query ProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
        title
        description
        featuredImage { url }
        images(first: 8) { edges { node { url } } }
        variants(first: 10) {
          edges {
            node {
              id
              title
              availableForSale
              price { amount }
            }
          }
        }
      }
    }
  `;

  try {
    const r = await callSF(query, { handle });
    if (!r.ok) return sendError(res, "DB_ERROR", `Shopify 応答エラー (${r.status})`);
    const json = await r.json();
    const p = json?.data?.productByHandle;
    if (!p) return sendError(res, "VALIDATION", "商品が見つかりません");

    const variants = (p?.variants?.edges ?? []).map((e: any) => ({
      id: e?.node?.id,
      title: e?.node?.title,
      price: Number(e?.node?.price?.amount ?? 0),
      available: Boolean(e?.node?.availableForSale ?? true),
    }));

    const data = {
      id: p.id,
      handle: p.handle,
      title: p.title,
      description: p.description ?? "",
      image: p.featuredImage?.url ?? (p.images?.edges?.[0]?.node?.url ?? ""),
      images: (p.images?.edges ?? []).map((e: any) => e?.node?.url).filter(Boolean),
      variants,
      price: variants[0]?.price ?? 0,
    };

    return res.json(data);
  } catch {
    return sendError(res, "DB_ERROR");
  }
});

export default router;
