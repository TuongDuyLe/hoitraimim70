import { demoRequest } from "./demo";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function isDemo() {
  return sessionStorage.getItem("traivui-demo") === "1";
}
export function setDemo(enabled: boolean) {
  if (enabled) sessionStorage.setItem("traivui-demo", "1");
  else sessionStorage.removeItem("traivui-demo");
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (isDemo()) {
    try {
      return await demoRequest<T>(path, options);
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : "Dữ liệu demo không hợp lệ.",
        400,
      );
    }
  }
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers:
        options.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại; đơn sẽ không được tạo trùng.",
      0,
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      body?.error ||
        body?.message ||
        "Yêu cầu chưa thành công. Vui lòng thử lại.",
      response.status,
    );
  if (!body)
    throw new ApiError(
      "API chưa được triển khai. Hãy kiểm tra Netlify Functions.",
      502,
    );
  return body as T;
}
