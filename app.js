#!/usr/bin/env node
/**
 * app.js — Hostinger-Native Production Entry Point (Alias for server.js)
 * =======================================================================
 *
 * WHY this file exists at the project root:
 *   Some Hostinger Node.js Web App configurations hardcode "app.js" as the
 *   default startup file in Passenger / Node server config.
 *   To guarantee zero-configuration compatibility regardless of whether Hostinger
 *   is configured to boot "server.js" or "app.js", this file simply proxies
 *   all execution to server.js.
 */

'use strict';
require('./server.js');
