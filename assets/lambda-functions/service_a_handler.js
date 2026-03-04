// Import necessary modules from AWS SDK v3
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Create a DynamoDB client
const dynamoDBClient = new DynamoDBClient({});

exports.handler = async (event) => {
    // Handle DELETE request to clear all table records
    if (event.httpMethod === 'DELETE') {
        return await deleteAllRecords();
    }

    // Handle POST request to create a job
    const jobId = event.jobId;
    const status = 'Processed'; // Initial job status
    const createdAt = new Date().toISOString(); // Current timestamp

    // Job item to be saved in DynamoDB
    const jobItem = {
        jobId,
        status,
        createdAt,
    };

    const params = {
        TableName: process.env.JOB_TABLE,
        Item: jobItem,
    };

    try {
        // Insert the job into the DynamoDB table
        const command = new PutCommand(params);
        await dynamoDBClient.send(command);

        // Return the jobId to the client immediately
        const response = {
            statusCode: 200,
            body: JSON.stringify({ jobId }),  // Return jobId to the client
        };

        // Return jobId immediately
        return response;
    } catch (error) {
        console.error('Error processing job:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not process job' }),
        };
    }
};

// Function to delete all records from the table
async function deleteAllRecords() {
    try {
        // Scan the table to get all items
        const scanCommand = new ScanCommand({
            TableName: process.env.JOB_TABLE,
        });
        
        const scanResult = await dynamoDBClient.send(scanCommand);
        const items = scanResult.Items || [];

        if (items.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'No records to delete',
                    deletedCount: 0 
                }),
            };
        }

        // Delete each item
        const deletePromises = items.map(item => {
            const deleteCommand = new DeleteCommand({
                TableName: process.env.JOB_TABLE,
                Key: { jobId: item.jobId },
            });
            return dynamoDBClient.send(deleteCommand);
        });

        await Promise.all(deletePromises);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'All records deleted successfully',
                deletedCount: items.length 
            }),
        };
    } catch (error) {
        console.error('Error deleting records:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Could not delete records',
                details: error.message 
            }),
        };
    }
}
