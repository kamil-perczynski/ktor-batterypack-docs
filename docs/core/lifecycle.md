# Lifecycle

`ktor-batterypack-core` wires startup and shutdown into the container's lifecycle. A bean that needs to run at startup implements `InitCallback`; a bean that holds a resource implements `AutoCloseable`. There is no registration API, no `Runtime.addShutdownHook`, and no cleanup block in `main` — implementing the interface *is* the registration, the same "registering a bean is the wiring" idea that mounts [controllers](/core/controllers) and [readiness checks](/core/health).

It makes two things easy:

- **fail-fast startup** — a failing `InitCallback` aborts the boot; an application that could not initialize never takes traffic,
- **cleanup that cannot be forgotten** — resources close on shutdown by implementing a standard JDK interface, not a framework one.

What the lifecycle deliberately is not: a scheduler (no cron, no periodic tasks — start your own loops in an `InitCallback`), a request lifecycle (per-request state lives in Ktor's `call.attributes`), or a drain coordinator (stopping in-flight connections is Ktor's own shutdown machinery). And it makes no promises about ordering across beans — see [Ordering](#ordering).

## The machinery

`configureKtorServer` subscribes to two Koin application events and delegates both to a single bean:

```kotlin
monitor.subscribe(KoinApplicationStarted) {
    get<LifecycleListener>().onStart()   // runs every InitCallback
}

monitor.subscribe(KoinApplicationStopPreparing) {
    get<LifecycleListener>().onStop()    // closes every AutoCloseable
}
```

That `LifecycleListener` bean is `KoinLifecycleListener`, published by `KtorBatterypackCoreModule`. Its definition is the whole trick:

```kotlin
@Singleton(binds = [LifecycleListener::class])
fun koinLifecycleListener(
    closeCallbacks: List<AutoCloseable>,
    initCallbacks: List<InitCallback>
): KoinLifecycleListener
```

Koin injects *every* bean implementing each interface as a list. There is no step where your bean is added to anything — resolving `List<InitCallback>` at startup is the collection.

Both events fire at a specific point relative to traffic:

```
server boot
 ├─ profiles resolved
 ├─ Koin starts ─────────────► InitCallbacks run
 ├─ StatusPages, ContentNegotiation installed
 ├─ routes mounted
 └─ server accepts requests
        ⋮
shutdown
 └─ KoinApplicationStopPreparing ─► AutoCloseables closed
```

The order gives two guarantees: initialization runs before the first request is served, and cleanup runs after the last one.

## Startup: `InitCallback`

Implement the interface, annotate the class with `@Singleton`, done:

```kotlin
import io.github.ktor_batterypack.core.di.InitCallback
import org.koin.core.annotation.Singleton

@Singleton
class ExchangeRateCacheWarmer(
    private val ratesClient: RatesClient,
    private val cache: ExchangeRateCache
) : InitCallback {

    override fun onInit() {
        cache.putAll(ratesClient.prefetchCurrencies())
    }
}
```

At startup, `onStart` runs every collected callback in sequence:

```
INFO  KoinLifecycleListener - Application has started. Running 2 initialization callbacks...
```

Two, in this case: yours plus the built-in banner printer (below).

The failure path is why this interface exists. When a callback throws, the failure is logged with the original exception and startup aborts:

```
ERROR KoinLifecycleListener - Initialization callback failed
java.net.ConnectException: rates service unreachable
	at com.example.ExchangeRateCacheWarmer.onInit(...)
...
IllegalStateException: Initialization callback=com.example.ExchangeRateCacheWarmer failed
```

The consequences are deliberate:

- the `IllegalStateException` naming the failed callback propagates and aborts the boot — the server never binds its port,
- callbacks after the failed one do not run.

Throw from `onInit` only when the application must not start. Survivable problems — a degraded cache, an unreachable optional dependency — belong in a log line, not an exception.

## Shutdown: `AutoCloseable`

Cleanup reuses the JDK interface. If the resource already implements `AutoCloseable` — HTTP clients, connection pools, executors — your bean is often just the resource itself. When it does not, implement `close()`:

```kotlin
import org.koin.core.annotation.Singleton
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService

@Singleton
class MailDispatcher : AutoCloseable {

    private val executor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor()

    override fun close() {
        executor.shutdown()
    }
}
```

When the resource lives inside another bean and cannot be closed from the outside, publish an ad-hoc closer bean instead — that pattern is shown in [Dependency Injection](/core/dependency-injection#lifecycle-management).

On stop, the listener closes every collected resource:

```
INFO  KoinLifecycleListener - Application is stopping. Closing resources...
```

The failure semantics are the deliberate opposite of startup's:

- a throwing `close()` is logged (`Failed to close resource`) and skipped,
- the remaining resources are still closed — one broken closer cannot strand the others.

Make `close()` idempotent and quick — a failure here is swallowed by design, so it must not carry work the application depends on.

## Ordering

The order in which init callbacks and closers run *across* beans is not a contract — it follows the container's definition order, which is an implementation detail. Sequencing that matters goes into a single callback:

```kotlin
@Singleton
class DatabaseBootstrapper(private val dataSource: DataSource) : InitCallback {

    override fun onInit() {
        migrateSchema(dataSource)  // warmQueries depends on the migrated schema
        warmQueries(dataSource)
    }
}
```

## `LifecycleListener`

The aggregate itself is a two-method interface:

```kotlin
interface LifecycleListener {
    fun onStart()
    fun onStop()
}
```

Core publishes exactly one implementation — `KoinLifecycleListener` — and both Koin events delegate to it. The interface is the seam, not a second user-facing hook: your beans implement `InitCallback` and `AutoCloseable`, and the listener is the piece that runs them.

A bean that needs both events in one class implements both interfaces and is collected into both lists:

```kotlin
@Singleton
class ImageStore : InitCallback, AutoCloseable {

    override fun onInit() { /* acquire the resource */ }

    override fun close() { /* release it */ }
}
```

## The banner: a built-in callback

The most literal example of the pattern ships in the module itself — the startup banner is an `InitCallback`. Set `ktor.banner` in `application.yaml`:

```yaml
ktor:
  banner: |
    MyApp 0.1.0 — profiles: local
```

`KtorBatterypackCoreModule` publishes `BannerPrinter`, an `InitCallback` that lands in the same list as your callbacks and logs the banner at startup:

```
INFO  BannerPrinter -
  MyApp 0.1.0 — profiles: local
```

The banner is optional — with no `ktor.banner` key the callback is a no-op. The value reaches the printer through the typed `KtorProps` bean, so it follows the usual convention: beans consume props beans, they never read configuration files themselves ([Dependency Injection](/core/dependency-injection), [Configuration](/core/config)).
