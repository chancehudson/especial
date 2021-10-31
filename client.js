const { nanoid } = require('nanoid')

const UNHANDLED_MESSAGE = 'unhandledMessage'

module.exports = class EspecialClient {
  constructor(url, _WebSocket = WebSocket) {
    this.url = url
    this._ridListeners = {}
    this.connected = false
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

  /**
   * Attempt to establish a Websocket connection. The promise resolves once a
   * connection is established or the number of retries is exceeded. This
   * promise is thus relatively long-lived.
   *
   * Use addConnectedHandler to listen for connection changes.
   **/
  async connect(_options = {}, _retryCount = 0) {
    if (this.connected) return
    const options = {
      retries: 3,
      reconnect: true,
      retryWait: 2000,
    }
    let retryCount = _retryCount
    if (typeof _options === 'object') {
      Object.assign(options, _options)
    } else {
      throw new Error('Connect options should be object')
    }
    const ws = new this._WebSocket(this.url)
    await new Promise((_rs, _rj) => {
      let promiseResolved = false
      // don't double resolve in the case of disconnect/reconnect after initial
      // connection
      const rs = (arg) => {
        if (promiseResolved) return
        _rs(arg)
        promiseResolved = true
      }
      const rj = (arg) => {
        if (promiseResolved) return
        _rj(arg)
        promiseResolved = true
      }
      ws.onmessage = ({ data }) => {
        this._handleMessage(data)
      }
      ws.onopen = () => {
        this.ws = ws
        this.connected = true
        // reset the retry count if we establish a connection
        retryCount = 0
        rs()
        for (const [key, fn] of Object.entries(this.connectionHandlers)) {
          fn()
        }
      }
      ws.onclose = async (event) => {
        const newDisconnect = this.connected
        this.connected = false
        delete this.ws
        if (newDisconnect) {
          for (const [key, fn] of Object.entries(this.connectionHandlers)) {
            fn()
          }
        }
        if (event.code === 1006) {
          // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
          // unexpected disconnect, attempt a reconnect
          if (!options.reconnect || retryCount > options.retries) {
            return rj()
          }
          await new Promise(r => setTimeout(r, options.retryWait))
          try {
            await this.connect(_options, ++retryCount)
            rs()
          } catch (err) {
            rj(err)
          }
        }
      }
      ws.onerror = async (err) => {
        ws.close(1006)
        if (!options.reconnect || retryCount > options.retries) {
          return rj(err)
        }
      }
    })
  }

  disconnect() {
    if (!this.connected) return
    this.ws.close(1000)
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
