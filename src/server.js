'use strict';

const Hapi = require('hapi');
const Logger = require('./logger');

/**
 *
 * @desc creates and returns a Hapi 17.x.x Server
 * @param {Object} userServerConfig - a hapi server configuration object
 * @param {Logger} (logger) [Logger] - a bunyan logger instance
 * @returns {Server}
 */
module.exports = function createHapiServer(userServerConfig, logger) {
  const log = logger || new Logger();
  const serverConfig = Object.assign({
    router: {
      stripTrailingSlash: true
    },
    routes: {
      cors: {
        headers: [
          'Authorization',
          'Content-Type',
          'If-None-Match',
        ],
        origin: [
          '*'
        ],
        credentials: true
      }
    },
    debug: false
  }, userServerConfig);
  const server = new Hapi.server(serverConfig);

  server.events.on('request', request => {
    log.logIncomingRequest(request);
  });

  server.events.on('response', request => {
    log.logOutgoingResponse(request);
  });

  return server;
};

