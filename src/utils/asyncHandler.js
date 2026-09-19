// src/utils/asyncHandler.js
//
// Wraps an async Express route handler so rejected promises are forwarded
// to next(err) instead of crashing the process / hanging the request.
// Keeps try/catch out of every controller.

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
