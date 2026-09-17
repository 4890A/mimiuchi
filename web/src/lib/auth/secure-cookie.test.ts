import { test } from "node:test";
import assert from "node:assert/strict";
import { secureCookie } from "./secure-cookie";

/**
 * When the login cookie is marked Secure. Getting this wrong over plain HTTP
 * makes the browser discard the cookie, so login never sticks.
 */

test("a plain-HTTP request gets a cookie the browser will keep", () => {
  // The iPhone-on-the-LAN case: `next start`, no TLS, no reverse proxy.
  assert.equal(secureCookie(undefined, "http"), false);
});

test("an HTTPS request gets a Secure cookie", () => {
  assert.equal(secureCookie(undefined, "https"), true);
  assert.equal(secureCookie(undefined, "HTTPS"), true);
});

test("with no scheme to go on, the cookie is not Secure", () => {
  assert.equal(secureCookie(undefined, null), false);
  assert.equal(secureCookie(undefined, ""), false);
});

test("behind chained proxies the first hop decides", () => {
  assert.equal(secureCookie(undefined, "https, http"), true);
  assert.equal(secureCookie(undefined, "http,https"), false);
});

test("KIKOERU_SECURE_COOKIES forces the answer whatever the scheme", () => {
  for (const off of ["false", "0", "no", " FALSE "]) {
    assert.equal(secureCookie(off, "https"), false, JSON.stringify(off));
  }
  for (const on of ["true", "1", "yes", " True "]) {
    assert.equal(secureCookie(on, "http"), true, JSON.stringify(on));
  }
});

test("an empty or unrecognised override falls back to the scheme", () => {
  // compose.yaml passes the variable through as "" when .env leaves it out.
  assert.equal(secureCookie("", "http"), false);
  assert.equal(secureCookie("", "https"), true);
  assert.equal(secureCookie("maybe", "https"), true);
});
