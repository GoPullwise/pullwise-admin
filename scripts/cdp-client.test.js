import { describe, expect, it } from "vitest";
import { createCdpClient } from "./cdp-client.mjs";

class FakeWebSocket {
  static OPEN = 1;

  static instance = null;

  constructor() {
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instance = this;
  }

  addEventListener(type, listener, options = {}) {
    const wrapped = options.once
      ? (event) => {
          this.listeners.set(
            type,
            (this.listeners.get(type) || []).filter((candidate) => candidate !== wrapped),
          );
          listener(event);
        }
      : listener;
    this.listeners.set(type, [...(this.listeners.get(type) || []), wrapped]);
  }

  emit(type, event = {}) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
    this.emit("close");
  }
}

describe("createCdpClient", () => {
  it("rejects an in-flight command when Chrome disconnects", async () => {
    const client = createCdpClient("ws://chrome.test/devtools/page/1", {
      WebSocketImpl: FakeWebSocket,
      commandTimeoutMs: 5_000,
    });
    FakeWebSocket.instance.emit("open");

    const command = client.send("Runtime.evaluate", { expression: "1 + 1" });
    FakeWebSocket.instance.emit("close");

    await expect(command).rejects.toThrow("connection closed");
  });

  it("bounds a command even when Chrome stays connected but never replies", async () => {
    const client = createCdpClient("ws://chrome.test/devtools/page/1", {
      WebSocketImpl: FakeWebSocket,
      commandTimeoutMs: 20,
    });
    FakeWebSocket.instance.emit("open");

    await expect(client.send("Runtime.evaluate", { expression: "1 + 1" })).rejects.toThrow(
      "timed out",
    );
  });
});
