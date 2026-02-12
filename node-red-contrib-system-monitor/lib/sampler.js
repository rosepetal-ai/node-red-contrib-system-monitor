"use strict";

class Sampler {
  static create(options = {}) {
    return new this(options);
  }

  getMetrics() {
    throw new Error("getMetrics() must be implemented by subclass");
  }
}

module.exports = Sampler;
