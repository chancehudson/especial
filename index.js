const WebSocket = require('ws')

class Especial {
  constructor() {
    this.connections = []
    this.handlers = {}
    this.middlewares = []
  }

  broadcast(_rid, _message, _data) {
    let message = _message
    let data = _data
    if (typeof _message === 'object') {
      data = _message
      message = ''
    }
    const payload = {
      _rid,
      message,
      data,
      status: 0,
    }
    for (const ws of this.connections) {
      this._serializeSend(payload, ws)
    }
  }

  use(_match, _fn) {
    let fn = _fn
    let match = _match
    if (typeof match === 'function') {
      fn = _match
      match = null
    }
    this.middlewares.push({ fn, match })
  }

  handle(route, ...handlers) {
    if (this.handlers[route]) {
      throw new Error(`Duplicate handler for route "${route}"`)
    }
    this.handlers[route] = handlers
  }

  listen(port, cb = (() => {})) {
    const server = new WebSocket.Server({
      port,
      perMessageDeflate: false,
    }, cb)
    server.on('connection', (ws) => {
      this.connections.push(ws)
      ws.on('close', () => {
        const i = this.connections.indexOf(ws)
        this.connections.splice(i, 1)
      })
      ws.on('message', (message) => {
        try {
          const payload = JSON.parse(message)
          this._handlePayload(payload, ws)
        } catch (err) {
          this._serializeSend({
            status: 1,
            error: 'Failed to parse JSON'
          }, ws)
        }
      })
    })
    server.on('close', () => {
      this.connections = []
    })
    return server
  }

  async _handlePayload(payload, ws) {
    const { route, _rid } = payload
    const handlers = this.handlers[route]
    const send = (_message, _data, _status) => {
      const message = typeof _message === 'string' ? _message : ''
      let data = {}
      if (typeof _message === 'object' || Array.isArray(_message)) {
        data = _message
      } else if (typeof _data === 'object' || Array.isArray(_message)) {
        data = _data
      }
      let status = 0
      if (typeof _status === 'number' && !Number.isNaN(_status)) {
        status = _status
      } else if (typeof _data === 'number' && !Number.isNaN(_data)) {
        status = _data
      } else if (typeof _message === 'number' && !Number.isNaN(_message)) {
        status = _message
      }
      this._serializeSend({
        status,
        _rid,
        data,
        route,
        message: message || (status === 0 ? 'Success' : 'Failure'),
      }, ws)
    }
    if (!handlers || handlers.length === 0) {
      send(`No handler for route "${route}"`, 1)
      return
    }
    const middlewares = this.middlewares.filter(({ fn, match }) => {
      return !match ||
        (typeof match === 'string' && match === route) ||
        (
          Object.prototype.toString.call(match) == '[object RegExp]' &&
          match.test(route)
        )
    })
    for (const { fn } of middlewares) {
      await new Promise(next => {
        fn(payload.data, send, next)
      })
    }
    for (const handler of handlers) {
      await new Promise(next => {
        handler(payload.data, send, next)
      })
    }
  }

  _serializeSend(payload, ws) {
    try {
      ws.send(JSON.stringify(payload))
    } catch (err) {
      ws.send(JSON.stringify({
        _rid: payload._rid,
        status: 1,
        message: 'Failed to serialize message',
        data: err,
      }))
    }
  }
}

module.exports = function especial() {
  return new Especial()
}
