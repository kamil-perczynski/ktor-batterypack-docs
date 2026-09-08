# Redis

`ktor-batterypack-redis` provides a Lettuce-based Redis client, plus an optional streams module for event publishing and consumption.

## What it provides

- `RedisClient` and `StatefulRedisConnection<String, String>` beans.
- `RedisProps` for typed configuration.
- Lettuce Micrometer latency metrics.
- Automatic cleanup of the Redis client on shutdown.
- A `ReadinessCheck` that verifies the Redis connection.
- `RedisStreamPublisher` for publishing messages to Redis streams.
- `RedisStreamListener` interface for consuming messages from streams.
- Background loops for stream fetching, autoclaim, and lag monitoring.

## Configuration

```yaml
redis:
  url: redis://localhost:6379
  fetcher:
    consumerPrefix: Main-
    consumerGroup: florin
    fetchingTimeout: 5000
    fetchingCount: 100
    autoclaimIntervalMs: 30000
    autoclaimMinIdleMs: 60000
    autoclaimCount: 10
    lagCheckIntervalMs: 30000
  publisher:
    retentionMs: 7200000
```

## Basic client

Add `KtorBatterypackRedisModule` to your Koin application and expose `RedisProps`:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackRedisModule::class,
        MyAppModule::class
    ]
)
object MyApp

@Module
class MyAppModule {
    @Singleton
    fun redisProps(config: AppConfig): RedisProps = config.redis
}
```

Inject the connection anywhere:

```kotlin
import io.lettuce.core.api.StatefulRedisConnection

@Singleton
class MyRedisClient(private val connection: StatefulRedisConnection<String, String>)
```

## Streams

For event-driven communication, add `KtorBatterypackRedisStreamsModule`:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackRedisModule::class,
        KtorBatterypackRedisStreamsModule::class,
        MyAppModule::class
    ]
)
object MyApp
```

### Publishing

```kotlin
import io.github.ktor_batterypack.redis.RedisStreamPublisher

@Singleton
class UserEventPublisher(private val publisher: RedisStreamPublisher) {

    fun userCreated(user: User) {
        publisher.publish(
            stream = "user-events",
            payload = user
        )
    }
}
```

### Listening

```kotlin
import io.github.ktor_batterypack.redis.RedisStreamListener

@Singleton
class UserEventListener : RedisStreamListener {

    override fun stream(): String = "user-events"

    override suspend fun onMessage(payload: String, headers: Map<String, String>) {
        // process payload
    }
}
```

Listeners are grouped under `RedisStreamListenerGroups.MAIN_GROUP` by default. The streams module runs background loops that fetch new messages, autoclaim stale ones, and report consumer lag metrics.

## Readiness check

The module registers `RedisReadinessCheck` automatically, so `/actuator/health/readiness` reports the Redis status.
