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

## API

### Client

`constructor(url, WebSocket)`: Create a new Especial client
  - **url**, a websocket url to connect to
  - **WebSocket**, the websocket implementation, defaults to the global `WebSocket` variable

`connect(options): Promise<void>`: Connect to the server, resolves upon success, rejects once the number of retries has been exceeded. This promise may be pending for a long time depending on retry settings.
  - **options**: An object specifying how reconnects should be performed
  - **options.retries**: How many times to retry before aborting (default: 3)
  - **options.reconnect**: Whether failed connections should automatically try to reconnect (default: true)
  - **options.retryWait**: How long to wait between retry attempts in milliseconds (default: 2000)

`addConnectedHandler(fn): id`: Register a function that will be called when the client connects or disconnects from a server.
  - **fn**: A function to be called (no arguments are passed)
  - **id**: The function returns a handler id that can be used to remove the handler

`clearConnectedHandler(id): void`: Unregister a connection listener function.
  - **id**: A handler id from `addConnectedHandler`.

`send(route, data): Promise<Response>`: Send a message to the server.
  - **route**: A string route to call on the server
  - **data**: An optional object to pass to the server. This data must be JSON serializable
  - **returns**: Returns a payload structured like the following:

```js
{
  _rid: "jki7uo9XsOEJkel3PrF_T", // the request identifier
  route: "utils.ping", // the requested route
  data: {}, // any data sent from the server
  message: "", // a response string (defaults to 'Success' or 'Failure')
  status: 0 // a response status, 0 indicates success
}
```

`disconnect()`: Disconnect from a server and cancel any pending retry requests.

`listen(_rid, fn): string`: Listen to a custom request id. This can be used for asymmetric communication (e.g. subscribing to server events)
  - **_rid**: A string to listen to. Any requests emitted from the server with this _rid will cause `fn` to be executed
  - **fn**: A function to call when a message with `_rid` is received. This function is called with a response payload as the only argument
  - **returns**: Returns a listener id that can be used to clear the listener

`clearListener(_rid, listenerId)`: Clear a route listener.
  - **_rid**: The route identifier to clear
  - **listenerId**: The listener id to clear

### Server

`constructor()`: Create a new Especial app.

`listen(port, cb)`: Start a websocket server listening on the specified port.
  - **port**: The port the server should listen on
  - **cb**: A callback function to be executed when the server starts. Any error will be passed as the first argument

`use(match, fn)`: Register a middleware function to be used for a set of routes.
  - **match**: Either a string or regular expression used to determine if the middleware should be executed for a route. If it's a string routes are exactly matched
  - **fn**: A middleware function to be executed for a route

`handle(route, ...handlers)`: Register functions to be called for a given route.
  - **route**: A string route to register handlers for. Wildcards are not supported, the route is directly matched during requests
  - **handlers**: One or more functions to be executed in series for a route. Handler functions will be passed 4 arguments:
    - `data: Object`: The request data
    - `send: (message: string, data: object, status: number) => void`: Function to send a response
    - `next: () => void`: Function to pass request to next middleware or handler
    - `ws: WebSocket`: The websocket making the request

`broadcast(_rid, _message, _data)`: Broadcast a message to all connected clients.
  - **_rid**: The route id to use for the broadcast
  - **_message**: The string message to be sent in the payload
  - **_data**: JSON serializable data to be sent in the payload

`broadcastOne(ws, _rid, _message, _data)`: Broadcast a message to a specific client.
  - **ws**: The websocket for the client that should receive the broadcast
  - **_rid**: The route id to use for the broadcast
  - **_message**: The string message to be sent in the payload, or the data object (if no message).
  - **_data**: (optional) JSON serializable data to be sent in the payload
