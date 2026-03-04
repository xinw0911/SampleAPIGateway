import * as cdk from 'aws-cdk-lib';
import { AccessLogFormat, AwsIntegration, LambdaIntegration, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path = require('path');

export interface ServiceAStackProps extends cdk.StackProps {
  readonly prefix: string;
}

export class ServiceAStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly apiId: string;
  public readonly jobTable: Table;

  constructor(scope: Construct, id: string, props: ServiceAStackProps) {
    super(scope, id, props);

    // DynamoDB table for job status
    this.jobTable = new Table(this, `${props.prefix}-table`, {
      partitionKey: { name: 'jobId', type: AttributeType.STRING },
      tableName: `${props.prefix}-job-table`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create a Log Group for Lambda logs
    const fnLogGroup = new LogGroup(this, `${props.prefix}-fn-log-group`, {
      retention: RetentionDays.ONE_WEEK,
    });

    // Create Lambda function
    const jobHandler = new Function(this, `${props.prefix}-fn`, {
      runtime: Runtime.NODEJS_20_X,
      handler: 'service_a_handler.handler',
      code: Code.fromAsset(path.join(__dirname, '../assets/lambda-functions')),
      environment: {
        JOB_TABLE: this.jobTable.tableName,
      },
      logGroup: fnLogGroup,
    });

    // Grant Lambda permission to write to DynamoDB
    this.jobTable.grantWriteData(jobHandler);
    // Grant Lambda permission to read and delete from DynamoDB (for DELETE operation)
    this.jobTable.grantReadData(jobHandler);
    this.jobTable.grantWriteData(jobHandler);

    // Create a Log Group for API Gateway logs
    const apiLogGroup = new LogGroup(this, `${props.prefix}-apigw-log-group`, {
      retention: RetentionDays.ONE_WEEK,
    });

    // API Gateway: Create a REST API with Lambda integration
    const api = new LambdaRestApi(this, `${props.prefix}-apigw`, {
      restApiName: `${props.prefix}-job-service`,
      handler: jobHandler,
      proxy: false,
      cloudWatchRole: true,
      deployOptions: {
        metricsEnabled: true,
        dataTraceEnabled: true,
        accessLogDestination: new LogGroupLogDestination(apiLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.ERROR,
      }
    });

    // POST /job method
    const job = api.root.addResource('job');

    job.addMethod("POST",
      new LambdaIntegration(jobHandler, {
        proxy: false,
        requestParameters: {
          'integration.request.header.X-Amz-Invocation-Type': "'Event'",
        },
        requestTemplates: {
          'application/json': `{
            "jobId": "$context.requestId",
            "body": $input.json('$')
          }`,
        },
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': `{"jobId": "$context.requestId"}`
            }
          },
          {
            statusCode: '500',
            responseTemplates: {
              'application/json': `{
                "error": "An error occurred while processing the request.",
                "details": "$context.integrationErrorMessage"
              }`
            }
          }
        ]
      }),
      {
        methodResponses: [
          { statusCode: '200' },
          { statusCode: '500' }
        ]
      }
    );

    // DELETE /job method (delete all records)
    job.addMethod("DELETE",
      new LambdaIntegration(jobHandler, {
        proxy: false,
        requestTemplates: {
          'application/json': `{
            "httpMethod": "DELETE"
          }`,
        },
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': `$input.json('$.body')`
            }
          },
          {
            statusCode: '500',
            responseTemplates: {
              'application/json': `{
                "error": "An error occurred while deleting records.",
                "details": "$context.integrationErrorMessage"
              }`
            }
          }
        ]
      }),
      {
        methodResponses: [
          { statusCode: '200' },
          { statusCode: '500' }
        ]
      }
    );

    // GET /job/{jobId} method (DynamoDB integration)
    const jobId = job.addResource('{jobId}');
    jobId.addMethod("GET",
      new AwsIntegration({
        service: 'dynamodb',
        action: 'GetItem',
        options: {
          credentialsRole: new Role(this, 'ApiGatewayDynamoRole', {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
            inlinePolicies: {
              dynamoPolicy: new PolicyDocument({
                statements: [
                  new PolicyStatement({
                    actions: ['dynamodb:GetItem'],
                    resources: [this.jobTable.tableArn],
                  }),
                ],
              })
            }
          }),
          requestTemplates: {
            'application/json': `{
              "TableName": "${this.jobTable.tableName}",
              "Key": {
                "jobId": {
                  "S": "$input.params('jobId')"
                }
              }
            }`,
          },
          integrationResponses: [
            {
              statusCode: '200',
              responseTemplates: {
                'application/json': `{
                  "jobId": "$input.path('$.Item.jobId.S')",
                  "status": "$input.path('$.Item.status.S')",
                  "createdAt": "$input.path('$.Item.createdAt.S')"
                }`
              }
            },
            {
              statusCode: '404',
              selectionPattern: '.*"Item":null.*',
              responseTemplates: {
                'application/json': '{"error": "Job not found"}'
              }
            }
          ]
        }
      }),
      {
        methodResponses: [
          { statusCode: '200' },
          { statusCode: '404' }
        ]
      }
    );

    // Export API URL and ID for cross-stack reference
    this.apiUrl = api.url;
    this.apiId = api.restApiId;

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'ServiceAApiUrl', {
      value: this.apiUrl,
      description: 'Service A API Gateway URL',
      exportName: `${props.prefix}-api-url`,
    });

    new cdk.CfnOutput(this, 'ServiceAApiId', {
      value: this.apiId,
      description: 'Service A API Gateway ID',
      exportName: `${props.prefix}-api-id`,
    });

    new cdk.CfnOutput(this, 'JobTableName', {
      value: this.jobTable.tableName,
      description: 'DynamoDB Job Table Name',
      exportName: `${props.prefix}-table-name`,
    });
  }
}
