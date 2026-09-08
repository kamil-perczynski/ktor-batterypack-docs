# Validation Codegen

`ktor-batterypack-validation-ksp` is a KSP processor that generates validator implementations from annotated interfaces. You describe what to validate by placing Jakarta constraint annotations on your DTOs and declaring an interface; the processor writes the implementation that checks every property, walks nested objects and lists, and collects structured errors.

It makes three things easy:

- turning Jakarta annotations (`@NotBlank`, `@Size`, `@Past`, ...) into runtime checks without hand-written boilerplate
- validating raw `JsonNode` payloads before deserialization, using the same DTO annotations as the constraint source
- overriding any generated method with custom logic — polymorphic dispatch, cross-field rules, or skipping validation entirely

The processor builds on [ktor-batterypack-validation](/validation/validation), which provides the runtime types (`ValidationResult`, `ValidationCall`, `Constraints`). Business-rule validation is not generated — the processor gives you [manual override](#manual-overrides) hooks to inject it. OpenAPI schema generation is a separate concern; see [OpenAPI Generator](/core/openapi-generator).

## Setup

The [`ktor-batterypack-gradle-plugin`](/gradle-plugin/) applies KSP automatically. If you are not using the plugin, apply KSP manually:

```kotlin
plugins {
    id("com.google.devtools.ksp") version "2.3.10"
}

dependencies {
    ksp("io.github.ktor_batterypack:ktor-batterypack-validation-ksp:0.0.13-alpha")
    implementation("io.github.ktor_batterypack:ktor-batterypack-validation:0.0.13-alpha")
    implementation("io.github.ktor_batterypack:ktor-batterypack-annotations:0.0.13-alpha")
}
```

The generated class is placed in the same package as the annotated interface, named `{InterfaceName}Impl`.

## Two modes

| | `@Validator` | `@JsonValidator` |
|---|---|---|
| **Input type** | Typed Kotlin DTO | `JsonNode` / `ObjectNode` |
| **When to use** | DTO is already deserialized | Validate before deserialization |
| **Method parameter** | The DTO class directly | `JsonNode` with `@ValidationParamType` bridge |
| **Constraint source** | Jakarta annotations on the DTO | Same — reads DTO metadata via `@ValidationParamType` |

The constraint source is the same in both modes — what differs is the value the generated code checks: the deserialized DTO, or the raw JSON tree.

## DTO validation with `@Validator`

Annotate your DTOs with Jakarta constraints and define an interface:

```kotlin
data class Person(
    @field:NotNull
    @field:NotBlank
    val firstName: String,
    @field:NotNull
    @field:NotBlank
    val lastName: String,

    val address: Address,

    @field:Past
    val birthDate: LocalDate,

    @field:NotEmpty
    val identifications: List<PersonIdentification>,
)

data class Address(
    @field:Size(min = 1, max = 100)
    val addressLine1: String,
    val addressLine2: String,
    @field:NotBlank
    @field:Pattern(regexp = "\\d{2}-\\d{3}")
    val zipCode: String,
)
```

```kotlin
@Validator
interface PersonValidator {
    fun validate(person: Person): ValidationResult<Person>
}
```

KSP generates `PersonValidatorImpl` in the same package. Use it directly or inject it through your DI container.

Every entry-point method follows one shape: exactly one DTO parameter, returning `ValidationResult<T>` with `T` matching that parameter. Multiple entry points per interface are fine — each gets its own generated implementation.

Calling `.check()` on the result throws `ValidationException` — handled globally by the core [exception handler](/core/exceptions).

## JSON validation with `@JsonValidator`

This is the more interesting mode for HTTP APIs. It lets you validate a raw `JsonNode` **before** attempting deserialization. The generator still reads constraint metadata from your DTO classes, but the generated code operates on JSON nodes directly.

### The `@ValidationParamType` bridge

Since the method parameter is `JsonNode` (not the DTO), the generator needs a hint to know which DTO's constraints to apply. That's what `@ValidationParamType` does:

```kotlin
@JsonValidator
interface JsonPersonValidator {

    @ValidationParamType(Person::class)
    fun validatePerson(person: JsonNode): ValidationResult<JsonNode>
}
```

The annotation says: "generate validation logic as if this method accepted `Person`, but run the checks against the `JsonNode`."

## Recommended usage: companion object

The generated `*Impl` classes work on their own, but the idiomatic way to expose a validator is delegation from the interface's companion object:

```kotlin
@Validator
interface UserDtoValidator {

    companion object : UserDtoValidator by UserDtoValidatorImpl()

    fun validate(userCreate: UserCreate): ValidationResult<UserCreate>

    fun validate(userUpdate: UserUpdate): ValidationResult<UserUpdate>
}
```

You call it without an instance — `UserDtoValidator.validate(dto)` — or keep injecting `UserDtoValidatorImpl` through your DI container; the companion just removes the ceremony. It is plain Kotlin delegation, so it works the same way for `@JsonValidator` interfaces.

## Manual overrides

Generated methods handle single-field constraints. When a rule spans several fields, or one nested type needs different handling, declare that method **with a body** — in either mode. That makes it a manual override, and there are exactly two mechanisms:

- **Replace** — a body on a method matching the generated naming convention (`validate{TypeName}`) replaces generation for that type. Your implementation is the only validation that runs for it.
- **Add** — a body on a differently named method runs after the generated checks, contributing errors to the same `ValidationCall`.

Cross-field rules, polymorphic dispatch, object-level checks, and skipping a nested type all build on these two mechanisms. They are covered in [Advanced Validation Codegen](/validation/validation-codegen-advanced).

## Supported constraints

The generator recognizes standard Jakarta Bean Validation annotations:

- `@NotNull`, `@NotBlank`, `@NotEmpty`
- `@Size(min, max)`
- `@Min`, `@Max`
- `@Positive`, `@PositiveOrZero`, `@Negative`, `@NegativeOrZero`
- `@DecimalMin`, `@DecimalMax`
- `@Past`, `@PastOrPresent`, `@Future`, `@FutureOrPresent`
- `@Pattern(regexp)`
- `@Email`

The list is not fixed — custom constraint descriptors extend it with your own annotations. See [Advanced Validation Codegen](/validation/validation-codegen-advanced#custom-constraint-descriptors).

Each annotation maps to a check method named `check{AnnotationSimpleName}` — `@NotBlank` becomes `checkNotBlank`, `@Email` becomes `checkEmail`. The implementations live in two classes from the runtime module: `io.github.ktor_batterypack.validation.Constraints` for typed validators, and `io.github.ktor_batterypack.validation.JsonConstraints` for the JSON variants whose logic has to operate on JSON trees (e.g. `@NotEmpty`, `@Size`). They are the same methods you can call by hand — see [Constraint helpers](/validation/validation#constraint-helpers).

Annotation targets `@field:`, `@get:`, and `@param:` are all picked up.

List item constraints work too:

```kotlin
@param:NotEmpty
val creditCards: List<@NotBlank @Pattern(regexp = "^\\d{16}$") String> = emptyList()
```

The generator produces per-item checks inside the list iteration loop.

## Error output shape

Validation errors are structured as nested JSON matching the shape of the input object. For a `Person` submitted with blank names and a blank zip code, validation fails like this:

```json
{
  "firstName": [
    { "constraint": "NotBlank" }
  ],
  "lastName": [
    { "constraint": "NotBlank" }
  ],
  "address": {
    "zipCode": [
      { "constraint": "NotBlank" },
      { "constraint": "Pattern", "message": "Must match \\d{2}-\\d{3}" }
    ]
  }
}
```

Each field maps to an array of violated constraints. Nested objects produce nested error objects. Lists produce `{ "errors": [...], "items": [...] }` where each item position is either `null` (valid) or an error object.

## See also

- [Validation](/validation/validation) — the runtime module (constraints, error types, `ValidationCall`)
- [Advanced Validation Codegen](/validation/validation-codegen-advanced) — the override mechanisms in depth: cross-field checks, polymorphic dispatch, object-level checks, skipping nested types, custom constraint descriptors
