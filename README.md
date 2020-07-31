# especial

A websocket based communication protocol.

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
