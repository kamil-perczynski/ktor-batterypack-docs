# HTTP Client

`ktor-batterypack-core` ships `KtorHttpClientFactory` — a singleton bean that builds pre-configured Ktor `HttpClient`s for calling other services. One call produces a client with the pack's conventions already installed:

- **JSON parity** — the client serializes with the same `JsonMapper` bean the server uses, so outbound requests and API responses handle Kotlin types and dates identically,
- **bounded waits** — a connect timeout and a request deadline, both per downstream,
- **metrics included** — every request is timed and tagged in Micrometer, exceptions included,
- **no cleanup wiring** — publish the client as a bean and the container closes it on shutdown.

The factory does not replace Ktor's `HttpClient` — it constructs one (the CIO engine) and hands you back the standard API. The setup is fixed and curated rather than negotiated per call: exactly what gets installed is enumerated in the next section.

One dependency to know up front: the factory needs a `MeterRegistry` bean, which [`ktor-batterypack-metrics`](/observability/metrics) provides. Without a metrics module in the container, startup fails with an unresolved dependency. What the factory deliberately does not do: retries, circuit breaking, fallbacks, authentication, and cookies — those are yours to add.

## The factory

`KtorHttpClientFactory` is a stateless singleton, published by the core module, that turns three values — a base URL and two timeouts — into a fully configured Ktor `HttpClient`. Each call to `createHttpClient` returns a new, independent client; the factory keeps no reference to what it built. One instance lives in the container, and every module injects the same one.

The class in full — the actual source, not an abridgment:

```kotlin{3-4,8-10}
@Singleton
class KtorHttpClientFactory(
    @Provided private val meterRegistry: MeterRegistry,
    private val jsonMapper: JsonMapper
) {

    fun createHttpClient(
        baseUrl: String,
        connectTimeoutMs: Long,
        readTimeoutMs: Long
    ): HttpClient = HttpClient(CIO) {
        expectSuccess = false

        install(ContentNegotiation) {
            register(ContentType.Application.Json, JacksonConverter(jsonMapper, true))
        }

        install(Logging) {
            logger = Logger.DEFAULT
            level = LogLevel.HEADERS
        }

        install(HttpTimeout) {
            connectTimeoutMillis = connectTimeoutMs
            requestTimeoutMillis = readTimeoutMs
        }

        install(ClientMicrometerMetricsPlugin) {
            registry = meterRegistry
        }

        defaultRequest {
            url(baseUrl)
        }
    }
}
```

Two beans go in. `meterRegistry` is the container's registry — the [`ktor-batterypack-metrics`](/observability/metrics) requirement from the opening: no metrics module, no factory bean. `jsonMapper` is the core module's shared mapper, the same bean the server's own content negotiation uses — whatever serializes your API responses serializes your outbound requests, Kotlin module and ISO-8601 dates included.

Note the absence of defaults: all three arguments of `createHttpClient` are mandatory. Every caller states its base URL and both timeouts — the factory refuses to guess, so a timeout you did not choose is a timeout you do not get.

What comes out is a client configured as follows:

