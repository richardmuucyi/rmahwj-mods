// The module runs where base64 is built into Uint8Array (the plugin docs use it throughout); the es2023 lib does not
// declare it. A separate file: the state contract in index.d.ts may only augment 'claude-code'.
interface Uint8Array {
  toBase64(): string
}
interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array
}
