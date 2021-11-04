const { nanoid } = require('nanoid')

const UNHANDLED_MESSAGE = 'unhandledMessage'

module.exports = class EspecialClient {
  constructor(url, _WebSocket = WebSocket) {
    this.url = url
    this._ridListeners = {}
    this.connected = false
    this.connectionHandlers = {}
    this._WebSocket = _WebSocket
    this._retryCount = 0
    this._retryTimer = null
    this._retryPromise = undefined
    this._cancelRetry = undefined
    this.listeners = {
      [UNHANDLED_MESSAGE]: {},
    }
  }

  once(_rid, fn) {
    this._ridListeners[_rid] = async (...args) => {
      delete this._ridListeners[_rid]
      fn(...args)
    }
  }

  listen(_rid, fn) {
    const listenerId = nanoid()
    if (!this.listeners[_rid]) {
      this.listeners[_rid] = {}
    }
    this.listeners[_rid][listenerId] = fn
    return listenerId
  }

  clearListener(_rid, listenerId) {
    delete this.listeners[_rid][listenerId]
    if (Object.keys(this.listeners[_rid]).length === 0) {
      delete this.listeners[_rid]
    }
  }

  addConnectedHandler(fn) {
    const id = nanoid()
    this.connectionHandlers[id] = fn
    return id
  }

  clearConnectedHandler(id) {
    delete this.connectionHandlers[id]
  }

  async callConnectionHandlers() {
    // execute after the retry promise to protect against `disconnect` being
    // called in the connection handler
    await Promise.resolve(this._retryPromise)
    for (const [, fn] of Object.entries(this.connectionHandlers)) {
      // don't wait on each individual handler, execute in parallel
      ;(async () => {
        try {
          await Promise.resolve(fn())
        } catch (err) {
          console.log(err)
          console.log('Uncaught error in especial connection handler')
        }
      })()
    }
  }

  async send(route, data = {}) {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    const _rid = nanoid()
    const p = new Promise((rs, rj) => {
      this.once(_rid, (payload) => {
        if (payload.status === 0) return rs(payload)
        const error = new Error('Received non-0 status response')
        error.payload = payload
        rj(error)
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
  async connect(_options = {}) {
    if (this.connected || this._retryTimer) return
    const options = {
      retries: 3,
      reconnect: true,
      retryWait: 2000,
    }
    if (typeof _options === 'object') {
      Object.assign(options, _options)
    } else {
      throw new Error('Connect options should be object')
    }
    await this.attemptConnect(options)
  }

  async _connect(options) {
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
        rs()
        this.callConnectionHandlers()
      }
      ws.onclose = async (event) => {
        const newDisconnect = this.connected
        this.connected = false
        delete this.ws
        if (newDisconnect) {
          this.callConnectionHandlers()
        }
        if (event.code !== 1000) {
          // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
          // unexpected disconnect
          rj()
          // start retrying to connect as necessary
          if (options.reconnect) {
            this.attemptConnect(options).catch(() => {})
          }
        }
      }
      ws.onerror = async (err) => {
        ws.close(1006)
      }
    })
  }

  async attemptConnect(options) {
    if (this._retryPromise) return this._retryPromise
    this._retryCount = 0
    let rs, rj
    const promise = this._retryPromise = new Promise((_rs, _rj) => {
      rs = (a) => {
        this._cancelRetry = undefined
        _rs(a)
      }
      rj = (a) => {
        this._cancelRetry = undefined
        _rj(a)
      }
      this._cancelRetry = _rj
    })
    ;(async () => {
      for (;;) {
        if (this._retryPromise !== promise) {
          return
        }
        if (this._retryCount > options.retries) {
          rj()
          this.cancelRetry()
          return
        } else if (this._retryCount === 0) {
          // first try, attempt immediately
          await this._attemptConnect(rs, rj, options)
          if (!this.connected && !options.reconnect) {
            rj()
            this.cancelRetry()
            return
          }
        } else {
          // wait for the retry interval
          await new Promise((_rs, _rj) => {
            let executed = false
            this._retryTimer = setTimeout(async () => {
              this._retryTimer = null
              executed = true
              await this._attemptConnect(rs, rj, options)
              _rs()
            }, options.retryWait)
            setTimeout(() => {
              // an abort timeout so the above promise isn't left hanging
              if (executed) return
              _rs()
            }, options.retryWait + 1000)
          })
        }
      }
    })()
    return this._retryPromise
  }

  async _attemptConnect(rs, rj, options) {
    try {
      await this._connect(options)
      rs()
      this.cancelRetry()
    } catch (err) {
      this._retryCount++
    }
  }

  cancelRetry() {
    if (this._retryTimer) {
      clearInterval(this._retryTimer)
      this._retryTimer = null
    }
    this._retryPromise = undefined
    if (this._cancelRetry) {
      this._cancelRetry()
      this._cancelRetry = undefined
    }
  }

  disconnect() {
    this.cancelRetry()
    if (!this.connected) return
    this.ws.close(1000)
  }

  _handleMessage(data) {
    const payload = JSON.parse(data)
    const fn = this._ridListeners[payload._rid]
    if (typeof fn !== 'function') {
      const fns = this.listeners[payload._rid] || this.listeners[UNHANDLED_MESSAGE]
      if (Object.keys(fns).length === 0) {
        console.error(payload)
        console.error('No handler for message')
        return
      }
      for (const [, _fn] of Object.entries(fns)) {
        _fn(payload)
      }
      return
    } else if (fn && this.listeners[payload._rid]) {
      console.log('Warning, rid/listener collision. Events should have unique names!')
      console.log('Ignoring registered listeners in favor of route handler')
    }
    fn(payload)
  }
}
