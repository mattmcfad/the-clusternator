'use strict';

/*global describe, it, expect */
/*eslint no-unused-expressions:0*/
describe('Passwords interface', function () {
  // for this.timeout to work this describe block CANNOT use an arrow
  this.timeout(10000);
  var C = require('../../chai'),
    passwords = require('../../../../src/server/auth/passwords'),
    testId = 'blah', testPass1 = 'secret',
    testPass2 = 'secret1';

  it('find should retrieved created passwords, that have a "saltedHash"',
    (done) => {
      passwords.create(testId, testPass1).then(() => {
        return passwords.find(testId).then((testId) => {
          C.check(done, () => {
            expect(testId.saltedHash).to.be.ok;
            expect(testId.saltedHash).to.not.equal(testPass1);
          });
        });
      }).fail(C.getFail(done));
    });

  it('change passwords should resolve if given a valid password, and a ' +
    'new password', (done) => {
    passwords.change(testId, testPass1, testPass2).then(() => {
      return passwords.verify(testId, testPass2).then(() => {
        C.check(done, () => {
          expect(true).to.be.ok;
        });
      });
    }, C.getFail(done));
  });

  it('change passwords should reject if given an invalid password', (done) => {
    passwords.change(testId, testPass1, testPass2).then(C.getFail(done),
      (err) => {
        C.check(done, () => {
          expect(err instanceof Error).to.be.ok;
        });
      }).fail(C.getFail(done));
  });

});
