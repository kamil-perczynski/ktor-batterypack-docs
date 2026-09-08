# OpenAPI Generator

The recommended way to define request and response DTOs in a Batterypack application is to describe them in an OpenAPI specification and generate Kotlin code with the [OpenAPI Generator Gradle plugin](https://openapi-generator.tech/docs/plugins/).

This page starts with the simplest usage — generating DTOs and using them directly in controllers — and then adds the recommended integration with [Validation Codegen](/validation/validation-codegen) and [JsonBinder](/core/request-binding).

## Why this approach

- **Single source of truth** — the OpenAPI spec is the contract for controllers, clients, and documentation.
- **Type-safe DTOs** — generated Kotlin data classes with Jackson annotations and Jakarta Bean Validation annotations.
- **Runtime validation** — `ktor-batterypack-validation-ksp` generates validator functions from the Bean Validation annotations on the DTOs.
- **Binder integration** — `JsonBinder` uses the generated validators to convert and validate request bodies and query parameters.

## Setup

### Plugins and dependencies

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.koin.compiler)
    alias(libs.plugins.openapi.generator)
    id("ktor-batterypack-gradle-plugin")
}

dependencies {
    implementation(libs.jakarta.validation.api)
    implementation(libs.jakarta.ws.rs.api)
    implementation(libs.jakarta.annotation.api)

    implementation(project(":ktor-batterypack-core"))
}
```

`jakarta.validation:jakarta.validation-api` and `jakarta.ws.rs:jakarta.ws.rs-api` are required because the generated DTOs reference their annotations.

### Generator configuration

Use `kotlin-server` with `jaxrs-spec`. The generator produces interfaces and DTOs; the interfaces can be ignored — the DTOs are what Batterypack consumes.

```kotlin
openApiGenerate {
    generatorName.set("kotlin-server")
    library.set("jaxrs-spec")
    generateApiDocumentation.set(false)
    inputSpec.set("$projectDir/src/main/resources/static/schema/api.yaml")
    outputDir.set("$projectDir/build/generated/openapi")
    apiPackage.set("com.example.myapp.api")
    modelPackage.set("com.example.myapp.api.dto")
    modelNameSuffix.set("Dto")
    auth.set("false")

    typeMappings.set(
        mapOf("double" to "java.math.BigDecimal")
    )

    configOptions.set(
        mapOf(
            "interfaceOnly" to "true",
            "allowUnicodeIdentifiers" to "true",
            "delegatePattern" to "true",
            "useTags" to "true",
            "useJakartaEe" to "true",
            "serializationLibrary" to "jackson",
            "useJackson3" to "true",
            "omitGradleWrapper" to "true",
            "enumPropertyNaming" to "original",
            "useBeanValidation" to "true",
            "openApiNullable" to "false",
            "useCoroutines" to "true"
        )
    )
}
```

The most important options:

- **`generatorName="kotlin-server"` and `library="jaxrs-spec"`** — required for the recommended setup.
- **`useJakartaEe=true`** — emits `jakarta.*` annotations instead of `javax.*`.
- **`serializationLibrary=jackson` and `useJackson3=true`** — generates Jackson 3 compatible DTOs.
- **`useBeanValidation=true`** — emits Jakarta Bean Validation annotations such as `@NotNull`, `@Size`, `@Pattern`, etc.
- **`openApiNullable=false`** — avoids `JsonNullable` wrappers and uses nullable Kotlin types instead.
- **`interfaceOnly=true` and `delegatePattern=true`** — generate JAX-RS interfaces and delegates; only the DTOs are used by Batterypack controllers.

### Source set wiring

Add the generated Kotlin sources to the main source set so compilation can see them:

```kotlin
sourceSets {
    main {
        kotlin { srcDir("build/generated/openapi/src/main/kotlin") }
    }
}
```

### Task ordering

Make Kotlin compilation run after code generation:

```kotlin
tasks.compileKotlin {
    dependsOn(tasks.openApiGenerate)
}
```

## Simplest usage

Once the DTOs are generated, use them directly in controllers like any other serializable class:

```kotlin
@Singleton
class PlantController(private val plantService: PlantService) : KtorController {

