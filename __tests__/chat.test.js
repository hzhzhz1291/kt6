const { prisma } = require('./setup');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');
const { attachChat } = require('../src/chat');
const { issueAccess } = require('../src/utils/jwt');

let server;
let io;
const sockets = [];

beforeEach(async () => {
  server = createServer(createApp());
  io = attachChat(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
});

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
  await io.close();
});

function client(token) {
  const socket = connect('http://127.0.0.1:' + server.address().port, {
    auth: { token }, autoConnect: false, reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

function nextEvent(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handle);
      reject(new Error('Missing event ' + name));
    }, 2500);
    function handle(data) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(name, handle);
  });
}

async function join(socket) {
  const online = nextEvent(socket, 'users:online');
  socket.connect();
  return online;
}

test('rejects an invalid JWT on connection', async () => {
  const socket = client('invalid');
  const failure = nextEvent(socket, 'connect_error');
  socket.connect();
  await expect(failure).resolves.toMatchObject({ message: 'Valid access token required' });
});

test('handles presence, global messages and room messages with authenticated users', async () => {
  const alice = await prisma.user.create({ data: { email: 'alice@example.com', name: 'Alice' } });
  const bob = await prisma.user.create({ data: { email: 'bob@example.com', name: 'Bob' } });
  const socketA = client(issueAccess(alice.id));
  const socketB = client(issueAccess(bob.id));
  await join(socketA);
  const appeared = nextEvent(socketA, 'user:online');
  const list = await join(socketB);
  expect(list.map((user) => user.id)).toEqual([alice.id, bob.id]);
  await expect(appeared).resolves.toEqual({ id: bob.id, name: 'Bob' });

  const global = nextEvent(socketB, 'message:new');
  await expect(socketA.timeout(2500).emitWithAck('message:send', { text: 'Hello' })).resolves.toEqual({ ok: true });
  await expect(global).resolves.toMatchObject({ text: 'Hello', user: { id: alice.id } });

  const blocked = await socketA.timeout(2500).emitWithAck('room:message', { room: 'team', text: 'Private' });
  expect(blocked.ok).toBe(false);
  await socketA.timeout(2500).emitWithAck('room:join', { room: 'team' });
  await socketB.timeout(2500).emitWithAck('room:join', { room: 'team' });
  const inRoom = nextEvent(socketB, 'room:message');
  await socketA.timeout(2500).emitWithAck('room:message', { room: 'team', text: 'Private' });
  await expect(inRoom).resolves.toMatchObject({ room: 'team', text: 'Private', user: { id: alice.id } });
  await socketB.timeout(2500).emitWithAck('room:leave', { room: 'team' });
  const offline = nextEvent(socketA, 'user:offline');
  socketB.disconnect();
  await expect(offline).resolves.toEqual({ id: bob.id, name: 'Bob' });
});
