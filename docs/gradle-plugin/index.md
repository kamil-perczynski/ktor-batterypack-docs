# Gradle Plugin

The `ktor-batterypack-gradle-plugin` turns your Gradle build into a Docker packaging pipeline. Applying it registers three tasks — a layered Docker distribution, a `Dockerfile`, and a `.dockerignore` — and wires optional KSP-based configuration metadata for IDE autocompletion in `application.yaml`.

## What it provides

| Task | Command | What it produces |
|------|---------|------------------|
| `dockerDist` | `./gradlew dockerDist` | A Docker-friendly distribution in `build/docker-dist` with separate `app` and `lib` layers — see [Docker Distribution](/gradle-plugin/docker-dist) |
| `bootstrapDockerfile` | `./gradlew bootstrapDockerfile` | A production-ready `Dockerfile` tuned to the `dockerDist` layout — see [Bootstrap Docker Files](/gradle-plugin/bootstrap-docker-files) |
| `bootstrapDockerignore` | `./gradlew bootstrapDockerignore` | A deny-all `.dockerignore` that admits only the build output — see [Bootstrap Docker Files](/gradle-plugin/bootstrap-docker-files) |

Beyond the tasks, the plugin applies KSP automatically and can generate configuration metadata from your typed config class — the mechanism behind [IDE autocompletion](/core/config#ide-autocompletion).

What the plugin deliberately does **not** do: build or push images. There is no Docker daemon interaction at all. It prepares everything `docker build` needs; running the build stays your job or your CI's. If you want a Dockerfile-free experience, tools like Jib or Cloud Native Buildpacks are the better fit — this plugin is for when you want a plain, readable `Dockerfile` you can inspect and extend.

## Setup

The plugin is published to the same repository as the libraries. If you followed [Get Started](/introduction/get-started#_1-add-the-repository-and-version-catalog), your `settings.gradle.kts` already has everything needed:

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
```

Apply the plugin in your module's `build.gradle.kts` — via the version catalog, or with an explicit version:

```kotlin
plugins {
    alias(batterypackLibs.plugins.ktor.batterypack)
    // or: id("ktor-batterypack-gradle-plugin") version "0.0.13-alpha"
}
```

That single line does all of the following:

1. Applies KSP (`com.google.devtools.ksp`) — you don't need to apply it yourself. This is why the [Validation Codegen](/validation/validation-codegen) processor works without extra plugin declarations.
2. Adds the plugin's own JAR plus Jackson 3 (`jackson-databind` and `jackson-dataformat-yaml`) to the `ksp` classpath. These power the metadata processor; they never end up in your application.
3. Registers the three tasks under the `ktor-batterypack` group (`./gradlew tasks --group ktor-batterypack` lists them).
4. Makes `assemble` depend on `dockerDist` — so a plain `./gradlew build` produces the Docker distribution on every build. If you don't want that, don't worry: the `Sync` is cheap when the outputs are already current.

## The `ktorBatterypack` block

```kotlin
ktorBatterypack {
    mainClass = "io.github.ktor-perczynski.MainKt"
    configMetadataClass = "io.github.ktor-perczynski.ConfigMap"
}
```

Both properties are optional — the plugin works with an empty block.

### `mainClass`

The entry point written into the generated Dockerfile's `CMD`. When left unset, the plugin falls back to the `Main-Class` attribute of the `jar` task manifest, and then to Ktor's Netty default, `io.ktor.server.netty.EngineMain`. The resolution order:

1. `ktorBatterypack.mainClass` in your build script
2. the `jar` manifest `Main-Class` (usually set by the `application` plugin)
3. `io.ktor.server.netty.EngineMain`

Only override it when the defaults are wrong. A wrong main class compiles, builds an image, and fails at container startup with `ClassNotFoundException` — the resolution chain exists so you never have to think about it, not so you always set it.

### `configMetadataClass`

Activates the configuration metadata generation described below. Leave it unset and the KSP processor stays idle.

## Configuration metadata

Batterypack loads configuration into typed classes — your `ConfigMap` and its nested props classes. Your IDE, however, sees `application.yaml` as plain text: a typo like `sever` instead of `server` fails at application startup, not while you type.

Setting `configMetadataClass` fixes that. Given a config class:

```kotlin
import com.fasterxml.jackson.annotation.JsonPropertyDescription

class ConfigMap(
    val server: ServerProps,
    val database: DatabaseProps,
)

class ServerProps(
    val host: String,
    val port: Int,
)

class DatabaseProps(
    val url: String,
    @JsonPropertyDescription("Maximum connection pool size.")
    val poolSize: Int,
)
```

the plugin passes the class to a KSP processor that walks its primary constructor and generates two files into `build/generated/ksp/main/resources`:

`META-INF/spring-configuration-metadata.json` — the Spring Boot metadata format, consumed by IntelliJ:

```json
{
  "groups" : [ {
    "name" : "server",
    "sourceType" : "io.github.ktor-perczynski.ConfigMap",
    "type" : "io.github.ktor-perczynski.ServerProps"
  }, {
    "name" : "database",
    "sourceType" : "io.github.ktor-perczynski.ConfigMap",
    "type" : "io.github.ktor-perczynski.DatabaseProps"
  } ],
  "properties" : [ {
    "name" : "server.host",
    "sourceType" : "io.github.ktor-perczynski.ServerProps",
    "type" : "java.lang.String"
  }, {
    "name" : "server.port",
    "sourceType" : "io.github.ktor-perczynski.ServerProps",
    "type" : "java.lang.Integer"
  }, {
    "name" : "database.url",
    "sourceType" : "io.github.ktor-perczynski.DatabaseProps",
    "type" : "java.lang.String"
  }, {
    "name" : "database.poolSize",
    "sourceType" : "io.github.ktor-perczynski.DatabaseProps",
    "type" : "java.lang.Integer",
    "description" : "Maximum connection pool size."
  } ]
}
```

`META-INF/config-schema.yaml` — the same structure as a JSON Schema (draft 2020-12), which YAML language servers and IntelliJ use for completion and validation:

```yaml
"$schema": "https://json-schema.org/draft/2020-12/schema"
type: "object"
properties:
  server:
    type: "object"
    description: "io.github.ktor-perczynski.ServerProps"
    properties:
      host:
        type: "string"
      port:
        type: "integer"
  database:
    type: "object"
    description: "io.github.ktor-perczynski.DatabaseProps"
    properties:
      url:
        type: "string"
      poolSize:
        type: "integer"
```

The wiring is automatic: the plugin registers the generated directory as a resources source, makes `processResources` depend on `kspKotlin`, and tolerates duplicate resource paths — both metadata files end up packaged inside your application JAR.

To get completion while editing, reference the schema from `application.yaml`:

```yaml
$schema: ../../../build/generated/ksp/main/resources/META-INF/config-schema.yaml
```

The path is relative to the YAML file, hence the climb back to the project root.

The processor has limits worth knowing:

- Only **constructor properties** are read. Nested classes with a primary constructor become groups and are walked recursively; everything else — enums, interfaces, third-party types — becomes a flat property carrying its fully-qualified type name.
- **No default values are recorded.** The metadata carries names, types, and `@JsonPropertyDescription` texts; it cannot tell the IDE what value a key falls back to.
- **One class per build.** `configMetadataClass` names a single class, and it must be visible to KSP in the same module. If it isn't, the processor logs a KSP error and generates nothing.

## Where to go next

The three tasks form a small pipeline: `dockerDist` lays out `build/docker-dist`, the bootstrap tasks write the `Dockerfile` and `.dockerignore` that consume it, and `docker build` puts it in an image.

- [Docker Distribution](/gradle-plugin/docker-dist) — the `dockerDist` layout and why it is layered
- [Bootstrap Docker Files](/gradle-plugin/bootstrap-docker-files) — the generated `Dockerfile`, its JVM flags, and the deny-all `.dockerignore`
