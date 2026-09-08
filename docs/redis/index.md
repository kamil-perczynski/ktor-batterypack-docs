# Redis

`ktor-batterypack-redis` wires a [Lettuce](https://lettuce.io/) Redis client with Micrometer command latency metrics and a readiness check. On top of the client it provides a [Redis Streams](/redis/redis-streams) toolkit for publishing and consuming events between domains and services.

It does not wrap pub/sub (`SUBSCRIBE`/`PUBLISH`) and ships no caching helpers. When you need plain `GET`/`SET`, distributed locks, or pub/sub, inject the underlying connection and use Lettuce directly — the batteries stay out of your way.

## What it provides

- `RedisClient` with Micrometer command latency recording — every Redis command is timed, tagged, and visible in [metrics](/observability/metrics).
- A shared `StatefulRedisConnection<String, String>` singleton.
- A `ReadinessCheck` that pings Redis and reports `DOWN` when it is unreachable.
- The [Redis Streams](/redis/redis-streams) toolkit: publishing, declarative listeners, consumer groups, crash recovery, and lag monitoring.

There are two Koin modules: `KtorBatterypackRedisModule` (the client, described on this page) and `KtorBatterypackRedisStreamsModule` (the streams machinery, which includes the base module).

## Dependency

```kotlin
implementation("io.github.kamil-perczynski:ktor-batterypack-redis:0.0.13-alpha")
```

## Wiring

Add `KtorBatterypackRedisModule` to your Koin application:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackRedisModule::class,
        MyAppModule::class
    ]
)
object MyApp
```

The module expects a `RedisProps` bean from your own configuration — the same "props come from your config object" convention as [database](/data/database):

```kotlin
@Module
@ComponentScan("com.example")
@Configuration
class MyAppModule {

    @Singleton
    fun redisProps(config: AppConfig): RedisProps = config.redis
}
```

If you use streams, register `KtorBatterypackRedisStreamsModule` instead — one entry wires both. The extra moving parts are covered in [Redis Streams](/redis/redis-streams).

## Configuration

`RedisProps` loads from your config object:

```kotlin
data class RedisProps(
    val url: String = "redis://localhost:6379",
    val fetcher: FetcherProps = FetcherProps(),
    val publisher: PublisherProps = PublisherProps()
)
```

Example `application.yaml`:

```yaml
redis:
  url: redis://localhost:6379
```

`url` defaults to `redis://localhost:6379`. This corresponds to a plain local Redis, e.g. `docker run -p 6379:6379 redis:8-alpine` or the `redis` service in the [repository's docker-compose](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/docker-compose.yml).

The `fetcher` and `publisher` blocks configure stream consumption and retention. Their defaults have real consequences — two-hour retention, sixty-second reclaim delay — so they are documented with the streams, not here: see [stream configuration](/redis/redis-streams#configuration).

## Readiness check

The module registers a readiness check that opens a connection and sends `PING`. When Redis is unreachable, the `redis` check reports `DOWN`, which takes your container out of load-balancer rotation — see [Health](/core/health). The check does not verify streams, consumer groups, or lag; it answers exactly one question: can we reach Redis.

## Direct Lettuce access

Everything the toolkit does not cover is still available through the beans:

```kotlin
@Singleton
class RateLimiter(
    private val connection: StatefulRedisConnection<String, String>
) {
    fun allow(key: String): Boolean =
        connection.sync().set(key, "1", SetArgs().nx().ex(60)) != null
}
```

Command latency is recorded through Micrometer regardless of who issues the command, so hand-written Lettuce calls show up in your metrics like everything else.

## Security notes

- `redis://` sends everything in the clear. In production use `rediss://` (TLS) with credentials in the URL, e.g. `rediss://:secret@redis.internal:6379`.
- Stream payloads become untrusted input the moment more than one service can write to your Redis. See the [stream security notes](/redis/redis-streams#security-notes).
