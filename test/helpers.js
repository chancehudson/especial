const test = require('ava')
const especial = require('..')
const tcpPortUsed = require('tcp-port-used')

const createServer = async (start = true) => {
  const getPort = () => Math.floor(Math.random() * 10000 + 10000)
  let port = getPort()
  while (await tcpPortUsed.check(port)) {
    port = getPort()
  }
  const app = especial()
  let server
  if (start) {
    await new Promise((rs, rj) => {
      server = app.listen(port, (err) => {
        if (err) rj(err)
        else rs()
      })
    })
  }
  return {
    server,
    app,
    port,
    url: `ws://localhost:${port}`,
  }
}

module.exports = { createServer }

test('helper stub', (t) => t.pass())
