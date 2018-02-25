'use strict';

const test = require('tap').test;
const sandbox = require('@log4js-node/sandboxed-module');
const util = require('util');
const appender = require('../../lib');

function setupLogging(category, options) {
  const msgs = [];

  const fakeLoggly = {
    createClient: function (opts) {
      this.config = opts;
      return {
        log: function (msg, tags, cb) {
          msgs.push({
            msg: msg,
            tags: tags,
            cb: cb
          });
        }
      };
    }
  };

  const justTheData = evt => util.format.apply(util, evt.data);

  const fakeLayouts = {
    layout: function (type, config) {
      this.type = type;
      this.config = config;
      return justTheData;
    },
    basicLayout: justTheData,
    messagePassThroughLayout: justTheData
  };

  const fakeConsole = {
    errors: [],
    error: function (msg, value) {
      this.errors.push({ msg: msg, value: value });
    }
  };

  const log4js = sandbox.require('log4js', {
    requires: {
      'node-loggly-bulk': fakeLoggly,
      './layouts': fakeLayouts
    },
    globals: {
      console: fakeConsole
    }
  });

  options = options || {};
  // weird path because running coverage messes with require.main.filename in log4js
  options.type = '../../../lib';

  log4js.configure({
    appenders: { loggly: options },
    categories: { default: { appenders: ['loggly'], level: 'trace' } }
  });

  return {
    log4js: log4js,
    logger: log4js.getLogger(category),
    loggly: fakeLoggly,
    layouts: fakeLayouts,
    console: fakeConsole,
    results: msgs
  };
}

function setupTaggedLogging() {
  return setupLogging('loggly', {
    token: 'your-really-long-input-token',
    subdomain: 'your-subdomain',
    tags: ['loggly-tag1', 'loggly-tag2', 'loggly-tagn']
  });
}

test('log4js logglyAppender', (batch) => {
  batch.test('should export configure', (t) => {
    t.type(appender.configure, 'function');
    t.end();
  });

  batch.test('should pass configuration to loggly', (t) => {
    const setup = setupLogging('loggly', { token: 'the-token', subdomain: 'the-subdomain' });
    t.equal(setup.loggly.config.token, 'the-token');
    t.equal(setup.loggly.config.subdomain, 'the-subdomain');
    t.end();
  });

  batch.test('with minimal config', (t) => {
    const setup = setupTaggedLogging();
    setup.logger.log('trace', 'Log event #1', 'Log 2', { tags: ['tag1', 'tag2'] });

    t.equal(setup.results.length, 1, 'has a results.length of 1');
    t.equal(setup.results[0].msg.msg, 'Log event #1 Log 2', 'has a result msg with both args concatenated');
    t.same(setup.results[0].tags, ['tag1', 'tag2'], 'has the correct result tags');
    t.end();
  });

  batch.test('config with object with tags and other keys', (t) => {
    const setup = setupTaggedLogging();
    // ignore this tags object b/c there are 2 keys
    setup.logger.log('trace', 'Log event #1', { other: 'other', tags: ['tag1', 'tag2'] });

    t.equal(setup.results.length, 1, 'has a results.length of 1');
    t.equal(
      setup.results[0].msg.msg,
      'Log event #1 { other: \'other\', tags: [ \'tag1\', \'tag2\' ] }',
      'has a result msg with the args concatenated'
    );
    t.same(setup.results[0].tags, [], 'has a result tags with the arg that contains no tags');
    t.end();
  });

  batch.test('with shutdown callback', (t) => {
    const setup = setupTaggedLogging();
    setup.logger.log('trace', 'Log event #1', 'Log 2', {
      tags: ['tag1', 'tag2']
    });

    setup.log4js.shutdown(() => { t.end(); });

    // shutdown will wait until after the last message has been sent to loggly
    setup.results[0].cb();
  });

  batch.test('shutdown with no pending messages', (t) => {
    const setup = setupTaggedLogging();
    setup.log4js.shutdown(() => t.end());
  });

  batch.test('should pass layouts config to layouts', (t) => {
    const setup = setupLogging('loggly', {
      token: 'abc123',
      subdomain: 'some-domain',
      layout: { type: 'cheese', name: 'gouda' }
    });

    t.equal(setup.layouts.type, 'cheese');
    t.equal(setup.layouts.config.name, 'gouda');
    t.end();
  });

  batch.test('when loggly errors', (t) => {
    const setup = setupTaggedLogging();
    setup.logger.info('this one will not work');
    setup.results[0].cb(new Error('all gone wrong'));

    t.equal(setup.console.errors[0].msg, 'log4js.logglyAppender - error occurred: ');
    t.end();
  });

  batch.end();
});
