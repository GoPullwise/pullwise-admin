import WebSocket from "ws";

const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

export function createCdpClient(
  url,
  { WebSocketImpl = WebSocket, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {},
) {
  const socket = new WebSocketImpl(url);
  const socketOpenState = WebSocketImpl.OPEN ?? 1;
  let nextId = 1;
  let terminalError = null;
  let openSettled = false;
  let rejectOpen;
  const pending = new Map();
  const listeners = new Map();

  const opened = new Promise((resolve, reject) => {
    rejectOpen = reject;
    socket.addEventListener(
      "open",
      () => {
        openSettled = true;
        resolve();
      },
      { once: true },
    );
  });

  const fail = (error) => {
    terminalError ||= error;
    if (!openSettled) {
      openSettled = true;
      rejectOpen(terminalError);
    }
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(terminalError);
    }
    pending.clear();
  };

  const openTimeoutId = setTimeout(
    () => fail(new Error("Chrome DevTools connection opening timed out.")),
    commandTimeoutMs,
  );
  opened.then(
    () => clearTimeout(openTimeoutId),
    () => clearTimeout(openTimeoutId),
  );

  socket.addEventListener("error", () => fail(new Error("Chrome DevTools connection failed.")));
  socket.addEventListener("close", () => fail(new Error("Chrome DevTools connection closed.")));
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      fail(new Error("Chrome DevTools returned an invalid message."));
      return;
    }
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timeoutId);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result || {});
      return;
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params || {});
  });

  return {
    opened,
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) || []), listener]);
    },
    async send(method, params = {}) {
      await opened;
      if (terminalError) throw terminalError;
      if (socket.readyState !== socketOpenState) {
        throw new Error("Chrome DevTools connection is not open.");
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome DevTools command ${method} timed out.`));
        }, commandTimeoutMs);
        pending.set(id, { resolve, reject, timeoutId });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          pending.delete(id);
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    },
    close() {
      fail(new Error("Chrome DevTools connection closed."));
      socket.close();
    },
  };
}
