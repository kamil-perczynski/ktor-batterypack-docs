# Core

`ktor-batterypack-core` is the foundation of the library. It bootstraps a Ktor application with Koin, Jackson, global exception handling, content negotiation, and automatic controller registration.

## What it provides

| Topic | Purpose |
|-------|---------|
| [Configuration](/core/config) | Type-safe config loading via Hoplite from YAML, environment variables, system properties, and active profiles |
| [OpenAPI Generator](/core/openapi-generator) | Recommended setup for generating DTOs from an OpenAPI spec and wiring them to validation and JsonBinder |
| [Controllers](/core/controllers) | `KtorController` interface for route classes that are discovered and registered automatically |
| [Exception Handling](/core/exceptions) | RFC 7807 `ProblemDetail` responses for validation, business, and unexpected errors |
| [Lifecycle](/core/lifecycle) | Startup `InitCallback`s and shutdown `AutoCloseable` cleanup around the Koin application lifecycle |
| [Request Binding](/core/request-binding) | Validated JSON body and query-parameter binding via `JsonBinder` and `QsBinder` |
| [Multipart Uploads](/core/multipart) | File upload parsing with content-type and size validation |
| [HTTP Client](/core/http-client) | Instrumented Ktor client factory with Jackson, logging, timeouts, and Micrometer metrics |
| [Health](/core/health) | Liveness and readiness endpoints |

## Bootstrap

The entry point is `configureKtorServer`. It installs the required Ktor plugins, wires Koin, and auto-discovers controllers:

```kotlin
import io.github.ktor_batterypack.core.configureKtorServer
import io.ktor.server.application.Application
import org.koin.plugin.module.dsl.withConfiguration

fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles ->
        // add custom modules, load config, expose the Application instance
        koinApp.withConfiguration<MyKoinApp>()
    }
}
```

`configureKtorServer` performs the following steps:

1. Resolves active profiles from `app.profiles` config or the `APP_PROFILES` environment variable.
2. Subscribes to Koin start/stop lifecycle events.
3. Installs the Koin plugin and invokes your configuration callback.
4. Installs `StatusPages` using `KtorExceptionHandler`.
5. Installs `ContentNegotiation` with the shared Jackson mapper.
6. Registers every `KtorController` bean in the Koin container.

## Core Koin module

`KtorBatterypackCoreModule` provides the following beans out of the box:

- `JsonMapper` — Jackson mapper with the Kotlin module and ISO date formatting.
- `LifecycleListener` — invokes `InitCallback`s on startup and closes `AutoCloseable`s on shutdown.
- `ReadinessCheck` — built-in disk-space readiness check.
- `ReadinessEndpoint` — aggregates all readiness checks.
- `KtorController` (`HealthController`) — registers `/actuator/health/liveness` and `/actuator/health/readiness`.
- `MultipartParser` — validates and parses multipart uploads.
- `InitCallback` (`BannerPrinter`) — prints the configured banner on startup.

Include it in your `@KoinApplication` module list:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        MyAppModule::class
    ]
)
object MyApp
```

See the individual topic pages for detailed usage.
