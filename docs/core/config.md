# Configuration

`ktor-batterypack-core` loads application configuration through a single function, `loadConfig<T>`. It merges YAML files, environment variables, and JVM system properties into one instance of a Kotlin data class you define.

What it makes easy:

- Typed configuration — values arrive as fields and constructor parameters, not string-keyed lookups.
- Per-environment overrides with profiles and environment variables, without a rebuild.
- Fail-fast startup — a value that does not map to the declared type aborts the boot.

Profile resolution is not your job: `configureKtorServer` resolves the active profiles and hands them to your configuration lambda. Batterypack does not replace Ktor's own `application.conf` — Ktor still reads it at bootstrap, and Batterypack reads exactly one key from it: `app.profiles`.

What it does not do: runtime reloading, value encryption, or validation beyond type mapping. The configuration is resolved once at startup; changing it means restarting the process.

## The simplest working usage

Three pieces: a data class, a YAML file, and one call.

```kotlin
data class MyConfig(
    val app: AppProps = AppProps()
)

data class AppProps(
    val name: String = "",
    val port: Int = 0
)
```

`src/main/resources/application.yaml`:

```yaml
app:
  name: my-app
  port: 8080
```

Load the config inside `configureKtorServer` and publish it as a Koin singleton:

```kotlin
import io.github.ktor_batterypack.core.config.loadConfig
import io.github.ktor_batterypack.core.configureKtorServer
import io.ktor.server.application.Application
import org.koin.dsl.module

fun Application.configureServer() {
    configureKtorServer { ktorApp, koinApp, profiles -> // (1)
        koinApp.modules(
            module {
                single { loadConfig<MyConfig>(profiles) } // (2)
            }
        )
    }
}
```

1. `configureKtorServer` resolves the active profiles before the container starts and passes them to your lambda.
2. The whole configuration tree is loaded once and published as a single bean for the rest of the application to consume.

At startup the server logs the resolved profiles — real output:

```
Loading application configuration with profiles: [local]
```

If a value does not map to its declared type — `port: not-a-number` — `loadConfig` throws and the application never starts. This is deliberate: a half-configured application must not accept traffic. You want the failure in the deployment log, not in the first request.

## The function itself

```kotlin
inline fun <reified T> loadConfig(
    profiles: List<String>,
    includeSystemProperties: Boolean = true
): T
```

System properties are included by default. Pass `false` in tests when you do not want stray `-D` properties from your build tool or IDE leaking into the configuration under test:

```kotlin
val config = loadConfig<TestConfig>(emptyList(), includeSystemProperties = false)
```

Every field of `T` must either have a default or be supplied by one of the sources below. A field with no default and no supplied value fails the load — which is how you make a configuration value mandatory.

## Sources and precedence

`loadConfig` consults sources in a fixed order. When the same key appears in several sources, the highest one wins:

1. **Environment variables** — upper-case names, underscores as path separators. `APP_PORT` maps to `app.port`, `DATABASE_URL` maps to `database.url`.
2. **JVM system properties** — read as-is: `-Dapp.port=9090`. No prefix, no namespace. Skipped entirely when `includeSystemProperties = false`.
3. **Working-directory `application-{profile}.yaml`** — one source per active profile, later profiles first.
4. **Classpath `application-{profile}.yaml`** — same reversed order.
5. **Working-directory `application.yaml`**
6. **Classpath `application.yaml`**

Every YAML source is optional. An application can boot with no configuration files at all, running purely on data class defaults and environment variables.

Two consequences worth internalizing:

- Environment variables beat every file. A container deployment can override any key without rebuilding or remounting anything.
- The working directory beats the classpath for the same file name. Dropping an `application.yaml` next to the jar overrides the one packaged inside it.

## Profiles

`configureKtorServer` resolves the active profiles before anything else:

1. `app.profiles` in Ktor's `application.conf` / `application.yaml`
2. the `APP_PROFILES` environment variable
3. `local` if neither is set

The raw value is split on commas, each entry is trimmed, and empty entries are dropped — `APP_PROFILES="local, docker"` behaves exactly like `APP_PROFILES=local,docker`.

Each active profile adds an `application-{profile}.yaml` source. **The later profile wins**: with `APP_PROFILES=local,docker`, keys in `application-docker.yaml` override the same keys in `application-local.yaml`. If you expected the opposite, the reason is that the loader iterates the profile list in reverse, so later profiles land at higher precedence.

Profile files only need to contain the keys that differ. A typical pair:

`application.yaml`:

```yaml
app:
  name: my-app
  port: 8080
```

`application-docker.yaml`:

```yaml
app:
  port: 9090
```

```bash
APP_PROFILES=docker ./gradlew run
```

`app.name` keeps its base value `my-app`; `app.port` becomes `9090`. Keys absent from a profile file simply fall through to the lower-precedence sources.

## One root class, loaded once

The recommended shape is a single root data class aggregating every section of your configuration, with every field defaulted:

```kotlin
data class ConfigMap(
    val app: AppProps = AppProps(),
    val mail: MailProps = MailProps()
)
```

Load it once in the composition root — the `single { loadConfig<ConfigMap>(profiles) }` from the first example — and let consumers take the section they need:

```kotlin
@Singleton
class Mailer(config: ConfigMap) {
    private val smtpHost = config.mail.smtpHost
}
```

Calling `loadConfig` per consumer instead re-reads and re-merges every source on each call: repeated file I/O per bean, and a window where two beans observe different values if the environment changed between calls. Load once, inject everywhere.

Defaulting every field has a cost: it lets the application boot with a section nobody configured. For values that must be supplied by the operator — connection strings, credentials — leave the default out, and startup fails until they exist.

## Security notes

- Secrets belong in environment variables. Anything written into `application.yaml` is committed and lives in git history forever.
- Fail-fast is your safety net for missing secrets: declare a secret field without a default, and an absent environment variable aborts startup instead of serving traffic with an empty password.
- The startup log line prints profile names only, never values. Keep it that way in your own code: do not log the configuration object.
