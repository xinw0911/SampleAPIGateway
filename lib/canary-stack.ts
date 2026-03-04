import * as cdk from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import path = require('path');

export interface CanaryStackProps extends cdk.StackProps {
  readonly prefix: string;
  readonly serviceBApiUrl: string;
  readonly serviceAApiUrl: string;
}

export class CanaryStack extends cdk.Stack {
  public readonly canaryAlarm: Alarm;

  constructor(scope: Construct, id: string, props: CanaryStackProps) {
    super(scope, id, props);

    // Create a Log Group for Lambda logs
    const fnLogGroup = new LogGroup(this, `${props.prefix}-fn-log-group`, {
      retention: RetentionDays.ONE_WEEK,
    });

    // Lambda function that calls Service B
    const canaryFunction = new Function(this, `${props.prefix}-fn`, {
      runtime: Runtime.NODEJS_20_X,
      handler: 'canary_handler.handler',
      code: Code.fromAsset(path.join(__dirname, '../assets/lambda-functions')),
      environment: {
        SERVICE_B_API_URL: props.serviceBApiUrl,
        SERVICE_A_API_URL: props.serviceAApiUrl,
      },
      logGroup: fnLogGroup,
      timeout: cdk.Duration.seconds(30),
    });

    // EventBridge rule to trigger Lambda every minute
    const rule = new Rule(this, `${props.prefix}-schedule-rule`, {
      schedule: Schedule.rate(cdk.Duration.minutes(1)),
      description: 'Trigger canary Lambda every minute to test Service B',
    });

    rule.addTarget(new LambdaFunction(canaryFunction));

    // CloudWatch Alarm on Lambda errors
    // Triggers when 2 or more invocations fail within 2 minutes
    this.canaryAlarm = new Alarm(this, `${props.prefix}-alarm`, {
      alarmName: `${props.prefix}-service-b-health-alarm`,
      alarmDescription: 'Alarm when Service B canary detects 2 failures',
      metric: canaryFunction.metricErrors({
        period: cdk.Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'CanaryFunctionName', {
      value: canaryFunction.functionName,
      description: 'Canary Lambda Function Name',
      exportName: `${props.prefix}-function-name`,
    });

    new cdk.CfnOutput(this, 'CanaryAlarmName', {
      value: this.canaryAlarm.alarmName,
      description: 'CloudWatch Alarm Name',
      exportName: `${props.prefix}-alarm-name`,
    });

    new cdk.CfnOutput(this, 'CanaryAlarmArn', {
      value: this.canaryAlarm.alarmArn,
      description: 'CloudWatch Alarm ARN',
      exportName: `${props.prefix}-alarm-arn`,
    });
  }
}
