#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ServiceAStack } from './service-a-stack';
import { ServiceBStack } from './service-b-stack';
import { CanaryStack } from './canary-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

// Stack A: Job Service (API Gateway + Lambda + DynamoDB)
const serviceAStack = new ServiceAStack(app, 'ServiceAStack', {
  env,
  stackName: 'service-a-stack',
  prefix: 'service-a',
});

// Stack B: Consumer Service (calls Service A)
const serviceBStack = new ServiceBStack(app, 'ServiceBStack', {
  env,
  stackName: 'service-b-stack',
  prefix: 'service-b',
  serviceAApiUrl: serviceAStack.apiUrl,
});

// Service B depends on Service A
serviceBStack.addDependency(serviceAStack);

// Canary Stack: Monitors Service B health
const canaryStack = new CanaryStack(app, 'CanaryStack', {
  env,
  stackName: 'canary-stack',
  prefix: 'canary',
  serviceBApiUrl: serviceBStack.apiUrl,
  serviceAApiUrl: serviceAStack.apiUrl,
});

// Canary depends on Service B
canaryStack.addDependency(serviceBStack);
