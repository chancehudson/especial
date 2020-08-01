# especial [![pipeline status](https://gitlab.com/jchancehud/especial/badges/master/pipeline.svg)](https://gitlab.com/jchancehud/especial/-/commits/master) [![coverage report](https://gitlab.com/jchancehud/especial/badges/master/coverage.svg)](https://gitlab.com/jchancehud/especial/-/jobs/artifacts/master/file/coverage/index.html?job=testing)

A websocket based communication protocol.

## Usage

`npm install especial`

### Server

```js
const especial = require('especial')

const app = especial()

app.handle('utils.ping', (data, send, next) => {
  send('pong')
})

const server = app.listen(4000, () => {
  console.log(`Listening on port 4000`)
})

```

### Client

```js
const EspecialClient = require('especial/client')

const client = new EspecialClient('ws://localhost:4000')
const { data, message, status } = await client.send('utils.ping')

console.log(message) // "pong"
```

## Protocol

Especial communicates across websockets using JSON encoded payloads. Clients emit a payload with a unique id and the server is expected to respond with a single message with the same id.

### Request

Requests are structured like this:

```json
{
  "_rid": "68f2ca32-d49e-4339-8e7f-1d846774aa3b",
  "route": "utils.ping",
  "data": {}
}
```

The fields are as follows:
  - `_rid`: A unique v4 UUID identifying the specific request
  - `route`: A string indicating the function to execute
  - `data`: An object containing arbitrary data for the function

### Response

Responses are structured like this:

```json
{
  "_rid": "68f2ca32-d49e-4339-8e7f-1d846774aa3b",
  "route": "utils.ping",
  "data": {},
  "message": "pong",
  "status": 0
}
```

- `_rid`: The same \_rid emitted in the matching request
- `route`: The route requested
- `data`: Arbitrary data returned from the function
- `message`: String info about function execution
- `status`: Integer representing execution result, `0` indicates success

### Broadcast

In addition to simple request/response communication servers may send data to clients without a request being made. This can be used to update data or provide new information.

The structure of such a message is the same as a response, with the `_rid` being a simple string the client may subscribe to.
