// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { api } from "../src/api";
import {
  AccountsPanel,
  allowedTaskTransition,
  emptyHistoryFilters,
  filterHistory,
  historyCsv,
  historySummary,
  OrderHistory,
  OrderThread,
  PreparationBoard,
} from "../src/Operations";
import type { Bootstrap, Order, PreparationTask, Role } from "../src/types";

vi.mock("../src/api", () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);
const notify = vi.fn();
const refresh = vi.fn(async () => {});
const onOrder = vi.fn();
function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    code: "TV-001",
    sellerId: null,
    sellerName: "Nhiều gian hàng",
    customerName: "Bàn 12",
    note: "Ít đá",
    items: [
      {
        productId: "tea",
        name: "Trà đào",
        quantity: 2,
        price: 15000,
        department: "drinks",
        sellerId: "s1",
      },
      {
        productId: "cookie",
        name: "Cookie bơ",
        quantity: 3,
        price: 10000,
        department: "food",
        sellerId: "s2",
      },
      {
        productId: "bracelet",
        name: "Vòng tay",
        quantity: 1,
        price: 20000,
        department: "handmade",
        sellerId: "s2",
      },
    ],
    total: 80000,
    paymentMethod: "transfer",
    paymentStatus: "paid",
    cashReceived: null,
    createdAt: "2026-10-12T17:00:00.000Z",
    paidAt: "2026-10-12T17:01:00.000Z",
    fulfillmentStatus: "queued",
    ...overrides,
  };
}
function task(overrides: Partial<PreparationTask> = {}): PreparationTask {
  return {
    id: "task-drinks",
    orderId: "order-1",
    department: "drinks",
    status: "queued",
    items: order().items.slice(0, 1),
    orderCode: "TV-001",
    customerName: "Bàn 12",
    note: "Ít đá",
    createdAt: "2026-10-12T17:01:00.000Z",
    updatedAt: "2026-10-12T17:01:00.000Z",
    ...overrides,
  };
}
function data(role: Role = "admin"): Bootstrap {
  return {
    user: {
      id: "admin",
      name: "Quản trị",
      username: "admin",
      role,
      sellerId: null,
    },
    sellers: [
      {
        id: "s1",
        name: "Nước",
        description: "",
        color: "orange",
        active: true,
      },
      {
        id: "s2",
        name: "Bánh & handmade",
        description: "",
        color: "green",
        active: true,
      },
    ],
    products: [
      {
        id: "tea",
        sellerId: "s1",
        name: "Trà đào",
        category: "Nước",
        price: 15000,
        stock: 50,
        emoji: "",
        color: "",
        active: true,
        department: "drinks",
      },
      {
        id: "cookie",
        sellerId: "s2",
        name: "Cookie bơ",
        category: "Bánh",
        price: 10000,
        stock: 50,
        emoji: "",
        color: "",
        active: true,
        department: "food",
      },
      {
        id: "bracelet",
        sellerId: "s2",
        name: "Vòng tay",
        category: "Handmade",
        price: 20000,
        stock: 50,
        emoji: "",
        color: "",
        active: true,
        department: "handmade",
      },
    ],
    orders: [
      order(),
      order({
        id: "order-2",
        code: "TV-002",
        customerName: "Bàn 2",
        note: "Không đường",
        total: 30000,
        items: order().items.slice(0, 1),
        paymentMethod: "cash",
        paymentStatus: "pending",
        paidAt: null,
        createdAt: "2026-10-12T16:59:00.000Z",
        fulfillmentStatus: "none",
      }),
      order({
        id: "order-3",
        code: "TV-003",
        customerName: "Khách hủy",
        paymentStatus: "cancelled",
        createdAt: "2026-10-13T17:00:00.000Z",
        paidAt: null,
        fulfillmentStatus: "none",
      }),
    ],
    settings: {
      eventName: "Hội trại",
      bankBin: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
    },
    tasks: [
      task(),
      task({
        id: "task-food",
        department: "food",
        status: "ready",
        items: order().items.slice(1, 2),
      }),
      task({ id: "task-unpaid", orderId: "order-2", orderCode: "TV-002" }),
    ],
    messages: [],
    users: [
      {
        id: "admin",
        name: "Quản trị",
        username: "admin",
        role: "admin",
        sellerId: null,
        active: true,
      },
      {
        id: "cashier",
        name: "Mai",
        username: "mai",
        role: "cashier",
        sellerId: null,
        active: true,
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mockApi.mockResolvedValue({});
});
afterEach(() => cleanup());

describe("History filtering and honest summaries", () => {
  it("uses inclusive Vietnam dates across UTC midnight and combines seller, payment, value and preparation filters", () => {
    expect(
      filterHistory(data(), {
        ...emptyHistoryFilters,
        from: "2026-10-13",
        to: "2026-10-13",
      }).map((entry) => entry.id),
    ).toEqual(["order-1"]);
    expect(
      filterHistory(data(), {
        ...emptyHistoryFilters,
        seller: "s2",
        paymentMethod: "transfer",
        paymentStatus: "paid",
        min: "50000",
        max: "80000",
        department: "food",
        preparation: "ready",
      }).map((entry) => entry.id),
    ).toEqual(["order-1"]);
    expect(
      filterHistory(data(), {
        ...emptyHistoryFilters,
        department: "drinks",
        preparation: "ready",
      }),
    ).toEqual([]);
  });
  it("finds notes and product names with accent-free Vietnamese search", () => {
    expect(
      filterHistory(data(), {
        ...emptyHistoryFilters,
        search: "khong duong",
      }).map((entry) => entry.id),
    ).toEqual(["order-2"]);
    expect(
      filterHistory(data(), {
        ...emptyHistoryFilters,
        search: "VONG TAY",
        paymentStatus: "paid",
      }).map((entry) => entry.id),
    ).toEqual(["order-1"]);
    expect(historySummary(data().orders)).toEqual({
      count: 3,
      paidRevenue: 80000,
      pendingAmount: 30000,
      units: 8,
    });
  });
  it("scopes preparation-team history to its own items and omits financial information", () => {
    const drinks = data("drinks");
    const scoped = filterHistory(drinks, { ...emptyHistoryFilters });
    expect(scoped[0].items.every((item) => item.department === "drinks")).toBe(
      true,
    );
    expect(historySummary(scoped)).toEqual({
      count: 3,
      paidRevenue: 0,
      pendingAmount: 0,
      units: 4,
    });
    expect(
      filterHistory(drinks, { ...emptyHistoryFilters, search: "cookie" }),
    ).toEqual([]);
    expect(historyCsv(scoped, drinks)).toContain("Số món của ban");
    expect(historyCsv(scoped, drinks)).not.toContain("VND");
    expect(historyCsv(scoped, drinks)).not.toContain("Nguồn xác nhận");
    expect(historyCsv(scoped, drinks)).not.toContain("Cookie bơ");
    const sales = filterHistory(data("sales"), {
      ...emptyHistoryFilters,
      paymentStatus: "paid",
    });
    expect(sales[0].total).toBe(0);
    expect(sales[0].items.map((item) => item.department)).toEqual([
      "food",
      "handmade",
    ]);
  });
  it("shows work statistics without monetary controls for preparation roles", () => {
    render(
      <OrderHistory
        data={data("drinks")}
        notify={notify}
        refresh={refresh}
        onOrder={onOrder}
      />,
    );
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByText("Doanh thu đã thanh toán")).toBeNull();
    expect(
      screen.getByText("Phần việc đang chuẩn bị").parentElement?.textContent,
    ).toContain("1");
    expect(screen.getByText("Phần việc sẵn sàng")).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Số món của ban" }),
    ).toBeTruthy();
  });
  it("escapes spreadsheet formulas and preserves quotes in downloaded CSV", () => {
    const csv = historyCsv(
      [order({ customerName: '=HYPERLINK("bad")', note: "@danger" })],
      data(),
    );
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\'@danger"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("updates summaries and rows with controls, resets filters, and paginates results", () => {
    const bootstrap = data();
    bootstrap.orders = Array.from({ length: 23 }, (_, index) =>
      order({ id: `o${index}`, code: `TV-${index + 100}` }),
    );
    render(
      <OrderHistory
        data={bootstrap}
        notify={notify}
        refresh={refresh}
        onOrder={onOrder}
      />,
    );
    const results = screen.getByRole("region", {
      name: "Kết quả lịch sử lên đơn",
    });
    expect(within(results).getAllByRole("row")).toHaveLength(21);
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(within(results).getAllByRole("row")).toHaveLength(4);
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm đơn hàng" }), {
      target: { value: "TV-100" },
    });
    expect(within(results).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Xem đơn TV-100" }));
    expect(onOrder).toHaveBeenCalledWith("o0");
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(within(results).getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText("Trang 1 / 2")).toBeTruthy();
  });
});

