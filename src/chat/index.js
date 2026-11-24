const { Server } = require('socket.io');
const Joi = require('joi');
const { readAccessUser } = require('../middleware/auth');

const roomName = Joi.string().trim().pattern(/^[a-zA-Z0-9_-]{1,40}$/).required();
const text = Joi.string().trim().min(1).max(1000).required();
const roomSchema = Joi.object({ room: roomName }).required();
const messageSchema = Joi.object({ text }).required();
const roomMessageSchema = Joi.object({ room: roomName, text }).required();

function attachChat(server) {
  const io = new Server(server, { maxHttpBufferSize: 10 * 1024 });
  const online = new Map();

  io.use(async (socket, next) => {
    try {
      const { user, expiresAt } = await readAccessUser(socket.handshake.auth.token);
      socket.data.user = { id: user.id, name: user.name };
      socket.data.expiresAt = expiresAt;
      next();
    } catch {
      next(new Error('Valid access token required'));
    }
  });

  io.on('connection', (socket) => {
    const { user, expiresAt } = socket.data;
    const current = online.get(user.id);
    if (current) current.count += 1;
    else online.set(user.id, { user, count: 1 });

    socket.emit('users:online', Array.from(online.values(), (entry) => entry.user));
    if (!current) socket.broadcast.emit('user:online', user);

    const timer = setTimeout(() => socket.disconnect(true), Math.max(1, expiresAt - Date.now()));
    timer.unref();

    function handle(event, schema, action) {
      socket.on(event, async (input, respond) => {
        const ack = typeof respond === 'function' ? respond : () => {};
        if (Date.now() >= expiresAt) {
          ack({ ok: false, error: 'Access token expired' });
          socket.disconnect(true);
          return;
        }
        const { error, value } = schema.validate(input);
        if (error) return ack({ ok: false, error: error.message });

        try {
          const problem = await action(value);
          ack(problem ? { ok: false, error: problem } : { ok: true });
        } catch (error) {
          console.error(error);
          ack({ ok: false, error: 'Could not process chat event' });
        }
      });
    }

    function message(body) {
      return { ...body, user, createdAt: new Date().toISOString() };
    }

    handle('message:send', messageSchema, (body) => {
      io.emit('message:new', message(body));
    });
    handle('room:join', roomSchema, async ({ room }) => {
      if (!socket.rooms.has('chat:' + room) && socket.rooms.size >= 21) return 'Too many rooms';
      await socket.join('chat:' + room);
    });
    handle('room:leave', roomSchema, ({ room }) => socket.leave('chat:' + room));
    handle('room:message', roomMessageSchema, (body) => {
      const target = 'chat:' + body.room;
      if (!socket.rooms.has(target)) return 'Join the room before sending a message';
      io.to(target).emit('room:message', message(body));
    });

    socket.on('disconnect', () => {
      clearTimeout(timer);
      const entry = online.get(user.id);
      entry.count -= 1;
      if (entry.count === 0) {
        online.delete(user.id);
        socket.broadcast.emit('user:offline', user);
      }
    });
  });
  return io;
}

module.exports = { attachChat };
