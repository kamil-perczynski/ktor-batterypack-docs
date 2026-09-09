# OpenAPI Generator

The [OpenAPI Generator Gradle plugin](https://openapi-generator.tech/docs/plugins/) compiles an OpenAPI specification into Kotlin code. 


It is **strongly recommended way** to define endpoints, requests and response DTOs in a Batterypack application.

You describe each payload once in YAML, and the generator writes the data classes your controllers bind to.


Generating the DTOs makes four things easy:

- one contract shared by controllers, clients, and documentation
- data classes that already carry Jackson and Jakarta Bean Validation annotations
- constraint annotations that [Validation Codegen](/validation/validation-codegen) turns into validator functions
- request bodies and query parameters that [JsonBinder](/core/request-binding) validates with those functions

This page is about the DTOs, and about validating them. Generating code enforces nothing on its own: no request is checked against a DTO until Validation Codegen generates a validator from its annotations and `JsonBinder` runs that validator on the incoming body.

You can hand-write your DTOs instead. Everything after [Setup](#setup) then applies unchanged, but the contract lives in two places, and the two drift.

Two things are out of scope: generating a Kotlin client, and writing the specification. The recommended `kotlin-server` generator with the `jaxrs-spec` library also emits typed JAX-RS endpoint interfaces next to the DTOs. This page does not use them.

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

`jakarta.validation:jakarta.validation-api` and `jakarta.ws.rs:jakarta.ws.rs-api` are not optional — the generated DTOs reference their annotations, so the module fails to compile without them.

### Generator configuration

Use `kotlin-server` with `jaxrs-spec`. The generator emits typed endpoint interfaces alongside the DTOs; this page works with the DTOs.

```kotlin
openApiGenerate {
    generatorName.set("kotlin-server")     // (1)
    library.set("jaxrs-spec")              // (1)
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
            "useJakartaEe" to "true",              // (2)
            "serializationLibrary" to "jackson",   // (3)
            "useJackson3" to "true",               // (3)
            "omitGradleWrapper" to "true",
            "enumPropertyNaming" to "original",
            "useBeanValidation" to "true",         // (4)
            "openApiNullable" to "false",          // (5)
            "useCoroutines" to "true"
        )
    )
}
```

1. The generator and library this page is written against.
2. Emits `jakarta.*` annotations instead of `javax.*`.
3. Generates Jackson 3 compatible DTOs, matching the shared mapper Batterypack serializes with.
4. Emits `@NotNull`, `@Size`, `@Pattern` and friends — the input to the KSP processor.
5. Uses nullable Kotlin types instead of `JsonNullable` wrappers.

What breaks if you deviate from these is covered in [Configuration that matters](#configuration-that-matters).

### Source set wiring

Add the generated Kotlin sources to the main source set so compilation can see them:

```kotlin
sourceSets {
    main {
        kotlin { srcDir("build/generated/openapi/src/main/kotlin") }
    }
}
```

Skip this and the generated files sit in `build/` while the compiler looks elsewhere: every DTO reference fails with an unresolved reference.

### Task ordering

Make Kotlin compilation run after code generation:

```kotlin
tasks.compileKotlin {
    dependsOn(tasks.openApiGenerate)
}
```

An incremental build can pass without this line, because the sources from the previous run are still on disk. A clean build — CI, a colleague's checkout, `./gradlew clean build` — fails with unresolved references. Wire the dependency instead of relying on the ordering happening to work.

## The simplest working usage

Once the DTOs are generated, use them in a controller like any other serializable class:

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

It handles nothing else. `call.receive` rejects a body that does not parse; it does not reject a 300-character plant name, because on this path nothing reads the constraint annotations. That is a reasonable trade for an internal endpoint or a prototype. For anything reachable from the internet, keep going.

## Recommended: validated binding with Validation Codegen

Your spec already states the constraints:

```yaml
PlantCreate:
  type: object
  required:
    - name
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 30
```

and the generator turns them into annotations on the DTO:

```kotlin
data class PlantCreateDto(
    @field:Size(min = 1, max = 30) // emitted because useBeanValidation is on
    val name: String
)
```

Abridged — the real class also carries `@JsonProperty` for the wire name and the nullability implied by `required`.

Those annotations are inert. Ktor does not read Jakarta Bean Validation annotations off a received body, so until something turns them into a check, `maxLength: 30` is documentation. Two pieces close that gap: [Validation Codegen](/validation/validation-codegen), the KSP processor that generates a validator function from the annotations, and [JsonBinder](/core/request-binding), which runs that function on the body before converting it.

That is also where generating pays for itself. Hand-write the DTO and the same rule exists twice — in the spec and in a validator — and drifts the first time someone edits one of them.

What follows is the hookup; the two linked pages own the details.

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

### Run KSP after generation

```kotlin
tasks.whenTaskAdded {
    if (name == "kspKotlin") {
        dependsOn(tasks.openApiGenerate)
    }
}
```

This guarantees the DTOs exist before the validator generator inspects them. Without it, KSP can run against a source directory that has not been populated yet, and the processor has nothing to read.

### Declare a validator interface

Create an interface annotated with `@JsonValidator` or `@Validator` that references the generated DTOs, with one method per DTO you want validated:

```kotlin
import io.github.ktor_batterypack.annotation.JsonValidator

@JsonValidator
interface PlantApiValidator {
    fun checkPlantCreateDto(dto: PlantCreateDto): PlantCreateDto
}
```

KSP generates the implementation. The functions `JsonBinder` consumes work on the raw payload: they take a Jackson `JsonNode`, check it against the constraints, and hand back the validated node for conversion to `PlantCreateDto`. [Request Binding](/core/request-binding) describes that flow in detail.

### Bind and validate

Inject the generated validator into the controller and pass it to `JsonBinder`:

```kotlin
@Singleton
class PlantController(
    private val jsonBinder: JsonBinder,
    private val plantApiValidator: PlantApiValidator,
    private val plantService: PlantService
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

`bindBody` validates the incoming JSON against the constraints defined in the spec, then converts the validated node to the generated DTO. A body that fails never reaches `plantService`: it becomes a 400 response describing the offending fields.

Query parameters follow the same pattern:

```kotlin
routing.get("/api/plants") {
    val params = jsonBinder.bindQueryParams<ListPlantsParamsDto>(
        call,
        plantApiValidator::checkListPlantsParamsDto
    )
    call.respond(plantService.findAll(params))
}
```

See [Validation Codegen](/validation/validation-codegen) for the full KSP setup, including how to register custom constraints.

## Configuration that matters

Most of the options in the [generator block](#generator-configuration) shape the generated endpoint interfaces and the Gradle output around them rather than the DTOs. These are the ones that change the code you compile against.

| Option | If you change it |
|--------|------------------|
| `generatorName` / `library` (1) | You get different annotations, different nullability handling, and a different output layout. The rest of this page assumes `kotlin-server` + `jaxrs-spec`. |
| `useJakartaEe` (2) | The DTOs import `javax.validation.*`, which is not the API on your classpath, and compilation fails on unresolved references. |
| `serializationLibrary` / `useJackson3` (3) | The DTO annotations describe a mapper other than the one Batterypack uses, so property naming and defaults stop matching what happens on the wire. |
| `useBeanValidation` (4) | No constraint annotations are emitted, so the KSP processor has nothing to read and `JsonBinder` accepts any body that parses. |
| `openApiNullable` (5) | Optional properties become `JsonNullable<T>` wrappers instead of `T?`, and every caller has to unwrap them. |
| `modelPackage` / `modelNameSuffix` | Your spec names and your Kotlin names stop being distinguishable — `PlantCreate` in the spec and `PlantCreate` in your domain model. |
| `typeMappings` | Applies to every occurrence of the mapped type. `double` → `BigDecimal` changes the property type across all DTOs, so services and tests passing `Double` no longer compile. |
| `enumPropertyNaming` | Enum constant names are derived differently from the spec, which renames constants that your Kotlin code already references. |

The remaining options — `interfaceOnly`, `delegatePattern`, `useTags`, `auth`, `useCoroutines`, `allowUnicodeIdentifiers`, `apiPackage`, `omitGradleWrapper`, `generateApiDocumentation` — shape the generated endpoint interfaces and the build output rather than the DTOs. `interfaceOnly` and `delegatePattern` decide what form those interfaces take; `generateApiDocumentation=false` and `omitGradleWrapper=true` keep documentation and a second Gradle wrapper out of the output directory.

The generator has many more options; we won't list them here. Consult the [OpenAPI Generator documentation](https://openapi-generator.tech/docs/generators/kotlin-server) for the full set.

## Advanced: custom annotations in generated DTOs

Sooner or later you need a validation rule that OpenAPI cannot express, and you still want it enforced at runtime like every other constraint. This section shows how to carry your own annotation from the specification into a generated DTO, and how to make Batterypack check requests against it.

The running example is one annotation on one property: `@Email` on `notifyEmail`, a field of the `CareTaskSnoozeRequest` schema below. OpenAPI can express the 30-character limit that sits beside it; it has no keyword for "must be a valid email address".

Two tools are involved, so there are two steps:

1. **Extend the OpenAPI Generator templates**, so that `@Email` survives code generation and lands on the DTO property.
2. **Register `@Email` with [Validation Codegen](/validation/validation-codegen)**, so that it is enforced when a request arrives.

Each step fails silently without the other. Skip the first and the annotation never appears on the DTO; skip the second and it appears and nothing checks it. Both states compile.

### Extend the templates

OpenAPI Generator reads unknown `x-` keys into a `vendorExtensions` map, but a Mustache template only emits what it explicitly references, and the stock Kotlin property templates do not reference yours. The extension is parsed, held in memory, and dropped.

So the annotation is declared in the spec, as an extension on the property:

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

The value is a literal block, so several annotations can be stacked one per line, and the fully qualified name saves you from teaching the template to emit imports.

Point the generator at your own templates:

```kotlin
openApiGenerate {
    // ... other options
    templateDir.set("$projectDir/src/main/resources/templateDir")
}
```

Overrides work by filename — the generator looks here first and falls back to its bundled templates for everything you did not supply — so you copy only the two files you are changing.

`notifyEmail` is optional, which routes it through `data_class_opt_var.mustache`; required properties go through `data_class_req_var.mustache`. Extend both, starting from the bundled versions:

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

`data_class_opt_var.mustache`, which renders optional properties. `data_class_req_var.mustache` is identical apart from the trailing declaration, where required properties get neither the `?` nor the default:

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

The `vendorExtensions` section is the entire addition; everything around it is the stock template. Two details in it matter:

- The triple braces in <code v-pre>{{{.}}}</code> print the annotation verbatim. Double braces would escape it.
- <code v-pre>{{>beanValidation}}</code> and <code v-pre>{{>beanValidationModel}}</code> emit the standard Jakarta constraints. Drop them and you gain your custom annotation while losing every `@Size` and `@NotNull` on the property.

The same mechanism carries any `x-` extension, not just annotations.

### Register the annotation with Validation Codegen

An annotation on a DTO does nothing until the KSP processor knows what to do with it. Register it in a constraint descriptor, as described in [Validation Codegen](/validation/validation-codegen).

Then confirm it with a request that breaks the rule. A successful build tells you the annotation is on the class, not that anything enforces it.

## Security notes

- The spec is not an enforcement mechanism. Constraints become runtime checks only through the generated annotations, the KSP processor, and `JsonBinder`. A route that calls `call.receive<PlantCreateDto>()` instead of `bindBody` skips validation entirely, and nothing in the build tells you.
- Custom annotations are inert until they are registered as constraint descriptors. Confirm enforcement with a request that violates the rule, not with a green build.
- Map precision-sensitive numbers deliberately. `typeMappings` with `double` → `java.math.BigDecimal` applies to every `double` in the spec, which is what you want for money and usually not what you want for measurements.
