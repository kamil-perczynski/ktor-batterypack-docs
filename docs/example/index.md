# Example Application

The `ktor-batterypack-example` module is a complete Ktor backend that demonstrates how all batterypack modules fit together.

## What it demonstrates

- Hexagonal (ports & adapters) architecture.
- Koin annotation-based DI with component scanning.
- Controller auto-registration via `KtorController`.
- Database access with Exposed + Hikari.
- Redis stream publishing and listening.
- Request validation with generated validators.
- Health endpoints and Prometheus metrics.
- Docker packaging via the Gradle plugin.
- Integration tests with Testcontainers.

## Architecture

```
controllers/   → HTTP routes (driving adapters), @Singleton implementing KtorController
domain/        → Business logic, entities, repository ports (interfaces)
infra/         → Infrastructure implementations (driven adapters)
libs/          → Minimal local helpers
```

Dependency rule: `controllers` → `domain` ← `infra`

## Application wiring

`KtorFrameApplicationServer.kt` bootstraps the Ktor server:

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
        enableTimedMethodsSampling(koinApp)
    }
}
```

`KtorFrameApp.kt` declares the Koin application and application module:

```kotlin
@KoinApplication(
    modules = [
        KtorBatterypackCoreModule::class,
        KtorFrameModule::class,
        FlorinModule::class,
        KtorBatterypackDatabaseModule::class,
        KtorBatterypackMetricsModule::class,
        KtorBatterypackRedisModule::class,
        KtorBatterypackRedisStreamsModule::class
    ]
)
object KtorFrameApp
```

## Domains

The example exposes three domains over HTTP:

### Users

CRUD operations with validation and event publishing:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users` | Create user |
| GET | `/users/{id}` | Get user |
| PUT | `/users/{id}` | Update user |
| DELETE | `/users/{id}` | Delete user |

### Plant Identification

Endpoints for listing plants and identifying plants from uploaded images via an external Florin service:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plants` | List plants |
| GET | `/api/plants/{id}` | Get plant |
| POST | `/api/plant-identification` | Identify plant from image |

### Wallets

Wallet lookups and top-up requests with event-driven balance changes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wallets/{id}` | Get wallet |
| GET | `/api/wallets/topup` | Top-up wallet |

Every write operation publishes domain events through Redis-backed event publishers for downstream consumers.

## Running the example

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Run the dev server
./gradlew run
```

Server starts at `http://localhost:8080`.

## Build & Package

```bash
./gradlew build
./gradlew bootstrapDockerfile
./gradlew bootstrapDockerignore
docker build -t ktor-batterypack-example .
```

## Integration tests

Integration tests extend `KtorBatteriesIT`, which spins up shared Testcontainers PostgreSQL and Redis once per JVM. Beans are injected via `application.koin().get<...>()`.

```bash
./gradlew test
```
