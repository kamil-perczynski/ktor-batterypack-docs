# Advanced Validation Codegen

This page covers patterns that go beyond basic constraint checking: cross-field validation on raw JSON, polymorphic type dispatch, and custom constraint descriptors.

You should be familiar with the basics from [Validation Codegen](/validation/validation-codegen) before reading this.

## Cross-field validation with `JsonTypeChecks`

Jakarta annotations validate individual fields. When a rule spans multiple fields — "billing period start must be before end" — you need a method override.

`JsonTypeChecks` provides typed extraction from `ObjectNode`: `checkString`, `checkLocalDate`, `checkInt`, `checkBoolean`, and others. Each returns the parsed value or `null` if the field is missing or the wrong type.

```kotlin
@JsonValidator
interface JsonInvoiceCreateValidator {

    @ValidationParamType(InvoiceCreate::class)
    fun validateInvoiceCreate(invoiceCreate: JsonNode): ValidationResult<JsonNode>

    @ValidationParamType(InvoicePosition::class)
    fun validateInvoicePosition(invoicePosition: ObjectNode?, call: ValidationCall)

    @ValidationParamType(MeteringPointPosition::class)
    fun checkBillingPeriod(meteringPointPosition: ObjectNode, call: ValidationCall) {
        val billingPeriodFrom =
            JsonTypeChecks.checkLocalDate("billingPeriodFrom", meteringPointPosition)

        val billingPeriodTo =
            JsonTypeChecks.checkLocalDate("billingPeriodTo", meteringPointPosition)

        if (billingPeriodFrom == null || billingPeriodTo == null) {
            return  // (1)
        }

        if (billingPeriodFrom.isAfter(billingPeriodTo)) {
            call.propertyError(
                "billingPeriodFrom",
                SingleConstraintError("TimeMath", "Billing period dates are incorrect")
            )
        }
    }
}
```

1. If either date is missing or unparseable, bail out. The generated per-field checks already report those errors.

`checkBillingPeriod` is an **additional** method — the generated `validateMeteringPointPosition` still runs all Jakarta constraint checks (`@NotBlank` on `meteringPointCode`, `@NotEmpty` on `positions`, etc.). Your method runs alongside it, not instead of it.

The rule for this: if your method name **does not** match the naming convention `validate{TypeName}`, it's treated as an additional check. If it **does** match, it replaces the generated method entirely.

## Polymorphic dispatch

When a DTO hierarchy uses an interface or sealed class, the generator cannot know which concrete type to validate at compile time. You provide the dispatch logic; the generator handles each branch.

### Interface hierarchies

```kotlin
@Validator
interface InvoiceCreateValidator {

    fun validateInvoiceCreate(invoiceCreate: InvoiceCreate): ValidationResult<InvoiceCreate>

    fun validateContractParty(contractParty: ContractParty?, call: ValidationCall) {
        if (contractParty == null) return

        when (contractParty) {
            is SellerParty -> validateSellerParty(contractParty, call)
            is BuyerParty -> validateBuyerParty(contractParty, call)
            is ReceiverParty -> validateReceiverParty(contractParty, call)
            is ProducerParty -> validateProducerParty(contractParty, call)
            is PayerParty -> validatePayerParty(contractParty, call)
        }
    }

    fun validateSellerParty(sellerParty: SellerParty?, call: ValidationCall)
    fun validateBuyerParty(buyerParty: BuyerParty?, call: ValidationCall)
    fun validateReceiverParty(receiverParty: ReceiverParty?, call: ValidationCall)
    fun validateProducerParty(producerParty: ProducerParty?, call: ValidationCall)
    fun validatePayerParty(payerParty: PayerParty?, call: ValidationCall)
}
```

`validateContractParty` has a body — the generator won't touch it. Each per-subtype method has no body — the generator fills those in based on each subtype's Jakarta annotations.

### JSON discriminator dispatch

The same pattern works with `@JsonValidator`, using `JsonTypeChecks` to read the discriminator:

```kotlin
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
```

The `else` branch reports an error for unknown discriminator values. The per-subtype methods are auto-generated, each reading constraints from their respective DTO class via `@ValidationParamType`.

## Object-level validation checks

Sometimes a constraint applies to the object as a whole, not to a single field. Use `"$"` as the property name to report object-level errors:

```kotlin
fun checkInvoiceCreate(invoiceCreate: InvoiceCreate?, call: ValidationCall) {
    if (invoiceCreate == null) return

    val types = mutableSetOf<ContractPartyType?>()
    types.add(invoiceCreate.party1?.type)
    types.add(invoiceCreate.party2?.type)
    // ...

    if (!types.contains(ContractPartyType.BUYER)) {
        call.propertyError(
            "$",
            SingleConstraintError("BuyerRequired", "Invoice must have a buyer party defined")
        )
    }
}
```

The `"$"` convention places the error at the root of the object's error map rather than under a field name.

## Skipping generated validation for a nested type

If you provide a body for a method that matches the generated naming convention (`validate{TypeName}`), the generator skips generation entirely for that type. An empty body effectively disables validation:

```kotlin
@ValidationParamType(Address::class)
fun validateAddress(address: ObjectNode?, call: ValidationCall) {
    // intentionally empty — skip all Address validation
}
```

If Address validation is skipped, no constraint checks will run for any Address field. This means invalid addresses will pass silently.

## Custom constraint descriptors

The generator's built-in constraint set covers standard Jakarta annotations. When you need to recognize your own constraint annotations — without modifying the generator — you can provide YAML descriptor files.

### Pointing the processor to your descriptors

Pass a directory path to KSP via the `ktor.validation.constraint.dir` option:

