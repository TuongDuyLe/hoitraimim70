import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistDraft,
  restoreDraft,
  type Draft,
  type OrderSubmission,
} from "../src/cart";

const requestKey = "6db36e35-2973-4b51-b058-de9ce531c048";

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    items: { "product-1": 2, "product-2": 1 },
    customerName: "Nhóm Sao Mai",
    note: "Giao tại bàn 3",
    key: requestKey,
    method: "cash",
    cash: "100000",
    ...overrides,
  };
}

function submission(overrides: Partial<OrderSubmission> = {}): OrderSubmission {
  return {
    sellerId: "seller-1",
    customerName: "Nhóm Sao Mai",
    note: "Giao tại bàn 3",
    paymentMethod: "cash",
    items: [
      { productId: "product-1", quantity: 2 },
      { productId: "product-2", quantity: 1 },
    ],
    idempotencyKey: requestKey,
    cashReceived: 100000,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Recovering an order with an uncertain server response", () => {
  it("restores the exact cash request and key after a committed request loses its response", () => {
    const attempted = submission();
    const original = draft({ submission: attempted });
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    expect(persistDraft("live-cart-seller-1", original)).toBe(true);
    // The browser closes after sending this persisted payload, before knowing whether the server committed it.
    const restored = restoreDraft(storage.get("live-cart-seller-1")!);
    expect(restored.key).toBe(requestKey);
    expect(restored.method).toBe("cash");
    expect(restored.cash).toBe("100000");
    expect(restored.submission).toEqual(attempted);
    expect(restored.submission?.cashReceived).toBe(100000);
    expect(restored.submission?.idempotencyKey).toBe(restored.key);
    expect(restored.submission).not.toBe(attempted);
  });

  it("keeps an uncertain transfer request as transfer on reload without adding cash fields", () => {
    const attempted = submission({ paymentMethod: "transfer" });
    delete attempted.cashReceived;
    const original = draft({
      method: "transfer",
      cash: "",
      submission: attempted,
    });
    const restored = restoreDraft(JSON.stringify(original));
    expect(restored.method).toBe("transfer");
    expect(restored.cash).toBe("");
    expect(restored.submission).toEqual(attempted);
    expect(restored.submission).not.toHaveProperty("cashReceived");
    expect(restored.key).toBe(requestKey);
  });
});

describe("Corrupt or malformed saved carts", () => {
  it.each([
    null,
    [],
    "broken",
    { "product-1": 0 },
    { "product-1": 1000 },
    { "product-1": 1.5 },
    { "product-1": "2" },
  ])("discards unsafe saved items %j", (items) => {
    const restored = restoreDraft(JSON.stringify({ ...draft(), items }));
    expect(restored.items).toEqual({});
    expect(restored.key).not.toBe(requestKey);
    expect(restored.submission).toBeUndefined();
  });

  it.each([
    { idempotencyKey: "different-valid-request-key" },
    { sellerId: 42 },
    { customerName: null },
    { note: [] },
    { paymentMethod: "card" },
    { items: [] },
    { items: [{ productId: null, quantity: 1 }] },
    { items: [{ productId: "product-1", quantity: 1000 }] },
    { cashReceived: "100000" },
    { cashReceived: -1 },
  ])(
    "rejects a malformed pending payload %j instead of sending it on retry",
    (invalid) => {
      const restored = restoreDraft(
        JSON.stringify(
          draft({
            submission: { ...submission(), ...invalid } as OrderSubmission,
          }),
        ),
      );
      expect(restored.items).toEqual({});
      expect(restored.submission).toBeUndefined();
      expect(restored.key).not.toBe(requestKey);
    },
  );

  it("recovers from malformed JSON without breaking the sale screen", () => {
    const restored = restoreDraft('{"items":');
    expect(restored.items).toEqual({});
    expect(restored.key).toMatch(/^[a-zA-Z0-9_-]{16,100}$/);
  });
});

describe("Safe cart persistence", () => {
  it("reports storage rejection without throwing", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    expect(() => persistDraft("live-cart-seller-1", draft())).not.toThrow();
    expect(persistDraft("live-cart-seller-1", draft())).toBe(false);
  });

  it("reports quota exhaustion without throwing or modifying the attempted payload", () => {
    const saved = draft({ submission: submission() });
    const before = JSON.stringify(saved);
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("Quota full", "QuotaExceededError");
      },
    });
    expect(persistDraft("live-cart-seller-1", saved)).toBe(false);
    expect(JSON.stringify(saved)).toBe(before);
  });
});
