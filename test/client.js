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

test('should abort if next is not called (middleware)', async (t) => {
  const { server, app, url } = await createServer()
  const middleware = (data, send, next) => send('aborted')
  app.use('ping', middleware)
  app.handle('ping', (data, send) => {
    t.assert(false, 'Should not execute handler after next is not called')
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  const { message } = await client.send('ping')
  t.assert(message === 'aborted')
  server.close()
})

test('should abort if next is not called (handler)', async (t) => {
  const { server, app, url } = await createServer()
  const middleware = (data, send, next) => send('aborted')
  app.handle('ping', middleware, (data, send) => {
    t.assert(false, 'Should not execute handler after next is not called')
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  const { message } = await client.send('ping')
  t.assert(message === 'aborted')
  server.close()
})

test('should not abort if next is called (handler)', async (t) => {
  const { server, app, url } = await createServer()
  const middleware = (data, send, next) => next()
  app.handle('ping', middleware, (data, send) => {
    send('pong')
  })
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  const { message } = await client.send('ping')
  t.assert(message === 'pong')
  server.close()
})

test('should not abort if next is called (middleware)', async (t) => {
  const { server, app, url } = await createServer()
  const middleware = (data, send, next) => next()
  app.use('ping', middleware)
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
  const connectPromise = client.connect({
    retries: 5,
    retryWait: 1000,
  })
  await new Promise(r => setTimeout(r, 3000))
  await new Promise((rs, rj) => app.listen(port, (err) => {
    if (err) rj(err)
    else rs()
  }))
  await new Promise(r => setTimeout(r, 2000))
  await connectPromise
})

test('should throw if no reconnection', async (t) => {
  const { app, port, url } = await createServer(false)
  const client = new EspecialClient(url, WebSocket)
  try {
    await client.connect()
    t.fail('Should throw error')
  } catch (err) {
    t.pass()
  }
})

test('should only accept object in connect function', async (t) => {
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  try {
    await client.connect(0)
  } catch (err) {
    t.assert(err.toString() === 'Error: Connect options should be object')
  }
  try {
    await client.connect('test')
  } catch (err) {
    t.assert(err.toString() === 'Error: Connect options should be object')
  }
})

test('should attempt reconnect if disconnected', async (t) => {
  t.plan(1)
  const { server, app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  client.addConnectedHandler(() => {
    if (client.connected) {
      t.pass()
    }
  })
  await new Promise(r => server.close(r))
  await new Promise(r => setTimeout(r, 3000))
  await new Promise((rs, rj) => app.listen(port, (err) => err ? rj(err) : rs()))
  await new Promise(r => setTimeout(r, 5000))
})

test('should retry connections using correct timing', async (t) => {
  t.plan(4)
  const { server, app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  {
    const p = client.connect({
      retries: 10,
      retryWait: 3000,
      reconnect: true,
    })
    // first connect attempt should be instant
    await new Promise(r => {
      setTimeout(() => {
        t.assert(client.connected, 'client is not immediately connected')
        r()
      }, 100)
    })
    await p
  }
  await new Promise(r => server.close(r))
  let newServer
  {
    // reconnect attempts should begin immediately
    await new Promise((r) => {
      newServer = app.listen(port, r)
    })
    await new Promise(r => setTimeout(() => {
      t.assert(client.connected, 'client did not immediately reconnect')
      r()
    }, 100))
  }
  await new Promise(r => newServer.close(r))
  {
    // wait for the first attempt
    await new Promise(r => setTimeout(r, 100))
    // now make sure the client waits an appropriate amount of time before retry
    await new Promise((r) => {
      newServer = app.listen(port, r)
    })
    // we're listening again, wait 2.5 seconds, client should not be connected
    await new Promise(r => setTimeout(() => {
      t.assert(!client.connected, 'client should not have reconnected yet')
      r()
    }, 2500))
    await new Promise(r => setTimeout(() => {
      t.assert(client.connected, 'client should have reconnected')
      r()
    }, 500))
  }
})

test('should safely disconnect twice', async (t) => {
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  await client.connect()
  client.disconnect()
  client.disconnect()
  await new Promise(r => setTimeout(r, 1000))
  client.disconnect()
  client.disconnect()
  t.pass()
})

test('should not double connect', async (t) => {
  t.plan(1)
  const { app, port, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  client.addConnectedHandler(() => {
    t.pass()
  })
  await client.connect()
  await client.connect()
})

test('connect should accept reconnect option', async (t) => {
  const { app, port, url } = await createServer(false)
  const client = new EspecialClient(url, WebSocket)
  setTimeout(() => {
    app.listen(port)
  }, 2000)
  try {
    await client.connect({
      reconnect: false,
    })
    t.fail()
  } catch (err) {
    t.pass()
  }
  await new Promise(r => setTimeout(r, 3000))
})

test('connect should accept retry options', async (t) => {
  t.plan(1)
  const { app, port, url } = await createServer(false)
  const client = new EspecialClient(url, WebSocket)
  let server
  setTimeout(() => {
    server = app.listen(port)
  }, 2000)
  // wait for 2 retries, then start server
  await Promise.all([
    client.connect({
      retryWait: 1000,
      retries: 3,
    }),
    new Promise(r => setTimeout(r, 2000))
  ])
  // kill the server and wait for 2 more retries to make sure retryCount reset
  await new Promise(r => server.close(r))
  client.addConnectedHandler(() => {
    if (client.connected) {
      t.pass()
    }
  })
  setTimeout(() => {
    app.listen(port)
  }, 2000)
  await new Promise(r => setTimeout(r, 3000))
})

test('should cancel connection retry', async (t) => {
  const { app, port, url } = await createServer(false)
  const client = new EspecialClient(url, WebSocket)
  const p = client.connect({
    retryWait: 1000,
    retries: 5,
  })
  await new Promise(r => setTimeout(r, 2000))
  client.disconnect()
  try {
    await Promise.race([
      p,
      new Promise(r => setTimeout(r, 1))
    ])
    t.fail('Connection should have been cancelled')
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
  client.listen('unhandledMessage', () => {
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
  client.listen('unhandledMessage', () => {
    t.pass()
  })
  const listenerId = client.listen('newMessage', ({ data, message, status }) => {
    t.assert(message === 'pong')
  })
  app.broadcast('newMessage', 'pong')
  await new Promise(r => setTimeout(r, 1000))
  client.clearListener('newMessage', listenerId)
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

test('should catch error thrown in connection handler', async (t) => {
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  client.addConnectedHandler(() => {
    throw new Error('This error is expected, do not worry')
  })
  try {
    await client.connect()
    t.pass()
  } catch (err) {
    t.fail('Error should have been caught')
  }
})

test('should call route handler if duplicate listener registered', async (t) => {
  const { server, app, url } = await createServer()
  const client = new EspecialClient(url, WebSocket)
  app.handle('test', (data, send) => {
    setTimeout(() => {
      send()
    }, 1000)
  })
  await client.connect()
  const p = client.send('test', {})
  const _rid = Object.keys(client._ridListeners)[0]
  client.listen(_rid, () => {
    t.fail('Should not execute listener')
  })
  const failTimer = setTimeout(() => {
    t.fail('_rid handler was not executed')
  }, 1200)
  await p
  clearInterval(failTimer)
  t.pass()
})
