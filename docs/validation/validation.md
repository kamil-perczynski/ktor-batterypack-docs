# Validation

`ktor-batterypack-validation` provides runtime validation utilities and constraint helpers. It is typically used together with the validation code generator, but can also be used directly.

## What it provides

- `ValidationResult<T>` — sealed result type representing valid or invalid data.
- `ValidationException` — exception carrying constraint errors.
- `Constraints` — helper object with common validation checks (`NotNull`, `NotBlank`, `Size`, `Min`, `Max`, `Email`, `Past`, `Future`, etc.).
- `ConstraintError`, `FieldConstraintError`, `ObjectConstraintError`, `ListConstraintError` — structured error models.
- `JsonConstraints` / `JsonTypeChecks` — helpers for validating JSON-shaped data.

## ValidationResult

Use `ValidationResult.valid(...)` and `ValidationResult.invalid(...)` to express validation outcomes:

```kotlin
import io.github.ktor_batterypack.validation.ValidationResult

fun validateAge(age: Int): ValidationResult<Int> {
    return if (age >= 18) {
        ValidationResult.valid(age)
    } else {
        ValidationResult.invalid(age, FieldConstraintError("age", SingleConstraintError("Min", "Must be at least 18")))
    }
}
```

Convert a result to a value or throw:

```kotlin
val age = validateAge(21).check()
```

## Constraint helpers

The `Constraints` object contains static helpers that report errors through a `ValidationCall`:

```kotlin
import io.github.ktor_batterypack.validation.Constraints
import io.github.ktor_batterypack.validation.ValidationCall

fun validateUser(dto: UserDto, call: ValidationCall) {
    Constraints.checkNotBlank("name", dto.name, call)
    Constraints.checkEmail("email", dto.email, call)
    Constraints.checkSize("name", dto.name, call, min = 2, max = 100)
    Constraints.checkMin("age", dto.age, call, value = 18)
}
```

Available checks include:

- `checkNotNull`, `checkNotEmpty`, `checkNotBlank`
- `checkSize` (String / Collection)
- `checkMin`, `checkMax` (Int, Long, Double)
- `checkPositive`, `checkPositiveOrZero`, `checkNegative`, `checkNegativeOrZero`
- `checkDecimalMin`, `checkDecimalMax`
- `checkPast`, `checkPastOrPresent`, `checkFuture`, `checkFutureOrPresent`
- `checkPattern`, `checkEmail`

## ValidationException

When validation fails, throw `ValidationException`:

```kotlin
throw ValidationException(data, errors, "Request validation failed")
```

The core `KtorExceptionHandler` converts this into an RFC 7807 `ProblemDetail` response with field errors in the extension data.

## JSON validation

For validating raw JSON (e.g. webhook payloads), use `JsonConstraints` and `JsonTypeChecks` to assert structure and types without binding to a DTO first.
