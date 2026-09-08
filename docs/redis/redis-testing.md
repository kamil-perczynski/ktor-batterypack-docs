# Redis Testing

`ktor-batterypack-redis-testing` gives integration tests a real Redis: a Testcontainers Redis, a second stream fetcher wired to test-only listeners, and a helper that captures stream messages. Tests publish and consume over the same machinery production uses — [Redis Streams](/redis/redis-streams) end to end — against a throwaway container.

What it deliberately does not do: mock anything. If you want unit tests without Redis, test your handlers directly — `onMessage(payload, headers)` is a plain suspend function.

## Dependency

```kotlin
testImplementation("io.github.kamil-perczynski:ktor-batterypack-redis-testing:0.0.13-alpha")
```

## RedisTestContainer

`RedisTestContainer` starts a Redis container and exposes its URI:

```kotlin
import io.github.ktor_batterypack.redis.testing.RedisTestContainer

val redis = RedisTestContainer().apply { start() }

val uri = redis.redisUri
// redis://localhost:<mapped-port>
```

| Property | Default |
|----------|---------|
| Image | `redis:8-alpine` |
| Port | `6379` (mapped) |

Start the container once per test class run, not per test — the [example app](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-example/src/test/kotlin/infra/KtorBatteriesIT.kt) shares it from a companion object. Use a custom image only to match production, e.g. `RedisTestContainer("redis:7-alpine")`.

## The test fetcher

`TestRedisModule` registers a second `RedisStreamFetcher`: consumer `Test` in consumer group `test`, driving only listeners whose `group()` returns `TEST_GROUP`. Your production listeners keep their default group and keep running under the main fetcher.

Since Redis delivers a copy of every message to each consumer group, both see the same events: your real handlers process them, and your test collector asserts on them. No behavior is stubbed out.

Registering the test fetcher is a matter of adding one module. Define a test Koin application that reuses your production modules plus `TestRedisModule`:

```kotlin
@KoinApplication
object TestMyApp

@Module(
    includes = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackMetricsModule::class,
        KtorBatterypackRedisStreamsModule::class,
        TestRedisModule::class,
        MyAppModule::class
    ]
)
@Configuration
@ComponentScan("com.example")
class TestMyAppModule
```

Point the app at the container before it boots, using the config override prefix the core config loader honors:

```kotlin
System.setProperty("config.override.redis.url", redis.redisUri)
```

## Capturing messages

For a quick capture, `MsgCapturingRedisListener` records every payload it receives:

```kotlin
import io.github.ktor_batterypack.redis.testing.MsgCapturingRedisListener

val collector = MsgCapturingRedisListener("user_events")
// collector.payloads: List<CapturedMsg> in arrival order
```

As a registered bean it lands in the default group — where it would [replace your real listener](/redis/redis-streams#consumer-groups-and-scaling) for the same stream name. When your app has a production listener on the stream under test, subclass and switch groups:

```kotlin{4}
@Singleton
class UserEventsCollector : MsgCapturingRedisListener(USER_EVENTS_TOPIC) {
    override fun group(): String = TEST_GROUP
}
```

For tests that await a specific event, the await pattern from the example application beats polling the list — a `CompletableDeferred` reset per expectation, with a timeout:

```kotlin
@Singleton
class UserEventsCollector : RedisStreamListener {

    private var result = CompletableDeferred<CapturedMsg>()

    fun expectResult() {
        result = CompletableDeferred()
    }

    override fun stream(): String = USER_EVENTS_TOPIC

    override fun group(): String = TEST_GROUP

    override suspend fun onMessage(payload: String, headers: Map<String, String>) {
        if (!result.isCompleted) result.complete(CapturedMsg(payload, headers))
    }

    suspend fun lastMessage(): CapturedMsg? = withTimeoutOrNull(3.seconds) {
        result.await()
    }
}
```

`lastMessage()` returns `null` after three seconds instead of hanging the test — a missing event fails an assertion, not the build timeout.

## A full test

The example application's pattern, condensed — publish through the real publisher (via an HTTP call), await the collector, assert on the payload:

```kotlin
class UserEventsIT : AppIntegrationTest() {

    private val collector: UserEventsCollector = application.koin().get()
    private val jsonMapper: JsonMapper = application.koin().get()

    @Test
    fun `creating a user publishes USER_CREATED`() = runTest {
        collector.expectResult()

        val response = httpClient.post("/users") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Alice","age":30}""")
        }

        assertThat(response.status).isEqualTo(HttpStatusCode.Created)

        val captured = collector.lastMessage()
        assertThat(captured).isNotNull

        val event = jsonMapper.readValue(captured!!.payload, UserEvent::class.java)
        assertThat(event.type).isEqualTo(UserEventType.USER_CREATED)
    }
}
```

`expectResult()` before the action that publishes — otherwise an event from a previous test can complete the deferred and steal this test's assertion.

The base class is the container plus the system property plus a booted application — the full version lives in the [example application's tests](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/ktor-batterypack-example/src/test/kotlin/infra/KtorBatteriesIT.kt).

## See also

- [Redis Streams](/redis/redis-streams) — the mechanics under test
- [Database Testing](/data/database-testing) — the same pattern for PostgreSQL
