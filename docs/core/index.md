# Core

`ktor-batterypack-core` is the module every Batterypack application starts from. One function — `configureKtorServer` — boots the server: it resolves configuration profiles, starts the Koin container, installs global exception handling and Jackson content negotiation, and discovers your route controllers.

It makes the repetitive parts of a Ktor backend someone else's problem:

- **one composition root** — `configureKtorServer` wires container, plugins, and routes in a single call,
- **bean registration is the wiring** — implement `KtorController` or `ReadinessCheck`, annotate with `@Singleton`, and the framework reacts; there is no registration list to maintain,
- **typed configuration** — `loadConfig<T>` binds YAML, environment variables, and system properties into data classes,
- **uniform errors** — every failure, from a rejected request body to an unhandled `Throwable`, leaves the server as an RFC 7807 `ProblemDetail`,
- **Kubernetes probes for free** — liveness and readiness endpoints are mounted before you write a single route.

The other modules — [Database](/data/database), [Redis](/redis/), [Metrics](/observability/metrics), [Validation](/validation/validation) — are add-ons. Each contributes beans to the same container through the same extension points, and none of them is required: core alone serves HTTP, JSON, health, and errors. Core does not hide its foundations, either — Ktor, Koin, Hoplite, and Jackson 3 are all still there, and plain Koin definitions remain the escape hatch whenever a convention does not fit.

What core deliberately does not do: request-scoped injection (all beans are singletons; per-request state belongs in `call.attributes`), request validation (that is the [Validation](/validation/validation) module's job), and any persistence, messaging, or metrics of its own.

## The composition root

Bootstrapping an application takes two declarations. First, the Koin application — the core module plus your own:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        MyAppModule::class
    ]
)
object MyApp

@Module
@ComponentScan("com.example.myapp")
@Configuration
class MyAppModule
```

Second, the server wiring. `configureKtorServer` takes a single lambda that receives the Ktor application, the Koin application, and the resolved profiles:

```kotlin
fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles ->
        koinApp.modules(
            module {
                single { loadConfig<ConfigMap>(profiles) } // (1)
                single { ktorApp }
            }
        )
        koinApp.withConfiguration<MyApp>()                 // (2)
    }
}
```

1. The typed configuration, loaded exactly once with the active profiles.
2. Binds the Koin definitions generated from `@KoinApplication` by the Koin compiler.

The Gradle setup — version catalog, Koin compiler plugin, `application.yaml` — is covered in [Get Started](/introduction/get-started); this page assumes it.

That single call installs, in order: the Koin container, `StatusPages` with a global `KtorExceptionHandler`, `ContentNegotiation` with the shared Jackson `JsonMapper` (Kotlin module included, dates written as ISO-8601 strings rather than timestamps), and routing built from every `KtorController` bean in the container. You do not install any of these yourself — you only touch them to add more.

The result is immediately observable. With nothing but the two declarations above, the server already answers:

```bash
curl http://localhost:8080/actuator/health/readiness
```

```json
{
  "status": "UP",
  "checks": { "diskSpace": "UP" }
}
```

The built-in disk check reports `DOWN` when the working directory has 100 MB or less of usable space. Health endpoints, their responses, and the `ReadinessCheck` contract have a [dedicated page](/core/health).

## What's inside

Each capability has its own page:

| Capability | What it gives you |
|------------|-------------------|
| [Configuration](/core/config) | `loadConfig<T>` — typed data classes, profile-specific YAML, environment-variable overrides |
| [Dependency Injection](/core/dependency-injection) | Koin with annotations, the composition root, and the extension-point idea |
| [OpenAPI Generator](/core/openapi-generator) | the recommended pipeline for request and response DTOs and their validators |
| [Controllers](/core/controllers) | `KtorController` — implement, annotate, and routes are mounted at startup |
| [Exception Handling](/core/exceptions) | seven pre-configured handlers, all producing RFC 7807 `ProblemDetail` |
| [Lifecycle](/core/lifecycle) | `InitCallback` at startup, `AutoCloseable` at shutdown — no manual wiring |
| [Request Binding](/core/request-binding) | `JsonBinder` and `QsBinder` — validate incoming data, then bind it to typed DTOs |
| [Multipart Uploads](/core/multipart) | `MultipartParser` with content-type and size limits |
| [HTTP Client](/core/http-client) | `KtorHttpClientFactory` — timeouts, logging, and Micrometer metrics pre-installed |
| [Health](/core/health) | liveness and readiness endpoints under `/actuator/health` |

## The extension points

The idea the whole pack runs on: *registering a bean is the wiring*. Core defines five small interfaces — implement one, make the class a Koin bean, and the framework reacts. No registration list, no configuration file, no `when` statement dispatching on type.

| Interface | What registering a bean gets you |
|-----------|----------------------------------|
| `KtorController` | its `register(Routing)` is invoked at startup; the routes are mounted |
| `ReadinessCheck` | its `check()` is aggregated into `/actuator/health/readiness` |
| `InitCallback` | its `onInit()` runs once, after the container has started |
| `AutoCloseable` | its `close()` runs on shutdown |
| `LifecycleListener` | notified of application start and stop |

The consequences matter more than the list:

- A failing `InitCallback` aborts startup with an `IllegalStateException` — a half-initialized application never takes traffic.
- A failing `close()` is logged and skipped, and shutdown always proceeds — one badly-behaved resource cannot leak the rest.
- Any `ReadinessCheck` reporting `DOWN` flips the readiness endpoint to `503`. The orchestrator stops routing traffic but the process keeps running; only a failing *liveness* probe gets it restarted.

All beans are singletons — if you need per-request state, keep it in `call.attributes`.

## What happens at startup

The bootstrap sequence, in the order the framework executes it:

1. **Profiles are resolved** — `app.profiles` from Ktor's own config, then the `APP_PROFILES` environment variable, falling back to `local`. Multiple profiles are comma-separated.
2. **The Koin container boots** — your lambda runs here, typically loading the typed configuration once.
3. **Init callbacks run** — `KoinLifecycleListener` invokes every `InitCallback` bean (the optional startup banner among them). The first failure aborts startup.
4. **Plugins install** — `StatusPages` with the global exception handler, then `ContentNegotiation` with the shared `JsonMapper`.
5. **Controllers register** — every `KtorController` bean's `register` is invoked, each logged by name, and the server starts accepting requests.

Shutdown is the mirror image: on stop-preparing, the listener closes every `AutoCloseable` bean, logging and continuing past failures.

Active profiles default to `local`. The default exists so the application picks up `application-local.yaml` — typically gitignored — before you configure anything else.

## Going further

Core alone is a complete HTTP service: routing, JSON, uniform errors, health probes. The other batteries become relevant when the domain does:

- [Database](/data/database) — Exposed + Hikari, monitored transactions, and its own readiness check
- [Redis](/redis/) — Lettuce client, stream publishing and consumption
- [Metrics](/observability/metrics) — Micrometer registry and Prometheus endpoints
- [Validation](/validation/validation) — declarative request validation with KSP code generation

One coupling worth knowing in advance: [`KtorHttpClientFactory`](/core/http-client) requires a `MeterRegistry` bean, which `ktor-batterypack-metrics` provides. Without a metrics module in the container, the factory cannot be created.

For a complete working project wired with all of the above, see the [Example Application](/example/).
