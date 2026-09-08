# Bootstrap & Shutdown

The fetcher lifecycle: everything that happens between process start and the first consumed message, and its mirror on shutdown.

![Bootstrap and shutdown sequence diagram](/redis/seq-boot.svg)

[`RedisStreamFetcher`](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/RedisStreamFetcher.kt) runs as an `InitCallback`, once, before the server accepts traffic. Boot does three things, and the order matters:

1. **Clean up dead consumers** — consumers with zero pending messages and idle over 60 s (`autoclaimMinIdleMs`) are deleted. A consumer that crashed *with* messages in flight is left alone here; the autoclaim loop reclaims its messages first.
2. **Create the consumer group** — `XGROUP CREATE` with `MKSTREAM` per stream. If the group already exists, Redis answers `BUSYGROUP`, which the fetcher swallows: boot is idempotent, safe on every restart.
3. **Start the loops** — the [fetching loop](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/bgloops/RedisStreamFetchingLoop.kt), the [autoclaim loop](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/bgloops/RedisStreamAutoclaimLoop.kt), and the [lag monitor](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/monitoring/RedisStreamConsumerLagMonitorLoop.kt), each on its own connection via a [`LoopHandle`](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-redis/src/main/kotlin/io/github/ktor_batterypack/redis/LoopHandle.kt).

One default worth internalizing: groups are created at offset `0`, not at the tail. The first boot of a new group replays the entire retained backlog — up to two hours of events by default. If you publish while nobody is consuming, those events are waiting when the first consumer starts.

Shutdown is the mirror image: the fetcher is `AutoCloseable`, and on close it cancels every loop and releases its connection before the shared client is closed by the container.

The full narrative, including failure modes, is in [Stream Internals](/redis/redis-streams-internals).
