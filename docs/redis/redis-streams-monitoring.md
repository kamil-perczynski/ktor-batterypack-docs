# Stream Monitoring

Everything the streams machinery does is measured: handler duration per stream, messages reclaimed from dead consumers, and per-consumer health. All of it flows through Micrometer to [/actuator/prometheus](/observability/metrics#prometheus-endpoint) — no extra wiring, no scraping config beyond what [Metrics](/observability/metrics) already sets up.

You read these metrics to answer three production questions: are handlers fast, are messages flowing, and is anything stuck. This page is the reference; what the numbers mean operationally is in [Reading consumer health](#reading-consumer-health).

## Metrics reference

| Metric | Type | Tags |
|--------|------|------|
| `redis.stream.listener.duration` | timer (p50/p95/p99) | `stream`, `consumerGroup`, `throwable` |
| `redis.stream.autoclaim.reclaimed` | counter | `stream` |
| `redis.stream.info` | gauge | `stream`, `consumerGroup`, `consumer`, `type` |

**`redis.stream.listener.duration`** times one `onMessage` invocation, success or failure. The `throwable` tag is `n/a` when the handler returned normally, and the exception's class name when it threw — so the failure rate per stream is a label filter away:

```promql
sum(rate(redis_stream_listener_duration_seconds_count{throwable!="n/a"}[5m]))
  /
sum(rate(redis_stream_listener_duration_seconds_count[5m]))
```

**`redis.stream.autoclaim.reclaimed`** increments by the number of messages each autoclaim pass reclaims. In a healthy deployment it sits at zero forever; any movement means a consumer died or stalled with messages in flight — see [failure modes](/redis/redis-streams-internals#failure-modes).

**`redis.stream.info`** is sampled from [XINFO CONSUMERS](https://redis.io/docs/latest/commands/xinfo-consumers/) every 30 s (`redis.fetcher.lagCheckIntervalMs`) and exposed as one gauge per `type`:

| `type` | Value |
|--------|-------|
| `pending` | messages delivered to this consumer but not yet acknowledged |
| `idle` | milliseconds since this consumer last received a message |
| `inactive` | milliseconds since this consumer last successfully interacted with the server; `-1` when your Redis does not report it (7.2 and above do) |

This is what the scrape output looks like:

```text
redis_stream_listener_duration_seconds{consumerGroup="florin",stream="wallet_events",throwable="n/a",quantile="0.99"} 0.041
redis_stream_listener_duration_seconds_count{consumerGroup="florin",stream="wallet_events",throwable="n/a"} 128
redis_stream_autoclaim_reclaimed_total{stream="wallet_events"} 3
redis_stream_info{consumer="Main-19a4f0c1b2",consumerGroup="florin",stream="wallet_events",type="pending"} 2
redis_stream_info{consumer="Main-19a4f0c1b2",consumerGroup="florin",stream="wallet_events",type="idle"} 45000
```

The consumer name is the instance: `Main-` plus a hex timestamp, one per running app instance. Additionally, every Lettuce command is timed under the `lettuce.command.*` prefix (first response and completion) — connection-level slowness shows up there even when the stream metrics look fine.

## Reading consumer health

The gauges tell you which of the three states you are in:

**Flowing.** `pending` at or near zero — expect transient values up to one fetching batch (100 by default) while a batch is being worked — and `idle` oscillating in the seconds range. Every consumer shows traffic. This is the steady state.

**Stuck.** `pending` climbing on one consumer while `idle` grows. Messages are delivered but never acknowledged. Throwing handlers don't cause this — [they still acknowledge](/redis/redis-streams#delivery-guarantees) — so a climbing `pending` means handlers that don't *return*: hung or looping. Autoclaim rescues this after the idle window (reclaimability is a property of the message, not the consumer's aliveness): watch `pending` drain as `autoclaim.reclaimed` climbs.

**Dying.** `autoclaim.reclaimed` climbing, a consumer's `pending` dropping to zero as its messages are claimed by others. A crash happened; the toolkit is recovering. One blip after a deployment is normal — consumers don't get deleted until the [next fetcher boot](/redis/redis-streams-internals#the-fetcher-lifecycle), so the dead consumer lingers in the gauges with `pending=0` and a climbing `idle`. Sustained reclaiming means a crash loop or chronically slow consumers.

A handler must finish well within `redis.fetcher.autoclaimMinIdleMs` (60 s default). A slower handler has its message reclaimed mid-flight and processed twice — idle time counts from delivery, not from when your handler started.

## Alerting on it

Three alerts cover the failure modes; thresholds are a starting point, not doctrine:

- **Backlog** — `sum by (stream) (redis_stream_info{type="pending"}) > 1000` for 5 minutes. Messages are arriving faster than they are handled, or a handler is wedged.
- **Crash loop** — `increase(redis_stream_autoclaim_reclaimed_total[10m]) > 0` outside deploy windows. Instances are dying with messages in flight.
- **Slow handlers** — `redis_stream_listener_duration_seconds{quantile="0.99"} > 1` sustained. Handlers are slower than your latency budget; the per-stream tag points at the culprit.

The `redis` readiness check does not cover any of this — it pings Redis, nothing more. A stream can be fully wedged while readiness says `UP`; that is what these metrics are for.

## See also

- [Redis Streams](/redis/redis-streams) — usage and delivery guarantees
- [Stream Internals](/redis/redis-streams-internals) — the loops that produce these numbers
- [Metrics](/observability/metrics) — the Prometheus wiring underneath
