# Validation Codegen

`ktor-batterypack-validation-ksp` is a Kotlin Symbol Processing (KSP) plugin that generates validator implementations from annotated interfaces.

## What it provides

- A `SymbolProcessor` that scans for `@Validator` and `@JsonValidator` interfaces.
- Generated validator classes that check every constructor property of the method parameter DTO.
- Support for custom constraint descriptor files in YAML.

## Annotations

### @Validator

Marks an interface as a validator contract. The processor generates an implementation class.

```kotlin
import io.github.ktor_batterypack.annotation.Validator

@Validator
interface CreateUserValidator {
    fun validate(dto: CreateUserDto)
}
```

The generated implementation validates every property of `CreateUserDto` (and nested DTOs):

- Non-nullable `String` properties must not be blank.
- Non-nullable numeric properties must be positive.
- Other properties are left unvalidated.

### @JsonValidator

Same as `@Validator`, but generates a JSON-oriented validator that works with raw JSON payloads.

```kotlin
import io.github.ktor_batterypack.annotation.JsonValidator

@JsonValidator
interface CreateUserJsonValidator {
    fun validate(json: String)
}
```

## Wiring KSP

The `ktor-batterypack-gradle-plugin` applies KSP automatically. If you are not using the plugin, apply KSP manually:

```kotlin
plugins {
    id("com.google.devtools.ksp") version "2.3.0-1.0.30"
}
```

Add the processor as a `ksp` dependency:

```kotlin
dependencies {
    ksp("io.github.kamil-perczynski:ktor-batterypack-validation-ksp:0.0.13-alpha")
    implementation("io.github.kamil-perczynski:ktor-batterypack-validation:0.0.13-alpha")
}
```

## Custom constraints

You can provide additional constraint descriptors via YAML. Point the processor to a directory:

```kotlin
ksp {
    arg("ktor.validation.constraint.dir", "${projectDir}/constraints")
}
```

Each YAML file describes constraints for specific types or properties, which the processor merges with the built-in Jakarta-style constraints.

## Generated output

The generated class is placed in the same package as the annotated interface and named after the DTO type. It can be injected as a singleton in your Koin module:

```kotlin
@Singleton
class UserController(private val validator: CreateUserValidator) {

    fun create(dto: CreateUserDto) {
        validator.validate(dto)
        // ...
    }
}
```

Validation failures throw `ValidationException`, which is handled globally by the core exception handler.
