# Database

`ktor-batterypack-database` wires a HikariCP connection pool and registers a database readiness check. It is designed to work with Exposed and Micrometer.

## What it provides

- `DataSource` bean backed by HikariCP.
- `DatabaseProps` for typed configuration.
- Automatic `AutoCloseable` cleanup of the connection pool.
- A `ReadinessCheck` that verifies the database is reachable.
- Micrometer metric integration through Hikari's `metricRegistry`.

## Configuration

`DatabaseProps` loads from your config object:

```kotlin
data class DatabaseProps(
    val url: String = "",
    val user: String = "",
    val password: String = "",
    val driver: String = "org.postgresql.Driver",
    val poolSize: Int = 2
)
```

Example `application.yaml`:

```yaml
database:
  url: jdbc:postgresql://localhost:5432/ktordb
  user: ktor
  password: ktorpassword
  driver: org.postgresql.Driver
  poolSize: 2
```

## Wiring

Add `KtorBatterypackDatabaseModule` to your Koin application:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorBatterypackDatabaseModule::class,
        MyAppModule::class
    ]
)
object MyApp
```

Expose `DatabaseProps` from your own module:

```kotlin
@Module
@ComponentScan("com.example")
class MyAppModule {

    @Singleton
    fun databaseProps(config: AppConfig): DatabaseProps = config.database
}
```

## Using Exposed

Connect Exposed to the provided `DataSource`:

```kotlin
import org.jetbrains.exposed.v1.jdbc.Database
import javax.sql.DataSource

@Singleton
class ExposedConnection(dataSource: DataSource) {
    init {
        Database.connect(dataSource)
    }
}
```

Exposed transactions then use the pooled connection.

## Schema creation

Use the core lifecycle `InitCallback` to create tables on startup:

```kotlin
import io.github.ktor_batterypack.core.di.InitCallback
import org.koin.core.annotation.Singleton

@Singleton
class UserSchema : InitCallback {
    override fun onInit() {
        // create tables
    }
}
```

## Readiness check

The module automatically registers a `DatabaseReadinessCheck` that pings the database and reports `DOWN` if the connection fails.
