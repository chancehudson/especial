const test = require('ava')
const { createServer } = require('./helpers')
const EspecialClient = require('../client')
const WebSocket = require('ws')

test('should ping route', async (t) => {
  const { server, app, url } = await createServer()
  app.handle('ping', (data, send) => {
    send('pong')
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  const { message } = await client.send('ping')
  t.assert(message === 'pong')
  server.close()
})

test('should retry connecting to server', async (t) => {
  const { app, port, url } = await createServer(false)
  t.plan(2)
  const client = new EspecialClient(url, WebSocket)
  const connectedId = client.addConnectedHandler(() => {
    if (client.connected) {
      t.pass()
      client.clearConnectedHandler(connectedId)
      client.disconnect()
    }
  })
  const disconnectedId = client.addConnectedHandler(() => {
    if (!client.connected) {
      t.pass()
      client.clearConnectedHandler(disconnectedId)
    }
  })
  await client.connect()
  await new Promise(r => setTimeout(r, 2000))
  await new Promise((rs, rj) => app.listen(port, (err) => {
    if (err) rj(err)
    else rs()
  }))
  await new Promise(r => setTimeout(r, 2000))
})

test('should throw if no reconnection', async (t) => {
  const { app, port, url } = await createServer(false)
  const client = new EspecialClient(url, WebSocket)
  client.reconnect = false
  try {
    await client.connect()
    t.fail('Should throw error')
  } catch (err) {
    t.pass()
  }
})

test('should safely disconnect twice', async (t) => {
  const { app, port, url } = await createServer(false)
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  client.disconnect()
  client.disconnect()
  t.pass()
})

test('should fail to listen for unregistered event', async (t) => {
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  try {
    client.on('not_a_real_event', () => {})
    t.fail('Should have thrown error')
  } catch (err) {
    t.pass()
  }
})

test('should ping route once', async (t) => {
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  let messageReceived = false
  t.plan(3)
  client.once('newMessage', () => {
    if (messageReceived) {
      t.fail()
    } else {
      t.pass()
      messageReceived = true
    }
  })
  client.on('unhandledMessage', () => {
    t.pass()
  })
  app.broadcast('newMessage', 'pong')
  app.broadcast('newMessage', 'pong')
  app.broadcast('newMessage', 'pong')
  await new Promise(r => setTimeout(r, 3000))
})

test('should listen for event', async (t) => {
  t.plan(2)
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  client.on('unhandledMessage', () => {
    t.pass()
  })
  client.listen('newMessage', (err, { data, message, status }) => {
    t.assert(message === 'pong')
  })
  app.broadcast('newMessage', 'pong')
  await new Promise(r => setTimeout(r, 1000))
  client.clearListener('newMessage')
  app.broadcast('newMessage', {})
  await new Promise(r => setTimeout(r, 1000))
})

test('should fail to send if not connected', async (t) => {
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  try {
    await client.send('test')
    t.fail('should fail to send without connection')
  } catch (err) {
    t.pass()
  }
})

test('should throw uncaught exception if no listener', async (t) => {
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  app.broadcast('test', {})
  await new Promise(r => setTimeout(r, 500))
  t.pass()
})
