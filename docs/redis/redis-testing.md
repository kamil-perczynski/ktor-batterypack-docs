# Redis Testing

`ktor-batterypack-redis-testing` provides a Testcontainers-based Redis container and test helpers for integration tests.

## RedisTestContainer

`RedisTestContainer` starts a Redis container and exposes the Redis URI:

```kotlin
import io.github.ktor_batterypack.redis.testing.RedisTestContainer

class MyIntegrationTest {

    companion object {
        val redis = RedisTestContainer().apply { start() }
    }
}
```

### Default settings

| Property | Default |
|----------|---------|
| Image | `redis:8-alpine` |
| Port | `6379` |

### Customizing

```kotlin
val redis = RedisTestContainer(image = "redis:7-alpine").apply { start() }
```

### Redis URI

```kotlin
val uri = redis.redisUri
// redis://localhost:<mapped-port>
```

## Capturing messages

`MsgCapturingRedisListener` lets tests capture stream messages without implementing a full listener:

```kotlin
import io.github.ktor_batterypack.redis.testing.MsgCapturingRedisListener

@Singleton
class TestListener : MsgCapturingRedisListener(stream = "user-events")
```

## Typical test setup

Use a shared container to avoid starting Redis for every test class:

```kotlin
abstract class RedisTest {

    companion object {
        @JvmStatic
        val redis: RedisTestContainer = RedisTestContainer().apply { start() }

        init {
            System.setProperty("REDIS_URL", redis.redisUri)
        }
    }
}
```

The core `loadConfig` function reads environment variables, so setting `REDIS_URL` before the config is loaded points the application at the test container.

## Dependency

```kotlin
testImplementation("io.github.kamil-perczynski:ktor-batterypack-redis-testing:0.0.13-alpha")
```
