import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order, Settings } from "../src/types";
import { exportOrders, localDay, qrUrl } from "../src/utils";

const settings: Settings = {
  eventName: "Hội trại",
  bankBin: "970422",
  bankName: "Ngân hàng thử nghiệm",
  accountNumber: "DEMO123456",
  accountName: "NGUYEN MINH ANH",
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    code: "HT261006A1B2C3D4E5F6",
    sellerId: "seller-1",
    sellerName: "Bếp Lửa Trại",
    customerName: "Khách lẻ",
    note: "",
    items: [
      {
        productId: "product-1",
        name: "Trà đào cam sả",
        quantity: 2,
        price: 25000,
      },
    ],
    total: 50000,
    paymentMethod: "transfer",
    paymentStatus: "pending",
    cashReceived: null,
    createdAt: "2026-10-05T17:00:00.000Z",
    paidAt: null,
    paymentSource: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Vietnam business date", () => {
  it.each([
    ["2026-10-05T16:59:59.999Z", "2026-10-05"],
    ["2026-10-05T17:00:00.000Z", "2026-10-06"],
    ["2026-12-31T17:00:00.000Z", "2027-01-01"],
    ["2028-02-28T17:00:00.000Z", "2028-02-29"],
    ["2026-10-06T00:00:00+07:00", "2026-10-06"],
  ])("maps %s to %s independent of machine timezone", (timestamp, expected) => {
    expect(localDay(timestamp)).toBe(expected);
  });

  it("defaults to the current day in Vietnam at the UTC boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T18:00:00.000Z"));
    expect(localDay()).toBe("2027-01-01");
  });
});

describe("VietQR payment details", () => {
  it("preserves the exact amount, order reference and Vietnamese account name", () => {
    const reference = "HT261006A1B2C3D4E5F6 / A&B + C";
    const accountName = "NGUYỄN MINH ANH & BẠN";
    const result = qrUrl(order({ total: 120001, code: reference }), {
      ...settings,
      accountName,
    });
    const url = new URL(result!);
    expect(url.origin).toBe("https://img.vietqr.io");
    expect(url.pathname).toBe("/image/970422-DEMO123456-qr_only.png");
    expect(url.searchParams.get("amount")).toBe("120001");
    expect(url.searchParams.get("addInfo")).toBe(reference);
    expect(url.searchParams.get("accountName")).toBe(accountName);
    expect([...url.searchParams.keys()]).toHaveLength(3);
  });

  it("encodes account identifiers as path segments", () => {
    const url = new URL(
      qrUrl(order(), { ...settings, accountNumber: "DEMO/A?B#C" })!,
    );
    expect(url.pathname).toBe("/image/970422-DEMO%2FA%3FB%23C-qr_only.png");
    expect(url.searchParams.get("amount")).toBe("50000");
    expect(url.hash).toBe("");
  });

  it("keeps an existing order on its original bank account when event settings change", () => {
    const originalBank = {
      bankBin: "970436",
      bankName: "Ngân hàng cũ",
      accountNumber: "OLDDEMO123",
      accountName: "CHU TAI KHOAN CU",
    };
    const pendingOrder = order({ bankDetails: originalBank });
    const changedSettings = {
      ...settings,
      bankBin: "970422",
      accountNumber: "NEWDEMO456",
      accountName: "CHU TAI KHOAN MOI",
    };
    const url = new URL(qrUrl(pendingOrder, changedSettings)!);
    expect(url.pathname).toBe("/image/970436-OLDDEMO123-qr_only.png");
    expect(url.searchParams.get("accountName")).toBe("CHU TAI KHOAN CU");
    expect(url.searchParams.get("amount")).toBe(String(pendingOrder.total));
    expect(url.searchParams.get("addInfo")).toBe(pendingOrder.code);
  });

  it("does not silently replace an incomplete bank snapshot with a new payable account", () => {
    const pendingOrder = order({
      bankDetails: {
        bankBin: "",
        bankName: "",
        accountNumber: "",
        accountName: "",
      },
    });
    expect(qrUrl(pendingOrder, settings)).toBeNull();
  });

  it.each(["bankBin", "accountNumber", "accountName"] as const)(
    "does not render a payable QR without %s",
    (field) => {
      expect(qrUrl(order(), { ...settings, [field]: "" })).toBeNull();
    },
  );

  it("does not render a payable QR for a zero total", () => {
    expect(qrUrl(order({ total: 0 }), settings)).toBeNull();
  });
});

describe("CSV order export", () => {
  it("neutralizes formula-like fields and preserves commas, quotes and line breaks", async () => {
    vi.useFakeTimers();
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:csv-preview");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    exportOrders([
      order({
        code: "=SUM(1,2)",
        sellerName: " \t@SUM(1,2)",
        customerName: '\n+CMD("test")',
      }),
    ]);
    const csv = await (createUrl.mock.calls[0][0] as Blob).text();
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"\' \t@SUM(1,2)"');
    expect(csv).toContain('"\'\n+CMD(""test"")"');
    expect(csv).toContain('"50000","transfer","pending",""');
    expect(anchor.href).toBe("blob:csv-preview");
    expect(anchor.download).toMatch(/^don-hang-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeUrl).toHaveBeenCalledWith("blob:csv-preview");
  });

  it("exports a quoted header when no orders match the chosen filter", async () => {
    vi.stubGlobal("document", { createElement: () => ({ click: () => {} }) });
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:empty-csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    exportOrders([]);
    const csv = await (createUrl.mock.calls[0][0] as Blob).text();
    expect(csv).toBe(
      '"Mã đơn","Gian hàng","Khách hàng","Thời gian","Tổng tiền (VND)","Phương thức","Trạng thái","Nguồn xác nhận"',
    );
  });
});
