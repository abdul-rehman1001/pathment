const { Server } = require('socket.io');
const messagingService = require('../services/messagingService');
const { verifyAccessToken } = require('../utils/jwt');
const { models } = require('../db');
const organizationService = require('../services/organizationService');
const { runWithRequestContext, getRequestContext } = require('../utils/auditContext');

let io = null;
const userSockets = new Map();

function getCorsOrigins() {
  const patterns = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = patterns.some((pattern) => {
      if (pattern.includes('*')) {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '[^.]+');
        return new RegExp('^' + escaped + '$').test(origin);
      }
      return pattern === origin;
    });
    callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
  };
}

async function socketAuthMiddleware(socket, next) {
  try {
    const tokenFromAuth = socket.handshake.auth?.token;
    const header = socket.handshake.headers?.authorization;
    const tokenFromHeader = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = tokenFromAuth || tokenFromHeader;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    if (decoded.temp) return next(new Error('Unauthorized'));
    const user = await models.User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'emailVerified']
    });

    if (!user || user.status !== 'active' || !user.emailVerified) {
      return next(new Error('Unauthorized'));
    }

    const requestedSlug = organizationService.normalizeSlug(socket.handshake.auth?.workspace);
    let organization = requestedSlug ? await organizationService.bySlug(requestedSlug) : null;
    if (requestedSlug && !organization) return next(new Error('Workspace not found'));
    if (!organization) {
      try {
        const hostname = new URL(socket.handshake.headers?.origin || '').hostname;
        organization = await organizationService.byHostname(hostname);
      } catch { /* use the default workspace below */ }
    }
    if (!organization) organization = await organizationService.bySlug(organizationService.defaultSlug());
    if (!organization) return next(new Error('Workspace not found'));
    await organizationService.assertWorkspaceAvailable(organization);
    await organizationService.assertMembership(user.id, organization.id);

    socket.user = user;
    socket.organizationId = organization.id;
    socket.requestContext = Object.freeze({ organizationId: organization.id, organizationSlug: organization.slug, userId: user.id });
    next();
  } catch (error) {
    next(new Error('Unauthorized'));
  }
}

function trackSocket(userId, socketId) {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
}

