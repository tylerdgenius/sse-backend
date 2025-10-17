const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors())

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const clients = new Set();

app.get("/sse", (req, res) => {
  // Required headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // allow CORS in dev (change for production)
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Prevent Node from timing out the socket
  req.socket.setTimeout(0);

  // Flush headers
  res.flushHeaders?.(); // safe for newer Node; no-op if not present

  // send an initial comment to establish the stream
  res.write(": connected\n\n");

  // Add to client list
  clients.add(res);

  // When client disconnects, remove it
  req.on("close", () => {
    clients.delete(res);
  });
});

function sseMessage({ event, id, data, retry }) {
  let msg = "";
  if (id !== undefined) msg += `id: ${id}\n`;
  if (event) msg += `event: ${event}\n`;
  if (retry !== undefined) msg += `retry: ${retry}\n`;
  // data may be multi-line; each line must be prefixed by "data: "
  const dataStr = typeof data === "string" ? data : JSON.stringify(data);
  dataStr?.split("\n").forEach(line => {
    msg += `data: ${line}\n`;
  });
  msg += `\n`; // end of event
  return msg;
}

function broadcast(payload) {
  const message = sseMessage(payload);

  for (const res of clients) {
    try {
      res.write(message);
      console.log("Message sent to SSE client.");
    } catch (err) {
      console.error("Error writing to SSE client, removing client:", err);
      clients.delete(res);
    }
  }
}

app.use(express.json());

app.post("/broadcast", (req, res) => {
  broadcast({ event: "manual", data: {"test": "message"} });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});