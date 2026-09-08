# Dependency injection

ktor-batterypack uses Koin with Koin Annotations as its DI stack. This page does not teach Koin; it covers what ktor-batterypack adds on top:

- a single composition root (`configureKtorServer`) that boots the container and wires the server,
- extension-point interfaces — the core idea, where *registering a bean is the wiring*,
- a startup/shutdown lifecycle driven entirely by the container.

The container is not hidden. If a convention does not fit, plain Koin definitions are the escape hatch, and you can always add them in `configureKtorServer`. What the pack does not provide: request-scoped injection. All beans are singletons; per-request state belongs in `call.attributes`.

## Setup

`ktor-batterypack-core` exposes the Koin runtime transitively (`koin-core`, `koin-ktor`, `koin-annotations` — Koin 4.2.1), so you only add the compile-time generator:

```kotlin
plugins {
    alias(libs.plugins.koin.compiler) // Koin compiler plugin, version 1.0.0-RC2
}
```

Without the KSP compiler, `@Singleton`, `@Module`, and `@KoinApplication` are inert annotations — no definitions are generated and the container starts empty.

## The composition root

`configureKtorServer` is the single entry point. It resolves configuration profiles (from `app.profiles`, then `APP_PROFILES`, defaulting to `local`), installs the container, and invokes your lambda before the server starts accepting requests:

```kotlin
fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles ->
        koinApp.modules(
            module {
                single { loadConfig<ConfigMap>(profiles) } // (1)
                single { ktorApp }                          // (2)
            }
        )
        koinApp.withConfiguration<KtorFrameApp>()           // (3)
    }
}
```

1. The whole typed configuration is loaded once, with the resolved profiles, and published as a single bean. Everything downstream derives its properties from it.
2. The Ktor `Application` itself becomes a bean, available for injection anywhere in the container.
3. Hooks in the generated annotation-based composition — see below.

The composition is declared as an object listing the modules that make up the application:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        AppModule::class
    ]
)
object KtorFrameApp
```

Your own module scans your packages and turns the config bean into the typed props beans that batteries expect:

```kotlin
@Module
@ComponentScan("com.example")
@Configuration
class AppModule {

    @Singleton
    fun ktorProps(configMap: ConfigMap): KtorProps = configMap.ktor
}
```

The convention: **beans never read configuration themselves**. `loadConfig` runs once at the root; modules consume typed props beans. Include a battery without publishing the props bean it declares, and startup fails with an unresolved dependency.

Batteries themselves are plain annotated modules — including one in the composition is all the installation it needs. The core module, for instance, publishes the `JsonMapper`, the lifecycle listener, and the health endpoints, and collects the extension-point beans described next.

## Extension points: registering a bean is the wiring

This is the design idea of ktor-batterypack. You never call a framework API to register a controller, a health check, or a startup hook. You publish a bean implementing a marker interface, and the batteries collect every implementation:

| Interface | Collected by | When it runs |
|---|---|---|
| `KtorController` | `getAll<KtorController>()` in `configureKtorServer` | at routing setup; `register(routing)` is called |
| `InitCallback` | injected as `List<InitCallback>` into `KoinLifecycleListener` | once, on application start |
| `AutoCloseable` | injected as `List<AutoCloseable>` into `KoinLifecycleListener` | once, on application stop |
| `ReadinessCheck` | injected as `List<ReadinessCheck>` into `ReadinessEndpoint` | on every readiness probe |

An annotated class under your scanned package is enough:

```kotlin
@Singleton
class ReportController(
    private val reportService: ReportService
) : KtorController {
    override fun register(routing: Routing) {
        routing.get("/reports") {
            call.respond(reportService.list())
        }
    }
}
```

No route registration exists anywhere else; the routes are served. Constructor dependencies are satisfied by the container, so `ReportService` needs nothing but its own `@Singleton`.

The last three interfaces in the table are the lifecycle half of the same idea: startup and shutdown behavior is not registered anywhere — it is *resolved* from the container.

## Lifecycle management

`configureKtorServer` subscribes to the container's start and stop-preparing events and delegates to the `LifecycleListener` bean — `KoinLifecycleListener`, published by the core module, which holds the collected `List<InitCallback>` and `List<AutoCloseable>`.

At runtime:

- **Start**: every `InitCallback` runs in sequence. If any callback throws, startup is aborted with an `IllegalStateException` naming the failed callback. This is deliberate: an application that could not initialize must not accept traffic.
- **Stop**: every `AutoCloseable` is closed. A failure is logged and the remaining resources are still closed — one broken closer cannot strand the others.

The order in which callbacks run is not guaranteed. If two callbacks must run in sequence, put both steps in one callback.

To run code on startup, implement `InitCallback`:

```kotlin
@Singleton
class CacheWarmer : InitCallback {
    override fun onInit() {
        // warm caches, preload data
    }
}
```

To release a resource on shutdown, implement `AutoCloseable` — or, when the resource itself is not closeable and lives inside another bean, publish an ad-hoc closer bean:

```kotlin
@Singleton
fun executorCloser(executor: ExecutorService): AutoCloseable =
    AutoCloseable { executor.shutdown() }
```

A bean may implement both interfaces at once; it will be initialized on start and closed on stop. If you need both events in a single place, implement `LifecycleListener` instead — see [Lifecycle](/core/lifecycle).

When you need several beans of the same type, qualify them with `@Named`:

```kotlin
@Singleton
@Named("payments")
fun paymentsHttpClient(factory: KtorHttpClientFactory, props: PaymentsProps): HttpClient =
    factory.createHttpClient(baseUrl = props.baseUrl)
```

Build HTTP clients with `KtorHttpClientFactory` rather than constructing them directly, so they inherit the shared `JsonMapper` and client metrics from the container.

## Testing

The test composition root uses the same annotations with swapped modules:

```kotlin
@KoinApplication
object TestApp

@Module(
    includes = [
        KtorBatterypackCoreModule::class,
        TestBatteryModule::class // stands in for the production module
    ]
)
@ComponentScan("com.example")
@Configuration
class TestAppModule
```

Because batteries depend only on interfaces — the extension points and the types they publish — a test module that republishes the same types replaces the whole battery. Swapping a module is the entire override; no per-bean mocking is needed.
