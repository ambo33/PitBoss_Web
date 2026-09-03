import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

type SocketDebugOptions = Partial<ManagerOptions & SocketOptions>;

type SocketRecord = {
  label: string;
  createdAt: string;
  connected: boolean;
  socketId: string | null;
  transport: string | null;
  reconnectAttempts: number;
  reconnects: number;
};

type SocketDebugSnapshot = {
  created: number;
  active: number;
  reconnectAttempts: number;
  reconnects: number;
  sockets: SocketRecord[];
};

type SocketDebugWindow = Window & {
  __PITBOSS_SOCKET_DEBUG__?: {
    snapshot: () => SocketDebugSnapshot;
  };
};

const isDevelopment = import.meta.env.DEV;
let created = 0;
let active = 0;
let reconnectAttempts = 0;
let reconnects = 0;
const sockets = new Map<number, SocketRecord>();

function snapshot(): SocketDebugSnapshot {
  return {
    created,
    active,
    reconnectAttempts,
    reconnects,
    sockets: Array.from(sockets.values()).map((socket) => ({ ...socket })),
  };
}

function log(event: string, details: Record<string, unknown>): void {
  if (!isDevelopment) return;
  console.info(`[SOCKET DEBUG] ${event}`, details);
}

if (isDevelopment && typeof window !== 'undefined') {
  (window as SocketDebugWindow).__PITBOSS_SOCKET_DEBUG__ = { snapshot };
}

export function createDebugSocket(label: string, options: SocketDebugOptions = {}): Socket {
  const socket = io('/', options);
  const connectionNumber = ++created;
  const record: SocketRecord = {
    label,
    createdAt: new Date().toISOString(),
    connected: false,
    socketId: null,
    transport: socket.io.engine?.transport.name ?? null,
    reconnectAttempts: 0,
    reconnects: 0,
  };
  sockets.set(connectionNumber, record);

  log('created', {
    connectionNumber,
    label,
    transport: record.transport,
    active,
  });

  const engine = socket.io.engine;
  engine?.on('upgrade', (transport) => {
    record.transport = transport.name;
    log('transport-upgraded', {
      connectionNumber,
      label,
      socketId: record.socketId,
      transport: transport.name,
    });
  });

  socket.on('connect', () => {
    if (!record.connected) {
      active += 1;
      record.connected = true;
    }
    record.socketId = socket.id ?? null;
    record.transport = socket.io.engine?.transport.name ?? record.transport;
    log('connected', {
      connectionNumber,
      label,
      socketId: record.socketId,
      transport: record.transport,
      active,
    });
  });

  socket.on('disconnect', (reason) => {
    if (record.connected) {
      active = Math.max(0, active - 1);
      record.connected = false;
    }
    log('disconnected', {
      connectionNumber,
      label,
      socketId: record.socketId,
      reason,
      active,
    });
  });

  socket.on('connect_error', (error) => {
    log('connect-error', {
      connectionNumber,
      label,
      message: error.message,
    });
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    reconnectAttempts += 1;
    record.reconnectAttempts += 1;
    log('reconnect-attempt', { connectionNumber, label, attempt });
  });
  socket.io.on('reconnect', (attempt) => {
    reconnects += 1;
    record.reconnects += 1;
    log('reconnected', { connectionNumber, label, attempt });
  });
  socket.io.on('reconnect_error', (error) => {
    log('reconnect-error', {
      connectionNumber,
      label,
      message: error.message,
    });
  });

  return socket;
}
