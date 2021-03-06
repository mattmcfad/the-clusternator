'use strict';
/**
 * Encapsulates functions required to build deployments on AWS
 *
 * @module aws/deploymentManager
 */
const Q = require('q');
const Subnet = require('./subnetManager');
const SG = require('./ec2/security-groups');
const Ec2 = require('./ec2Manager');
const rid = require('./../resource-identifier');
const Cluster = require('./clusterManager');
const Route53 = require('./route53Manager');
const Task = require('./taskServiceManager');
const common = require('./common');
const constants = require('../constants');
const awsConstants = require('./aws-constants');
const path = require('path');
const util = require('../util');
const elbFns = require('./elb/elb');
const R = require('ramda');
const Config = require('../config');

function getDeploymentManager(ec2, ecs, r53, awsElb, vpcId, zoneId) {
  const subnet = Subnet(ec2, vpcId);
  const securityGroup = SG.bindAws({ ec2: util.makePromiseApi(ec2), vpcId });
  const cluster = Cluster(ecs);
  const route53 = Route53(r53, zoneId);
  const ec2mgr = Ec2(ec2, vpcId);
  const task = Task(ecs);
  const elb = R.mapObjIndexed(elbAwsPartial, elbFns);

  function elbAwsPartial(fn) {
    if (typeof fn !== 'function') {
      return () => {};
    }
    return R.partial(fn, { elb: util.makePromiseApi(awsElb) });
  }

  function createEc2(creq) {
    return ec2mgr.createDeployment({
      clusterName: creq.name,
      pid: creq.projectId,
      deployment: creq.deployment,
      sgId: creq.groupId,
      subnetId: creq.subnetId,
      sshPath: creq.sshData || path.join('.private',
        constants.SSH_PUBLIC_PATH),
      apiConfig: {}
    });
  }

  function createElb(creq) {
    return elb.createDeployment(creq.projectId, creq.deployment, creq.subnetId,
      creq.groupId, awsConstants.AWS_SSL_ID, creq.useInternalSSL)();
  }

  function setUrl(creq) {
    return route53
      .createDeploymentCNameRecord(creq.projectId, creq.deployment, creq.dns)
      .then((r53result) => {
        creq.url = r53result;
        return creq;
      });
  }


  /**
   * @param {Object} creq
   * @returns {Promise<{ groupId: string }>}
   */
  function setGroupId(creq) {
    return securityGroup
      .createDeployment(creq.projectId, creq.deployment)()
      .then((groupId) => {
        creq.groupId = groupId;
        return creq;
      });
  }


  /**
   * @param {string} projectId
   * @param {string} deployment
   * @param {Object} appDef
   * @param {*=} sshData
   * @returns {Request|Promise.<T>|*}
   */
  function create(projectId, deployment, appDef, sshData) {
    const creq = {
      projectId,
      deployment,
      appDef,
      sshData,
      name: rid.generateRID({ pid: projectId, deployment })
    };

    return common
      .setSubnet(subnet, creq)
      .then(() => Q
        .all([
          setGroupId(creq),
          cluster.create(creq.name) ])
        .then(() => creq))
      .then(() => common.createElbEc2(createElb, createEc2, creq))
      .then(() => common.createTask(task, creq))
      .then(() => common.registerEc2ToElb(elb, creq))
      .then(setUrl)
      .then((creq) => common.qualifyUrl(Config(), creq.url));

  }

  /**
   * @param {{ elbId: string, instanceIds: Array.<string>, deployment: string, 
   name: string, projectId: string }} creq
   * @returns {Promise.<Promise.<Object>>}
   */
  function updateDestroy(creq) {
    return elb.deRegisterInstances(creq.elbId, creq.instanceIds)()
      .then(() =>
        destroyEc2(creq.projectId, creq.deployment, creq.name)
          .then((r) => task
            .destroy(creq.name)
            .fail((err) => {
              util.info(`PR Problem Destroying Task: ${err.message}`);
              return r;
            }))
          /**
           * @todo we don't have to destroy this cluster, there is a better way,
           * this is a temporary solution.  @rafkhan knows the cluster update
           * story best and also knows its issues at the moment
           */
          .then(() => cluster
            .destroy(creq.name)
            .fail(() => undefined)));
  }

  /**
   * @param {string} projectId
   * @param {string} deployment
   * @param {Object} appDef
   * @param {string[]|string} sshKeys
   * @param {string} elbId
   * @param {string[]} instanceIds
   * @returns {Promise}
   */
  function update(projectId, deployment, appDef, sshKeys, elbId, instanceIds) {
    const creq = {
      appDef,
      elbId,
      sshPath: sshKeys || '',
      instanceIds,
      name: rid.generateRID({ pid: projectId, deployment }),
      deployment,
      projectId
    };

    return updateDestroy(creq)
      .then(() => common
        .setSubnet(subnet, creq)
        .then(() => Q
          .all([
            setGroupId(creq),
            cluster.create(creq.name)
          ])
          .then(() => creq))
        .then(() => createEc2(creq)
          .then((results) => creq.ec2Info = results))
        .then(() => common.createTask(task, creq))
        .then(() => common.registerEc2ToElb(elb, creq))
        .then(() => {
          creq.url = route53.generateDeploymentDomain(projectId, deployment);
          return creq;
        })
        .then((creq) => common.qualifyUrl(Config(), creq.url)));
  }
  
  /**
   * @param {string} projectId
   * @param {string} deployment
   * @param {string} clusterName
   * @returns {Promise.<string[]>}
   */
  function destroyEc2(projectId, deployment, clusterName) {
    if (!clusterName) {
      throw new Error('destroyEc2: requires valid clusterName');
    }
    return cluster
      .listContainers(clusterName)
      .then((result) => Q
        .all(result.map(common.getDeregisterClusterFn(cluster, clusterName)))
        .then(() => ec2mgr
          .destroyDeployment(projectId, deployment)
          .fail((err) => {
            util.info('Deployment Destruction Problem Destroying Ec2: ' +
              err.message);
          })));
  }

  /**
   * @param {string} projectId
   * @param {string} deployment
   * @returns {Request|Promise.<T>}
   */
  function destroyRoutes(projectId, deployment) {
    return elb.describeDeployment(projectId, deployment)()
      .then((result) => route53
        .destroyDeploymentCNameRecord(projectId, deployment, result.dns));
  }

  function destroyElb(projectId, deployment) {
    return elb.destroyDeployment(projectId, deployment)()
      //fail over
      .fail((err) => util.warn(err));
  }

  /**
   * @param {string} projectId
   * @param {string} deployment
   * @returns {Request}
   */
  function destroy(projectId, deployment) {
    const clusterName = rid.generateRID({
      pid: projectId,
      deployment
    });
    return destroyRoutes(projectId, deployment)
      .then(() => destroyEc2(projectId, deployment, clusterName),
        () => destroyEc2(projectId, deployment, clusterName))
      .then(() => destroyElb(projectId, deployment))
      .then((r) => task
        .destroy(clusterName)
        .fail((err) => {
          util.info('Deployment Destruction Problem Destroying Task: ' +
            err.message);
        }))
      .then(() => cluster
        .destroy(clusterName)
        // fail over
        .fail(() => undefined))
      .then(() => securityGroup
        .destroyDeployment(projectId, deployment)()
        // fail over
        .fail(() => undefined));
  }


  return {
    create,
    destroy,
    update
  };
}

module.exports = getDeploymentManager;
