'use strict';
/**
This module loads AWS credentials, and configuration for the server, or possibly
a "local server".
@module Config
*/

const AWS_ENV_KEY = 'AWS_ACCESS_KEY_ID';
const AWS_ENV_SECRET = 'AWS_SECRET_ACCESS_KEY';
const DEFAULT_VERSION = require('./constants').DEFAULT_API_VERSION;

const Q = require('q');
const fs = require('fs');
const path = require('path');

const util = require('./util');
const questions = require(
  `./api/${DEFAULT_VERSION}/project-fs/skeletons/create-interactive-questions`);


const DOT_CLUSTERNATOR_CONFIG =
  path.join(getUserHome(), '.clusternator-config.json');
const  writeFile = Q.nbind(fs.writeFile, fs);
const chmod = Q.nbind(fs.chmod, fs);

const credFileName = 'credentials';
const configFileName = 'config';
const localPath = path.join(__dirname, '..', '.private');
const globalPath = '/etc/clusternator/';

getConfig.saveToken = saveToken;
getConfig.interactiveUser = interactiveUser;
module.exports = getConfig;

/**
 * @todo replace this with `os.homedir()`?
 * https://nodejs.org/api/os.html#os_os_homedir
 * @returns {string}
 */
function getUserHome() {
  return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
}

function validateAwsCreds(c) {
  if (!c) {
    return null;
  }
  if (!c.accessKeyId) {
    return null;
  }
  if (!c.secretAccessKey) {
    return null;
  }
  if (!c.region) {
    return null;
  }
  return c;
}

function loadJSON(fullpath) {
  try {
    return require(fullpath);
  } catch (err) {
    util.winston.debug('Winston Error', err.message);
    return null;
  }
}

function getAwsCredsFromProc() {
  if (process.env[AWS_ENV_KEY] && process.env[AWS_ENV_SECRET]) {
    return {
      accessKeyId: process.env[AWS_ENV_KEY],
      secretAccessKey: process.env[AWS_ENV_SECRET],
    };
  }
  return null;
}

function checkAwsCreds() {
  let fullpath = path.join(localPath, credFileName + '.local.json');
  let c = validateAwsCreds(loadJSON(fullpath));
  if (c) {
    return c;
  }
  util.verbose('No "local" credentials found in ' + fullpath +
    ', checking project');
  fullpath = localPath + credFileName + '.json';
  c = validateAwsCreds(loadJSON(fullpath));
  if (c) {
    return c;
  }
  util.verbose('No "project" credentials found in ' + fullpath +
    ', checking global');
  fullpath = path.join(globalPath, credFileName + '.json');
  c = validateAwsCreds(loadJSON(fullpath));
  if (c) {
    return c;
  }
  util.verbose('No "global" credentials found in ' + fullpath +
    ', checking environment variables');
  return getAwsCredsFromProc();
}

function validateUserConfig(c) {
  if (!c.credentials) {
    return null;
  }
  if (!c.credentials.host) {
    return null;
  }
  if (!c.credentials.user) {
    return null;
  }
  if (!c.credentials.token) {
    c.credentials.token = '';
  }
  if (!c.apiVersion) {
    c.apiVersion = DEFAULT_VERSION;
  }
  return c;
}

function checkUser() {
  try {
    const c = require(DOT_CLUSTERNATOR_CONFIG);
    return validateUserConfig(c);
  } catch (err) {
    return null;
  }
}

function checkConfig() {
  let fullpath = path.join(localPath, configFileName + '.local.json');
  let c = loadJSON(fullpath);
  if (c) {
    return c;
  }
  util.verbose('No "local" config found in ' + fullpath +
    ', checking project');
  fullpath = localPath + configFileName + '.json';
  c = loadJSON(fullpath);
  if (c) {
    return c;
  }
  util.verbose('No "project" config found in ' + fullpath +
    ', checking global');
  fullpath = path.join(globalPath, configFileName + '.json');
  c = loadJSON(fullpath);
  if (c) {
    return c;
  }
  util.verbose('No "global" config found in ' + fullpath);
  return {};
}

/**
 * Synchronously gets a copy of the current configuration object
 * @returns {{}}
 */
function getConfig() {
  const config = checkConfig();

  config.awsCredentials = checkAwsCreds();
  config.user = checkUser();

  return config;
}

/**
 * @param {{ host: string, username: string, token: string, name: string=,
 email: string=, apiVersion: string=, tld: string= }} options
 * @return {Promise<{ host: string, username: string, token: string,
 name: string=, email: string=, apiVersion: string=, tld: string= }> }
 */
function writeUserConfig(options) {
  if (!options) {
    throw new TypeError('User config requires a parameters object');
  }
  if (!options.host || !options.username) {
    throw new TypeError('User config requires a host/user');
  }
  const user = {
    name: options.name || 'Mysterious Stranger',
    email: options.email || '',
    tld: options.tld || 'example.com',
    credentials: {
      user: options.username,
      token: options.token || '',
      host: options.host
    },
    apiVersion: options.apiVersion || DEFAULT_VERSION
  };
  return writeFile(DOT_CLUSTERNATOR_CONFIG, JSON.stringify(user, null, 2))
    .then(() => chmod(DOT_CLUSTERNATOR_CONFIG, '600'))
    .then(() => user);
}

/**
 * Interactively prompts the user for input needed to create a user config
 * @returns {Promise<Object>}
 */
function interactiveUser() {
  let user = getConfig().user;
  if (!user) {
    user = { credentials: {} };
  }
  return util
    .inquirerPrompt(questions.userInit({
      name: user.name || 'Mysterious Stranger',
      email: user.email || '',
      tld: user.tld || '',
      host: user.credentials.host || '',
      username: user.credentials.user || '',
      apiVersion: user.apiVersion || DEFAULT_VERSION
  }))
    .then(writeUserConfig);
}

/**
 * Promises to save the given token to the user's credentials
 * @param {string} token
 * @returns {Promise}
 */
function saveToken(token) {
  let user = checkUser();
  if (!user) {
    return Q.reject(
      new Error('Please run "clusternator config" before trying to login'));
  }
  user.credentials.token = token;
  return writeFile(DOT_CLUSTERNATOR_CONFIG, JSON.stringify(user, null, 2));
}

