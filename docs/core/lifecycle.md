# Lifecycle

`ktor-batterypack-core` hooks into the Koin application lifecycle. Beans can participate in startup and shutdown without manual wiring.

## Startup callbacks

Implement `InitCallback` to run code when the application starts:

```kotlin
import io.github.ktor_batterypack.core.di.InitCallback
import org.koin.core.annotation.Singleton

@Singleton
class SchemaCreator : InitCallback {
    override fun onInit() {
        // create tables, seed data, warm caches, etc.
    }
}
```

All `InitCallback` beans are collected and invoked by `KoinLifecycleListener` after Koin has started. If any callback throws, startup fails with an `IllegalStateException`.

## Shutdown cleanup

Beans implementing `AutoCloseable` are closed automatically when the application stops:

```kotlin
@Singleton
class EventPublisher : AutoCloseable {
    override fun close() {
        // flush buffers, close connections, etc.
    }
}
```

Failures during close are logged but do not prevent other resources from being closed.

## `LifecycleListener`

If you need to observe both events in one place, implement `LifecycleListener`:

```kotlin
import io.github.ktor_batterypack.core.di.LifecycleListener
import org.koin.core.annotation.Singleton

@Singleton
class MyLifecycleListener : LifecycleListener {
    override fun onStart() {
        // startup logic
    }

    override fun onStop() {
        // shutdown logic
    }
}
```

`KoinLifecycleListener` implements this interface and bridges Koin start/stop events to your callbacks.

## `Closer`

For ad-hoc cleanup that is not tied to a bean, use `Closer`:

```kotlin
import io.github.ktor_batterypack.core.Closer

val closer = Closer()
closer.add { tempFile.delete() }
closer.add { executor.shutdown() }

closer.close() // runs callbacks in reverse order
```

`Closer` is useful inside service methods or tests where you need deterministic teardown.

## How it is wired

`configureKtorServer` subscribes to Koin's `KoinApplicationStarted` and `KoinApplicationStopPreparing` events:

```kotlin
monitor.subscribe(KoinApplicationStarted) {
    val lifecycleListener: LifecycleListener = get()
    lifecycleListener.onStart()
}

monitor.subscribe(KoinApplicationStopPreparing) {
    val lifecycleListener: LifecycleListener = get()
    lifecycleListener.onStop()
}
```

`KtorBatterypackCoreModule` provides the `LifecycleListener` bean as a `KoinLifecycleListener` backed by the collected `InitCallback` and `AutoCloseable` beans.
