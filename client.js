const { nanoid } = require('nanoid')

const UNHANDLED_MESSAGE = 'unhandledMessage'

module.exports = class EspecialClient {
  constructor(url, _WebSocket = WebSocket) {
    this.url = url
    this._ridListeners = {}
    this.connected = false
    this.reconnect = true
    this.retries = Infinity
    this.connectionHandlers = {}
    this._WebSocket = _WebSocket
    this.listeners = {
      [UNHANDLED_MESSAGE]: [],
    }
  }

  once(_rid, fn) {
    this._ridListeners[_rid] = async (...args) => {
      delete this._ridListeners[_rid]
      fn(...args)
    }
  }

  on(message, fn) {
    if (!Array.isArray(this.listeners[message])) {
      throw new Error(`Unrecognized event "${message}"`)
    }
    this.listeners[message].push(fn)
  }

  listen(_rid, fn) {
    this._ridListeners[_rid] = fn
  }

  clearListener(_rid) {
    delete this._ridListeners[_rid]
  }

  addConnectedHandler(fn) {
    const id = nanoid()
    this.connectionHandlers[id] = fn
    return id
  }

  clearConnectedHandler(id) {
    delete this.connectionHandlers[id]
  }

  async send(route, data = {}) {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    const _rid = nanoid()
    const p = new Promise((rs, rj) => {
      this.once(_rid, (err, payload) => {
        if (err) rj(err)
        else rs(payload)
      })
    })
    const payload = {
      _rid,
      route,
      data,
    }
    this.ws.send(JSON.stringify(payload))
    return await p
  }

  async connect(retryCount = 0) {
    const ws = new this._WebSocket(this.url)
    await new Promise((rs, rj) => {
      ws.onmessage = ({ data }) => {
        this._handleMessage(data)
      }
      ws.onopen = () => {
        this.ws = ws
        this.connected = true
        rs()
        for (const [key, fn] of Object.entries(this.connectionHandlers)) {
          fn()
        }
      }
      ws.onclose = async () => {
        const newDisconnect = this.connected
        this.connected = false
        delete this.ws
        if (newDisconnect) {
          for (const [key, fn] of Object.entries(this.connectionHandlers)) {
            fn()
          }
        }
      }
      ws.onerror = async (err) => {
        ws.close()
        if (!this.reconnect || retryCount >= this.retries) {
          return rj(err)
        }
        rs()
        await new Promise(r => setTimeout(r, 2000))
        await this.connect(++retryCount)
      }
    })
  }

  disconnect() {
    if (!this.connected) return
    this.ws.close()
  }

  _handleMessage(data) {
    const payload = JSON.parse(data)
    const fn = this._ridListeners[payload._rid]
    if (typeof fn !== 'function') {
      const fns = this.listeners[UNHANDLED_MESSAGE]
      if (fns.length === 0) {
        console.error(payload)
        console.error('No handler for message')
        return
      }
      for (const _fn of fns) {
        _fn()
      }
      return
    }
    if (payload.status === 0) {
      fn(null, payload)
    } else {
      fn(payload)
    }
  }
}
