# Bounded operation schema profile

`compileSchema(schema)` returns an immutable `{schemaDigest, validate, assert}`.
`validate(params)` returns a boolean for an ordinary mismatch. Invalid schemas,
non-JSON inputs, unsupported constraints, and exhausted budgets throw a bounded
`SchemaError` code. `assert(params)` additionally throws `SCHEMA_VALUE_INVALID`
for a mismatch. Compilation copies and hashes the schema; mutating the author's
original object cannot change an installed validator.

`parseSchemaJson(stringOrBytes)` parses a packaged schema before compilation.
It rejects malformed UTF-8, duplicate object keys (including differently escaped
spellings), excessive nesting and excessive input. It never resolves a URL.
Use it for package-file schemas; do not let `JSON.parse` discard duplicate keys
before this check.

This is a documented subset of the JSON Schema 2020-12 vocabulary, not a complete
implementation of that standard. It keeps arbitrary nested game domains rather
than defining an inventory model. Every accepted assertion is evaluated. Unknown
keywords, unknown formats, unsupported regex syntax, other dialects and unresolved
references fail at compilation; they are never treated as annotations or ignored.

## Supported assertions

| Domain | Keywords and behavior |
| --- | --- |
| Any JSON value | Boolean schemas; `type` (one type or a unique type array); `const`; nonempty `enum` with at most 128 distinct values |
| Numbers | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`; positive safe-integer `multipleOf` only |
| Strings | `minLength`, `maxLength` count Unicode code points; bounded `pattern`; the asserted formats below |
| Objects | `properties`, `required`, `additionalProperties` as boolean or schema, `minProperties`, `maxProperties`, `dependentRequired` |
| Arrays | `items` as boolean or schema, `prefixItems`, `minItems`, `maxItems`, `uniqueItems` with structural JSON equality |
| Composition | `allOf`, `anyOf`, `oneOf`, `not`; at most 16 branches in a combination |
| References | Same-document JSON Pointer `$ref`, with `~0`/`~1` decoding; `$defs` and `definitions`; cycles rejected |

`integer` requires a safe, lossless JavaScript integer. NaN, infinities, unsafe
integer numbers and host objects are rejected even by `true`. Large native IDs
must use canonical decimal strings. No coercion, defaults insertion, property
deletion or input mutation occurs.

The supported asserted formats are `sha256` (64 lowercase hexadecimal digits),
`hex` (nonempty, even-length lowercase hexadecimal), `decimal-integer` (canonical
signed decimal, no `-0`), `uint64`, `int64`, and `uuid`. Other formats—including
`date-time` and arbitrary URI formats—are unsupported rather than accepted
without validation.

`$schema` may name the 2020-12 schema URL and is checked without fetching it.
`$comment`, `title`, `description`, `default`, `examples`, `deprecated`, `readOnly`
and `writeOnly` are the explicitly accepted annotations. They do not grant
permissions, change validation, or replace trusted host policy. Annotation types
are checked, and their contents count toward schema size limits. Even unused
definitions are compiled, so an unsupported constraint cannot hide there.

## Pattern profile

Patterns use a small interpreted grammar. The validator never constructs a host
`RegExp`, `Function` or `eval`, and never downloads executable dependencies.
Accepted patterns start with `^`, end with `$`, and match the complete string.
The anchors use strict full-string semantics, including at newlines.

Supported syntax includes literals, ASCII character classes and ranges,
alternation, capturing/noncapturing groups, `?`, and bounded `{n}` / `{m,n}`
repetition. Literal metacharacters can be escaped. This covers the shipped
Crimson canonical-decimal, digest and fixed-width hexadecimal schemas.

Unbounded `*`, `+`, `{m,}`, backreferences, lookarounds, negated classes, wildcard
`.`, shorthand classes such as `\d`, flags and lazy quantifiers are rejected.
Authors can spell `\d` as `[0-9]`. Nested bounded repetition is supported but
still consumes validation work; an ambiguous expression cannot bypass the budget.

## Independent ceilings

| Resource | Default maximum |
| --- | ---: |
| Schema JSON | 128 KiB, 4,096 nodes, depth 32 |
| Parameter JSON | 128 KiB, 10,000 nodes, depth 32 |
| One parameter string | 16,384 Unicode code points |
| Validation work | 200,000 interpreted steps |
| Pattern source / AST / nesting | 256 characters / 128 nodes / depth 16 |
| Bounded repetition | 8,192 iterations |
| Pattern memoization | 32,768 states |
| Property/required/prefix declarations | 128 each |

Callers may reduce limits, never increase them. Property traversal, reference
depth, pattern expansion, memoized matching, branch evaluation and comparisons
are bounded independently. JSON keys that can poison object prototypes,
accessors, cycles and non-JSON instances are rejected. The API accepts parsed
JSON and bounded binary schema files; executing a hostile host-created Proxy
is outside this JSON transport contract.

The operation catalog obtains schemas only from the exact validated package
manifest or its digest-bound files. These checks run before draft persistence
and again before the connector receives the canonical operation log. They are
parameter validation, not a substitute for game-format checks, independent
entitlement inspection, revision binding, backup verification or user approval.

Reference semantics: [JSON Schema validation vocabulary](https://json-schema.org/draft/2020-12/json-schema-validation)
and [core vocabulary](https://json-schema.org/draft/2020-12/json-schema-core).
No specification code was copied into this implementation.
