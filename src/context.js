'use strict';

const uuid = require('uuid');
const _ = require('lodash');

module.exports = class Context {
  /**
   *
   * @param {String} (id)
   * @param {Number} (start)
   * @param {Logger} (log)
   */
  constructor(id, start, log) {
    this.id = id || uuid.v4();
    this.start = start || Date.now();
    // check to make sure that log is a bunyan logger before
    if (log && _.isFunction(log.child)) {
      this.log = log.child({
        request_id: id
      });
    }
  }

  /**
   *
   * @returns {Number}
   */
  dt() {
    return Date.now() - this.start;
  }
}