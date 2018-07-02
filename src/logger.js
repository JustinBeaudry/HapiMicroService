'use strict';

const bunyan = require('bunyan');
const gc = require('./gcStats');
const Context = require('./context');

/**
 * @type {Logger}
 */
module.exports = class Logger {
  /**
   *
   * @param {{
       name: String,
       process: String,
       level: String
     }} logOptions
   * @param {Number} (lagProbeInterval) [250]
   * @param {Number} (unresponsiveTimeout) [30000]
   */
  constructor(logOptions, lagProbeInterval=250, unresponsiveTimeout=30000) {
    this.options = Object.assign({
      name: 'service',
      process: 'service',
      level: 'info'
    }, logOptions);
    this.log = bunyan.createLogger(this.options);
    this.lag = require('event-loop-lag')(lagProbeInterval);
    this.unresponsiveTimeout = unresponsiveTimeout;
    gc.on('stats', (stats) => this.logInfo('GC', stats));
  }

  /**
   *
   * @param {Request} request
   */
  logIncomingRequest(request) {
    let context = new Context(request.headers['x-request-id'], null, this.log);

    request.context = context;

    let data = {
      request: {
        method: request.method,
        headers: request.headers,
        params: request.params,
        path: request.path,
        query: request.query,
        state: request.state,
        url: request.raw.req.url,
        time: context.start
      },
      lag: this.lagAsFixedMillis()
    };

    if (request.headers['x-forwarded-for']) {
      data.request.remote = request.headers['x-forwarded-for'];
    }

    let message = request.method + ' ' + request.path;

    context.log.trace(data, message);

    context.timer = setTimeout(function() {
      context.log.error(data, message + ' is unresponsive (' + context.dt() + 'ms)');
    }, this.unresponsiveTimeout);
  }

  /**
   *
   * @param {Request} request
   */
  logOutgoingResponse(request) {
    let response = request.response;
    let context = request.context || new Context(request.headers['x-request-id'], null, this.log);

    if (context.timer) {
      clearTimeout(context.timer);
      delete context.timer;
    }

    var data = {
      request: {
        method: request.method,
        path: request.path,
        query: request.query,
        url: request.raw.req.url,
        time: context.start
      },
      response: {
        time: Date.now()
        // other fields filled in below.
      },
      duration: context.dt(),
      lag: this.lagAsFixedMillis()
    };

    if (request.headers['x-forwarded-for']) {
      data.request.remote = request.headers['x-forwarded-for'];
    }

    if (this.log.level() < 30) {
      data.request.headers = request.headers;
      data.request.params = request.params;
      data.request.state = request.state;
    }

    var message = request.method + ' ' + request.path + ' ';

    // the asymmetric value of response makes me very unhapi :'-(
    if (response.isBoom) {
      response.output.headers['x-request-id'] = context.id;
      data.response.headers = response.output.headers;
      data.response.statusCode = response.output.statusCode;

      data.error = Logger.serializeError(response);

      message += response.output.statusCode + ' (' + context.dt() + 'ms)';

      if (response.isServer) {
        context.log.error(data, message);
      } else {
        if (data.error.stack) {
          delete data.error.stack; // just calm down, ok?
        }
        context.log.warn(data, message);
      }
    } else if (response.source && response.source.success === false) {
      response.headers['x-request-id'] = context.id;
      data.response.headers = response.headers;
      data.response.statusCode = response.statusCode;

      data.error = Logger.serializeError(response.source);

      message += response.statusCode + ' (' + context.dt() + 'ms)';

      context.log.error(data, message);

    } else {
      response.headers['x-request-id'] = context.id;
      data.response.headers = response.headers;
      data.response.statusCode = response.statusCode;
      message += response.statusCode + ' (' + context.dt() + 'ms)';

      context.log.info(data, message);
    }
  }

  /**
   *
   * @param {String} msg
   * @param {Object} data
   */
  logInfo(msg, data) {
    data = data || {};
    if (typeof data === 'string') {
      data = {
        info: data
      };
    }
    this.log.info(data, msg);
  }

  /**
   *
   * @param {String} msg
   * @param {Object} data
   */
  logWarning(msg, data) {
    data = data || {};
    if (typeof data === 'string') {
      data = {
        info: data
      };
    }
    this.log.warn(data, msg);
  }

  /**
   *
   * @param {String} msg
   * @param {Error} err
   */
  logError(msg, err) {
    this.log.error({
      err: Logger.serializeError(err)
    }, msg);
  }

  /**
   *
   * @param {String} msg
   * @param {Object} data
   */
  logTrace(msg, data) {
    data = data || {};
    if (typeof data === 'string') {
      data = {
        info: data
      };
    }
    this.log.trace(data, msg);
  }

  /**
   *
   * @desc Serialize an Error object (Core error properties are enumerable in node 0.4, not in 0.6).
   * @param {Error} err
   * @returns {{
     message: String,
     name: String,
     stack: String,
     code: Number,
     signal: Number,
     data: Object
   }|Error}
   */
  static serializeError(err) {
    if (!err || !err.stack) {
      return err;
    }
    return {
      message: err.message,
      name: err.name,
      stack: Logger.getFullErrorStack(err),
      code: err.code,
      signal: err.signal,
      data: err.data
    };
  }

  /**
   *
   * @param {Error} ex
   * @returns {string}
   */
  static getFullErrorStack(ex) {
    var ret = ex.stack || ex.toString();
    if (ex.cause && typeof ex.cause === 'function') {
      var cex = ex.cause();
      if (cex) {
        ret += '\nCaused by: ' + Logger.getFullErrorStack(cex);
      }
    }
    return (ret);
  }

  /**
   *
   * @private
   * @desc Helper func to get current event loop lag in milliseconds as a fixed integer millisecond measurement
   rather than a fractional floating point Number value (we don't need nanos slush).
   * @returns {*}
   */
  lagAsFixedMillis() {
    return this.lag().toFixed();
  }
}
