const test = require('ava')
const especial = require('..')
const EspecialClient = require('../client')
const { createServer } = require('./helpers')
const WebSocket = require('ws')
const { nanoid } = require('nanoid')

test('should fail to register multiple handlers for route', async (t) => {
  const app = especial()
  app.handle('ping', () => {})
  try {
    app.handle('ping')
    t.fail('Should throw for duplicate handler')
  } catch (err) {
    t.pass()
  }
})

test('should fail to parse bad message', async (t) => {
  const { app, port, url } = await createServer()
  const ws = new WebSocket(url)
  await new Promise((rs) => {
    ws.onopen = () => {
      rs()
    }
  })
  const p = new Promise((rs) => {
    ws.onmessage = ({ data }) => {
      const payload = JSON.parse(data)
      t.assert(payload.status === 1)
      rs()
    }
  })
  ws.send('bad json')
  await p
})

test('should register and test middleware', async (t) => {
  t.plan(4)
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  app.handle('ping', (data, send) => {
    send('pong', {}, 0)
  })
  app.handle('test', (data, send) => {
    send({}, 0)
  })
  let pingReceived = false
  app.use(/^pi/, (_, __, next) => {
    if (pingReceived) {
      throw new Error('Duplicate ping middleware')
    }
    pingReceived = true
    t.pass()
    next()
  })
  let testReceived = false
  app.use('test', (_, __, next) => {
    if (testReceived) {
      throw new Error('Duplicate test middleware')
    }
    testReceived = true
    t.pass()
    next()
  })
  app.use((_, __, next) => {
    t.pass()
    next()
  })
  await client.send('ping')
  await client.send('test')
})

test('should send error if no handler for route', async (t) => {
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  try {
    await client.send('test')
    t.fail('Unhandled route should error')
  } catch (err) {
    t.pass()
  }
})

test('should fail to send unserializable data', async (t) => {
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  app.handle('test', (data, send) => {
    const _data = {}
    _data.d = _data
    send('message', _data)
  })
  try {
    await client.send('test')
    t.fail('Should receive serialization error')
  } catch (err) {
    t.pass()
  }
})

test('should send failure', async (t) => {
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  app.handle('test', (data, send) => {
    send(1)
  })
  try {
    await client.send('test')
    t.fail('Should receive error')
  } catch (err) {
    t.pass()
  }
})

test('should test parallel messages', async (t) => {
  const { app, port, url } = await createServer()
  app.handle('test', (data, send) => {
    const { id } = data
    send({ id })
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  const promises = []
  const COUNT = 100000
  t.plan(COUNT)
  const sendTest = async (i) => {
    const id = nanoid()
    const { data } = await client.send('test', { id })
    t.assert(data.id === id)
  }
  for (let x = 0; x < COUNT; x++) {
    promises.push(sendTest(x))
  }
  await Promise.all(promises)
})

test('should start server without callback', async (t) => {
  const { app, port } = await createServer(false)
  app.listen(port)
  t.pass()
})

test('should catch error in handler', async (t) => {
  const { app, port, url } = await createServer()
  app.handle('test', () => {
    throw new Error('Test error')
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  try {
    const { data, message, status } = await client.send('test')
    t.fail('Should receive non-0 status')
  } catch (err) {
    const { payload } = err
    t.assert(payload.message.startsWith('An uncaught error occurred'))
    t.assert(payload.status === 2)
  }
})

test('should register uncaught error handler', async (t) => {
  t.plan(6)
  const { app, port, url } = await createServer()
  const handlerError = new Error('Test error')
  app.handle('test', () => {
    throw handlerError
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  app.handleUncaughtError((err, data, send, ws) => {
    t.assert(err.toString() === handlerError.toString())
    t.assert(ws)
    t.assert(typeof send === 'function')
    t.assert(typeof data === 'object')
    send('Error handled')
  })
  const { data, message, status } = await client.send('test')
  t.assert(status === 0)
  t.assert(message === 'Error handled')
})
