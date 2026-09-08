# Metrics

`ktor-batterypack-metrics` exposes application metrics in Prometheus format using Micrometer.

## What it provides

- A `PrometheusMeterRegistry` bean bound as `MeterRegistry`.
- `KtorMetricsInit` to register Ktor-specific metric filters before any metrics are recorded.
- A `MetricsController` that serves `/actuator/prometheus`.
- Helpers for timing method invocations via dynamic proxies.

## Wiring

Add `KtorBatterypackMetricsModule` to your Koin application:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackMetricsModule::class,
        MyAppModule::class
    ]
)
object MyApp
```

## Prometheus endpoint

Once wired, the following endpoint is available automatically:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/actuator/prometheus` | Prometheus scrape output |

Example response:

```text
# HELP http_server_requests_seconds
# TYPE http_server_requests_seconds summary
http_server_requests_seconds_count{status="200",uri="/hello"} 42
```

## Recording custom metrics

Inject the `MeterRegistry` or `PrometheusMeterRegistry` anywhere:

```kotlin
import io.micrometer.core.instrument.MeterRegistry
import org.koin.core.annotation.Singleton

@Singleton
class OrderService(private val meterRegistry: MeterRegistry) {

    fun placeOrder() {
        meterRegistry.counter("orders.placed").increment()
        // ...
    }
}
```

## Ktor metrics

The module registers `KtorMetricsInit` as a `MeterRegistryInit` bootstrapper so that Ktor's Micrometer metrics are configured correctly before other metrics are recorded.

## Timing methods

The module includes helpers for timing interface methods via dynamic proxies. Enable sampling during application bootstrap:

```kotlin
import io.github.ktor_batterypack.metrics.reflect.enableTimedMethodsSampling
import org.koin.core.KoinApplication

fun configureKoin(koinApp: KoinApplication) {
    enableTimedMethodsSampling(koinApp)
}
```

This wraps timed interfaces so their method invocations are recorded in Micrometer.
