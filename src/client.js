const uuid = require('uuid')

module.exports = class EspecialClient {
  constructor(url) {
    this.url = url
    this._ridListeners = {}
    this.connected = false
    this.reconnect = true
    this.retries = Infinity
    this.connectionHandlers = {}
  }

  listen(rid, fn) {
    this._ridListeners[rid] = fn
  }

  addConnectedHandler(fn) {
    const id = uuid.v4()
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
    const _rid = uuid.v4()
    const p = new Promise((rs, rj) => {
      this._ridListeners[_rid] = (err, payload) => {
        if (err) rj(err)
        else rs(payload)
      }
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
    const ws = new WebSocket(this.url)
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
        this.connected = false
        delete this.ws
        for (const [key, fn] of Object.entries(this.connectionHandlers)) {
          fn()
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

  _handleMessage(data) {
    const payload = JSON.parse(data)
    if (!payload._rid) {
      console.log('Received message with no _rid')
      console.log(data)
      return
    }
    const fn = this._ridListeners[payload._rid]
    if (typeof fn !== 'function') {
      console.log(payload)
      console.log('No handler for message')
      return
    }
    if (payload.status === 0) {
      fn(null, payload)
    } else {
      fn(payload)
    }
  }
}
