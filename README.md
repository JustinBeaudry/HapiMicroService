HapiMicroService
============

A micro service utility class that encapsulates all the necessary logic 
to quickly setup and run a Hapi 17 Server.

## Installation

Install HapiMicroService as a dependency of your project
```
npm i -S hapi-microservice
```

## Setup

Require HapiMicroService and create a new instance. Give the instance a unique name,
pass in a [Hapi server configuration object](https://hapijs.com/api#server.options), 
a [Bunyan logger configuration object](https://github.com/trentm/node-bunyan#constructor-api),
a [lag probe interval](https://github.com/pebble/event-loop-lag#event-loop-lagnumber) 
that's passed through to the Logger instance,
and a health check path that defaults to '/health'.
```javascript
  // ...
  const MicroService = require('hapi-microservice'); 
  const microService = new MicroService('MyAwesomeServer', {
    server: {
      // hapi 17 server config object
    },
    log: {
      // bunyan logger config 
    },
    routePrefix: '/api', // prefix all routes
    lagProbeInterval: 250 // refresh rate for measuring event loop lag (in ms)
  });
  // ... 
  microService.start();
```

## Adding routes and handling Hapi responses

HapiMicroService provides a method on the base class for adding routes. and standardizing responses and 
response formatting. Refer to the [Hapi route config option docs](https://hapijs.com/api/#route-options) for more information on
object formatting.

Hapi17 doesn't seem to provide a way in the server configuration object to prefix all routes. Because of this 
implementors of HapiMicroService **should always** register routes through MicroServices helper and not directly
to `this.server`.

Due to `addRoutes` being an asynchronous function (`server.register` is also async) we must handle the returned Promise.

```javascript
  // ...
 
  const MicroService = require('hapi-microservice') 
  
  const microService = new MicroService('MyAwesomeServer', {
    server: {
      app: {
        port: 3000
      }
    },
    routePrefix: '/api'
  });
  
  async function init() {
    const routes = [{
      method: 'GET',
      path: '/path/to/resource',
      // note that there is no reply() function in Hapi17, you either use `responseToolkit` or return a value
      handler: async (request, responseToolkit) => {
        let result;
        try {
          result = await myAwesomePromiseReturningService();
        } catch(err) {
          MicroService.replyHandler(err, null, responseToolkit);
          return;
        }
        MicroService.replyHandler(null, result, responseToolkit);
      } 
    }];
    await microService.addRoutes(routes);
  }
  
  // NOTE:  that all promises must be handled in Node
  init()
    .catch(err => {
      // handle err
    });
  // ...
```