```kotlin
ksp {
    arg("ktor.validation.constraint.dir", "${projectDir}/constraints")
}
```

Every `.yaml` file in that directory is loaded at compile time and merged with the built-in Jakarta descriptors. The processor loads your files first, then appends the Jakarta set, so both are available during generation.

### Descriptor file format

A descriptor file has four required top-level keys:

<div v-pre>

```yaml
$schema: constraints-descriptor.schema.yaml  # optional, for IDE support

imports:                          # (1)
  - com.example.validation.MyConstraints

jsonImports:                      # (2)
  - com.example.validation.MyConstraints
  - com.example.validation.MyJsonConstraints

defaults:                         # (3)
  simpleClassName: MyConstraints

constraints:                      # (4)
  - annotation: com.example.annotation.Iban
  - annotation: com.example.annotation.PhoneNumber
    callTpl: "MyConstraints.checkPhone({{quote prop}}, {{value}}, {{call}})"
```

</div>

**imports** — fully qualified imports added to the generated `@Validator` class. These must include the class that contains your constraint check methods.

**jsonImports** — fully qualified imports added to the generated `@JsonValidator` class. If your JSON checks live in a separate class, list it here.

**defaults.simpleClassName** — the simple class name used in the default call template. Every constraint in this file inherits this unless it overrides `simpleClassName` individually.

**constraints** — the list of annotation-to-method mappings.

### How constraints map to generated code

Each constraint entry needs at minimum an `annotation` — the fully qualified name of the annotation class. When the generator sees this annotation on a DTO property, it emits a method call.

By default, the generated call follows this template:

```
{simpleClassName}.check{AnnotationSimpleName}("{propertyName}", value, call, ...args)
```

For example, a constraint entry:

```yaml
- annotation: com.example.annotation.Iban
```

with `defaults.simpleClassName: MyConstraints` generates:

```kotlin
MyConstraints.checkIban("iban", it, call)
```

The generator derives the method name from the annotation's simple name: `com.example.annotation.Iban` becomes `checkIban`.

### Overriding the call template

If the default template doesn't match your method signature, override it with `callTpl` (for typed validators) or `jsonCallTpl` (for JSON validators):

<div v-pre>

```yaml
constraints:
  - annotation: com.example.annotation.PhoneNumber
    callTpl: "MyConstraints.checkPhone({{quote prop}}, {{value}}, {{call}}, {{constraintArgs args}})"
    jsonCallTpl: "MyJsonConstraints.checkPhone({{quote prop}}, {{value}}, {{call}})"
```

</div>

Templates use Handlebars syntax. The following variables are available:

<div v-pre>

| Variable | Description |
|---|---|
| `{{simpleClassName}}` | The `simpleClassName` for this constraint (from defaults or per-constraint override) |
| `{{methodName}}` | The derived method name, e.g. `checkPhoneNumber` |
| `{{prop}}` | The property name being validated |
| `{{quote prop}}` | The property name wrapped in quotes — use this for string arguments |
| `{{value}}` | The value expression (typically `it` inside a `?.let` block) |
| `{{call}}` | The `ValidationCall` variable name |
| `{{constraintArgs args}}` | Renders annotation arguments as named parameters (e.g. `min=1, max=100`) |

</div>

If `callTpl` is not set on a constraint, it falls back to `defaults.callTpl`. If that's also not set, the built-in default template is used. The same cascade applies to `jsonCallTpl`, with one extra fallback: if `jsonCallTpl` is missing, it falls back to `callTpl` before using the default.

### Per-constraint class override

If a specific constraint's check method lives on a different class than the default, override `simpleClassName` on that entry:

```yaml
defaults:
  simpleClassName: MyConstraints

constraints:
  - annotation: com.example.annotation.Iban
  - annotation: com.example.annotation.Luhn
    simpleClassName: CreditCardConstraints
```

This generates `MyConstraints.checkIban(...)` for the first and `CreditCardConstraints.checkLuhn(...)` for the second.

### What the built-in Jakarta descriptor looks like

For reference, here is the built-in descriptor that ships with the generator:

<div v-pre>

```yaml
imports:
  - io.github.ktor_batterypack.validation.Constraints
jsonImports:
  - io.github.ktor_batterypack.validation.Constraints
  - io.github.ktor_batterypack.validation.JsonConstraints
defaults:
  simpleClassName: Constraints
constraints:
  - annotation: jakarta.validation.constraints.NotBlank
  - annotation: jakarta.validation.constraints.NotEmpty
    jsonCallTpl: JsonConstraints.checkNotEmpty({{quote prop}}, {{value}}, {{call}})
  - annotation: jakarta.validation.constraints.Min
  - annotation: jakarta.validation.constraints.Max
  - annotation: jakarta.validation.constraints.Size
    jsonCallTpl: JsonConstraints.checkSize({{quote prop}}, {{value}}, {{call}}, {{constraintArgs args}})
  - annotation: jakarta.validation.constraints.Past
  - annotation: jakarta.validation.constraints.Pattern
  # ... and so on for all Jakarta constraints
```

</div>

Most entries rely on the default template. Only `NotEmpty` and `Size` override `jsonCallTpl` because their JSON validation logic differs from the typed DTO version (they operate on `JsonNode` arrays/objects instead of Kotlin collections).

Your custom descriptors work exactly the same way — same format, same template variables, same fallback rules.

## See also

- [Validation Codegen](/validation/validation-codegen) — setup, basic usage, `@Validator` and `@JsonValidator`
- [Validation](/validation/validation) — the runtime module (constraints, error types, `ValidationCall`)
