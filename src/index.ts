// src/index.ts
import express from "express";
import dotenv from "dotenv";
import cookieSession from "cookie-session";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import addressRoutes from "./routes/addresses.js";
import ordersRoutes from "./routes/orders.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import webhookRoutes from "./routes/webhook.js";
import meRoutes from "./routes/me.js";
import devRoutes from "./routes/dev.js";
import shopifyRoutes from "./routes/shopify.js";
import productsRoutes from "./routes/products.js";
import cartRoutes from "./routes/cart.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const isProd = process.env.NODE_ENV === "production";

// 1) セキュリティ基本
app.disable("x-powered-by");            // Expressを隠す
app.set("trust proxy", 1);               // 逆プロキシ配下での secure-cookie 判定

// helmet: まずは標準セット。必要に応じてCSP等は後日チューニング
app.use(helmet());

// 2) Webhook (raw body) を最優先でマウント
//    - HMAC検証のため rawBody を渡す必要がある
app.use(
  ["/api/webhook", "/webhook"],
  bodyParser.raw({ type: "*/*", limit: "2mb" })
);

// 3) Webhook専用レートリミット
//    - Shopify からのBurstを考慮して十分ゆるめに（本番は環境変数で調整）
const WEBHOOK_RPM = Number(process.env.WEBHOOK_RPM ?? 120); // 1分あたりの許容量
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: WEBHOOK_RPM,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use(["/api/webhook", "/webhook"], webhookLimiter);

// Webhook ルーター (raw → limiter の後)
app.use(["/api/webhook", "/webhook"], webhookRoutes);

// 4) CORS（通常API用）
//    - 許可オリジンを環境変数からカンマ区切りで読み込む
//    - 未指定時は dev 既定: http://localhost:3000 のみ許可
const ORIGIN_ENV = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const ALLOWED_ORIGINS = ORIGIN_ENV.split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  (req, res, next) => {
    // WebhookにはCORS不要（Shopifyサーバ→サーバ）
    if (req.path.startsWith("/api/webhook") ||
      req.path.startsWith("/webhook")) return next();
    return cors({
      origin: (origin, cb) => {
        // Same-origin や SSR/ツール(Originなし) は許可
        if (!origin) return cb(null, true);
        const ok = ALLOWED_ORIGINS.includes(origin);
        cb(ok ? null : new Error("CORS: origin not allowed"));
      },
      credentials: true,
    })(req, res, next);
  }
);

// 5) 通常リクエストの JSON パーサ（Webhookより後）
app.use(express.json({ limit: "1mb" }));

// 6) セッション（本番で secure/lax）※既に適正設定のため維持
app.use(
  cookieSession({
    name: "okome.sid",
    keys: [process.env.SESSION_SECRET!],
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  })
);

// session 初期化（型安全のための保険）
app.use((req, _res, next) => {
  if (!req.session) req.session = {} as any;
  next();
});

// 開発用
app.use("/api/dev", devRoutes);

// ===== API ルート =====
app.use("/api/auth", authRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/me", meRoutes);
app.use("/api/shopify", shopifyRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/cart", cartRoutes);

// ヘルスチェック
app.get("/", (_req, res) => {
  res.send("okome-site backend is running.");
});

// エラーハンドリング（CORS拒否などのメッセージを素直に返す）
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err?.message?.startsWith("CORS:")) {
    return res.status(403).json({ ok: false, code: "FORBIDDEN", message: "許可されていないオリジンからのアクセスです。" });
  }
  return res.status(500).json({ ok: false, code: "DB_ERROR", message: "サーバ内部でエラーが発生しました。" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening at http://0.0.0.0:${PORT}`);
});
