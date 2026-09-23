// Standalone unit tests: all DB/service boundaries are mocked before import.
jest.mock('../../src/db', () => ({ models: { User: { findByPk: jest.fn() } } }));
jest.mock('../../src/utils/jwt', () => ({ verifyAccessToken: jest.fn() }));
jest.mock('../../src/services/organizationService', () => ({
  normalizeSlug: (v) => v, defaultSlug: () => 'a', bySlug: jest.fn(),
  byHostname: jest.fn(), assertMembership: jest.fn(), assertWorkspaceAvailable: jest.fn(),
}));
jest.mock('../../src/services/messagingService', () => ({
  markDelivered: jest.fn(), listConversations: jest.fn(), listMessages: jest.fn(),
  assertUserInConversation: jest.fn(), sendMessage: jest.fn(), markConversationRead: jest.fn(),
}));
jest.mock('socket.io', () => ({ Server: jest.fn() }));
const { Server } = require('socket.io');
const { models } = require('../../src/db');
const { verifyAccessToken } = require('../../src/utils/jwt');
const organizations = require('../../src/services/organizationService');
const messaging = require('../../src/services/messagingService');
const { getRequestContext, runWithRequestContext } = require('../../src/utils/auditContext');
const sockets = require('../../src/socket');
let auth, connect, io;
let clients;
function client(id, workspace) {
  const handlers = {};
  const socket = { id, handlers, rooms: new Set(), handshake: { auth: { token: 'token', workspace }, headers: {} },
    on: jest.fn((event, handler) => { handlers[event] = handler; }),
    join: jest.fn(room => socket.rooms.add(room)),
    leave: jest.fn(room => socket.rooms.delete(room)), emit: jest.fn(),
    disconnect: jest.fn(() => { socket.rooms.clear(); handlers.disconnect?.(); }),
  };
  clients.push(socket);
  return socket;
}
async function login(socket) {
  const next = jest.fn();
  await auth(socket, next);
  expect(next).toHaveBeenCalledWith();
  connect(socket);
  await Promise.resolve();
}
beforeEach(() => {
  jest.clearAllMocks();
  clients = [];
  io = { use: jest.fn(fn => { auth = fn; }), on: jest.fn((event, fn) => { connect = fn; }),
    to: jest.fn().mockReturnThis(), emit: jest.fn() };
  io.in = jest.fn(room => ({ disconnectSockets: (close) => {
    for (const socket of clients) if (socket.rooms.has(room)) socket.disconnect(close);
  } }));
  Server.mockImplementation(() => io);
  models.User.findByPk.mockResolvedValue({ id: 'shared-user', status: 'active', emailVerified: true });
  verifyAccessToken.mockReturnValue({ id: 'shared-user' });
  organizations.bySlug.mockImplementation(async slug => ({ id: slug, slug, status: 'active' }));
  organizations.assertMembership.mockResolvedValue({ status: 'active' });
  organizations.assertWorkspaceAvailable.mockResolvedValue(undefined);
  messaging.markDelivered.mockResolvedValue([]);
  sockets.initSocket({});
});
test('rejects temporary 2FA JWT before reading the user', async () => {
  verifyAccessToken.mockReturnValue({ id: 'shared-user', temp: true });
  const next = jest.fn();
  await auth(client('temp', 'a'), next);
  expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  expect(models.User.findByPk).not.toHaveBeenCalled();
});
test('rejects inactive membership and unavailable workspace', async () => {
  organizations.assertMembership.mockRejectedValueOnce(new Error('Forbidden'));
  const next = jest.fn();
  await auth(client('inactive', 'a'), next);
  expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  organizations.assertWorkspaceAvailable.mockRejectedValueOnce(new Error('Workspace unavailable'));
  await auth(client('suspended', 'a'), next);
  expect(next.mock.calls[1][0]).toBeInstanceOf(Error);
});
test('binds connection and concurrent async events to their authenticated tenants', async () => {
  const a = client('a1', 'a'), b = client('b1', 'b');
  const observed = [];
  messaging.markDelivered.mockImplementation(async () => { observed.push(getRequestContext().organizationId); return []; });
  await login(a); await login(b);
  expect(observed).toEqual(['a', 'b']);
  messaging.listConversations.mockImplementation(async () => {
    const before = getRequestContext().organizationId;
    await new Promise(resolve => setImmediate(resolve));
    expect(getRequestContext().organizationId).toBe(before);
    return [before];
  });
  const ackA = jest.fn(), ackB = jest.fn();
  await runWithRequestContext({ organizationId: 'wrong' }, () => Promise.all([
    a.handlers['conversation:list']({ organizationId: 'b' }, ackA),
    b.handlers['conversation:list']({}, ackB),
  ]));
  expect(ackA).toHaveBeenCalledWith({ ok: true, conversations: ['a'] });
  expect(ackB).toHaveBeenCalledWith({ ok: true, conversations: ['b'] });
  expect(getRequestContext()).toEqual({});
  await a.handlers.disconnect(); await b.handlers.disconnect();
});
test('scopes rooms, emissions and presence, and drops context-free worker emits', async () => {
  const a = client('presence', 'a'); await login(a);
  expect(a.join.mock.calls.flat()).toEqual(['organization:a:user:shared-user', 'organization:a']);
  await a.handlers['conversation:join']({ conversationId: 'c' }, jest.fn());
  expect(a.join).toHaveBeenCalledWith('organization:a:conversation:c');
  sockets.emitToUser('shared-user', 'unsafe', {});
  sockets.emitToConversation('c', 'unsafe', {});
  expect(io.to).not.toHaveBeenCalled();
  expect(sockets.isUserOnline('shared-user')).toBe(false);
  runWithRequestContext({ organizationId: 'b' }, () => expect(sockets.isUserOnline('shared-user')).toBe(false));
  runWithRequestContext({ organizationId: 'a' }, () => {
    expect(sockets.isUserOnline('shared-user')).toBe(true);
    sockets.emitToUser('shared-user', 'safe', {});
    sockets.emitToConversation('c', 'safe', {});
  });
  expect(io.to.mock.calls.flat()).toEqual(['organization:a:user:shared-user', 'organization:a:conversation:c']);
  await a.handlers.disconnect();
  runWithRequestContext({ organizationId: 'a' }, () => expect(sockets.isUserOnline('shared-user')).toBe(false));
});
test('revoked membership blocks later events and disconnects', async () => {
  const a = client('revoked', 'a'); await login(a);
  organizations.assertMembership.mockRejectedValueOnce(new Error('revoked'));
  const ack = jest.fn();
  await a.handlers['message:list']({ conversationId: 'c' }, ack);
  expect(messaging.listMessages).not.toHaveBeenCalled();
  expect(ack).toHaveBeenCalledWith({ ok: false, message: 'Unauthorized' });
  expect(a.disconnect).toHaveBeenCalledWith(true);
  await a.handlers.disconnect();
});

