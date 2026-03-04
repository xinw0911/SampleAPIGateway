// Canary Lambda - Calls Service B to monitor health, then cleans up Service A records
const https = require('https');
const http = require('http');

exports.handler = async (event) => {
    const serviceBUrl = process.env.SERVICE_B_API_URL;
    const serviceAUrl = process.env.SERVICE_A_API_URL;
    
    if (!serviceBUrl) {
        console.error('SERVICE_B_API_URL not configured');
        throw new Error('SERVICE_B_API_URL not configured');
    }

    if (!serviceAUrl) {
        console.error('SERVICE_A_API_URL not configured');
        throw new Error('SERVICE_A_API_URL not configured');
    }

    try {
        console.log(`Canary check: Calling Service B at ${serviceBUrl}`);
        
        // Call Service B (which will create a job in Service A)
        const serviceBResponse = await callServiceB(serviceBUrl);
        
        console.log('Canary check: Service B responded successfully', serviceBResponse);
        
        // Clean up records in Service A
        console.log(`Canary cleanup: Deleting all records from Service A at ${serviceAUrl}`);
        const cleanupResponse = await deleteServiceARecords(serviceAUrl);
        
        console.log('Canary cleanup: Service A records deleted', cleanupResponse);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Canary check passed and cleanup completed',
                timestamp: new Date().toISOString(),
                serviceBResponse: serviceBResponse,
                cleanupResponse: cleanupResponse
            }),
        };
    } catch (error) {
        console.error('Canary check failed:', error.message);
        
        // Attempt cleanup even if Service B failed
        try {
            console.log('Attempting cleanup despite failure...');
            await deleteServiceARecords(serviceAUrl);
            console.log('Cleanup completed despite Service B failure');
        } catch (cleanupError) {
            console.error('Cleanup also failed:', cleanupError.message);
        }
        
        // Throw error to trigger Lambda failure metric
        throw new Error(`Service B health check failed: ${error.message}`);
    }
};

// Helper function to call Service B
function callServiceB(apiUrl) {
    return new Promise((resolve, reject) => {
        // Parse the URL
        const url = new URL(apiUrl);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 25000 // 25 second timeout
        };

        const req = protocol.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                // Check if Service B returned an error status
                if (res.statusCode >= 500) {
                    reject(new Error(`Service B returned ${res.statusCode}: ${data}`));
                } else if (res.statusCode >= 400) {
                    console.warn(`Service B returned client error ${res.statusCode}: ${data}`);
                    // Don't fail on 4xx errors, only 5xx
                    resolve({ statusCode: res.statusCode, body: data });
                } else {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (e) {
                        resolve({ statusCode: res.statusCode, body: data });
                    }
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Network error calling Service B: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Service B request timed out'));
        });

        // Send test payload
        req.write(JSON.stringify({ 
            canary: true,
            timestamp: new Date().toISOString() 
        }));
        req.end();
    });
}

// Helper function to delete all records from Service A
function deleteServiceARecords(apiUrl) {
    return new Promise((resolve, reject) => {
        // Parse the URL and append /job endpoint
        const url = new URL(`${apiUrl}job`);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 25000 // 25 second timeout
        };

        const req = protocol.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Service A DELETE returned ${res.statusCode}: ${data}`));
                } else {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (e) {
                        resolve({ statusCode: res.statusCode, body: data });
                    }
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Network error calling Service A DELETE: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Service A DELETE request timed out'));
        });

        req.end();
    });
}
