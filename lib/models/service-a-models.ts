/**
 * Service A API Models
 * 
 * These models define the contract between Service A and its consumers (like Service B).
 * Any changes to these models may require updates to dependent services.
 */

export interface JobRequest {
  data?: string;
  metadata?: Record<string, any>;
}

export interface JobResponse {
  jobId: string;
}

export interface JobStatus {
  jobId: string;
  status: 'Processed' | 'Failed' | 'Pending';
  createdAt: string;
}

export interface DeleteResponse {
  message: string;
  deletedCount: number;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

/**
 * Service A API Endpoints
 */
export const ServiceAEndpoints = {
  CREATE_JOB: '/job',
  GET_JOB: '/job/{jobId}',
  DELETE_ALL: '/job',
} as const;

/**
 * HTTP Methods
 */
export const ServiceAMethods = {
  POST: 'POST',
  GET: 'GET',
  DELETE: 'DELETE',
} as const;
