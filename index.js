const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3001;

app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello World!");
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
  console.log(`SSE client connected. Total clients: ${clients.size}`);

  // When client disconnects, remove it
  req.on("close", () => {
    clients.delete(res);
    console.log(`SSE client disconnected. Total clients: ${clients.size}`);
  });

  req.on("error", (err) => {
    console.error("SSE connection error:", err);
    clients.delete(res);
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (err) {
      console.error("Heartbeat failed:", err);
      clients.delete(res);
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

function sseMessage({ event, id, data, retry }) {
  let msg = "";
  if (id !== undefined) msg += `id: ${id}\n`;
  if (event) msg += `event: ${event}\n`;
  if (retry !== undefined) msg += `retry: ${retry}\n`;
  // data may be multi-line; each line must be prefixed by "data: "
  const dataStr = typeof data === "string" ? data : JSON.stringify(data);

  if (dataStr) {
    dataStr.split("\n").forEach((line) => {
      msg += `data: ${line}\n`;
    });
  }

  msg += `\n`; // end of event
  return msg;
}

function broadcast(payload) {
  const message = sseMessage(payload);
  const deadClients = new Set();

  for (const res of clients) {
    try {
      res.write(message);
      console.log("Message sent to SSE client.");
    } catch (err) {
      console.error("Error writing to SSE client, removing client:", err);
      deadClients.add(res);
    }
  }

  deadClients.forEach((client) => clients.delete(client));
}

app.use(express.json());

app.post("/broadcast", (req, res) => {
  const { event = "message", data, id, retry } = req.body;

  broadcast({
    event,
    data: data || {
      message: "Test broadcast",
      timestamp: new Date().toISOString(),
    },
    id,
    retry,
  });

  res.json({
    ok: true,
    message: "Broadcast sent",
    clientCount: clients.size,
  });
});

app.get("/status", (req, res) => {
  res.json({
    connectedClients: clients.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('Closing SSE connections...');
  for (const res of clients) {
    try {
      res.write(sseMessage({ event: "shutdown", data: "Server shutting down" }));
      res.end();
    } catch (err) {
      console.error("Error closing SSE connection:", err);
    }
  }
  clients.clear();
  process.exit(0);
});