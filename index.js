const WebSocket = require('ws')

module.exports = function especial() {
  return new Especial()
}

class Especial {
  constructor() {
    this.connections = []
    this.handlers = {}
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
          ws.send({
            status: 1,
            error: 'Failed to parse JSON'
          })
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
    if (!handlers || handlers.length === 0) {
      throw new Error(`No handler for route "${route}"`)
    }
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
        message: message || (status === 0 ? 'Success' : 'Failure'),
      }, ws)
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
        status: 1,
        message: 'Failed to serialize message',
        data: err,
      }))
    }
  }
}