describe("Preparation and communication rights", () => {
  it("enforces department and step-specific transitions", () => {
    expect(allowedTaskTransition("drinks", "food", "queued", "preparing")).toBe(
      false,
    );
    expect(
      allowedTaskTransition("sales", "handmade", "queued", "preparing"),
    ).toBe(true);
    expect(allowedTaskTransition("sales", "food", "ready", "delivered")).toBe(
      false,
    );
    expect(
      allowedTaskTransition("cashier", "drinks", "queued", "preparing"),
    ).toBe(false);
    expect(
      allowedTaskTransition("cashier", "drinks", "ready", "delivered"),
    ).toBe(true);
    expect(allowedTaskTransition("admin", "food", "queued", "ready")).toBe(
      false,
    );
  });
  it("shows only paid work for the drinks team and sends the correct preparation update", async () => {
    render(
      <PreparationBoard
        data={data("drinks")}
        notify={notify}
        refresh={refresh}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Món đã sẵn sàng" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chuẩn bị" }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/preparation/task-drinks", {
        method: "PATCH",
        body: { status: "preparing" },
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledWith(true));
  });
  it("lets cashier confirm delivery but does not expose preparation actions", async () => {
    render(
      <PreparationBoard
        data={data("cashier")}
        notify={notify}
        refresh={refresh}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Bắt đầu chuẩn bị" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Đã giao cho khách" }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/preparation/task-food", {
        method: "PATCH",
        body: { status: "delivered" },
      }),
    );
  });
  it("sends replies to the correct team and hides messages from other departments", async () => {
    const bootstrap = data("drinks");
    bootstrap.messages = [
      {
        id: "m1",
        orderId: "order-1",
        department: "food",
        authorId: "c",
        authorName: "Thu ngân",
        role: "cashier",
        message: "Bánh không đường",
        createdAt: order().createdAt,
      },
      {
        id: "m2",
        orderId: "order-1",
        department: null,
        authorId: "c",
        authorName: "Thu ngân",
        role: "cashier",
        message: "Khách đang chờ",
        createdAt: order().createdAt,
      },
    ];
    render(
      <OrderThread
        data={bootstrap}
        orderId="order-1"
        department="drinks"
        notify={notify}
        refresh={refresh}
      />,
    );
    expect(screen.queryByText("Bánh không đường")).toBeNull();
    expect(screen.getByText("Khách đang chờ")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Lời nhắn" }), {
      target: { value: "  Nước sẽ xong sau 2 phút  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi lời nhắn" }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/orders/order-1/messages", {
        method: "POST",
        body: { department: "drinks", message: "Nước sẽ xong sau 2 phút" },
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Lời nhắn",
          }) as HTMLTextAreaElement
        ).value,
      ).toBe(""),
    );
  });
  it("only offers message targets present in the order", () => {
    const bootstrap = data("cashier");
    bootstrap.orders = [order({ items: order().items.slice(0, 1) })];
    render(
      <OrderThread
        data={bootstrap}
        orderId="order-1"
        notify={notify}
        refresh={refresh}
      />,
    );
    const targets = within(
      screen.getByRole("combobox", { name: "Gửi tới" }),
    ).getAllByRole("option");
    expect(targets.map((option) => option.textContent)).toEqual([
      "Tất cả ban trong đơn",
      "Nước uống",
    ]);
  });
});

