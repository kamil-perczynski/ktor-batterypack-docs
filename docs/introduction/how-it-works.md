# How it Works

A Batterypack application is a Ktor application whose wiring lives in one lambda and whose features are beans. This page is the view from 30,000 feet; [Core](/core/) documents each mechanism at ground level.

## One composition root

Two declarations bootstrap any Batterypack service, regardless of how many batteries it runs.

First, the Koin application — core's module plus your own:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        MyAppModule::class                    // (1)
    ]
)
object MyApp
```

1. Your module, typically carrying a `@ComponentScan` over your packages.

Second, the server wiring — the only framework call in your codebase:

```kotlin
fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles ->     // (1)
        koinApp.modules(module {
            single { loadConfig<MyConfig>(profiles) }       // (2)
            single { ktorApp }
        })
        koinApp.withConfiguration<MyApp>()                  // (3)
    }
}
```

1. One lambda receives the Ktor application, the Koin application, and the resolved profiles.
2. Your typed configuration, loaded exactly once.
3. Binds the definitions generated from `@KoinApplication` by the Koin compiler.

[Get Started](/introduction/get-started) walks the full setup — version catalog, plugins, `application.yaml`. This page stays conceptual.

Everything else — routes, health checks, cleanup, timers — is expressed as beans. That is the second half of the model.

## Registering a bean is the wiring

Core defines five small interfaces. Implement one, make the class a Koin bean, and the framework reacts — no registration list, no configuration file:

| Interface | What registering a bean gets you |
|-----------|----------------------------------|
| `KtorController` | its `register(Routing)` runs at startup; the routes are mounted |
| `ReadinessCheck` | its `check()` is aggregated into `/actuator/health/readiness` |
| `InitCallback` | its `onInit()` runs once, after the container has started |
| `AutoCloseable` | its `close()` runs on shutdown |
| `LifecycleListener` | notified of application start and stop |

The consequences matter more than the list:

- A failing `InitCallback` aborts startup with an `IllegalStateException` — a half-initialized application never takes traffic.
- A failing `close()` is logged and skipped, and shutdown always proceeds — one badly-behaved resource cannot leak the rest.
- Any `ReadinessCheck` reporting `DOWN` flips the readiness endpoint to `503`. The orchestrator stops routing traffic, but the process keeps running; only a failing liveness probe gets it restarted.

All beans are singletons. Per-request state belongs in `call.attributes`.

The extension-point contracts have [their own documentation](/core/dependency-injection); the callbacks are covered in [Lifecycle](/core/lifecycle).

## How a battery joins

Adding a battery is two edits: a Gradle dependency, and one line in the `@KoinApplication` declaration. Adding metrics, for example:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackMetricsModule::class,    // (1)
        MyAppModule::class
    ]
)
object MyApp
```

1. The only change beyond the dependency line in `build.gradle.kts`.

That single line makes `/actuator/prometheus` answer:

```bash
curl http://localhost:8080/actuator/prometheus
```

```text
# HELP http_server_requests_seconds
# TYPE http_server_requests_seconds summary
http_server_requests_seconds_count{status="200",uri="/hello"} 42
```

No route to declare, no plugin to install. The battery's `MetricsController` is a `KtorController` bean — the same extension point your own controllers use — so core's registration machinery mounts it along with everything else. This is why batteries compose: they are just more beans in the same container, reacting to the same five interfaces.

## Startup and shutdown, briefly

Startup runs in a fixed order: profiles are resolved (`app.profiles`, then the `APP_PROFILES` environment variable, falling back to `local`), the Koin container boots and your lambda runs, `InitCallback` beans fire — the first failure aborts — `StatusPages` and `ContentNegotiation` install, and every `KtorController` registers its routes.

Shutdown is the mirror image: every `AutoCloseable` bean is closed, failures logged and skipped.

The full sequences, including health endpoint responses, are documented in [Lifecycle](/core/lifecycle) and [Health](/core/health).

## What stays plain

Batterypack is conventions on top of Ktor, not a replacement for it:

- routing is the plain Ktor DSL inside your controllers' `register`,
- any Koin DSL definition is valid next to the annotated ones — the escape hatch when a convention does not fit,
- configuration is Hoplite YAML you can read and edit; `loadConfig<T>` just binds it,
- the underlying clients — `DataSource`, `RedisClient`, `MeterRegistry`, the Ktor `Application` — are ordinary injectable beans.

The conventions are additive: implement an interface and the framework reacts; implement nothing and nothing extra happens.

---

With the model in place, [Get Started](/introduction/get-started) walks the bootstrap step by step, and [Modules at a Glance](/introduction/modules) maps the rest of the pack.
