# Redis Streams

The streams toolkit turns Redis into a lightweight event backbone: publish JSON events from anywhere in your code, consume them with declarative listeners, and get consumer groups, crash recovery, and lag metrics without operating a broker.

It makes sense inside one application — decoupling domains, triggering side effects — and between a handful of services. It is not Kafka: messages are retained for two hours by default, there is exactly one Redis instance in the data path, and handler failures are never retried. When you need a durable, replayable, high-volume event log, use a real broker. For everything short of that, this is dramatically less machinery.

The toolkit is built on [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/) and consumes them through consumer groups. You don't need to know the Redis commands to use it — but the [internals page](/redis/redis-streams-internals) maps every feature onto its command, which helps when debugging.

## What it provides

- `RedisStreamPublisher` — one-liner publishing with headers and automatic retention trimming.
- `RedisStreamListener` — a declarative consumer: name a stream, handle messages.
- `RedisStreamFetcher` — a lifecycle-managed consumer group with crash recovery ([XAUTOCLAIM](https://redis.io/docs/latest/commands/xautoclaim/)) and dead-consumer cleanup.
- Stream metrics — handler duration, reclaimed messages, per-consumer lag. See [Stream Monitoring](/redis/redis-streams-monitoring).

What it deliberately does not do: retries on handler failure (messages are acknowledged even when the handler throws — see [delivery guarantees](#delivery-guarantees)), typed payloads (you get a JSON `String` and deserialize it yourself), and message versioning.

## Setup

Add the streams module to your Koin application:

```kotlin{7}
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackMetricsModule::class,
        KtorBatterypackRedisStreamsModule::class,
        MyAppModule::class
    ]
)
object MyApp
```

`KtorBatterypackRedisStreamsModule` includes the base `KtorBatterypackRedisModule`, so one entry wires the client and the streams. Your own module still provides `RedisProps` — see [Redis](/redis/) for that wiring.

On boot, the fetcher creates a consumer group for every stream your listeners declare, and starts consuming. Nothing else to wire: any `RedisStreamListener` bean is discovered, registered, and driven automatically.

## The simplest working usage

An event, a listener, and a publish call. That is the whole API.

```kotlin
data class JobFinished(val jobId: String)

@Singleton
class JobEventsListener : RedisStreamListener {

    override fun stream(): String = "job_events"

    override suspend fun onMessage(payload: String, headers: Map<String, String>) {
        log.info("received: {}", payload)
    }
}

@Singleton
class JobEventPublisher(private val publisher: RedisStreamPublisher) {

    fun publish(event: JobFinished) {
        publisher.publish(stream = "job_events", payload = event)
    }
}
```

Call `publish` from wherever the event occurs — a controller, a service, a scheduled job. With Redis running locally (`docker run -p 6379:6379 redis:8-alpine`) and the app started, a publish produces this log line within milliseconds:

```
INFO  JobEventsListener - received: {"jobId":"42"}
```

Messages flow: publish serializes the payload to JSON, `XADD`s it to the stream; the fetcher's `XREADGROUP` picks it up, dispatches to the listener registered for that stream name, and acknowledges it. The next section shows the shape this grows into.

## The recommended usage

The example application wraps the raw publisher in a typed per-domain publisher, keeps the stream name in a constant, and deserializes in the listener:

```kotlin
const val WALLET_EVENTS_TOPIC = "wallet_events"

@Singleton
class WalletEventPublisher(private val redisStreamPublisher: RedisStreamPublisher) {

    fun publish(event: WalletEvent) {
        redisStreamPublisher.publish(
            stream = WALLET_EVENTS_TOPIC,
            payload = event,
            headers = mapOf("X-Correlation-Id" to event.walletId),
        )
    }
}

@Singleton
class WalletEventsListener(
    private val jsonMapper: JsonMapper,
    private val walletService: WalletService,
) : RedisStreamListener {

    override fun stream(): String = WALLET_EVENTS_TOPIC

    override suspend fun onMessage(payload: String, headers: Map<String, String>) {
        val event = jsonMapper.readValue(payload, WalletEvent::class.java)

        if (event.type == WalletEventType.WALLET_TOPUP_REQUESTED) {
            walletService.processTopup(
                event.walletId.toUInt(),
                BigDecimal(event.amount),
                event.userId.toUInt(),
            )
        }
    }
}
```

Three habits worth copying:

- **The stream name is a constant** shared by publisher and listener. A typo in a raw string is a silent no-op: the publisher writes to one stream, a listener waits on another, nothing connects.
- **Publishers are typed façades.** The rest of the code publishes domain events, never strings.
- **Headers carry correlation, not data.** Everything the handler needs to act on lives in the payload; headers are metadata like `X-Correlation-Id`.

The full example — user, plant, and wallet events — is in the [example application](https://github.com/kamil-perczynski/ktor-batterypack/tree/main/ktor-batterypack-example/src/main/kotlin/domain).

## The wire format

Each message is a flat field map written with [XADD](https://redis.io/docs/latest/commands/xadd/). The serialized payload lands under the reserved `_p` key; every header becomes an additional string field:

```
127.0.0.1:6379> XRANGE wallet_events - +
1) 1) "1789900000000-0"
   2) 1) "_p"
      2) "{\"walletId\":\"42\",\"amount\":\"50.00\",\"userId\":\"7\",\"type\":\"WALLET_TOPUP_REQUESTED\"}"
      3) "X-Correlation-Id"
      4) "42"
```

Reading the stream back with `redis-cli` shows exactly what your listeners receive. There is no envelope, no timestamp field, no sender identity — the event ID (a Redis millisecond timestamp) is the only metadata Redis adds.

Every publish also trims the stream: messages older than the retention window are removed with approximate `MINID` trimming. Retention is 7,200,000 ms — two hours — by default, configurable via `redis.publisher.retentionMs`, and overridable per publish:

```kotlin
publisher.publish(
    stream = "wallet_events",
    payload = event,
    retentionDuration = 24.hours, // audit-grade events survive a day
)
```

Consequence: a stream is a transport here, not a log. Once a message is trimmed, it is gone — if you need an audit trail, write it to your database when you handle the event.

## Consumer groups and scaling

All listeners of an application join a single [consumer group](https://redis.io/docs/latest/develop/data-types/streams/#consumer-groups), `florin` by default. Each app instance registers as its own consumer inside that group — the name is `Main-` plus a hex timestamp, e.g. `Main-19a4f0c1b2`. Redis hands each message to exactly one consumer in the group, so three app instances give you three-way load balancing with zero configuration.

Two rules follow from this model, and both surprise people:

**One listener per stream name.** Listeners are indexed by their `stream()` value; registering a second listener for the same stream silently replaces the first. If two domains need the same events, either give each domain its own consumer group (below), or use one listener that fans out internally.

**Sharing the default group across applications load-balances between them.** Two different apps that listen to the same stream with group `florin` each receive only *some* of the messages — Redis splits them across all consumers of the group. When each application needs *every* message, give each a distinct group:

```yaml
redis:
  fetcher:
    consumerGroup: billing # every app that needs all events sets its own
```

One more default to know: consumer groups are created at offset `0`, not at the tail. The first boot of a new group processes the entire retained backlog — up to two hours of events. If you publish while nobody is consuming, those events are waiting when the consumer first starts. Subsequent boots find the group already present and continue where it left off.

## Delivery guarantees

The guarantees are simple to state and important to internalize:

**Successful handling: acknowledged.** The message is [XACK](https://redis.io/docs/latest/commands/xack/)ed after your listener returns.

**Failing handling: acknowledged too.** When your listener throws, the exception is logged and recorded in metrics with the exception class as a tag — and the message is acknowledged all the same. A failing handler does not block the stream, and the event is *not* retried. If you need retries, build them into the handler (catch, schedule, or re-publish to a retry stream). The toolkit refuses to guess here: a poison message looping forever is worse than one lost event.

**Crash mid-handling: redelivered.** If the process dies before the acknowledgement, the message stays pending under the dead consumer's name. After sixty seconds of idle time it becomes eligible for [XAUTOCLAIM](https://redis.io/docs/latest/commands/xautoclaim/), and the next autoclaim pass — every thirty seconds — reassigns it to a live consumer. Expect a crashed message to resume within 60–90 seconds.

So: at-least-once across crashes, effectively at-most-once across handler exceptions. Handlers should be idempotent anyway — a claim race can still deliver a message twice — but the retry path is not a feature you can lean on.

**Ordering: per stream.** Messages of one stream are handled sequentially, in publication order. Messages from different streams are handled in parallel. A slow listener on `wallet_events` delays `wallet_events`, not `user_events` — see [internals](/redis/redis-streams-internals#message-processing).

## Configuration

```yaml
redis:
  url: redis://localhost:6379
  fetcher:
    consumerGroup: florin
    consumerPrefix: Main-
    fetchingTimeout: 5000
    fetchingCount: 100
    autoclaimIntervalMs: 30000
    autoclaimMinIdleMs: 60000
    autoclaimCount: 10
    lagCheckIntervalMs: 30000
  publisher:
    retentionMs: 7200000
```

| Property | Default | Meaning |
|----------|---------|---------|
| `redis.fetcher.consumerGroup` | `florin` | the consumer group all listeners join |
| `redis.fetcher.consumerPrefix` | `Main-` | consumer name prefix; the instance id is appended |
| `redis.fetcher.fetchingTimeout` | `5000` ms (5 s) | how long a read blocks waiting for new messages; also the retry pause when Redis errors |
| `redis.fetcher.fetchingCount` | `100` | max messages fetched per batch |
| `redis.fetcher.autoclaimIntervalMs` | `30000` (30 s) | pause between autoclaim passes |
| `redis.fetcher.autoclaimMinIdleMs` | `60000` (60 s) | idle time before a pending message can be reclaimed |
| `redis.fetcher.autoclaimCount` | `10` | max messages reclaimed per pass |
| `redis.fetcher.lagCheckIntervalMs` | `30000` (30 s) | how often consumer info is sampled for [lag gauges](/redis/redis-streams-monitoring) |
| `redis.publisher.retentionMs` | `7200000` (2 h) | how long published messages survive in the stream |

The defaults are tuned for a typical service. The two most likely to need changing are `consumerGroup` — the moment a second application consumes the same stream — and `retentionMs`, if consumers are allowed to be down for more than two hours.

## Security notes

- Streams carry no authentication: anyone with write access to your Redis can inject events into your streams. In production, Redis should listen only on an internal network, and you should treat payloads and headers as untrusted input — validate before acting on them ([Validation](/validation/validation)).
- Payloads and headers sit in Redis unencrypted for the whole retention window. Keep secrets out of both.
- Use `rediss://` for TLS — see the [Redis security notes](/redis/#security-notes).

## See also

- [Stream Internals](/redis/redis-streams-internals) — the fetcher lifecycle, the three background loops, failure modes
- [Stream Monitoring](/redis/redis-streams-monitoring) — metrics, lag, alerting
- [Redis Testing](/redis/redis-testing) — Testcontainers and test listener groups
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/) — the Redis data type this builds on