test('applies rollout availability gate before membership or connection', async () => {
  organizations.assertWorkspaceAvailable.mockRejectedValueOnce(new Error('Multi tenant disabled'));
  const next = jest.fn();
  await auth(client('gated', 'other'), next);
  expect(organizations.assertWorkspaceAvailable).toHaveBeenCalledWith({ id: 'other', slug: 'other', status: 'active' });
  expect(organizations.assertMembership).not.toHaveBeenCalled();
  expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
});

afterEach(() => {
  for (const socket of clients) socket.handlers.disconnect?.();
  jest.useRealTimers();
});
test('revocation removes every socket and private room only in the affected workspace', async () => {
  const a = client('a', 'a'), a2 = client('a2', 'a'), b = client('b', 'b');
  await login(a); await login(a2); await login(b);
  await a.handlers['conversation:join']({ conversationId: 'private' });
  sockets.disconnectWorkspaceUser('shared-user', 'a');
  expect(a.disconnect).toHaveBeenCalledWith(true);
  expect(a2.disconnect).toHaveBeenCalledWith(true);
  expect(a.rooms.size).toBe(0);
  expect(a2.rooms.size).toBe(0);
  expect(b.disconnect).not.toHaveBeenCalled();
  expect(b.rooms.has('organization:b:user:shared-user')).toBe(true);
  runWithRequestContext({ organizationId: 'a' }, () => expect(sockets.isUserOnline('shared-user')).toBe(false));
  await a.handlers['message:list']({ conversationId: 'private' }, jest.fn());
  expect(messaging.listMessages).not.toHaveBeenCalled();
});
test('idle membership validation revokes sockets in tenant context and clears its timer', async () => {
  jest.useFakeTimers();
  const a = client('idle', 'a'); await login(a);
  organizations.assertMembership.mockImplementation(async () => {
    expect(getRequestContext()).toMatchObject({ organizationId: 'a', userId: 'shared-user' });
    throw new Error('membership removed');
  });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(a.disconnect).toHaveBeenCalledWith(true);
  expect(a.rooms.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
test('does not execute an event after disconnection during its membership check', async () => {
  const a = client('race', 'a'); await login(a);
  let resolve;
  organizations.assertMembership.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = a.handlers['message:list']({ conversationId: 'private' }, jest.fn());
  sockets.disconnectWorkspaceUser('shared-user', 'a');
  resolve({ status: 'active' });
  await pending;
  expect(messaging.listMessages).not.toHaveBeenCalled();
});
