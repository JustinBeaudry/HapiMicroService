'use strict'

const path = require('path');
const Boom = require('boom');
const crypto = require('crypto');
const createServer = require('./server');
const Logger = require('./logger');
const pkg = require('../package.json');
const Context = require('./context');

const _routePrefix = Symbol('route_prefix');
const _port = Symbol('port');

/**
 *
 * @member {String} name
 * @member {Object} config
 * @member {Logger} log
 * @member {Object} utils
 * @member {Hapi.Server} server
 */
module.exports = class MicroService {
  /**
   *
   * @param {String} name
   * @param {{
   *   server: Object,
   *   routePrefix: String,
   *   log: {
   *     name: String,
   *     process: String,
   *     level: String
   *   },
   *   lagProbeInterval: Number,
   *   unresponsiveTimeout: Number,
   *   healthCheckPath: String
   * }} config
   */
  constructor(name, {
    server,
    routePrefix,
    log,
    lagProbeInterval,
    unresponsiveTimeout,
    healthCheckPath='/health'
  }) {
    log = Object.assign({
      name: name,
      process: name
    }, log);
    this.name = name;
    this.server = createServer(server, this.log);
    this.log = new Logger(log, lagProbeInterval, unresponsiveTimeout);
    this[_routePrefix] = routePrefix;
    this[_port] = server.app.port;
    this.Boom = Boom;
    // register a health check route
    this._healthCheckRoute = {
      method: 'GET',
      path: healthCheckPath,
      handler: async () => {
        return {
          statusCode: 200,
          healthy: true
        };
      }
    };
  }

  /**
   *
   * @desc registers a "master" plugin to prefix all routes and adds routes to that plugin
   * @param {Array<Object>} routes
   * @returns {Promise}
   */
  addRoutes(routes) {
    let prefix = this[_routePrefix];
    // make sure prefix has a leading slash
    if (!(/^\/.+/.test(prefix))) {
      prefix = `/${prefix}`;
    }
    // add the health check route to the list
    routes = routes.concat(this._healthCheckRoute);
    return this.server.register({
      name: this.name,
      version: pkg.version,
      register: function(server) {
        routes.forEach(route => {
          server.route(route);
        });
      }
    }, {
      routes: {
        prefix: prefix
      }
    });
  }

  /**
   * @desc shortcut for calling this.server.start()
   */
  async start() {
    try {
      await this.server.start();
    } catch(err) {
      this.log.logError(`${this.name} failed to start`);
      throw err;
    }
    this.log.logInfo(`${this.name} Server Started`, {
      port: this[_port],
      prefix: this[_routePrefix]
    });
    this.server.log('info', `${this.name} Server Started`);
  }

  /**
   * @desc shortcut for calling this.server.stop()
   */
  async stop() {
    this.server.stop();
  }

  /**
   *
   * @param {Object|null} err
   * @param {Object} data
   * @param {Function|Object} responseToolkit
   * @param {Object} (cacheControl)
   * @returns {*}
   */
  static replyHandler(err, data, responseToolkit, cacheControl) {
    let contentType = 'application/json';
    if (err) {
      let statusCode = 404; // we hide the real status behind a 404, except when upstream just failed
      let code = err.code || err.statusCode;

      if (code) {
        if (code >= 400 && code < 500) {
          statusCode = code;
        }
        // return a 503 Not Available for any status code in the 500-600 block
        else if (code >= 500 && code < 600) {
          statusCode = 503;
        }
      }
      let boomErr = new Boom(err, {
        statusCode: statusCode
      });
      // pass along any headers if exists
      if (err.headers) {
        boomErr.output.headers = Object.assign(boomErr.output.headers || {}, err.headers);
      }
      return boomErr;
    }
    else if (!data) {
      return Boom.notFound();
    }
    else {
      let results = methodOutput(data, responseType);
      let response = responseToolkit.response(results.data);
      response.type(contentType);
      if (cacheControl) {
        response.header('cache-control', cacheControl);
      }
      if (results.hash) {
        response.etag(results.hash);
      }
      return response;
    }
  }

  /**
   * @description Handles redirects while forwarding any necessary headers
   * @param {String} redirectUrl
   * @param {Object} context
   * @param {Function|Object} responseToolkit
   * @returns {Response | *}
   */
  static redirectHandler(redirectUrl, context, responseToolkit) {
    if (context && context.headers && context.headers['set-cookie']) {
      return responseToolkit
        .redirect(redirectUrl)
        .header('set-cookie', context.headers['set-cookie'])
    } else {
      return responseToolkit.redirect(redirectUrl);
    }
  }

  /**
   *
   * @param {Http.Request|Object} request
   * @returns {Object}
   */
  static handleContext(request={}) {
    return {
      'x-request-id': request.headers['x-request-id'] || Context().id
    }
  }
}

/**
 *
 * @param result
 * @returns {{data: {string}, hash: {string}}}
 */
const methodOutput = exports.methodOutput = function methodOutput(result) {
  let hash;
  let data;

  try {
    data = JSON.stringify(result);
  } catch(err) {
    throw err;
  }

  try {
    // TODO: more checks to see if data can be packaged into a hash
    if (typeof data === 'string') {
      hash = crypto.createHash('md5').update(data).digest('hex');
    }
  } catch(err) {
    throw err;
  }

  return {
    data: result,
    hash: hash
  };
};