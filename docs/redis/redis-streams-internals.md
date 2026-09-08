# Stream Internals

How the streams machinery actually runs: what happens on boot, what the three background loops do, how messages flow through processing, and what happens when things break. Read this when the behavior from [Redis Streams](/redis/redis-streams) needs debugging, or when you want to reason about production failure modes.

Everything here maps one-to-one onto commands in the [`ktor-batterypack-redis` module](https://github.com/kamil-perczynski/ktor-batterypack/tree/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis) — nothing is hidden behind magic, and the source is short.

## The fetcher lifecycle

`RedisStreamFetcher` is an `InitCallback`: it runs once on startup, before the server accepts traffic. Boot does three things, in order:

**1. Dead-consumer cleanup.** For every stream, the fetcher runs [XINFO CONSUMERS](https://redis.io/docs/latest/commands/xinfo-consumers/) and deletes any consumer that has zero pending messages and has been idle longer than `autoclaimMinIdleMs` (60 s default) — [XGROUP DELCONSUMER](https://redis.io/docs/latest/commands/xgroup-delconsumer/). Restarting an instance therefore doesn't leak consumer entries; a consumer that died with pending messages is *not* deleted here — its messages are reclaimed by the autoclaim loop first.

**2. Consumer-group creation.** Each stream gets [XGROUP CREATE](https://redis.io/docs/latest/commands/xgroup-create/) with `MKSTREAM`, at offset `0` — the first boot of a new group replays the retained backlog. If the group already exists, Redis answers with `BUSYGROUP`, which the fetcher swallows: boot is idempotent, safe to repeat on every restart.

**3. Loop startup.** The fetcher then starts every `RedisStreamsBackgroundLoop` bean. The number of listeners is logged:

```
INFO  RedisStreamFetcher - Registering 2 redis stream listener(s) in group: florin, streams: [plant_events, wallet_events]
```

Shutdown mirrors boot: the fetcher is also `AutoCloseable`; on close it cancels every loop and releases every loop connection before the shared `RedisClient` is closed by the container.

## The background loops

Steady-state consumption is three loops, each a coroutine on `Dispatchers.IO` with its own dedicated Redis connection:

| Loop | Command | Cadence | Purpose |
|------|---------|---------|---------|
| Fetching | `XREADGROUP` | blocks 5 s, batches of 100 | deliver new messages to listeners |
| Autoclaim | `XAUTOCLAIM` | every 30 s | reclaim messages from dead consumers |
| Lag monitor | `XINFO CONSUMERS` | every 30 s | sample per-consumer gauges |

Each loop implements `RedisStreamsBackgroundLoop` with a `start()` that creates an independent runtime — its own connection, its own coroutine scope — and returns a `LoopHandle`. The handle cancels the loop and closes its connection. Because every `start()` is independent, one loop bean can serve several fetchers: the streams module and the [testing module](/redis/redis-testing) share the same loop singletons, each fetcher starting its own copy.

**The fetching loop** reads new messages only (`XREADGROUP` with the `>` id), so anything already delivered to a consumer is never re-fetched. Reads block for `fetchingTimeout` (5 s) and fetch up to `fetchingCount` (100) messages per call. When the read itself fails — Redis restarted, network blip — the loop logs the error, waits out the same 5 s, and retries forever. Redis being down degrades the app; it does not crash it.

**The autoclaim loop** reclaims messages stranded by crashes. Every 30 s it asks each stream for pending messages idle longer than `autoclaimMinIdleMs` (60 s) — up to `autoclaimCount` (10) per pass — and claims them for the current instance. Claimed messages flow through the same processing as fresh ones, and each pass records the count in the [`redis.stream.autoclaim.reclaimed`](/redis/redis-streams-monitoring) metric. This is the only redelivery path: a message redelivered by autoclaim was necessarily stuck in a pending list for at least 60 seconds.

**The lag monitor loop** samples [XINFO CONSUMERS](https://redis.io/docs/latest/commands/xinfo-consumers/) every 30 s and publishes `idle`, `pending`, and `inactive` per consumer as gauges. It never acts on what it sees — acting is your alerting's job, covered in [Stream Monitoring](/redis/redis-streams-monitoring).

## Message processing

Both delivery paths — fetch and autoclaim — converge in `StreamMessageProcessor`. A batch is grouped by stream, and each stream's messages are handled by one coroutine:

```kotlin{6}
coroutineScope {
    for ((_, msgs) in messages.groupBy { it.stream }) {
        launch(CoroutineName("Listener")) {
            for (message in msgs) {
                processMessage(message, listeners, consumerGroup, connection)
            }
        }
    }
}
```

Parallel across streams, sequential within a stream. This is where the per-stream ordering guarantee comes from: a slow handler on `wallet_events` delays `wallet_events`, while `user_events` keeps flowing.

Per message: the payload is the `_p` field, everything else is headers, the listener is invoked, and its duration is recorded. Then comes the line that defines the delivery model:

```kotlin{4}
finally {
    withContext(Dispatchers.IO + NonCancellable) {
        connection.async().xack(message.stream, consumerGroup, message.id).await()
    }
}
```

The acknowledgement runs in `finally` with `NonCancellable` — it happens after a successful return, after a caught exception, and even when the coroutine is cancelled mid-handler during shutdown. A listener exception is logged and counted, never rethrown, and never blocks the next message. The consequences are spelled out in [delivery guarantees](/redis/redis-streams#delivery-guarantees); the design intent is that a stream can never wedge on one bad message.

## Failure modes

| Scenario | What happens |
|----------|--------------|
| Redis down at boot | the setup connection fails, startup aborts — fail fast, fix Redis, roll again |
| Redis down mid-run | the fetching loop logs, waits 5 s, retries; autoclaim and lag loops log and retry on their next pass; readiness goes `DOWN` and the pod leaves rotation |
| Listener throws | logged, metric'd with the exception class, message acknowledged — no retry |
| Instance crashes mid-message | message stays pending; reclaimed after 60 s idle on a 30 s cadence — resumes within 60–90 s |
| Redis restarts, streams survive | consumer groups are durable in Redis; boot's `BUSYGROUP` path resumes exactly where the group left off |

The blunt summary: the toolkit is resilient to Redis outages at runtime and to consumer crashes, but it does not buffer — during a Redis outage, publishing fails and fetching waits. Events published in that window are lost unless the publisher's caller retries them.

## See also

- [Redis Streams](/redis/redis-streams) — the usage manual this page complements
- [Stream Monitoring](/redis/redis-streams-monitoring) — the metrics these loops emit
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/) — Redis' own documentation of the data type
