import { Router } from "express";
import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import { sendError } from "../lib/errors.js";

const router = Router();

// 会員登録
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password) {
    return sendError(res, "VALIDATION", "email と password は必須です");
  }
  if (String(password).length < 6) {
    return sendError(res, "VALIDATION", "パスワードは6文字以上にしてください");
  }

  try {
    const normalized = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return sendError(res, "VALIDATION", "既に登録済みのメールアドレスです");
    }

    const hashed_password = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({
      data: { email: normalized, name: name ?? "", hashed_password },
      select: { id: true, email: true, name: true },
    });

    // セッション保存（メールも保持しておくと「メール一致の未ひも付けオーダー」表示が安定）
    (req.session as any).userId = user.id;
    (req.session as any).email = user.email;

    return res.json({ ok: true, user });
  } catch (error) {
    console.error("[auth/register]", error);
    return sendError(res, "DB_ERROR");
  }
});

// ログイン
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return sendError(res, "VALIDATION", "email と password は必須です");
  }

  try {
    const normalized = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });

    if (!user || !user.hashed_password) {
      return sendError(res, "UNAUTHORIZED", "メールアドレスまたはパスワードが正しくありません");
    }

    const ok = await bcrypt.compare(String(password), user.hashed_password);
    if (!ok) {
      return sendError(res, "UNAUTHORIZED", "メールアドレスまたはパスワードが正しくありません");
    }

    (req.session as any).userId = user.id;
    (req.session as any).email = user.email;
    return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("[auth/login]", error);
    return sendError(res, "DB_ERROR");
  }
});

// ログアウト
router.post("/logout", (req, res) => {
  req.session = null as any;
  res.json({ ok: true });
});

export default router;
