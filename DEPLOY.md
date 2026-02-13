# DEPLOY（案A：同一ドメインで /api を backend に流す）

## 0. 前提
- 1台EC2で運用（nginxが入口）
- /            -> frontend（Next）
- /api/*       -> backend（Express）
- HTTPSはcertbot
- process管理はpm2

## 1. サーバ準備
- Node.js（LTS）
- pm2
- nginx
- certbot

## 2. リポジトリ配置
- /var/www/okome/okome-site-front
- /var/www/okome/okome-site-back

## 3. backend（Express）
### 3-1. env
- .env.production を配置（キーは .env.example 参照）

### 3-2. install / build / migrate
- npm ci
- npx prisma generate
- npx prisma migrate deploy

### 3-3. 起動（pm2）
- pm2 start "node dist/index.js" --name okome-back

## 4. frontend（Next）
### 4-1. env
- .env.production を配置

### 4-2. install / build
- npm ci
- npm run build

### 4-3. 起動（pm2）
- pm2 start "npm run start -- -p 3000" --name okome-front

## 5. nginx（/ と /api の振り分け）
- /etc/nginx/sites-available/okome.conf を作成
- 有効化 → reload

## 6. HTTPS（certbot）
- certbot --nginx

## 7. 動作確認
### 7-1. API
- curl -i https://<DOMAIN>/api/me
- curl -i https://<DOMAIN>/api/products
- curl -i https://<DOMAIN>/api/orders

### 7-2. UI動線
- トップ表示
- ログイン
- /mypage/addresses で保存
- /mypage/orders で一覧表示

## 8. Webhook
- ShopifyのWebhook送信先: https://<DOMAIN>/api/webhook
- 署名検証: SHOPIFY_WEBHOOK_SECRET

## 9. ログ
- pm2 logs okome-front
- pm2 logs okome-back
- nginx access/error
