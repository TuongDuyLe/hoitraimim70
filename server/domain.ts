import { HttpError } from "./errors";
import type { Department, OrderItem, Product } from "./types";

export function inferDepartment(value: { department?: Department; category?: string; name?: string }): Department {
  if (value.department) return value.department;
  const text = `${value.category ?? ""} ${value.name ?? ""}`.toLocaleLowerCase("vi");
  if (/handmade|thủ công|thu cong|móc|moc khoa|vòng|vong tay/.test(text)) return "handmade";
  if (/đồ uống|do uong|nước|nuoc|trà|tra dao|cà phê|ca phe|giải khát|giai khat|drink|coffee|juice|soda/.test(text)) return "drinks";
  return "food";
}

export function planOrder(
  sellerId: string | null,
  requested: { productId: string; quantity: number }[],
  products: Product[],
) {
  if (requested.length === 0)
    throw new HttpError(400, "Đơn cần có ít nhất một món.");
  const seen = new Set<string>();
  const items: OrderItem[] = [];
  let total = 0;
  for (const entry of requested) {
    if (seen.has(entry.productId))
      throw new HttpError(
        400,
        "Mỗi món chỉ được xuất hiện một lần trong đơn.",
        "DUPLICATE_PRODUCT",
      );
    seen.add(entry.productId);
    const product = products.find((p) => p.id === entry.productId);
    if (!product || !product.active || (sellerId !== null && product.sellerId !== sellerId))
      throw new HttpError(
        409,
        "Món không còn bán hoặc không thuộc gian hàng này.",
        "PRODUCT_UNAVAILABLE",
      );
    if (
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > 999
    )
      throw new HttpError(400, "Số lượng món không hợp lệ.");
    if (product.stock !== null && product.stock < entry.quantity)
      throw new HttpError(
        409,
        `Không đủ tồn kho cho ${product.name}.`,
        "OUT_OF_STOCK",
      );
    total += product.price * entry.quantity;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000)
      throw new HttpError(400, "Giá trị đơn vượt giới hạn.", "TOTAL_TOO_LARGE");
    items.push({
      productId: product.id,
      name: product.name,
      quantity: entry.quantity,
      price: product.price,
      trackedStock: product.stock !== null,
      department: inferDepartment(product),
      sellerId: product.sellerId,
    });
  }
  return { items, total };
}

export function cashStatus(total: number, cashReceived?: number) {
  if (cashReceived !== undefined && cashReceived < total)
    throw new HttpError(
      400,
      "Tiền khách đưa chưa đủ để thanh toán.",
      "INSUFFICIENT_CASH",
    );
  return cashReceived === undefined ? ("pending" as const) : ("paid" as const);
}
