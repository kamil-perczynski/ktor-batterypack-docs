# Get Started

Ktor Batterypack is a set of opinionated Kotlin libraries that wire common backend concerns into a Ktor application so you can focus on domain code. The **Core** module is the entry point: it bootstraps the server, installs Koin, Jackson content negotiation, global exception handling, and auto-discovers your route controllers.

This guide shows how to add the Core module to a new Ktor project and write your first controller.

## Quick Start

### 1. Add the repository and version catalog

Artifacts are published to Repsy. Add the repository and the Batterypack version catalog to `settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        maven {
            name = "KtorBatterypackMaven"
            url = uri("https://repo.repsy.io/ktor-baterrypack/maven")
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        maven {
            name = "KtorBatterypackMaven"
            url = uri("https://repo.repsy.io/ktor-baterrypack/maven")
        }
        mavenCentral()
    }
    versionCatalogs {
        create("batterypackLibs").from("io.github.ktor_batterypack:ktor-batterypack-versions-catalog:0.0.13-alpha")
    }
}
```

### 2. Apply plugins and add the Core dependency

In your module `build.gradle.kts`:

```kotlin
plugins {
    alias(batterypackLibs.plugins.kotlin.jvm)
    alias(batterypackLibs.plugins.koin.compiler)
    application
}

dependencies {
    implementation(batterypackLibs.ktor.batterypack.core)
}
```

The Koin compiler plugin is required because Batterypack uses Koin annotations for DI.

### 3. Create a Koin application module

Define a Koin module that includes `KtorBatterypackCoreModule` and scans your package for `@Singleton` controllers:

```kotlin
import io.github.ktor_batterypack.core.KtorBatterypackCoreModule
import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Configuration
import org.koin.core.annotation.KoinApplication
import org.koin.core.annotation.Module

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

### 4. Configure the Ktor server

Use `configureKtorServer` in your `Application` module. The lambda receives the Ktor application, the Koin application, and the resolved active profiles:

```kotlin
import io.github.ktor_batterypack.core.config.loadConfig
import io.github.ktor_batterypack.core.configureKtorServer
import io.ktor.server.application.Application
import org.koin.dsl.module
import org.koin.plugin.module.dsl.withConfiguration

fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles ->
        koinApp.modules(
            module {
                single { loadConfig<MyConfig>(profiles) }
                single { ktorApp }
            }
        )
        koinApp.withConfiguration<MyApp>()
    }
}
```

### 5. Write a controller

Implement `KtorController` and annotate the class with `@Singleton`. Its `register` function is called automatically:

```kotlin
import io.github.ktor_batterypack.core.ktor.KtorController
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respondText
import io.ktor.server.routing.Routing
import io.ktor.server.routing.get
import org.koin.core.annotation.Singleton

@Singleton
class HelloController : KtorController {
    override fun register(routing: Routing) {
        routing.get("/hello") {
            call.respondText("Hello, world!")
        }
    }
}
```

### 6. Add configuration

Create `src/main/resources/application.yaml`:

```yaml
app:
  profiles: local

ktor:
  deployment:
    port: 8080
  banner: |
    MyApp started
```

Active profiles are read from `app.profiles` or the `APP_PROFILES` environment variable and default to `local`.

### 7. Run

```bash
./gradlew run
```

Your application now exposes:

- `GET /hello` — your custom controller
- `GET /actuator/health/liveness` — liveness probe
- `GET /actuator/health/readiness` — readiness probe with the built-in disk-space check
- JSON request/response handling via Jackson
- RFC 7807 error responses for validation, missing resources, and unhandled errors

## Next steps

- Read the [Core](/core/) module documentation for details on configuration, controllers, lifecycle, and more.
- Add the [Database](/data/database/), [Redis](/redis/), [Metrics](/observability/metrics/), or [Validation](/validation/validation/) modules when you need them.
- Check the [Example Application](/example/) for a complete working project.
