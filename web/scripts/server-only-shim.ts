/**
 * Stand-in for the `server-only` marker module.
 *
 * Next.js resolves `server-only` through its bundler; nothing provides it to
 * plain Node, so importing any `lib/` module under tsx would fail. The scripts
 * tsconfig maps the specifier here, where it is a no-op — these scripts *are*
 * server-side, which is exactly what the marker asserts.
 */
export {};
