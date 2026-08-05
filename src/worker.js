const PROTOCOL = 9;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CABLE_BATCH = 64;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function cleanTag(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function cleanClient(message) {
  return {
    tag: cleanTag(message.tag),
    clientId: String(message.clientId || "").trim().toLowerCase(),
    romHash: String(message.romHash || "").trim().toLowerCase(),
    romSize: Number(message.romSize || 0),
    gameCode: String(message.gameCode || "").trim().toUpperCase(),
  };
}

function validateClient(message) {
  if (Number(message.protocol) !== PROTOCOL) {
    return "Este relay es SIO v9. Usa Gazapo Link SIO EXP en ambos telefonos.";
  }
  const client = cleanClient(message);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(client.tag)) return "Tag-name invalido.";
  if (!/^[0-9a-f-]{32,40}$/.test(client.clientId)) return "Identidad de dispositivo invalida.";
  if (!/^[0-9a-f]{40}$/.test(client.romHash) || client.romSize <= 0) {
    return "Selecciona una ROM antes de entrar al modo online.";
  }
  return "";
}

function attachment(socket) {
  return socket.deserializeAttachment() || {
    roomCode: "",
    playerId: -1,
    tag: "",
    clientId: "",
    romHash: "",
    romSize: 0,
    gameCode: "",
    cableReady: false,
  };
}

function saveAttachment(socket, value) {
  socket.serializeAttachment(value);
}

export default {
  async fetch(request, env) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({
        ok: true,
        service: "gazapo-link-relay-sio-exp",
        protocol: PROTOCOL,
        architecture: "one-core-per-device",
      });
    }
    const id = env.RELAY.idFromName("global-relay-sio-v9");
    return env.RELAY.get(id).fetch(request);
  },
};

export class RelayRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ ok: false, message: "WebSocket requerido." }, 426);
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    saveAttachment(server, attachment(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, rawMessage) {
    let message;
    try {
      message = JSON.parse(typeof rawMessage === "string"
        ? rawMessage
        : new TextDecoder().decode(rawMessage));
    } catch {
      return this.send(socket, { type: "error", message: "Mensaje JSON invalido." });
    }

    switch (message.type) {
      case "create":
        return this.createRoom(socket, message);
      case "join":
        return this.joinRoom(socket, message);
      case "cable_ready":
        return this.cableReady(socket);
      case "cable_batch":
        return this.forwardCableBatch(socket, message);
      case "ping":
        return this.send(socket, {
          type: "pong",
          sentAt: Number.isSafeInteger(message.sentAt) ? message.sentAt : -1,
          now: Date.now(),
        });
      default:
        return this.send(socket, {
          type: "error",
          message: "Mensaje no admitido por el relay SIO v9.",
        });
    }
  }

  webSocketClose(socket) {
    this.leave(socket);
  }

  webSocketError(socket) {
    this.leave(socket);
  }

  socketsInRoom(code) {
    return this.state.getWebSockets()
      .filter((socket) => attachment(socket).roomCode === code);
  }

  peerFor(socket) {
    const current = attachment(socket);
    if (!current.roomCode) return null;
    return this.socketsInRoom(current.roomCode)
      .find((candidate) => attachment(candidate).playerId !== current.playerId) || null;
  }

  roomCode() {
    const occupied = new Set(
      this.state.getWebSockets().map((socket) => attachment(socket).roomCode).filter(Boolean)
    );
    do {
      const random = new Uint32Array(6);
      crypto.getRandomValues(random);
      let code = "";
      for (const value of random) code += ALPHABET[value % ALPHABET.length];
      if (!occupied.has(code)) return code;
    } while (true);
  }

  createRoom(socket, message) {
    const error = validateClient(message);
    if (error) return this.send(socket, { type: "error", message: error });
    this.leave(socket);
    const code = this.roomCode();
    const client = cleanClient(message);
    saveAttachment(socket, {
      ...attachment(socket),
      ...client,
      roomCode: code,
      playerId: 0,
      cableReady: false,
    });
    this.send(socket, { type: "room", code, playerId: 0, tag: client.tag });
  }

  joinRoom(socket, message) {
    const error = validateClient(message);
    if (error) return this.send(socket, { type: "error", message: error });
    const code = String(message.code || "").trim().toUpperCase();
    const members = this.socketsInRoom(code);
    const hostSocket = members.find((member) => attachment(member).playerId === 0);
    if (!hostSocket) return this.send(socket, { type: "error", message: "La sala no existe." });
    if (members.some((member) => attachment(member).playerId === 1)) {
      return this.send(socket, { type: "error", message: "La sala esta llena." });
    }

    const host = attachment(hostSocket);
    const guest = cleanClient(message);
    if (host.tag.toLowerCase() === guest.tag.toLowerCase()) {
      return this.send(socket, { type: "error", message: "Los jugadores necesitan tags distintos." });
    }
    if (host.romHash !== guest.romHash || host.romSize !== guest.romSize) {
      return this.send(socket, { type: "error", message: "La ROM no coincide con la del creador." });
    }

    this.leave(socket);
    saveAttachment(hostSocket, { ...host, cableReady: false });
    saveAttachment(socket, {
      ...attachment(socket),
      ...guest,
      roomCode: code,
      playerId: 1,
      cableReady: false,
    });
    this.send(socket, { type: "joined", code, playerId: 1, tag: guest.tag });
    this.send(hostSocket, { type: "session_ready", playerId: 0, peerTag: guest.tag });
    this.send(socket, { type: "session_ready", playerId: 1, peerTag: host.tag });
  }

  cableReady(socket) {
    const current = attachment(socket);
    const peer = this.peerFor(socket);
    if (!current.roomCode || !peer) return;
    saveAttachment(socket, { ...current, cableReady: true });
    const peerState = attachment(peer);
    if (!peerState.cableReady) return;
    for (const member of this.socketsInRoom(current.roomCode)) {
      this.send(member, { type: "cable_start", protocol: PROTOCOL });
    }
  }

  forwardCableBatch(socket, message) {
    const current = attachment(socket);
    const peer = this.peerFor(socket);
    if (!current.roomCode || !current.cableReady || !peer || !attachment(peer).cableReady) return;
    if (!Array.isArray(message.packets)
        || message.packets.length < 1 || message.packets.length > MAX_CABLE_BATCH) return;

    const packets = [];
    for (const packet of message.packets) {
      if (!Array.isArray(packet) || packet.length !== 4) return;
      const [seq, ignoredPlayerId, data, flags] = packet;
      if (!Number.isInteger(seq) || seq === 0 || !Number.isInteger(ignoredPlayerId)
          || !Number.isInteger(data) || !Number.isInteger(flags)
          || flags <= 0 || flags > 0x1ff) return;
      packets.push([seq, current.playerId, data, flags]);
    }
    this.send(peer, { type: "cable_batch", packets });
  }

  leave(socket) {
    const current = attachment(socket);
    if (!current.roomCode) return;
    const peer = this.peerFor(socket);
    if (peer) this.send(peer, { type: "peer_left", tag: current.tag });
    saveAttachment(socket, {
      ...current,
      roomCode: "",
      playerId: -1,
      cableReady: false,
    });
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.leave(socket);
    }
  }
}