describe("Account administration", () => {
  it("does not expose account controls to preparation roles", () => {
    render(
      <AccountsPanel data={data("sales")} notify={notify} refresh={refresh} />,
    );
    expect(screen.queryByRole("button", { name: "Thêm tài khoản" })).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });
  it("preserves a blank password on edits and protects the active administrator", async () => {
    render(<AccountsPanel data={data()} notify={notify} refresh={refresh} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sửa tài khoản admin" }),
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "Tiểu ban / vai trò",
        }) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Tài khoản được phép đăng nhập",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Đóng biểu mẫu tài khoản" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sửa tài khoản mai" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Họ tên" }), {
      target: { value: "Mai hậu cần" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Tiểu ban / vai trò" }),
      { target: { value: "drinks" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/users/cashier", {
        method: "PATCH",
        body: {
          name: "Mai hậu cần",
          username: "mai",
          role: "drinks",
          active: true,
          sellerId: null,
        },
      }),
    );
    expect(mockApi.mock.calls[0][1]?.body).not.toHaveProperty("password");
  });
  it("creates department accounts without requiring a seller assignment", async () => {
    render(<AccountsPanel data={data()} notify={notify} refresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Họ tên" }), {
      target: { value: "Ban Nước" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Tên đăng nhập" }), {
      target: { value: "ban.nuoc" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "TestPass123456" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Tiểu ban / vai trò" }),
      { target: { value: "drinks" } },
    );
    expect(
      screen.queryByRole("combobox", { name: "Gian hàng được gán" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/users", {
        method: "POST",
        body: {
          name: "Ban Nước",
          username: "ban.nuoc",
          role: "drinks",
          active: true,
          sellerId: null,
          password: "TestPass123456",
        },
      }),
    );
  });
});
