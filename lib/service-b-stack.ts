import * as cdk from 'aws-cdk-lib';
import { LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel, AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path = require('path');
import { ServiceAEndpoints } from './models/service-a-models';

export interface ServiceBStackProps extends cdk.StackProps {
  readonly prefix: string;
  readonly serviceAApiUrl: string;
}

export class ServiceBStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ServiceBStackProps) {
    super(scope, id, props);

    // Create a Log Group for Lambda logs
    const fnLogGroup = new LogGroup(this, `${props.prefix}-fn-log-group`, {
      retention: RetentionDays.ONE_WEEK,
    });

    // Lambda function that calls Service A
    const serviceBHandler = new Function(this, `${props.prefix}-fn`, {
      runtime: Runtime.NODEJS_20_X,
      handler: 'service_b_handler.handler',
      code: Code.fromAsset(path.join(__dirname, '../assets/lambda-functions')),
      environment: {
        SERVICE_A_API_URL: props.serviceAApiUrl,
        SERVICE_A_JOB_ENDPOINT: ServiceAEndpoints.CREATE_JOB,
      },
      logGroup: fnLogGroup,
    });

    // Create a Log Group for API Gateway logs
    const apiLogGroup = new LogGroup(this, `${props.prefix}-apigw-log-group`, {
      retention: RetentionDays.ONE_WEEK,
    });

    // API Gateway for Service B
    const api = new LambdaRestApi(this, `${props.prefix}-apigw`, {
      restApiName: `${props.prefix}-service`,
      handler: serviceBHandler,
      proxy: true,
      cloudWatchRole: true,
      deployOptions: {
        metricsEnabled: true,
        dataTraceEnabled: true,
        accessLogDestination: new LogGroupLogDestination(apiLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.ERROR,
      }
    });

    // Export API URL
    this.apiUrl = api.url;

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'ServiceBApiUrl', {
      value: this.apiUrl,
      description: 'Service B API Gateway URL',
      exportName: `${props.prefix}-api-url`,
    });
  }
}