    override fun register(routing: Routing) {
        routing.post("/api/plants") {
            val request = call.receive<PlantCreateDto>()
            call.respond(plantService.create(request))
        }
    }
}
```

The shared Jackson mapper handles serialization and deserialization.

## Validation Codegen Integration

The recommended next step is to wire the generated DTOs to `ktor-batterypack-validation-ksp`. The processor scans classes annotated with `@Validator` or `@JsonValidator` and generates validator functions from the Bean Validation annotations on the DTO properties.

### Add the KSP processor

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.ksp)                 // add KSP
    alias(libs.plugins.koin.compiler)
    alias(libs.plugins.openapi.generator)
    id("ktor-batterypack-gradle-plugin")
}

dependencies {
    ksp(project(":ktor-batterypack-validation-ksp"))

    implementation(libs.jakarta.validation.api)
    implementation(libs.jakarta.ws.rs.api)
    implementation(libs.jakarta.annotation.api)

    implementation(project(":ktor-batterypack-annotations"))
    implementation(project(":ktor-batterypack-validation"))
    implementation(project(":ktor-batterypack-core"))
}
```

### Ensure KSP runs after OpenAPI generation

```kotlin
tasks.whenTaskAdded {
    if (name == "kspKotlin") {
        dependsOn(tasks.openApiGenerate)
    }
}
```

This guarantees that the DTOs exist before the validator generator inspects them.

### Declare a validator interface

Create an interface annotated with `@JsonValidator` or `@Validator` that references the generated DTOs. KSP produces a `*Validator` class with `check*` methods that take and return a Jackson `JsonNode`.

```kotlin
import io.github.ktor_batterypack.annotation.JsonValidator

@JsonValidator
interface PlantApiValidator {
    fun checkPlantCreateDto(dto: PlantCreateDto): PlantCreateDto
}
```

### Use the generated validator with JsonBinder

Inject the generated validator into the controller and pass it to `JsonBinder`:

```kotlin
@Singleton
class PlantController(
    private val jsonBinder: JsonBinder,
    private val plantApiValidator: PlantApiValidator
) : KtorController {

    override fun register(routing: Routing) {
        routing.post("/api/plants") {
            val request = jsonBinder.bindBody<PlantCreateDto>(
                call,
                plantApiValidator::checkPlantCreateDto
            )
            call.respond(plantService.create(request))
        }
    }
}
```

`bindBody` validates the incoming JSON against the OpenAPI-defined constraints and converts the validated node to the generated DTO. The same pattern works for query parameters with `bindQueryParams`.

See [Validation Codegen](/validation/validation-codegen) for the full KSP setup, including how to register custom constraints.

## Advanced Usage

### Custom annotations in generated DTOs

The default OpenAPI Generator does not pass custom OpenAPI extensions through to the generated Kotlin code. If you need custom validation annotations (or any other annotations) on generated DTO properties, provide custom Mustache templates that emit `vendorExtensions.x-extra-annotations`.

Add `templateDir` to the generator configuration:

```kotlin
openApiGenerate {
    // ... other options
    templateDir.set("$projectDir/src/main/resources/templateDir")
}
```

The example application overrides the property templates to emit optional and required annotations:

`data_class_opt_var.mustache`:

```mustache
{{#description}}
    /* {{{.}}} */
{{/description}}
@JsonProperty("{{#lambda.escapeDollar}}{{baseName}}{{/lambda.escapeDollar}}")
{{#vendorExtensions.x-extra-annotations}}
    {{{.}}}
{{/vendorExtensions.x-extra-annotations}}
{{#useBeanValidation}}{{>beanValidation}}{{>beanValidationModel}}{{/useBeanValidation}}     {{>modelMutable}} {{{name}}}: {{#isEnum}}{{classname}}.{{nameInPascalCase}}{{/isEnum}}{{^isEnum}}{{{dataType}}}{{/isEnum}}? = {{{defaultValue}}}{{^defaultValue}}null{{/defaultValue}}
```

`data_class_req_var.mustache`:

```mustache
{{#description}}
    /* {{{.}}} */
{{/description}}
@JsonProperty("{{#lambda.escapeDollar}}{{baseName}}{{/lambda.escapeDollar}}")
{{#vendorExtensions.x-extra-annotations}}
    {{{.}}}
{{/vendorExtensions.x-extra-annotations}}
{{#useBeanValidation}}{{>beanValidation}}{{>beanValidationModel}}{{/useBeanValidation}}    {{>modelMutable}} {{{name}}}: {{#isEnum}}{{classname}}.{{nameInPascalCase}}{{/isEnum}}{{^isEnum}}{{{dataType}}}{{/isEnum}}
```

Then declare the annotation in the OpenAPI spec:

```yaml
CareTaskSnoozeRequest:
  type: object
  required:
    - snoozedDaysCount
  properties:
    notifyEmail:
      type: string
      minLength: 1
      maxLength: 30
      x-extra-annotations: |-
        @com.example.myapp.validation.Email
    snoozedDaysCount:
      type: integer
      minimum: 1
      maximum: 30
```

For the validation KSP processor to recognize the custom annotation, register it in a constraint descriptor. See [Validation Codegen](/validation/validation-codegen) for details.
