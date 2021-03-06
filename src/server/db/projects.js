'use strict';
/**
 * Interface to the projects database
 *
 * @module server/db/projects
 */
const ENCRYPTED_PROPS = Object.freeze(['sharedKey', 'gitHubKey']);

const dbCtl = require('./db-controller');
const util = require('../../util');

module.exports.createAccessor = createAccessor;
module.exports.pruneRecord = pruneRecord;

/**
 * @param {function(string, *=)} hashTable
 * @param {string} encryptionKey
 * @returns {accessor}
 */
function createAccessor(hashTable, encryptionKey) {
  return dbCtl.createAccessor(hashTable, pruneRecord, null, encryptionKey,
    ENCRYPTED_PROPS);
}

/**
 * @param {{ id: string, repo: string }} record
 * @returns {{id: string, repo: string, name: (string), sharedKey: (string),
 gitHubKey: (string), channel: string}}
 * @throws {TypeError}
 */
function pruneRecord(record) {
  const invalid = 'projects need at least an id, and repo';
  if (!record) {
    throw new TypeError(invalid);
  }
  if (!record.id || !record.repo) {
    throw new TypeError(invalid);
  }
  return {
    id: record.id,
    repo: record.repo,
    name: record.name || '',
    sharedKey: record.sharedKey || '',
    gitHubKey: record.gitHubKey || '',
    channel: record.channel || record.id
  };
}

