// Service B Lambda - Calls Service A to create jobs
const https = require('https');
const http = require('http');

exports.handler = async (event) => {
    const serviceAUrl = process.env.SERVICE_A_API_URL;
    
    if (!serviceAUrl) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'SERVICE_A_API_URL not configured' }),
        };
    }

    try {
        // Parse the request body
        const requestBody = event.body ? JSON.parse(event.body) : {};
        
        // Call Service A to create a job
        const jobId = await createJobInServiceA(serviceAUrl, requestBody);
        
        // Return response
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Service B successfully called Service A',
                jobId: jobId,
                serviceAUrl: serviceAUrl
            }),
        };
    } catch (error) {
        console.error('Error calling Service A:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Failed to call Service A',
                details: error.message 
            }),
        };
    }
};

// Helper function to call Service A
function createJobInServiceA(apiUrl, payload) {
    return new Promise((resolve, reject) => {
        // Parse the URL
        const url = new URL(`${apiUrl}job`);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Amz-Invocation-Type': 'Event'
            }
        };

        const req = protocol.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const response = JSON.parse(data);
                        resolve(response.jobId);
                    } catch (e) {
                        reject(new Error('Failed to parse Service A response'));
                    }
                } else {
                    reject(new Error(`Service A returned status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(payload));
        req.end();
    });
}
