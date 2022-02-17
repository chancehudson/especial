# especial <a href="https://app.circleci.com/pipelines/github/vimwitch/especial" target="_blank">![build-badge](https://img.shields.io/circleci/build/github/vimwitch/especial?token=9c37b99e7b34a165ae1f3e0c6ea4c5acead2db40)</a> <a href="https://tubby.cloud/tubs/617c8c01d6af3500196df884/index.html" target="_blank">![coverage-badge](https://tubby.cloud/tubs/617c8c01d6af3500196df884/badge.svg)</a>

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
  "_rid": "jki7uo9XsOEJkel3PrF_T",
  "route": "utils.ping",
  "data": {}
}
```

The fields are as follows:
  - `_rid`: A unique identifier for the request
  - `route`: A string indicating the function to execute
  - `data`: An object containing arbitrary data for the function

### Response

Responses are structured like this:

```json
{
  "_rid": "jki7uo9XsOEJkel3PrF_T",
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
