const { NatsWrapper } = require("./natsWrapper")
const events = require("../events/listeners")

async function ensureStream(nc, streamName = "EVENTS") {
  const jsm = await nc.jetstreamManager()

  try {
    await jsm.streams.info(streamName)
    return
  } catch (e) {}

  await jsm.streams.add({
    name: streamName,
    subjects: ["events.>"],
    retention: "limits",
    storage: "file"
  })

  console.log(`Uploader JetStream stream ensured: ${streamName}`)
}

module.exports = async () => {
  // CONNECT NATS
  await NatsWrapper.connect(process.env.NATS_CLIENT_ID, process.env.NATS_URL)
  await ensureStream(NatsWrapper.client(), process.env.NATS_STREAM || "EVENTS")

  // Graceful shutdown
  const shutdown = async () => {
    console.log("NATS draining...")
    await NatsWrapper.close()
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  // LISTENERS
  events.forEach(Event => new Event(NatsWrapper).listen())
}