function untrackSocket(userId, socketId) {
  const sockets = userSockets.get(userId);
  if (!sockets) {
    return;
  }
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

// Uses the adapter so a shared adapter can revoke sockets on every process.
function disconnectWorkspaceUser(userId, organizationId) {
  if (!io || !userId || !organizationId) return;
  const room = `organization:${organizationId}:user:${userId}`;
  userSockets.delete(room);
  io.in(room).disconnectSockets(true);
}

function emitToUser(userId, event, payload) {
  if (!io) {
    return;
  }
  const organizationId = getRequestContext().organizationId;
  if (!organizationId) return; // Context-free workers must not broadcast across workspaces.
  io.to(`organization:${organizationId}:user:${userId}`).emit(event, payload);
}

function emitToConversation(conversationId, event, payload) {
  if (!io) {
    return;
  }
  const organizationId = getRequestContext().organizationId;
  if (!organizationId) return;
  io.to(`organization:${organizationId}:conversation:${conversationId}`).emit(event, payload);
}

function isUserOnline(userId) {
  const organizationId = getRequestContext().organizationId;
  if (!organizationId) return false;
  const sockets = userSockets.get(`organization:${organizationId}:user:${userId}`);
  return Boolean(sockets && sockets.size > 0);
}

function getIO() {
  return io;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: getCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => runWithRequestContext({ ...socket.requestContext }, () => {
    const userId = socket.user.id;
    const presenceKey = `organization:${socket.organizationId}:user:${userId}`;
    trackSocket(presenceKey, socket.id);

    let disconnected = false;
    let validating = false;
    const validationTimer = setInterval(() => {
      if (disconnected || validating) return;
      validating = true;
      runWithRequestContext({ ...socket.requestContext }, async () => {
        try {
          await organizationService.assertMembership(userId, socket.organizationId);
        } catch {
          disconnectWorkspaceUser(userId, socket.organizationId);
        } finally {
          validating = false;
        }
      });
    }, 60_000);
    validationTimer.unref?.();

    // EventEmitter registration does not retain AsyncLocalStorage context.
    // Re-enter a fresh, authenticated context for every packet and its async work.
    const on = (event, handler) => socket.on(event, (...args) =>
      runWithRequestContext({ ...socket.requestContext }, async () => {
        if (event !== 'disconnect') {
          if (disconnected) return;
          try {
            await organizationService.assertMembership(userId, socket.organizationId);
          } catch {
            const ack = args[args.length - 1];
            if (typeof ack === 'function') ack({ ok: false, message: 'Unauthorized' });
            disconnectWorkspaceUser(userId, socket.organizationId);
            return;
          }
        }
        if (event !== 'disconnect' && disconnected) return;
        return handler(...args);
      }));

    socket.join(`organization:${socket.organizationId}:user:${userId}`);
    socket.join(`organization:${socket.organizationId}`);

    socket.emit('socket:ready', {
      userId,
      socketId: socket.id,
      organizationId: socket.organizationId,
    });

    // This user is now online → mark messages addressed to them as delivered
    // and tell each sender so their ticks flip from sent (✓) to delivered (✓✓).
    messagingService.markDelivered(userId).then((delivered) => {
      if (!delivered.length) return;
      const bySender = new Map();
      delivered.forEach((d) => {
        if (!bySender.has(d.senderId)) bySender.set(d.senderId, []);
        bySender.get(d.senderId).push(d);
      });
      for (const [senderId, items] of bySender) {
        emitToUser(senderId, 'message:delivered', {
          messageIds: items.map((i) => i.id),
          conversationIds: [...new Set(items.map((i) => i.conversationId))]
        });
      }
    }).catch((err) => console.error('[Socket] markDelivered failed:', err.message));

    on('conversation:join', async ({ conversationId }, ack) => {
      try {
        await messagingService.assertUserInConversation(userId, conversationId);
        socket.join(`organization:${socket.organizationId}:conversation:${conversationId}`);
        if (typeof ack === 'function') {
          ack({ ok: true });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    on('conversation:leave', ({ conversationId }, ack) => {
      socket.leave(`organization:${socket.organizationId}:conversation:${conversationId}`);
      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

    on('conversation:list', async (payload = {}, ack) => {
      try {
        const conversations = await messagingService.listConversations(userId, payload);
        if (typeof ack === 'function') {
          ack({ ok: true, conversations });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    on('message:list', async (payload = {}, ack) => {
      try {
        const messages = await messagingService.listMessages(userId, payload.conversationId, payload);
        if (typeof ack === 'function') {
          ack({ ok: true, messages });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    on('message:send', async (payload, ack) => {
      try {
        const result = await messagingService.sendMessage(userId, payload);

        const msgPayload = { conversationId: result.conversationId, message: result.message };
        emitToConversation(result.conversationId, 'message:new', msgPayload);

        result.recipientIds.forEach((recipientId) => {
          // Direct delivery via user room — guaranteed even if recipient hasn't joined the conversation room
          emitToUser(recipientId, 'message:new', msgPayload);

          const notification = result.notifications?.find((item) => item.userId === recipientId);
          if (!notification) return;

          emitToUser(recipientId, 'notification:new', {
            id: notification.id,
            type: notification.type,
            audience: notification.audience || 'any',
            title: notification.title,
            message: notification.message,
            status: notification.status,
            actionUrl: notification.actionUrl,
            actionLabel: notification.actionLabel,
            relatedEntityType: notification.relatedEntityType,
            relatedEntityId: notification.relatedEntityId,
            createdAt: notification.createdAt,
            conversationId: result.conversationId
          });
        });

        if (typeof ack === 'function') {
          ack({ ok: true, message: result.message });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    on('conversation:read', async ({ conversationId }, ack) => {
      try {
        const result = await messagingService.markConversationRead(userId, conversationId);

        emitToConversation(conversationId, 'conversation:read', {
          conversationId,
          userId,
          updatedCount: result.updatedCount
        });

        // Signal the reading user's navigation badge to refresh its unread count.
        emitToUser(userId, 'message:unread-count', {});

        if (typeof ack === 'function') {
          ack({ ok: true, updatedCount: result.updatedCount });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message });
        }
      }
    });

    on('disconnect', () => {
      disconnected = true;
      clearInterval(validationTimer);
      untrackSocket(presenceKey, socket.id);
    });
  }));

  return io;
}

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToConversation,
  isUserOnline,
  disconnectWorkspaceUser
};
