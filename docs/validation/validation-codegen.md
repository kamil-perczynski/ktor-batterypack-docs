# Validation Codegen

`ktor-batterypack-validation-ksp` is a KSP processor that generates validator implementations from annotated interfaces. You describe what to validate by placing Jakarta constraint annotations on your DTOs and declaring an interface; the processor writes the implementation that checks every property, walks nested objects and lists, and collects structured errors.

It makes three things easy:

- turning Jakarta annotations (`@NotBlank`, `@Size`, `@Past`, ...) into runtime checks without hand-written boilerplate
- validating raw `JsonNode` payloads before deserialization, using the same DTO annotations as the constraint source
- overriding any generated method with custom logic — polymorphic dispatch, cross-field rules, or skipping validation entirely

The processor builds on [ktor-batterypack-validation](/validation/validation), which provides the runtime types (`ValidationResult`, `ValidationCall`, `Constraints`). Business-rule validation is not generated — the processor gives you override hooks to inject it. OpenAPI schema generation is a separate concern; see [OpenAPI Generator](/core/openapi-generator).

## Setup

The `ktor-batterypack-gradle-plugin` applies KSP automatically. If you are not using the plugin, apply KSP manually:

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

Both modes read constraints from the same Jakarta annotations on your data classes. The difference is what the generated code validates against.

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
    val addressLine1: String,
    val addressLine2: String,
    @field:NotBlank
    @field:Pattern(regexp = "\\d{2}-\\d{3}")
    @field:Size(min = 1, max = 100)
    val zipCode: String,
)
```

```kotlin
@Validator
interface PersonValidator {
    fun validate(person: Person): ValidationResult<Person>
}
```

The entry-point method must return `ValidationResult<T>` where `T` matches the parameter type. KSP generates `PersonValidatorImpl` in the same package. Use it directly or inject through your DI container.

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

## Overriding generated methods

Any method in the interface **with a body** is treated as a manual override. The generator will call your implementation instead of generating one.

### Replacing a nested type validator

If you provide a body for a method matching a nested type, the generated code delegates to your implementation:

```kotlin
@JsonValidator
interface JsonPersonValidator {

    @ValidationParamType(Person::class)
    fun validatePerson(person: JsonNode): ValidationResult<JsonNode>

    @ValidationParamType(PersonIdentification::class)
    fun validatePersonIdentification(personIdentification: ObjectNode?, call: ValidationCall) {
        if (personIdentification == null) return

        when (val type = JsonTypeChecks.checkString("type", personIdentification)) {
            ID_DOCUMENT_CHECK.name -> validateIdDocIdentification(personIdentification, call)
            LIVENESS_CHECK.name -> validateLivenessIdentification(personIdentification, call)
            else -> call.propertyError(
                "type",
                SingleConstraintError("EnumConstant", "Unknown enum constant: '$type'")
            )
        }
    }

    @ValidationParamType(IdDocIdentification::class)
    fun validateIdDocIdentification(idDocIdentification: ObjectNode?, call: ValidationCall)

    @ValidationParamType(LivenessIdentification::class)
    fun validateLivenessIdentification(livenessIdentification: ObjectNode?, call: ValidationCall)
}
```

Here `validatePersonIdentification` has a body: it inspects the `type` discriminator and dispatches to per-subtype validators, each of which is still auto-generated (no body). This is the pattern for **polymorphic hierarchies**.

### Adding extra checks alongside generation

If you define a method with a **different name** than the generated one for the same type, the codegen calls both — your method runs *in addition to* the generated checks:

```kotlin
@ValidationParamType(Address::class)
fun checkAddressLines(address: ObjectNode?, call: ValidationCall) {
    val line1 = address?.get("addressLine1")?.asString(null) ?: return
    val line2 = address.get("addressLine2")?.asString(null) ?: return

    if (line1.isNotBlank() && line2.isNotBlank() && line1 == line2) {
        call.propertyError(
            "addressLine1",
            SingleConstraintError("AddressLineUnique", "Address lines must be unique")
        )
    }
}
```

The generated `validateAddress` runs the Jakarta constraint checks. Then `checkAddressLines` runs your cross-field logic. Both contribute errors to the same `ValidationCall`.

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

Annotation targets `@field:`, `@get:`, and `@param:` are all picked up.

List item constraints work too:

```kotlin
@param:NotEmpty
val creditCards: List<@NotBlank @Pattern(regexp = "^\\d{16}$") String> = emptyList()
```

The generator produces per-item checks inside the list iteration loop.

## Error output shape

Validation errors are structured as nested JSON matching the shape of the input object. Here's what a failed validation of a `Person` looks like:

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

## Companion object pattern

A convenient way to expose the generated implementation:

```kotlin
@Validator
interface UserDtoValidator {

    companion object : UserDtoValidator by UserDtoValidatorImpl()

    fun validate(userCreate: UserCreate): ValidationResult<UserCreate>

    fun validate(userUpdate: UserUpdate): ValidationResult<UserUpdate>
}
```

Multiple validation methods in one interface are supported. Each method must accept exactly one DTO parameter and return `ValidationResult<T>`.

## See also

- [Validation](/validation/validation) — the runtime module (constraints, error types, `ValidationCall`)
- [Advanced Validation Codegen](/validation/validation-codegen-advanced) — cross-field JSON checks, polymorphic dispatch, custom constraint descriptors
