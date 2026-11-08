const s: Record<string, string> = new Proxy(
  {},
  { get: (_target, key) => `tc-${String(key)}` }
)

export default s