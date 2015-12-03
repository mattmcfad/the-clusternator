'use strict';

const TEST_VPC = 'vpc-ab07b4cf';
const TEST_ZONE = '/hostedzone/Z1K98SX385PNRP';
const LOGIN_PATH = '/login';

var R = require('ramda');
var q = require('q');
var express = require('express');
var bodyParser = require('body-parser-rawbody');
var aws = require('aws-sdk');
var path = require('path');

var getPRManager = require('../aws/prManager');
var getDynamoDBManager = require('../aws/dynamoManager');

var prHandler = require('./pullRequest');
var pushHandler = require('./push');
var loggers = require('./loggers');
var log = loggers.logger;

var waitFor = require('../util').waitFor;

var githubAuthMiddleware = require('./auth/githubHook');

var nodePath = require('path');
var compression = require('compression');
var authentication = require('./auth/authentication');
var authorization = require('./auth/authorization');
var ensureAuth = require('connect-ensure-login').ensureLoggedIn;
var users = require('./auth/users');
var util = require('../util');
var clusternatorApi = require('./clusternator-api');


var GITHUB_AUTH_TOKEN_TABLE = 'github_tokens';

function createServer(prManager) {
  var app = express();

  /**
   *  @todo the authentication package could work with a "mount", or another
   *  mechanism that is better encapsulated
   */
  authentication.init(app);

  app.use(compression());
  app.use(express['static'](
    nodePath.normalize(__dirname + nodePath.sep + '..' + nodePath.sep + 'www'))
  );
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  /**
   * @todo the clusternator package could work  with a "mount", or another
   * mechanism that is better encapsulated
   */
  clusternatorApi.init(app);

  function ping(req, res) {
    res.send('Still alive.');
  }

  // TODO: SSL, auth

  var curriedPushHandler = R.curry(pushHandler)(prManager);
  var curriedPRHandler = R.curry(prHandler)(prManager);

  app.use(loggers.request);

  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');

  app.get('/', [
    ensureAuth(LOGIN_PATH),
    exposeUser,
    (req, res) => {
      res.render('index');
    }]);
  app.get('/logout', [
      authentication.endpoints.logout
    ]
  );
  app.get('/login', (req, res) => {
    res.render('login', { error: false });
  });
  app.post('/login', authentication.endpoints.login);

  app.get('/passwd', [
    ensureAuth(LOGIN_PATH),
    exposeUser,
    (req, res) => {
      res.render('passwd', { error: false });
    }
  ]);

  app.get('/users/:id/tokens', [
    ensureAuth(LOGIN_PATH),
    exposeUser,
    users.endpoints.getTokens
  ]);

  app.post('/users/:id/tokens', [
    ensureAuth(LOGIN_PATH),
    exposeUser,
    users.endpoints.createToken
  ]);

  app.post('/users/:id/password', [
    ensureAuth(LOGIN_PATH),
    users.endpoints.password
  ]);
  app.put('/users/:id/password', [
    ensureAuth(LOGIN_PATH),
    users.endpoints.password
  ]);

  app.get('/users/:id', [
    ensureAuth(LOGIN_PATH),
    users.endpoints.get
  ]);

  app.get('/ping', ping);
  app.post('/clusternate',
    [
      ensureAuth(LOGIN_PATH),
      curriedPushHandler
    ]); // CI post-build hook

  app.post('/github/pr', [
    //githubAuthMiddleware,
    curriedPRHandler
  ]);     // github close PR hook

  app.use(loggers.error);

  return app;
}

function getAwsResources(config) {
  var creds = config.awsCredentials;

  var ec2 = new aws.EC2(creds);
  var ecs = new aws.ECS(creds);
  var r53 = new aws.Route53(creds);
  var ddb = new aws.DynamoDB(creds);

  return {
    ec2: ec2,
    ecs: ecs,
    r53: r53,
    ddb: ddb
  };
}

// XXX
// This function is here to force the PR manager to load asynchronously,
// such that we can query for a VPC ID before starting (as opposed to
// using a hardcoded one right now).
//
function loadPRManagerAsync(ec2, ecs, r53) {
  var prm = getPRManager(ec2, ecs, r53, TEST_VPC, TEST_ZONE);
  return q.resolve(prm);
}

function createAndPollTable(ddbManager, tableName) {
  log.info('Creating DynamoDB table: %s', tableName);
  return ddbManager.createTable(tableName)
    .then(() => {
      log.info('Waiting for DynamoDB table: %s', tableName);

      return waitFor(() => {
        log.info('Polling...');
        return ddbManager.checkActiveTable(tableName);
      }, 500, 100, 'ddb table create ' + tableName)
    }, q.reject);
}

function initializeDynamoTable(ddbManager, tableName) {
  log.info('Looking for DynamoDB table: %s', tableName);

  return ddbManager.checkTableExistence(tableName)
    .then((exists) => {
      if(exists) {
        log.info('DynamoDB table %s was found',
          tableName);

        return q.resolve();
      } else {
        log.info('DynamoDB table %s was not found',
          tableName);

        return createAndPollTable(ddbManager, tableName);
      }
    }, q.reject)

    .then(() => {
      log.info('Table "' + tableName + '" is active');
    }, q.reject);
}

function exposeUser(req, res, next) {
  if (!req.user) {
    res.locals.username = null;
  }
  res.locals.username = req.user.id;
  next();
}

function getServer(config) {
  var a = getAwsResources(config);

  var ddbManager = getDynamoDBManager(a.ddb);
  var initDynamoTable = R.curry(initializeDynamoTable)(ddbManager);

  return initDynamoTable(GITHUB_AUTH_TOKEN_TABLE)
    .then(() => {
      return loadPRManagerAsync(a.ec2, a.ecs, a.r53)
    }, q.reject)
    .then(createServer, q.reject);
}

function startServer(config) {
  return getServer(config)
    .then((server) => {
      server.listen(config.port);
      util.info('Clusternator listening on port', config.port)
    }, (err) => {
      log.error(err, err.stack);
    });
}

module.exports = {
  getServer: getServer,
  startServer: startServer
};
