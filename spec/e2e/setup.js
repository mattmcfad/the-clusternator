'use strict';
const TEST_VPC = 'vpc-ab07b4cf';
const TEST_ROUTE = 'rtb-79284a1d';

var path = require('path');

var sourcePath = path.join('..', '..', 'src');

var c = require(path.join(sourcePath, 'config')),
a = require('aws-sdk');

function getEc2() {
  var config = c();
  return new a.EC2(config.credentials);
}

function getEcs() {
  var config = c();
  return new a.ECS(config.credentials);
}

function makePath() {
    var args = Array.prototype.slice.apply(arguments);
    args.unshift(sourcePath);
    return path.join.apply(path, args);
}

module.exports = {
  path: makePath,
  getEc2: getEc2,
  getEcs: getEcs,
  testVPC: TEST_VPC,
  testROUTE: TEST_ROUTE
};
