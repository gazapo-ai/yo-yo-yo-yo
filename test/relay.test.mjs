import assert from "node:assert/strict";
import { RelayRoom } from "../src/worker.js";

class Socket {
  constructor() {
    this.attachment = {};
    this.messages = [];
  }

  serializeAttachment(value) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment() {
    return structuredClone(this.attachment);
  }

  send(value) {
    this.messages.push(JSON.parse(value));
  }
}

class State {
  constructor(sockets) {
    this.sockets = sockets;
  }

  getWebSockets() {
    return this.sockets;
  }
}

const host = new Socket();
const guest = new Socket();
const room = new RelayRoom(new State([host, guest]));
const client = {
  protocol: 9,
  clientId: "12345678-1234-1234-1234-123456789abc",
  romHash: "a".repeat(40),
  romSize: 1024,
  gameCode: "TEST",
};

room.webSocketMessage(host, JSON.stringify({ type: "create", ...client, tag: "Host_1" }));
const code = host.messages.at(-1).code;
assert.match(code, /^[A-Z2-9]{6}$/);

room.webSocketMessage(guest, JSON.stringify({
  type: "join",
  ...client,
  clientId: "abcdefab-1234-1234-1234-123456789abc",
  tag: "Guest_2",
  code,
}));
assert.equal(host.messages.at(-1).type, "session_ready");
assert.equal(guest.messages.at(-1).type, "session_ready");

room.webSocketMessage(host, JSON.stringify({ type: "cable_ready" }));
assert.equal(host.messages.some((message) => message.type === "cable_start"), false);
room.webSocketMessage(guest, JSON.stringify({ type: "cable_ready" }));
assert.equal(host.messages.some((message) => message.type === "cable_start"), true);
assert.equal(guest.messages.some((message) => message.type === "cable_start"), true);

room.webSocketMessage(host, JSON.stringify({
  type: "cable_batch",
  packets: [[1, 99, 0x1234, 4], [2, 99, 2, 8]],
}));
const forwarded = guest.messages.find((message) => message.type === "cable_batch");
assert.deepEqual(forwarded.packets, [[1, 0, 0x1234, 4], [2, 0, 2, 8]]);

console.log("relay SIO v9: room, readiness and cable forwarding OK");
