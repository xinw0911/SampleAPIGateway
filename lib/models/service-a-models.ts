/**
 * Service A API Models
 * 
 * These models define the contract between Service A and its consumers (like Service B).
 * Any changes to these models may require updates to dependent services.
 * 
 * BREAKING CHANGE: Renamed jobId to id, changed endpoint from /job to /task,
 * and updated status values.
 */

export interface JobRequest {
  data?: string;
  metadata?: Record<string, any>;
}

export interface JobResponse {
  id: string;
}

export interface JobStatus {
  id: string;
  status: 'Completed' | 'Error' | 'InProgress';
  createdAt: string;
  updatedAt: string;
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
  CREATE_JOB: '/task',
  GET_JOB: '/task/{id}',
  DELETE_ALL: '/task',
} as const;

/**
 * HTTP Methods
 */
export const ServiceAMethods = {
  POST: 'POST',
  GET: 'GET',
  DELETE: 'DELETE',
} as const;
