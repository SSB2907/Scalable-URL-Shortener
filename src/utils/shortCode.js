// src/utils/shortCode.js
//
// Thin wrapper around nanoid. Kept as its own module (rather than calling
// nanoid() inline) so tests can mock code generation deterministically to
// simulate a collision.

const { nanoid } = require("nanoid");
const config = require("../config");

function generateCode() {
  return nanoid(config.shortCode.length);
}

module.exports = { generateCode };
