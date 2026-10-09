'use strict';

const { EventEmitter } = require('events');

/**
 * Process-wide domain bus for decoupling services from side-effect work.
 * Emitters must not rely on AsyncLocalStorage reaching listeners — pass
 * organizationId (and any other context) on the payload.
 */
const appEvents = new EventEmitter();
appEvents.setMaxListeners(30);

module.exports = appEvents;
