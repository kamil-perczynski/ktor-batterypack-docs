# Consume Messages

How a stream entry reaches your listener — through the fetching loop, the crash-recovery path, and the health sampler that feeds the lag gauges.

![Consume sequence diagram](/redis/seq-consume.svg)

**New messages.** The [fetching loop](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/bgloops/RedisStreamFetchingLoop.kt) blocks on `XREADGROUP` — five seconds at a time, up to 100 messages per batch. Batches are grouped by stream, and each stream is handled by its own coroutine, messages within a stream sequentially. That is the per-stream ordering guarantee: a slow handler on `wallet_events` delays `wallet_events`, nothing else.

**Per message.** The [`StreamMessageProcessor`](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/bgloops/StreamMessageProcessor.kt) takes the `_p` field as the payload, everything else as headers, and invokes the [`RedisStreamListener`](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/RedisStreamListener.kt) registered for the stream — recording its duration, with the exception class as a tag if it threw. Then comes the line that defines the delivery model: `XACK` runs in a `finally` block, so the message is acknowledged on success, on failure, and even mid-cancellation during shutdown. A failing handler never blocks the stream and never gets a retry.

**Crash recovery.** Every 30 s the [autoclaim loop](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/bgloops/RedisStreamAutoclaimLoop.kt) asks for pending messages idle over 60 s (`XAUTOCLAIM`) and reassigns them to a live instance — the only redelivery path. Expect a message stranded by a crash to resume within 60–90 seconds.

**Health sampling.** The [lag monitor](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/monitoring/RedisStreamConsumerLagMonitorLoop.kt) samples `XINFO CONSUMERS` every 30 s and publishes `pending`, `idle`, and `inactive` per consumer as gauges. It never acts on what it sees — acting is your alerting's job.

Delivery guarantees are spelled out in [Redis Streams](/redis/redis-streams#delivery-guarantees); what to do with the gauges is in [Stream Monitoring](/redis/redis-streams-monitoring).
