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
import { Storage } from "happy-dom";
import App from "../src/App";
import { demoRequest, resetDemo } from "../src/demo";
import type { Bootstrap } from "../src/types";

beforeEach(() => {
  // Node 26 exposes its own optional Web Storage; use the actual DOM storage in this browser test.
  vi.stubGlobal("localStorage", new Storage());
  vi.stubGlobal("sessionStorage", new Storage());
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("traivui-demo", "1");
  history.replaceState(null, "", "/");
  resetDemo();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function openSale() {
  render(<App />);
  await screen.findByRole("heading", { name: /Lên đơn, thêm niềm vui/ });
  await screen.findByRole("button", { name: /^Thêm Trà đào cam sả,/ });
}

describe("Selling through the complete demo interface", () => {
  it("creates a paid cash order, shows the correct change and reserves inventory", async () => {
    await openSale();
    fireEvent.click(
      screen.getByRole("button", { name: /^Thêm Trà đào cam sả,/ }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Tên khách hoặc số bàn" }),
      { target: { value: "Khách tiền mặt" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /Tiền khách đưa/ }),
      { target: { value: "50000" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Thu tiền & hoàn tất/ }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Thanh toán hoàn tất",
    });
    expect(
      within(dialog).getByRole("heading", { name: "Đã nhận đủ tiền!" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("Khách tiền mặt")).toBeTruthy();
    expect(
      within(dialog).getByText("Tiền khách đưa").parentElement?.textContent,
    ).toContain("50.000");
    expect(
      within(dialog).getByText("Tiền trả lại").parentElement?.textContent,
    ).toContain("25.000");

    const stored = await demoRequest<Bootstrap>("/bootstrap");
    expect(stored.orders).toHaveLength(9);
    expect(stored.orders[0]).toMatchObject({
      customerName: "Khách tiền mặt",
      total: 25000,
      paymentMethod: "cash",
      paymentStatus: "paid",
      cashReceived: 50000,
      paymentSource: "cash",
    });
    expect(stored.products.find((p) => p.id === "demo-product-1")?.stock).toBe(
      47,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Tiếp tục bán hàng/ }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", {name:"Thanh toán hoàn tất"})).toBeNull());
    expect(
      screen.queryByRole("button", { name: "Giảm Trà đào cam sả" }),
    ).toBeNull();
  });

  it("creates a transfer with blank demo bank details and records manual payment after confirmation", async () => {
    await openSale();
    fireEvent.click(screen.getByRole("button", { name: /^Thêm Trà tắc,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển khoản" }));
    const checkout = screen.getByRole("button", {
      name: /Tạo đơn & hiện QR/,
    }) as HTMLButtonElement;
    expect(checkout.disabled).toBe(false);
    fireEvent.click(checkout);

    const dialog = await screen.findByRole("dialog", {
      name: "Thanh toán đơn hàng",
    });
    expect(within(dialog).getByText("QR thử nghiệm")).toBeTruthy();
    expect(within(dialog).queryByRole("img")).toBeNull();
    const pending = await demoRequest<Bootstrap>("/bootstrap");
    expect(pending.orders[0]).toMatchObject({
      total: 15000,
      paymentMethod: "transfer",
      paymentStatus: "pending",
      bankDetails: { accountNumber: "" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận đã nhận tiền" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
    await screen.findByRole("dialog", { name: "Thanh toán hoàn tất" });
    expect(
      screen.getByText("Người phụ trách đã xác nhận tiền chuyển khoản."),
    ).toBeTruthy();
    const paid = await demoRequest<Bootstrap>("/bootstrap");
    expect(paid.orders).toHaveLength(9);
    expect(paid.orders[0]).toMatchObject({
      id: pending.orders[0].id,
      paymentStatus: "paid",
      paymentSource: "manual",
    });
    expect(paid.orders[0].paidAt).not.toBeNull();
  });

  it("cancels a pending transfer and restores its reserved stock", async () => {
    await openSale();
    fireEvent.click(screen.getByRole("button", { name: /^Thêm Trà tắc,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển khoản" }));
    fireEvent.click(screen.getByRole("button", { name: /Tạo đơn & hiện QR/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Thanh toán đơn hàng",
    });
    const before = await demoRequest<Bootstrap>("/bootstrap");
    expect(before.products.find((p) => p.id === "demo-product-2")?.stock).toBe(
      64,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy đơn" }));
    expect(within(dialog).getByText("Hủy đơn này?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
    await screen.findByRole("dialog", { name: "Đơn hàng đã hủy" });
    expect(
      screen.queryByRole("button", { name: "Xác nhận đã nhận tiền" }),
    ).toBeNull();
    const cancelled = await demoRequest<Bootstrap>("/bootstrap");
    expect(cancelled.orders[0]).toMatchObject({
      id: before.orders[0].id,
      paymentStatus: "cancelled",
    });
    expect(
      cancelled.products.find((p) => p.id === "demo-product-2")?.stock,
    ).toBe(65);
  });

  it("keeps each seller cart separate and restores it when switching back", async () => {
    await openSale();
    fireEvent.click(
      screen.getByRole("button", { name: /^Thêm Trà đào cam sả,/ }),
    );
    const sellerSelect = screen.getByRole("combobox", {
      name: "Chọn gian hàng",
    });
    fireEvent.change(sellerSelect, { target: { value: "demo-seller-2" } });
    await screen.findByRole("button", { name: /^Thêm Xúc xích nướng,/ });
    expect(
      screen.queryByRole("button", { name: "Giảm Trà đào cam sả" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /^Thêm Xúc xích nướng,/ }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Chọn gian hàng" }), {
      target: { value: "demo-seller-1" },
    });
    await screen.findByRole("button", { name: "Giảm Trà đào cam sả" });
    expect(
      screen.queryByRole("button", { name: "Giảm Xúc xích nướng" }),
    ).toBeNull();
    const stored = await demoRequest<Bootstrap>("/bootstrap");
    expect(stored.orders).toHaveLength(8);
  });
});

describe("Managing a seller menu through the interface", () => {
  it("adds, edits and suspends a product in the selected seller without exposing it for sale", async () => {
    await openSale();
    fireEvent.change(screen.getByRole("combobox", { name: "Chọn gian hàng" }), {
      target: { value: "demo-seller-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Thực đơn" }));
    await screen.findByRole("heading", { name: "Thực đơn" });
    expect(screen.queryByText("Trà đào cam sả")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thêm món mới" }));
    const addDialog = await screen.findByRole("dialog", {
      name: "Thêm món ngon",
    });
    fireEvent.change(
      within(addDialog).getByRole("textbox", { name: "Tên món" }),
      { target: { value: "Bắp xào trại vui" } },
    );
    fireEvent.change(within(addDialog).getByLabelText(/Nhóm món/), {
      target: { value: "Ăn vặt" },
    });
    fireEvent.change(
      within(addDialog).getByRole("spinbutton", { name: "Giá bán (VND)" }),
      { target: { value: "18000" } },
    );
    fireEvent.change(
      within(addDialog).getByRole("spinbutton", { name: /Tồn kho/ }),
      { target: { value: "12" } },
    );
    fireEvent.click(within(addDialog).getByRole("button", { name: "Lưu món" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const addedRow = screen.getByRole("row", { name: /Bắp xào trại vui/ });
    expect(addedRow.textContent).toContain("18.000");
    fireEvent.click(within(addedRow).getByRole("button", { name: "Sửa" }));

    const editDialog = await screen.findByRole("dialog", {
      name: "Chỉnh sửa món",
    });
    fireEvent.change(
      within(editDialog).getByRole("textbox", { name: "Tên món" }),
      { target: { value: "Bắp xào phô mai" } },
    );
    fireEvent.change(
      within(editDialog).getByRole("spinbutton", { name: "Giá bán (VND)" }),
      { target: { value: "22000" } },
    );
    fireEvent.click(
      within(editDialog).getByRole("button", { name: "Lưu món" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const editedRow = screen.getByRole("row", { name: /Bắp xào phô mai/ });
    expect(editedRow.textContent).toContain("22.000");
    fireEvent.click(
      within(editedRow).getByRole("button", { name: "Đang bán" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /Bắp xào phô mai/ })).getByRole(
          "button",
          { name: "Tạm ngừng" },
        ),
      ).toBeTruthy(),
    );
    const stored = await demoRequest<Bootstrap>("/bootstrap");
    expect(
      stored.products.find((p) => p.name === "Bắp xào phô mai"),
    ).toMatchObject({
      sellerId: "demo-seller-2",
      price: 22000,
      stock: 12,
      active: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Bán hàng" }));
    await screen.findByRole("heading", { name: /Lên đơn, thêm niềm vui/ });
    expect(
      screen.queryByRole("button", { name: /^Thêm Bắp xào phô mai,/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Thêm Xúc xích nướng,/ }),
    ).toBeTruthy();
  });
});
