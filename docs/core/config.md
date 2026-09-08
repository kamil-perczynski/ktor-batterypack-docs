# Configuration

`ktor-batterypack-core` uses [Hoplite](https://github.com/sksamuel/hoplite) for type-safe configuration loading. Config values are resolved from multiple sources and merged into a single Kotlin data class.

## `loadConfig<T>`

The `loadConfig<T>` function resolves an instance of type `T` from the active configuration sources:

```kotlin
import io.github.ktor_batterypack.core.config.loadConfig

val config = loadConfig<AppConfig>(profiles)
```

It is typically called inside `configureKtorServer` and registered as a Koin singleton:

```kotlin
configureKtorServer { ktorApp, koinApp, profiles ->
    koinApp.modules(
        module {
            single { loadConfig<AppConfig>(profiles) }
        }
    )
}
```

## Configuration sources

Sources are merged with the following precedence (highest first):

1. Environment variables (`UPPER_CASE_WITH_UNDERSCORES`)
2. System properties (`config.override.*`)
3. Profile-specific YAML files (`application-{profile}.yaml`) in reverse profile order
4. Base `application.yaml`

Both classpath resources and working-directory files are supported, and every source is optional.

## Active profiles

Profiles are resolved by `configureKtorServer` from:

- `app.profiles` in Ktor's `application.conf` / `application.yaml`
- the `APP_PROFILES` environment variable
- defaulting to `local`

Multiple profiles can be comma-separated:

```bash
APP_PROFILES=local,docker ./gradlew run
```

## Built-in properties

The Core module provides `KtorProps`, which covers common server settings:

```kotlin
data class KtorProps(
    val deployment: DeploymentProps = DeploymentProps(),
    val application: KtorApplicationProps = KtorApplicationProps(),
    val multipart: MultipartProps = MultipartProps(),
    val banner: String? = null
)
```

### `DeploymentProps`

```kotlin
data class DeploymentProps(
    val port: Int = 8080
)
```

### `KtorApplicationProps`

```kotlin
data class KtorApplicationProps(
    val modules: List<String> = emptyList()
)
```

### `MultipartProps`

```kotlin
data class MultipartProps(
    val maxFileSizeBytes: Int = 5 * 1024 * 1024,
    val allowedContentTypes: List<String> = listOf(
        "image/jpeg",
        "image/png",
        "image/webp"
    )
)
```

## Example `application.yaml`

```yaml
app:
  profiles: local

ktor:
  deployment:
    port: 8080
  multipart:
    maxFileSizeBytes: 10485760
    allowedContentTypes:
      - image/jpeg
      - image/png
      - application/pdf
  banner: |
    My application started
```

## Aggregated config

In real applications you usually aggregate all properties into one root class:

```kotlin
data class AppConfig(
    val ktor: KtorProps = KtorProps(),
    val database: DatabaseProps = DatabaseProps(),
    val redis: RedisProps = RedisProps()
)
```

Then load it once and let downstream beans pick the sections they need:

```kotlin
@Singleton
class KtorFrameModule {

    @Singleton
    fun ktorProps(config: AppConfig): KtorProps = config.ktor

    @Singleton
    fun databaseProps(config: AppConfig): DatabaseProps = config.database
}
```
