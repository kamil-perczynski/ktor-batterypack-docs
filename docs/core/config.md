# Configuration

`ktor-batterypack-core` provides `loadConfig<T>` — a type-safe configuration loader built on [Hoplite](https://github.com/sksamuel/hoplite). It is deliberately modeled after Spring Boot's configuration loading: a base `application.yaml`, profile-specific files layered on top, environment variables and system properties as overrides — all bound into immutable Kotlin data classes, the equivalent of Spring's `@ConfigurationProperties`.

It gives you:

- **typed config** — plain data classes with defaults, no stringly-typed lookups scattered through the codebase,
- **profiles** — per-environment files such as `application-docker.yaml`,
- **deployment overrides without files** — `DATABASE_URL=...` beats anything in YAML,
- **test overrides with system properties** — the trick that wires Testcontainers into config (see below),
- **one config bean** — the whole application derives from a single loaded instance.

It does not replace Ktor's own `ApplicationConfig`. Ktor reads `ktor.deployment` and the `ktor.application.modules` list from `application.yaml` before your code runs; `loadConfig` configures everything after that. The two share the same YAML file but bind different trees — Ktor binds the `ktor` prefix, your data classes bind the rest.

What it deliberately does not do: hot reload (config is read once at startup), remote config stores (no Consul, no config server), and per-bean config reads — that last one is a convention covered in [Dependency Injection](/core/dependency-injection).

## Sources and precedence

`loadConfig` merges four kinds of sources. When two of them provide the same key, the higher one wins:

| Precedence | Source | Example |
|------------|--------|---------|
| 1 — highest | Environment variables | `DATABASE_URL` |
| 2 | System properties | `config.override.database.url` |
| 3 | `application-{profile}.yaml` | `application-docker.yaml` |
| 4 — lowest | `application.yaml` | committed defaults |

All file sources are optional. A missing file contributes nothing; a value absent from every source falls back to the data-class default:

```kotlin
data class DatabaseProps(
    val url: String = "",   // used when no source provides database.url
    val poolSize: Int = 2
)
```

The failure modes follow from this. A missing file never breaks startup, but a value that cannot be decoded into the declared type always does: `loadConfig` throws and the server never boots. A non-nullable property with no default and no value fails the same way. Fail-fast at boot is the point — there is no partially-initialized config at runtime.

## The simplest working usage

Ktor itself requires part of the configuration to be present: without `ktor.application.modules`, the server starts, loads no module, and shuts down. So even the minimal `application.yaml` carries the `ktor` block — and the same tree binds to the core-provided `KtorProps`:

```yaml
# application.yaml
ktor:
  deployment:
    port: 8080
  application:
    modules:
      - io.github.example.ApplicationKt.configureServer
```

```kotlin
import io.github.ktor_batterypack.core.config.loadConfig
import io.github.ktor_batterypack.core.ktor.KtorProps

fun Application.configureServer() {
    configureKtorServer { _, koinApp, profiles ->
        koinApp.modules(
            module {
                single { loadConfig<KtorProps>(profiles) }
            }
        )
    }
}
```

Any bean can now receive the props through the container:

```kotlin
val props: KtorProps // injected

props.deployment.port   // 8080
```

`profiles` selects which `application-{profile}.yaml` files participate (see below); `configureKtorServer` resolves and passes it for you. Pass `emptyList()` yourself when you want only `application.yaml` and the non-file sources. The second parameter, `includeSystemProperties`, defaults to `true` — tests that must stay immune to stray JVM flags pass `false`.

## Recommended usage: the ConfigMap pattern

A real application aggregates the props of every battery it uses into one root class, conventionally named `ConfigMap`:

```kotlin
data class ConfigMap(
    val ktor: KtorProps = KtorProps(),                   // core: port, multipart, banner
    val database: DatabaseProps = DatabaseProps(),       // database battery
    val redis: RedisProps = RedisProps(),                // redis battery
    val florin: FlorinClientProps = FlorinClientProps() // your own
)
```

`ConfigMap` is loaded once in the composition root, inside `configureKtorServer`, and published as a single Koin bean:

```kotlin
fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles ->
        koinApp.modules(
            module {
                single { loadConfig<ConfigMap>(profiles) }
                single { ktorApp }
            }
        )
        koinApp.withConfiguration<KtorFrameApp>()
    }
}
```

Downstream modules publish the typed props that batteries expect:

```kotlin
@Singleton
fun ktorProps(configMap: ConfigMap): KtorProps = configMap.ktor
```

The convention: **beans never read configuration themselves**. `loadConfig` runs once at the root; everything else receives typed props through the container. [Dependency Injection](/core/dependency-injection) covers the full wiring.

## IDE autocompletion

The Gradle plugin can generate a JSON schema for your `ConfigMap` (KSP option `configMetadataClass`). Referencing it from the YAML gives completion and documentation in the IDE:

```yaml
$schema: ../../../build/generated/ksp/main/resources/META-INF/config-schema.yaml
```

See the [Gradle Plugin](/gradle-plugin/) documentation.

## Profiles

Profiles select which `application-{profile}.yaml` files participate in the merge. They are resolved in this order:

1. the `app.profiles` key in Ktor's own configuration — so, `application.yaml`,
2. the `APP_PROFILES` environment variable,
3. the default: `local`.

The value is a comma-separated list — `local,docker` loads both files. When several profiles define the same key, the last profile in the list wins.

A typical split, taken from the example application:

```yaml
# application.yaml — committed, environment-independent
ktor:
  deployment:
    port: 8080
database:
  url: jdbc:postgresql://localhost:5432/ktordb
```

```yaml
# application-docker.yaml — committed, docker-compose specifics
database:
  url: jdbc:postgresql://postgres:5432/ktordb
redis:
  url: redis://redis:6379
```

```yaml
# docker-compose.yml
ktor-batterypack:
  environment:
    APP_PROFILES: docker
```

`application-local.yaml` is the override valve for one machine. The convention — enforced by `.gitignore` — is that it stays uncommitted. Committing it defeats its purpose and puts machine-specific secrets into history.

## Overriding without files

Environment variables need no YAML at all. They are written in `UPPER_CASE_WITH_UNDERSCORES`, as in `DATABASE_URL` for `database.url`:

```bash
DATABASE_URL=jdbc:postgresql://prod-db:5432/ktordb \
DATABASE_USER=ktor \
java -jar app.jar
```

This is the intended way to change config in containers: the image stays identical across environments, only the environment differs.

System properties work the same way behind the `config.override.` prefix:

```bash
java -Dconfig.override.database.url=jdbc:postgresql://prod-db:5432/ktordb -jar app.jar
```

Pass `includeSystemProperties = false` to `loadConfig` to switch this source off entirely.

## Overriding config in tests

This is what the system property mechanism is for. A Testcontainers instance chooses a random host port when it starts, so the JDBC URL it exposes **cannot live in any YAML file** — it does not exist until the container runs. System properties close the gap: set them after starting the container, and `loadConfig` picks them up above every file source.

The pattern, from the example application's `KtorBatteriesIT` — the shared base of all integration tests, with containers started once per JVM:

```kotlin
companion object {
    private val postgres = PostgresTestContainer()
    private val redis = RedisTestContainer()

    init {
        postgres.start()
        redis.start()

        // the mapped ports exist only now — inject them as overrides
        System.setProperty("config.override.database.url", postgres.jdbcUrl)
        System.setProperty("config.override.database.user", postgres.username)
        System.setProperty("config.override.database.password", postgres.password)
        System.setProperty("config.override.redis.url", redis.redisUri)
    }
}
```

The test then boots the application with an explicit profile, so a developer's uncommitted `application-local.yaml` cannot leak in:

```kotlin
val builder = ApplicationTestBuilder()
builder.environment { config = MapApplicationConfig("app.profiles" to "test") }
builder.application {
    configureKtorServer { ktorApp, koinApp, profiles ->
        koinApp.modules(
            module {
                single { ktorApp }
                single { loadConfig<ConfigMap>(profiles) }
            }
        )
        koinApp.withConfiguration<TestKtorFrameApp>()
    }
}
```

The overrides must be set before the application boots — `loadConfig` reads system properties once, at load time. Skip the override and the application under test connects to the committed default — `localhost:5432` — which is either nothing or, worse, a leftover local database that makes tests pass for the wrong reason.

See [Database Testing](/data/database-testing) and [Redis Testing](/redis/redis-testing) for the ready-made containers.

## Security notes

- Treat everything in a committed `application.yaml` as public. Production secrets belong in environment variables (`DATABASE_PASSWORD`) or the uncommitted `application-local.yaml`. A committed secret ends up in the image layers and in git history.
- A `config.override.database.password` system property is visible in the host's process list to every user. Prefer environment variables for secrets.
