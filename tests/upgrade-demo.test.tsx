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
  vi.stubGlobal("localStorage", new Storage());
  vi.stubGlobal("sessionStorage", new Storage());
  sessionStorage.setItem("traivui-demo", "1");
  history.replaceState(null, "", "/");
  resetDemo();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const bootstrap = () => demoRequest<Bootstrap>("/bootstrap");
const switchRole = (role: string) =>
  demoRequest("/demo/role", { method: "POST", body: { role } });
async function mixedTransfer() {
  await switchRole("cashier");
  return (
    await demoRequest<{ order: Bootstrap["orders"][number] }>("/orders", {
      method: "POST",
      body: {
        items: [
          { productId: "demo-cookie", quantity: 2 },
          { productId: "demo-handmade", quantity: 1 },
          { productId: "demo-product-1", quantity: 1 },
        ],
        paymentMethod: "transfer",
        idempotencyKey: crypto.randomUUID(),
        customerName: "Bàn 5",
        note: "Ít đá",
      },
    })
  ).order;
}
describe("cashier to payment to department acknowledgement", () => {
  it("keeps the second alert when opening details from two paid orders in one refresh", async () => {
    const create=async()=> (await demoRequest<{order:Bootstrap["orders"][number]}>("/orders",{method:"POST",body:{sellerId:"demo-seller-1",items:[{productId:"demo-product-1",quantity:1}],paymentMethod:"transfer",idempotencyKey:crypto.randomUUID()}})).order;
    const first=await create(),second=await create();
    render(<App/>);
    await screen.findByRole("button",{name:/^Thêm Trà đào cam sả,/});
    await demoRequest(`/orders/${first.id}/confirm`,{method:"POST",body:{}});
    await demoRequest(`/orders/${second.id}/confirm`,{method:"POST",body:{}});
    fireEvent.click(screen.getByRole("button",{name:"Làm mới dữ liệu"}));
    await screen.findByRole("button",{name:"Xem chi tiết / In phiếu"});
    fireEvent.click(screen.getByRole("button",{name:"Xem chi tiết / In phiếu"}));
    await screen.findByRole("dialog",{name:"Thanh toán hoàn tất"});
    expect(screen.getByRole("button",{name:"Xem chi tiết / In phiếu"})).toBeTruthy();
    expect(screen.getByText(first.code)).toBeTruthy();
  });
  it("normalizes admin catalog to a real stall after selecting the common basket", async () => {
    render(<App/>);
    await screen.findByRole("button",{name:/^Thêm Trà đào cam sả,/});
    fireEvent.change(screen.getByRole("combobox",{name:"Chọn gian hàng"}),{target:{value:"all"}});
    fireEvent.click(screen.getByRole("button",{name:"Thực đơn"}));
    const picker=screen.getByRole("combobox",{name:"Chọn gian hàng"}) as HTMLSelectElement;
    expect(picker.value).toBe("demo-seller-1");
    expect(screen.getByText("Trà đào cam sả")).toBeTruthy();
  });
  it("shows staff order details without prices or cashier payment actions", async () => {
    await switchRole("drinks");
    const data=await bootstrap();
    render(<App/>);
    await screen.findByRole("heading",{name:"Chuẩn bị & trao đổi"});
    fireEvent.click(screen.getByRole("button",{name:"Đơn hàng"}));
    fireEvent.click(await screen.findByRole("button",{name:`Xem đơn ${data.orders[0].code}`}));
    const dialog=await screen.findByRole("dialog",{name:"Chi tiết phần việc"});
    expect(within(dialog).queryByText(/Tổng thanh toán|Tiền khách đưa/)).toBeNull();
    expect(within(dialog).queryByRole("button",{name:/In phiếu|Xác nhận đã nhận tiền|Tiếp tục bán hàng/})).toBeNull();
    expect(within(dialog).getByRole("button",{name:"Mở bảng chuẩn bị"})).toBeTruthy();
  });
  it("dispatches a mixed order only after cashier confirmation and isolates each department", async () => {
    const order = await mixedTransfer();
    expect(order.total).toBe(85000);
    expect(order.sellerId).toBeNull();
    expect(
      (await bootstrap()).tasks?.filter((t) => t.orderId === order.id),
    ).toHaveLength(0);
    await expect(demoRequest(`/orders/${order.id}/simulate-payment`, {
      method: "POST",
      body: {},
    })).rejects.toThrow();
    expect((await bootstrap()).orders.find((entry) => entry.id === order.id)?.paymentStatus).toBe("pending");
    await demoRequest(`/orders/${order.id}/confirm`, {
      method: "POST",
      body: {},
    });
    expect(
      (await bootstrap()).tasks?.filter((t) => t.orderId === order.id),
    ).toHaveLength(3);
    await switchRole("drinks");
    const water = await bootstrap();
    expect(water.products).toEqual([]);
    expect(water.orders.find((o) => o.id === order.id)?.total).toBe(0);
    expect(
      water.tasks?.flatMap((t) => t.items).every((item) => item.price === 0),
    ).toBe(true);
    expect(
      water.orders
        .find((o) => o.id === order.id)
        ?.items.map((i) => i.productId),
    ).toEqual(["demo-product-1"]);
    const task = water.tasks!.find((t) => t.orderId === order.id)!;
    await demoRequest(`/preparation/${task.id}`, {
      method: "PATCH",
      body: { status: "preparing" },
    });
    await demoRequest(`/preparation/${task.id}`, {
      method: "PATCH",
      body: { status: "ready" },
    });
    await expect(
      demoRequest(`/preparation/${task.id}`, {
        method: "PATCH",
        body: { status: "delivered" },
      }),
    ).rejects.toThrow();
    await demoRequest(`/orders/${order.id}/messages`, {
      method: "POST",
      body: { department: "drinks", message: "Nước đã sẵn sàng ở bàn hậu cần" },
    });
    await switchRole("cashier");
    expect(
      (await bootstrap()).messages?.some(
        (m) => m.orderId === order.id && m.message.includes("sẵn sàng"),
      ),
    ).toBe(true);
    await demoRequest(`/preparation/${task.id}`, {
      method: "PATCH",
      body: { status: "delivered" },
    });
    await switchRole("sales");
    const sales = await bootstrap();
    expect(
      sales.orders
        .find((o) => o.id === order.id)
        ?.items.map((i) => i.department)
        .sort(),
    ).toEqual(["food", "handmade"]);
    expect(sales.messages?.some((m) => m.department === "drinks")).toBe(false);
    await expect(
      demoRequest("/orders", { method: "POST", body: {} }),
    ).rejects.toThrow();
  });
  it("lets cashier use one basket across stalls and displays exactly one total QR order", async () => {
    await switchRole("cashier");
    render(<App />);
    await screen.findByRole("button", { name: /^Thêm Trà đào cam sả,/ });
    expect(
      (
        screen.getByRole("combobox", {
          name: "Chọn gian hàng",
        }) as HTMLSelectElement
      ).value,
    ).toBe("all");
    fireEvent.click(
      screen.getByRole("button", { name: /^Thêm Trà đào cam sả,/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Thêm Bánh cookie,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển khoản" }));
    fireEvent.click(screen.getByRole("button", { name: /Tạo đơn & hiện QR/ }));
    const dialog = await screen.findByRole("dialog", { name: "Thanh toán đơn hàng" });
    const order = (await bootstrap()).orders[0];
    expect(order.total).toBe(40000);
    expect(order.items).toHaveLength(2);
    expect(order.paymentStatus).toBe("pending");
    expect((await bootstrap()).tasks?.filter((t) => t.orderId === order.id)).toHaveLength(0);
    expect(within(dialog).queryByRole("button", { name: /Mô phỏng VietQR/ })).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận đã nhận tiền" }),
    );
    expect(within(dialog).getByText("Bạn đã kiểm tra tiền vào ngân hàng?")).toBeTruthy();
    expect((await bootstrap()).orders[0].paymentStatus).toBe("pending");
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
    await waitFor(async () =>
      expect((await bootstrap()).orders[0].paymentSource).toBe("manual"),
    );
    expect(
      (await bootstrap()).tasks?.filter((t) => t.orderId === order.id),
    ).toHaveLength(2);
  });
  it("opens preparation for staff and hides cashier/admin navigation", async () => {
    await switchRole("drinks");
    render(<App />);
    await screen.findByRole("heading", { name: "Chuẩn bị & trao đổi" });
    expect(screen.queryByRole("button", { name: "Bán hàng" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cài đặt" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tài khoản & tiểu ban" }),
    ).toBeNull();
  });
});
