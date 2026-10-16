import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getPool } from "./db";
import { jwtKey } from "./config";
import { HttpError } from "./errors";
import { mapUser } from "./mappers";
import type { User } from "./types";

const cookieName = "camp_pos_session";
const sessionSeconds = 8 * 60 * 60;
let dummyHash: Promise<string> | undefined;

export function sessionCookie(token: string, request: Request, clear = false) {
  const secure =
    new URL(request.url).protocol === "https:" ||
    process.env.NODE_ENV === "production";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : sessionSeconds}${secure ? "; Secure" : ""}`;
}
function cookieToken(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
async function readSessionId(request: Request) {
  const token = cookieToken(request);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtKey(), {
      algorithms: ["HS256"],
      issuer: "camp-pos",
      audience: "camp-pos-session",
    });
    return typeof payload.jti === "string" && typeof payload.sub === "string"
      ? { id: payload.jti, userId: payload.sub }
      : null;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return null;
  }
}
export async function currentUser(request: Request): Promise<User> {
  const session = await readSessionId(request);
  if (!session)
    throw new HttpError(401, "Vui lòng đăng nhập.", "UNAUTHENTICATED");
  const { rows } = await getPool().query(
    `SELECT u.* FROM sessions t JOIN users u ON u.id=t.user_id LEFT JOIN sellers s ON s.id=u.seller_id WHERE t.id=$1 AND t.user_id=$2 AND t.expires_at>now() AND u.active=true AND (u.role<>'seller' OR s.active=true)`,
    [session.id, session.userId],
  );
  if (!rows[0])
    throw new HttpError(
      401,
      "Phiên đăng nhập đã hết hạn hoặc tài khoản đã bị khóa.",
      "UNAUTHENTICATED",
    );
  return mapUser(rows[0]);
}
export async function login(username: string, password: string) {
  const signingKey = jwtKey();
  const db = getPool();
  // Persist username throttling in PostgreSQL so separate function instances share it.
  const key = createHash("sha256").update(username).digest("hex");
  const attempts = await db.query(
    `INSERT INTO login_attempts(key_hash,attempts,window_started) VALUES ($1,1,now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_started<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_started=CASE WHEN login_attempts.window_started<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_started END RETURNING attempts`,
    [key],
  );
  if (attempts.rows[0].attempts > 10)
    throw new HttpError(
      429,
      "Đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.",
      "RATE_LIMITED",
    );
  const { rows } = await db.query(
    `SELECT u.*,s.active AS seller_active FROM users u LEFT JOIN sellers s ON s.id=u.seller_id WHERE LOWER(u.username)=$1 OR LOWER(COALESCE(u.email, ''))=$1 OR LOWER(u.username)=$2`,
    [username.toLowerCase(), username.toLowerCase().replaceAll("@gmail.com", "")],
  );
  const row = rows[0];
  dummyHash ??= bcrypt.hash("InvalidUserTimingPadding29!", 12);
  const matches = await bcrypt.compare(
    password,
    row?.password_hash ?? (await dummyHash),
  );
  if (!matches || !row?.active || (row.role === "seller" && !row.seller_active))
    throw new HttpError(
      401,
      "Tên đăng nhập hoặc mật khẩu không đúng.",
      "INVALID_CREDENTIALS",
    );
  const id = randomUUID();
  await db.query(
    "INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,$3)",
    [id, row.id, new Date(Date.now() + sessionSeconds * 1000)],
  );
  await db.query("DELETE FROM login_attempts WHERE key_hash=$1", [key]);
  await db.query("DELETE FROM sessions WHERE expires_at<now()");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(row.id)
    .setJti(id)
    .setIssuer("camp-pos")
    .setAudience("camp-pos-session")
    .setIssuedAt()
    .setExpirationTime(`${sessionSeconds}s`)
    .sign(signingKey);
  return { user: mapUser(row), token };
}
export async function logout(request: Request) {
  const session = await readSessionId(request);
  if (session)
    await getPool().query("DELETE FROM sessions WHERE id=$1 AND user_id=$2", [
      session.id,
      session.userId,
    ]);
}
export function requireAdmin(user: User) {
  if (user.role !== "admin")
    throw new HttpError(
      403,
      "Chỉ quản trị viên được thực hiện thao tác này.",
      "FORBIDDEN",
    );
}
export function requireSellerScope(user: User, sellerId: string) {
  if (user.role !== "admin" && !(user.role === "seller" && user.sellerId === sellerId))
    throw new HttpError(
      403,
      "Bạn không có quyền truy cập gian hàng này.",
      "FORBIDDEN",
    );
}
export function requireOrderScope(user: User, sellerId: string | null) {
  if (user.role === "admin" || user.role === "cashier") return;
  if (user.role === "seller" && sellerId !== null && user.sellerId === sellerId) return;
  throw new HttpError(403, "Bạn không có quyền tạo hoặc thay đổi thanh toán đơn này.", "FORBIDDEN");
}
