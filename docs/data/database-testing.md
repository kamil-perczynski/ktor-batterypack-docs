# Database Testing

`ktor-batterypack-database-testing` provides a Testcontainers-based PostgreSQL container for integration tests.

## PostgresTestContainer

`PostgresTestContainer` starts a PostgreSQL container and exposes the JDBC URL:

```kotlin
import io.github.ktor_batterypack.database.testing.PostgresTestContainer

class MyIntegrationTest {

    companion object {
        val postgres = PostgresTestContainer().apply { start() }
    }
}
```

### Default settings

| Property | Default |
|----------|---------|
| Image | `postgres:17-alpine` |
| Database | `ktordb` |
| Username | `ktor` |
| Password | `ktorpassword` |

### Customizing

```kotlin
val postgres = PostgresTestContainer(
    image = "postgres:16-alpine",
    database = "testdb",
    username = "test",
    password = "test"
).apply { start() }
```

### JDBC URL

```kotlin
val url = postgres.jdbcUrl
// jdbc:postgresql://localhost:<mapped-port>/ktordb
```

## Typical test setup

Use a shared container across tests to avoid starting a database for every test class:

```kotlin
abstract class DatabaseTest {

    companion object {
        @JvmStatic
        val postgres: PostgresTestContainer = PostgresTestContainer().apply { start() }

        init {
            System.setProperty("DATABASE_URL", postgres.jdbcUrl)
        }
    }
}
```

The core `loadConfig` function reads environment variables, so setting `DATABASE_URL` before the config is loaded is enough to point the application at the test container.

## Dependency

```kotlin
testImplementation("io.github.kamil-perczynski:ktor-batterypack-database-testing:0.0.13-alpha")
```
