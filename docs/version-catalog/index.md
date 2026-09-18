# Version Catalog


The Batterypack publishes a Gradle version catalog that hands your build every battery together with the stack those batteries were built and tested against. 
Import it once and your dependency declarations become aliases — no coordinates to hunt, no versions to reconcile, no compatibility matrix to maintain.

The whole set is declared in one file — [`gradle/libs.versions.toml`](https://github.com/kamil-perczynski/ktor-batterypack/blob/main/gradle/libs.versions.toml)

It does not replace Gradle's version catalog mechanism — it is an import that composes with Ktor's official catalog and your own local `libs`. It deliberately does not carry Ktor's server and client artifacts, and it has no opinion about your application's own dependencies. Both gaps are covered below.

## How to use it

If you followed [Get Started](/introduction/get-started#_1-add-the-repository-and-version-catalog), your `settings.gradle.kts` already looks like this. The recommended shape — taken from a real consumer — declares two catalogs side by side:

```kotlin
pluginManagement {
    repositories {
        maven {
            name = "KtorBatterypackMaven"
            url = uri("https://repo.repsy.io/ktor-batterypack/maven")
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        maven {
            name = "KtorBatterypackMaven"
            url = uri("https://repo.repsy.io/ktor-batterypack/maven")
        }
        mavenCentral()
    }
    versionCatalogs {
        create("ktorLibs").from("io.ktor:ktor-version-catalog:3.4.0")
        create("batterypackLibs").from("io.github.ktor_batterypack:ktor-batterypack-versions-catalog:0.0.13-alpha")
    }
}
```

The repository declaration is not optional: the catalog, the batteries, and the Gradle plugin all resolve from Repsy, not Maven Central.

In `build.gradle.kts`, split dependencies by who owns the version:

```kotlin
plugins {
    alias(batterypackLibs.plugins.kotlin.jvm)
    alias(batterypackLibs.plugins.koin.compiler)
    alias(batterypackLibs.plugins.ktor.batterypack)
}

dependencies {
    // batteries and the stack around them — aliases, no versions
    implementation(batterypackLibs.ktor.batterypack.core)
    implementation(batterypackLibs.ktor.batterypack.validation)
    implementation(batterypackLibs.ktor.batterypack.redis)
    implementation(batterypackLibs.exposed.jdbc)
    implementation(batterypackLibs.logstash.logback.encoder)

    // application-specific libraries — plain coordinates, your choices
    implementation("org.eclipse.jgit:org.eclipse.jgit:7.7.0")

    // Ktor server and client artifacts — Ktor's own catalog
    testImplementation(ktorLibs.server.testHost)
}
```

Three registries, three responsibilities: `batterypackLibs` for what the pack owns, `ktorLibs` for Ktor's surface, plain coordinates (or a local `libs` catalog) for everything your application is about. 

Why isn't Ktor's server and client stack simply inside the pack's catalog? Ktor's catalog is upstream and published per Ktor release — duplicating a subset here would give you two places to look and one more thing to drift. The two-catalog pattern costs one extra line; in exchange each catalog stays authoritative for its own artifacts.


## How it helps

The batteries are only half the product. The other half is a known-good combination of stack versions: which Kotlin works with which KSP, which Jackson the batteries serialize with, which Exposed the database battery was tested against. Pin that combination yourself and every pack upgrade means re-deriving it by hand — read the release notes, bump a dozen versions, fix whatever broke.

The catalog moves that work to the pack's side of the fence. It pins roughly twenty-five stack versions, nine batteries, and five plugins as one set; a release ships the whole set pre-verified by the pack's CI. Your build states *what* it depends on; the catalog answers *at which version*. The [Gradle Plugin](/gradle-plugin/) and every module manual assume you arrived here — aliases like `batterypackLibs.ktor.batterypack.core` are the catalog speaking.

## Upgrading

An upgrade is one coordinate: `0.0.13-alpha` becomes the next release tag, and batteries, stack pins, and plugin versions move together. That is the design, not a limitation — the set is tested as a whole, so it upgrades as a whole. If a release bumps Exposed, the database battery in the same catalog version already accounts for it; nothing is left for you to reconcile.

## What the catalog does not do for you

- **Ktor server and client artifacts** — use [Ktor's own catalog](https://ktor.io), as in the example above. The pack's catalog covers what the batteries wrap, not Ktor's full surface.
- **Your application's dependencies** — the catalog has no aliases for libraries the pack knows nothing about. Keep those as plain coordinates or a small local `libs` catalog.
- **Transitive alignment** — the catalog fills in versions only where you use its aliases. Whatever arrives transitively resolves by Gradle's normal conflict rules; it is not forced to a single version across your build.
- **Selective upgrades** — all nine batteries share one version. You cannot take a newer database battery while pinning the core battery; if you need that granularity, you are back to manual coordinates. And if a single pin must move before the next release, that is an issue on the pack's repository — not a version override in your build.
