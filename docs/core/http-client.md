# HTTP Client

`ktor-batterypack-core` includes `KtorHttpClientFactory` for creating instrumented Ktor HTTP clients. The factory pre-configures Jackson serialization, request logging, timeouts, and Micrometer metrics.

## `KtorHttpClientFactory`

```kotlin
import io.github.ktor_batterypack.core.ktor.client.KtorHttpClientFactory
import io.ktor.client.HttpClient
import org.koin.core.annotation.Singleton

@Singleton
class FlorinClient(private val httpClientFactory: KtorHttpClientFactory) {

    private val client: HttpClient = httpClientFactory.createHttpClient(
        baseUrl = "https://api.florin.example.com",
        connectTimeoutMs = 5_000,
        readTimeoutMs = 30_000
    )

    suspend fun identify(imageBytes: ByteArray): IdentificationResult {
        // use client...
    }
}
```

The factory requires a `MeterRegistry` bean (provided by `ktor-batterypack-metrics`) and the shared `JsonMapper`.

## Pre-installed features

Every client created by the factory includes:

- **CIO engine**
- **ContentNegotiation** with Jackson (lenient mode)
- **Logging** at `HEADERS` level
- **Timeouts** for connect and request duration
- **Micrometer metrics** via `ClientMicrometerMetricsPlugin`

`expectSuccess` is set to `false` so non-2xx responses do not throw automatically.

## Metrics

Outgoing requests are recorded as Micrometer timers under `ktor.http.client.requests` with tags:

| Tag | Value |
|-----|-------|
| `method` | HTTP method |
| `status` | response status code, or `TIMEOUT` / `CONNECT_TIMEOUT` / `IO_ERROR` / `ERROR` on failure |
| `host` | request host |
| `uri` | path pattern or `UNKNOWN` |
| `error` | exception class name on failure |

Percentiles `0.5`, `0.9`, `0.95`, and `0.99` are published.

## Path patterns

By default the metric URI tag is `UNKNOWN`. Use `pathPattern()` in your request builder to tag calls with a stable route pattern:

```kotlin
import io.github.ktor_batterypack.core.ktor.client.pathPattern

client.get("/v1/plants/123") {
    pathPattern("/v1/plants/{id}")
}
```

This keeps metric cardinality low while still distinguishing endpoints.

## Cleanup

`HttpClient` implements `AutoCloseable`. If you create long-lived clients inside a bean, make the owning bean implement `AutoCloseable` and close the client in `close()` so the lifecycle listener tears it down on shutdown.

```kotlin
@Singleton
class FlorinClient(private val factory: KtorHttpClientFactory) : AutoCloseable {

    private val client: HttpClient = factory.createHttpClient(
        baseUrl = "https://api.florin.example.com",
        connectTimeoutMs = 5_000,
        readTimeoutMs = 30_000
    )

    override fun close() {
        client.close()
    }
}
```
