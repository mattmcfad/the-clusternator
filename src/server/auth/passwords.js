'use strict';

/*global require, module*/

var passwords = Object.create(null),
    hash = require('./crypto-hash'),
    Q = require('q');

/**
 * @param {string} id
 * @returns {Q.Promise}
 */
function find(id) {
    var d = Q.defer();
    if (passwords[id]) {
        d.resolve(passwords[id]);
    } else {
        d.reject(new Error('not found'));
    }
    return d.promise;
}

/**
 * @param {string} id
 * @param {string} newPass
 * @returns {Q.Promise}
 */
function createPassword(id, newPass) {
    return find(id).then(() => {
        // invalid case
        throw new Error('password exists');
    }, () => {
        // expected case
        return hash.saltHash(newPass).then((shash) => {
            passwords[id] = {
                saltedHash: shash
            };
        });
    });
}

function changePassword_(id, shash) {
    var d = Q.defer();
    passwords[id].saltedHash = shash;
    d.resolve();
    return d.promise;
}

/**
 * @param {string} id
 * @param {string} oldPass
 * @param {string} newPass
 * @returns {Q.Promise}
 */
function changePassword(id, oldPass, newPass) {
    // change passwords
    return verify(id, oldPass).then(() => {
        return hash.saltHash(newPass).then((shash) => {
            return changePassword_(id, shash);
        });
    });
}

/**
 * @param {string} id
 * @param {string} password
 * @returns {Q.Promise}
 */
function verify(id, password) {
    return find(id).then((row) => {
        return hash.verify(row.saltedHash, password);
    });
}

module.exports = {
    find,
    create: createPassword,
    change: changePassword,
    verify
};

