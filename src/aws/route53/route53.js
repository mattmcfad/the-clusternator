'use strict';
/**
 * Provides a simple interface to AWS's Route53 DNS API
 *
 * @module aws/route53Manager
 */

const R = require('ramda');
const util = require('../../util');
const rid = require('../../resource-identifier');
const skeletons = require('./route53Skeletons');
const constants = require('../../constants');
const awsConstants = require('../aws-constants');

module.exports = {
  list,
  createPRARecord,
  createPRCNameRecord,
  createDeploymentARecord,
  createDeploymentCNameRecord,
  createZone,
  destroyPRARecord,
  destroyPRCNameRecord,
  destroyDeploymentARecord,
  destroyDeploymentCNameRecord,
  findId,
  generatePRDomain: rid.generatePRSubdomain,
  generateDeploymentDomain,
  helpers: {
    createRecordParams,
    createChange,
    createChangeBatch,
    createResourceRecord,
    createResourceRecordSet,
    findTld,
    validateResourceRecordSetType,
    pluckHostedZoneName,
    pluckId,
    findFirstTag
  }
};


/**
 * @param {Route53Wrapper} route53
 * @returns {function(): Promise}
 */
function list(route53) {
  return route53.listHostedZones({}).then((result) => {
    return result.HostedZones;
  });
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param {string} pid
 * @param {string} pr
 * @param {string} ip
 * @param {Object=} config Route53 config object (optional)
 * @returns {function(): Promise}
 */
function createPRARecord(route53, zoneId, pid, pr, ip, config) {
  return findTld(route53, zoneId).then((tld) => {
    const domainName = rid.generatePRSubdomain(pid, pr);
    return route53
      .changeResourceRecordSets(
        createRecordParams(zoneId, domainName, ip, tld, 'A', config))
      .then(() => domainName);
  });
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param {string} pid
 * @param {string} pr
 * @param {string} url
 * @param {Object=} config object (optional)
 * @returns {function(): Promise}
 */
function createPRCNameRecord(route53, zoneId, pid, pr, url, config) {
  return findTld(route53, zoneId).then((tld) => {
    const domainName = rid.generatePRSubdomain(pid, pr);
    return route53
      .changeResourceRecordSets(
        createRecordParams(zoneId, domainName, url, tld, 'CNAME', config))
      .then(() => domainName);
  });
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param {string} pid
 * @param {string} deployment
 * @param {string} ip
 * @param {Object=} config Route53 config object (optional)
 * @returns {function(): Promise}
 */
function createDeploymentARecord(route53, zoneId, pid, deployment, ip, config) {
  return findTld(route53, zoneId)
    .then((tld) => {
    const domainName = generateDeploymentDomain(pid, deployment);
    return route53
      .changeResourceRecordSets(
        createRecordParams(zoneId, domainName, ip, tld, 'A', config))
      .then(() => domainName);
  });
}


/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param {string} pid
 * @param {string} deployment
 * @param {string} url
 * @param {Object=} config object (optional)
 * @returns {function(): Promise}
 */
function createDeploymentCNameRecord(route53, zoneId, pid, deployment, url, config) {
  return findTld(route53, zoneId)
    .then((tld) => {
      const domainName = generateDeploymentDomain(pid, deployment);
      return route53
        .changeResourceRecordSets(
          createRecordParams(zoneId, domainName, url, tld, 'CNAME', config))
        .then(() => domainName);
    });
}


function createZone(route53, callerReference, name) {
  return route53.createHostedZone({
    CallerReference: callerReference,
    Name: name
  }).then(pluckHostedZoneName);
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param {string} pid
 * @param {string} pr
 * @param {string} ip
 * @param {Object=} config Route53 config object (optional)
 * @returns {function(): Promise}
 */
function destroyPRARecord(route53, zoneId, pid, pr, ip, config) {
  return findTld(route53, zoneId).then((tld) => {
    const domainName = rid.generatePRSubdomain(pid, pr);
    return route53.changeResourceRecordSets(
      destroyRecordParams(zoneId, domainName, ip, tld, 'A', config)
    );
  });
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param {string} pid
 * @param {string} pr
 * @param {string} url
 * @param {Object=} config Route53 config object (optional)
 * @returns {function(): Promise}
 */
function destroyPRCNameRecord(route53, zoneId, pid, pr, url, config) {
  return findTld(route53, zoneId).then((tld) => {
    const domainName = rid.generatePRSubdomain(pid, pr);
    return route53.changeResourceRecordSets(
      destroyRecordParams(zoneId, domainName, url, tld, 'CNAME', config)
    );
  });
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param pid
 * @param deployment
 * @param ip
 * @param config
 * @returns {function(): Promise}
 */
function destroyDeploymentARecord(route53, zoneId, pid, deployment, ip, config) {
  return findTld(route53, zoneId).then((tld) => {
    const domainName = generateDeploymentDomain(pid, deployment);
    return route53.changeResourceRecordSets(
      destroyRecordParams(zoneId, domainName, ip, tld, 'A', config)
    );
  });
}

/**
 * @param {Route53Wrapper} route53
 * @param {string} zoneId
 * @param pid
 * @param deployment
 * @param url
 * @param config
 * @returns {function(): Promise}
 */
function destroyDeploymentCNameRecord(route53, zoneId, pid, deployment, url, config) {
  return findTld(route53, zoneId).then((tld) => {
    const domainName = generateDeploymentDomain(pid, deployment);
    return route53.changeResourceRecordSets(
      destroyRecordParams(zoneId, domainName, url, tld, 'CNAME', config)
    );
  });
}

/**
 * @returns {Promise<string>}
 */
function findId() {
  return list().then((l) => {
    if (!l.length) {
      throw new Error('Route53: No Hosted Zones Found');
    }
    return listTags(l).then((tagSet) => {
      const  id = findFirstTag(tagSet);
      if (id) {
        return awsConstants.AWS_R53_ZONE_PREFIX + id;
      }
      throw new Error('Route53: No Clusternator Resources Found');
    });
  });
}

/**
 * @param {string} pid
 * @param {string} deployment
 * @returns {string}
 */
function generateDeploymentDomain(pid, deployment) {
  if (deployment === 'master') {
    return pid;
  }
  return pid + '-' + deployment;
}

/**
 * @param {{ HostedZone: { Name: string } }} getHostedZoneResult
 * @returns {string}
 */
function pluckHostedZoneName(getHostedZoneResult) {
  return getHostedZoneResult.HostedZone.Name;
}

/**
 * @returns Promise<string> promise to find the TLD for the hosted zone
 */
function findTld(route53, zoneId) {
  return route53.getHostedZone({
    Id: zoneId
  }).then(pluckHostedZoneName);
}

/**
 * @param {string} action
 * @returns {{ Action: string }}
 */
function createChange(action) {
  const actionIndex = skeletons.CHANGE_ACTIONS.indexOf(action);
  let change;
  if (actionIndex === -1) {
    throw new TypeError('route53: invalid change action: ' + action +
      ' MUST be one of ' + skeletons.CHANGE_ACTIONS.join(', '));
  }
  change = util.clone(skeletons.CHANGE);
  change.Action = action;
  return change;
}

/**
 * @param {string=} comment
 * @returns {{ Comment: string }}
 */
function createChangeBatch(comment) {
  const changeBatch = util.clone(skeletons.CHANGE_BATCH);
  if (comment) {
    changeBatch.Comment = comment;
  }
  return changeBatch;
}

/**
 * @param {string} value
 * @returns {{ Value: string }}
 */
function createResourceRecord(value) {
  if (!value) {
    throw new TypeError('route53: createResourceRecord expecting value ' +
      'parameter');
  }
  const resourceRecord = util.clone(skeletons.RESOURCE_RECORD);
  resourceRecord.Value = value;
  return resourceRecord;
}

/**
 * @param {*} type
 * @returns {string} (from resourceRecrodSetTypes)
 */
function validateResourceRecordSetType(type) {
  let typeIndex = skeletons.RECORD_TYPES.indexOf(type);
  typeIndex = typeIndex === -1 ? 1 : typeIndex;

  return skeletons.RECORD_TYPES[typeIndex];
}

/**
 * @param {string} name
 * @param {string} type
 * @param {string} resourceValue
 * @returns {ResourceRecordSet}
 */
function createResourceRecordSet(name, type, resourceValue) {
  type = validateResourceRecordSetType(type);
  if (!name) {
    throw new TypeError('route53: createResourceRecordSet expecting ' +
      '"name" parameter');
  }
  const resourceRecordSet = util.clone(skeletons.RESOURCE_RECORD_SET);
  resourceRecordSet.Name = name;
  resourceRecordSet.Type = type;
  resourceRecordSet.ResourceRecords.push(
    createResourceRecord(resourceValue)
  );
  return resourceRecordSet;
}

/**
 * @param {string} verb
 * @param {string} zoneId
 * @param {string} domainName
 * @param {string} ip
 * @param {string} tld
 * @param {string} type
 * @param {Object=} config
 * @returns {Object} params
 */
function changeRecordParams(verb, zoneId, domainName, ip, tld, type, config) {
  config = config || {};
  const changeBatch = createChangeBatch();
  const change = createChange(verb);
  const params = {
      ChangeBatch: changeBatch,
      HostedZoneId: zoneId
    };
  changeBatch.Changes.push(change);

  params.ChangeBatch.Changes[0].ResourceRecordSet =
    createResourceRecordSet(domainName + '.' + tld, type, ip);

  return R.merge(params, config);
}

/**
 * @param {string} zoneId
 * @param {string} domainName
 * @param {string} ip
 * @param {string} tld
 * @param {string} type
 * @param {Object=} config
 */
function createRecordParams(zoneId, domainName, ip, tld, type, config) {
  return changeRecordParams('CREATE', zoneId, domainName, ip, tld, type, config);
}

/**
 * @param {string} zoneId
 * @param {string} domainName
 * @param {string} ip
 * @param {string} tld
 * @param {string} type
 * @param {Object=} config
 */
function destroyRecordParams(zoneId, domainName, ip, tld, type, config) {
  return changeRecordParams('DELETE', zoneId, domainName, ip, tld, type, config);
}

/**
 * @param {{ Id: string }} resource
 * @returns {string}
 */
function pluckId(resource) {
  const splits = resource.Id.split('/');
  return splits[splits.length - 1];
}

/**
 * @param {Array.<{ Tags: { Key: string, Value: string },
  ResourceId: string }>} tagSet
 * @returns {string}
 */
function findFirstTag(tagSet) {
  let id = null;
  tagSet.forEach((r) => {
    r.Tags.forEach((t) => {
      if (t.Key === constants.CLUSTERNATOR_TAG) {
        id = r.ResourceId;
      }
    });
  });
  return id;
}

/**
 * @param {HostedZone[]} l
 * @returns {function(): Promise}
 */
function listTags(l) {
  return route53.listTagsForResources({
    ResourceType: 'hostedzone',
    ResourceIds: l.map(pluckId)
  }).then(function(tagSet) {
    return tagSet.ResourceTagSets;
  });
}