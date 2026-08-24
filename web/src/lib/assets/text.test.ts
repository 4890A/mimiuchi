import test from "node:test";
import assert from "node:assert/strict";
import { decodeTextFile } from "./text";

const utf8 = (s: string) => new TextEncoder().encode(s);

function withBom(bom: number[], body: Uint8Array): Uint8Array {
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}

test("decodes bare UTF-8", () => {
  assert.equal(decodeTextFile(utf8("…この洞窟に逃げ延びていたとはな。")), "…この洞窟に逃げ延びていたとはな。");
});

test("strips a UTF-8 BOM", () => {
  const buf = withBom([0xef, 0xbb, 0xbf], utf8("『【耳舐め特化】"));
  const out = decodeTextFile(buf);
  assert.equal(out, "『【耳舐め特化】");
  assert.ok(!out.startsWith("﻿"), "BOM must not survive into the text");
});

test("decodes UTF-16LE with a BOM", () => {
  const s = "みお：（正面寄り・やや左耳　近め）";
  const body = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    body[i * 2] = s.charCodeAt(i) & 0xff;
    body[i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  assert.equal(decodeTextFile(withBom([0xff, 0xfe], body)), s);
});

test("falls back to Shift-JIS when the bytes are not valid UTF-8", () => {
  // 「あ」in CP932 is 0x82 0xA0 — an invalid UTF-8 sequence.
  assert.equal(decodeTextFile(new Uint8Array([0x82, 0xa0])), "あ");
});

test("a leading 4-byte emoji does not derail BOM sniffing", () => {
  // One real readme starts with U+1F3B5, whose first byte is 0xF0. Naive
  // first-byte checks mistake that for something needing special handling.
  const out = decodeTextFile(utf8("🎵 ご購入ありがとうございます"));
  assert.ok(out.startsWith("🎵"));
});

test("normalizes CRLF, lone CR, and mixed endings to LF", () => {
  assert.equal(decodeTextFile(utf8("a\r\nb\r\nc")), "a\nb\nc");
  assert.equal(decodeTextFile(utf8("a\rb")), "a\nb");
  // 115 LF plus a single CRLF is a real file in the wild.
  assert.equal(decodeTextFile(utf8("a\nb\r\nc\nd")), "a\nb\nc\nd");
});

test("keeps the leading blank lines a script opens with", () => {
  // One 台本 starts with seven blank CRLF lines; the reader should see them
  // as-is rather than have them silently trimmed.
  const out = decodeTextFile(utf8("\r\n\r\n\r\n…この洞窟に"));
  assert.equal(out, "\n\n\n…この洞窟に");
});

test("handles an empty file", () => {
  assert.equal(decodeTextFile(new Uint8Array(0)), "");
});