| Piece | Setting | Consequence |
|-------|---------|-------------|
| Engine | CIO | coroutine-based I/O, HTTP/1.1 only |
| `expectSuccess` | `false` | non-2xx responses return normally; status handling is explicit |
| Content negotiation | shared `JsonMapper` | outbound JSON matches the server's serialization |
| Logging | `HEADERS`, `Logger.DEFAULT` | request and response headers logged to the console |
| Timeouts | `HttpTimeout` | connect deadline plus whole-request deadline |
| Metrics | `ClientMicrometerMetricsPlugin` | every request timed — see [Client metrics](#client-metrics) |
| Base URL | `defaultRequest { url(baseUrl) }` | relative request paths resolve against the base |

Three of these deserve narration.

**Status handling.** `expectSuccess` is `false` — the deliberate convention that status handling is a `when` at the call site, not a `try/catch` around `body()`. The common mistake is skipping the check:

```kotlin
// anti-pattern: assumes every response is a Charge
val charge = httpClient.post("/v1/charges") { setBody(request) }.body<Charge>() // [!code error]
```

On a `422` this does not fail with "payment rejected" — it reads the error document *as* a `Charge` and fails with a Jackson mapping error pointing at your DTO. The `when (response.status)` branch in the usage section below is the fix; it keeps the real failure visible.

**Logging goes to the console.** An honest gap: the pre-installed logging uses `Logger.DEFAULT`, which prints to stdout — not to SLF4J/Logback. Client request logs will not land in your structured log setup, and the factory offers no way to change that; a hand-built client with `logger = Logger.SLF4J` is the alternative.

**The "read" timeout is the whole request.** `readTimeoutMs` maps to Ktor's `requestTimeoutMillis`: the deadline covers sending the body, waiting for the status line, and reading the response. A slow download counts against it, so budget for the entire exchange, not the read phase. `connectTimeoutMs` covers only opening the connection.

The limits are deliberate: the engine is fixed to CIO — HTTP/1.1 only — logging is fixed to the console, and there is no plugin pass-through; the table is the whole configuration. When that box does not fit — HTTP/2, authentication plugins, SLF4J logging — plain `HttpClient(...)` remains available and the metrics plugin is public API. Just know that a hand-built client inherits nothing from the table: each piece you want is yours to spell out.

## The simplest working usage

A client is one bean definition — a name, a base URL, and two timeouts:

```kotlin{12-19}
import io.github.ktor_batterypack.core.ktor.client.KtorHttpClientFactory
import io.ktor.client.HttpClient
import org.koin.core.annotation.Configuration
import org.koin.core.annotation.Module
import org.koin.core.annotation.Named
import org.koin.core.annotation.Singleton

@Module
@Configuration
class PaymentsModule {

    @Singleton
    @Named("payments")
    fun paymentsHttpClient(factory: KtorHttpClientFactory): HttpClient =
        factory.createHttpClient(
            baseUrl = "https://api.payments.example.com",
            connectTimeoutMs = 1_000,
            readTimeoutMs = 15_000
        )
}
```

The caller injects it under the same name and speaks plain Ktor:

```kotlin{16,19-28}
import io.github.ktor_batterypack.core.ktor.client.pathPattern
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.HttpStatusCode
import org.koin.core.annotation.Named
import org.koin.core.annotation.Singleton

@Singleton
class ChargesClient(@Named("payments") private val httpClient: HttpClient) {

    suspend fun charge(amountCents: Int): Charge {
        val response = httpClient.post("/v1/charges") {
            setBody(ChargeRequest(amountCents))
            pathPattern("/v1/charges")
        }

        return when (response.status) {
            HttpStatusCode.OK, HttpStatusCode.Created ->
                response.body<Charge>()

            HttpStatusCode.UnprocessableEntity ->
                throw ChargeRefusedException("payment rejected: $amountCents cents")

            else ->
                throw IllegalStateException("Unexpected status from payments: ${response.status}")
        }
    }
}
```

`pathPattern` tags the request for client metrics; without it, the request is recorded under `uri="UNKNOWN"` (see [Client metrics](#client-metrics)). The `when` is the status handling — non-2xx responses return normally instead of throwing, so your code decides what each status means, with both paths visible at the call site. Everything else is plain Ktor, down to the relative `/v1/charges` path, which resolves against the client's base URL because `defaultRequest` is pre-installed.

Name every client from the start, even the first one: two unnamed `HttpClient` beans leave the container unable to tell them apart, and adding the name later means touching every injection site.

An exception thrown from a wrapper like `ChargesClient` propagates like any other failure while handling a request — the global handler turns it into a `ProblemDetail` ([Exception Handling](/core/exceptions)).

## The recommended usage

Hard-coded URLs belong in scratch code. Production derives them from the typed config tree — the usual convention that beans consume props beans, never configuration files ([Configuration](/core/config), [Dependency Injection](/core/dependency-injection)):

```yaml
payments:
  baseUrl: "https://api.payments.example.com"
  connectTimeoutMs: 1000
  readTimeoutMs: 15000
```

```kotlin
data class PaymentsProps(
    val baseUrl: String = "",
    val connectTimeoutMs: Long = 1_000,   // one second to open the connection
    val readTimeoutMs: Long = 15_000      // fifteen seconds for the whole request
)
```

The module binds the props and the client next to each other:

```kotlin{6,14-16}
@Module
@Configuration
class PaymentsModule {

    @Singleton
    fun paymentsProps(@Provided configMap: ConfigMap): PaymentsProps = configMap.payments

    @Singleton
    @Named("payments")
    fun paymentsHttpClient(
        factory: KtorHttpClientFactory,
        props: PaymentsProps
    ): HttpClient = factory.createHttpClient(
        baseUrl = props.baseUrl,
        connectTimeoutMs = props.connectTimeoutMs,
        readTimeoutMs = props.readTimeoutMs
    )
}
```

`ConfigMap` is your root configuration class — the [Configuration](/core/config) page covers the pattern.

One client per downstream service, created once at startup and reused. CIO pools connections inside the client instance; a client built per request throws the pool away and pays connection setup on every call. The lifecycle side is automatic: `HttpClient` is `AutoCloseable`, the container collects it at shutdown, and the closing rules of [Lifecycle](/core/lifecycle) apply — a throwing `close()` is logged and skipped, the rest still close.

## Client metrics

Every request through a factory-built client is recorded as a Micrometer timer named `ktor.http.client.requests` — the plugin's default `metricName`, which the factory keeps. Quantiles 0.5, 0.9, 0.95, and 0.99 are published with it.

| Tag | Value |
|-----|-------|
| `method` | request method — `GET`, `POST`, ... |
| `status` | response code as a string — `200`, `503`; failure tags for exceptions, below |
| `host` | the request's host, e.g. `api.payments.example.com` |
| `uri` | the `pathPattern` value, `UNKNOWN` when not set |
| `error` | the exception's class name — present only on failures |

The `uri` tag is the one you control, and the only one that needs your help. Server-side metrics can derive a route pattern from the routing table; a client has no routing table, so the plugin cannot know that `/v1/charges/42` and `/v1/charges/97` are the *same operation*. Without `pathPattern`, every request is recorded under `uri="UNKNOWN"` — the timer still works, but a slow `/charges` is indistinguishable from a slow `/refunds`. Hence the extension you already saw:

```kotlin{4}
import io.github.ktor_batterypack.core.ktor.client.pathPattern

httpClient.post("/v1/charges") {
    pathPattern("/v1/charges")
}
```

Pass static literals. Interpolated IDs or query strings produce one Prometheus series per distinct value — see [Security notes](#security-notes).

Failures are timed as well. The plugin wraps the send phase: when a request throws, it records the duration with a failure status and rethrows — the exception still reaches your code, metrics never swallow it.

| Exception | `status` tag |
|-----------|--------------|
| `HttpRequestTimeoutException` | `TIMEOUT` |
| `ConnectTimeoutException` | `CONNECT_TIMEOUT` |
| `SocketTimeoutException` | `TIMEOUT` |
| any other `IOException` | `IO_ERROR` |
| anything else | `ERROR` |

Scraped from `/actuator/prometheus` ([Metrics](/observability/metrics)), a healthy timer looks like:

```text
ktor_http_client_requests_seconds_count{method="POST",status="200",host="api.payments.example.com",uri="/v1/charges"} 128
ktor_http_client_requests_seconds{method="POST",status="200",host="api.payments.example.com",uri="/v1/charges",quantile="0.5"} 0.113
```

The median charge round-trip takes 113 ms. To see your own series after wiring a client:

```bash
curl -s http://localhost:8080/actuator/prometheus | grep ktor_http_client
```

## Security notes

- **Headers end up in the logs.** The pre-installed logging runs at `HEADERS`. Ktor masks the `Authorization` header by default; every other header — `Cookie`, `X-API-Key`, custom tokens — is printed in full to stdout. Keep secret-bearing headers to a minimum, and prefer `Authorization`, which is masked.
- **Talk HTTPS to downstreams.** With a `http://` base URL, every request — tokens included — crosses the network in cleartext. Internal service-to-service traffic is still a network; use `https://` unless the downstream sits on localhost or a sealed sidecar connection.
- **`pathPattern` values become Prometheus label values.** A static literal costs one series per status code; an interpolated ID or query string costs one per distinct request, multiplying your series count with your traffic. Tag the operation, not the instance.
