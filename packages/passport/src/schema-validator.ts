import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import PolicySchema from './schemas/Policy.schema.json'

/**
 * Schema validator — extracted from Lucid-L2 offchain/src/utils/schemaValidator.ts
 *
 * Key difference from original: schemas are imported directly instead of
 * loaded from the filesystem via fs.readFileSync. This removes the fs/path
 * dependency and makes the package truly portable.
 */

export type SchemaId = 'Policy' | 'ModelMeta' | 'ComputeMeta' | 'RunReceipt'

/** Validation result type — discriminated union */
export type ValidationResult<T> =
  | { ok: true; value: T; errors?: never }
  | { ok: false; errors: unknown; value?: never }

/**
 * Schema registry — we only need Policy for the gateway hot path.
 * ModelMeta and ComputeMeta are validated at passport creation time (in Lucid-L2).
 * We include stubs that always pass for schemas we don't bundle.
 */
const SCHEMAS: Partial<Record<SchemaId, object>> = {
  Policy: PolicySchema,
}

let ajvSingleton: InstanceType<typeof Ajv> | null = null
const validatorCache = new Map<SchemaId, ReturnType<InstanceType<typeof Ajv>['compile']>>()

function getAjv(): InstanceType<typeof Ajv> {
  if (!ajvSingleton) {
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
    })
    addFormats(ajv)
    ajvSingleton = ajv
  }
  return ajvSingleton
}

export function validateWithSchema<T>(id: SchemaId, value: unknown): ValidationResult<T> {
  // If we don't have the schema bundled, pass through (validated elsewhere)
  const schema = SCHEMAS[id]
  if (!schema) {
    return { ok: true, value: value as T }
  }

  const ajv = getAjv()
  let validate = validatorCache.get(id)
  if (!validate) {
    validate = ajv.compile(schema)
    validatorCache.set(id, validate)
  }
  const ok = validate(value)
  if (!ok) {
    return { ok: false, errors: validate.errors }
  }
  return { ok: true, value: value as T }
}