# Gradle Plugin

The `ktor-batterypack-gradle-plugin` adds Docker-friendly distribution tasks to a Ktor JVM project.

## Applying the plugin

```kotlin
plugins {
    id("io.github.kamil-perczynski.ktor-batterypack") version "0.0.13-alpha"
}
```

The plugin automatically applies the KSP plugin, because it relies on KSP for config metadata generation.

## Tasks

| Task | Group | Description |
|------|-------|-------------|
| `dockerDist` | ktor-batterypack | Copies the application JAR and runtime dependencies into `build/docker-dist` with separate `app` and `lib` layers. |
| `bootstrapDockerfile` | ktor-batterypack | Generates a `Dockerfile` that consumes the `dockerDist` output. |
| `bootstrapDockerignore` | ktor-batterypack | Generates a `.dockerignore` that keeps the Docker context minimal. |

`assemble` is configured to depend on `dockerDist`, so a regular `./gradlew build` produces the Docker distribution without any extra step.

## Extension

Optional configuration through the `ktorBatterypack { }` block:

```kotlin
ktorBatterypack {
    mainClass = "com.example.MyApplicationKt"
    configMetadataClass = "com.example.MyConfigMetadata"
}
```

| Property | Description |
|----------|-------------|
| `mainClass` | Fully-qualified application entry point. Falls back to the `jar` manifest `Main-Class`, then to `io.ktor.server.netty.EngineMain`. |
| `configMetadataClass` | Fully-qualified class used to generate config metadata via KSP. |

## Docker workflow

```bash
./gradlew build
./gradlew bootstrapDockerfile
./gradlew bootstrapDockerignore
docker build -t my-app .
```

The generated distribution separates the application JAR from its dependencies, so Docker builds can cache the dependency layer and only rebuild the small application layer when your code changes.
