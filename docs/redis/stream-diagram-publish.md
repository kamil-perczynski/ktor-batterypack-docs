# Publish Message

How an event travels from a `publish` call to a stream entry.

![Publish sequence diagram](/redis/seq-publish.svg)

The [`RedisStreamPublisher`](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/RedisStreamPublisher.kt) serializes the payload to JSON and writes one flat field map with `XADD`: the payload lands under the reserved `_p` key, every header becomes an additional field. Redis generates the entry ID — a millisecond timestamp — and returns it to the caller.

Every publish also trims the stream: entries older than the retention window are removed with approximate `MINID` trimming. Retention is two hours by default (`redis.publisher.retentionMs`), overridable per publish for events that must survive longer.

Consequence: a stream here is a transport, not a log. Once an entry is trimmed it is gone — if you need an audit trail, write it to your database when you handle the event. The wire format and retention knobs are documented in [Redis Streams](/redis/redis-streams#the-wire-format).
