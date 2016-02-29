'use strict';
const util = require('./util');
const Q = require('q');
const C = require('./chai');



/*global describe, it, expect, beforeEach */
describe('utility functions', () => {
  it('should have a function that quotes a supplied argument', () => {
    expect(util.quote('booya')).equal('"booya"');
  });

  it('clone should return a copy of an object', () => {
    const testObj = {
        a: 5,
        b: {
          ba: 10
        }
      };
    const copy = util.clone(testObj);
    expect(copy).to.not.equal(testObj);
    expect(copy.b).to.not.equal(testObj.b);
    expect(copy.b.ba).to.equal(testObj.b.ba);
  });

  it('getCidrPrefixFromIPString should return the first two classes of an ' +
    ' ip address', () => {
      expect(util.getCidrPrefixFromIPString('1.2.3.4')).to.equal('1.2');
    });

  it('plog should return the first argument', () => {
    expect(util.plog(2)).to.equal(2);
  });

  it('errLog should return a broken promsie', (done) => {
    const output = 'hahhahah';
    util.errLog(output).then(C.getFail(done), (err) => {
      C.check(done, () => {
        expect(err.message).to.equal(output);
      });
    });
  });

  describe('waitFor tests', () => {
    it('waitFor should resolve if its predicate resolves', (done) => {
      function predicate() {
        return Q.resolve();
      }
      util.waitFor(predicate, 1, 1, 'test').then(() => {
        C.check(done, () => {
          expect(true).to.be;
        });
      }, C.getFail(done));
    });


    it('waitFor should reject if its predicate rejects, *and* max retries ' +
      ' exceeded', (done) => {
        function predicate() {
          return Q.reject(new Error('test'));
        }
        util.waitFor(predicate, 1, 1, 'test').then(C.getFail(done), (err) => {
          C.check(done, () => {
            expect(err instanceof Error).to.be;
          });
        });
      });


    it('waitFor should reseolve if its predicate resolves, *and* max retries ' +
      ' is *not* exceeded', (done) => {
        let count = 0;

        function predicate() {
          count += 1;
          if (count < 5) {
            return Q.reject(new Error('test'));
          } else {
            return Q.resolve();
          }
        }
        util.waitFor(predicate, 1, 6, 'test').then(() => {
          C.check(done, () => {
            expect(true).to.be;
          });
        }, C.getFail(done));
      });
  });

  describe('makePromiseApi tests', () => {
    let api;

    // AWS's is a constructor so our mock should be too
    MockApi.prototype.oneParam = (param, callback) => {
      callback();
    };
    MockApi.prototype.twoParams = (p1, p2, callback) => {
      callback(null, p2);
    };
    MockApi.prototype.errorOut = (param, callback) => {
      callback(new Error('test'));
    };

    beforeEach(() => {
      api = util.makePromiseApi(new MockApi());
    });

    it('should turn oneParam into a promise', (done) => {
      api.oneParam(1).then(() => {
        C.check(done, () => {
          expect(true).to.be;
        });
      }, C.getFail(done));
    });

    it('should turn twoParams into a promise, and resolve the expected param ' +
      '(2)', (done) => {
      api.twoParams(1, 2).then((result) => {
        C.check(done, () => {
          expect(result).to.equal(2);
        });
      }, C.getFail(done));
    });

    it('should reject errorOut', (done) => {
      api.errorOut(1).then(C.getFail(done), (err) => {
        C.check(done, () => {
          expect(err instanceof Error).to.be;
        });
      });
    });

    function MockApi() {

    }
  });

  describe('partial function', () => {
    it('should throw if not given a function', () => {
      expect(() => util.partial()).to.throw(TypeError);
    });

    it('should partially apply single variables', () => {
      const test = util.partial((a, b) => a + b, 5);
      expect(test(5) === 10).to.be.ok;
    });

    it('should partially apply arrays of variables', () => {
      const test = util.partial((a, b) => a + b, [5, 5]);
      expect(test() === 10).to.be.ok;
    });
  });

});