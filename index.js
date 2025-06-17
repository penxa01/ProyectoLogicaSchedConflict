// =============================================================================
// Node.js Server with IBM Cloud Object Storage Integration - CORREGIDO
// =============================================================================

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const AWS = require('aws-sdk'); // Para IBM COS (compatible con S3)

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// IBM Cloud Object Storage Configuration
// =============================================================================

const COS_CONFIG = {
    endpoint: 'https://s3.us-south.cloud-object-storage.appdomain.cloud',
    apiKeyId: 'C3g5p6YQe8rCH9xztTduzstOPz1CVT64fox7Gi5j7xLi',
    ibmAuthEndpoint: 'https://iam.cloud.ibm.com/identity/token',
    serviceInstanceId: 'crn:v1:bluemix:public:cloud-object-storage:global:a/d3c266a491d4414c9e4af3ad57209e3f:397f0b00-814e-41b7-9119-1103b8ab1ea2::',
    bucketName: 'cloud-object-storage-cos-proyfinal-2f2',
    hmacKeys: {
        accessKeyId: 'c4e04be35cbe4cbcb94f1965f63211b4',
        secretAccessKey: '3dbe16aa69c31b75d4caac521be303aa2d75a6188b8e38e4'
    }
};

// =============================================================================
// IBM Watson Configuration - ACTUALIZADO CON TU JOB EXISTENTE Y GROUP ID
// =============================================================================

const IBM_CONFIG = {
    apiKey: '7m47Gixb23qgvhj8qOAeO4cYYBP-_0zfSUX-hvfjHmCE',
    jobId: 'af8c7532-a4cb-46a9-abda-97a19b4b5b9b', // Tu Job ID existente
    spaceId: 'b6b35acd-fc65-4966-be66-98499d334c4c', // Tu Space ID
    // Endpoint para ejecutar job existente
    jobRunEndpoint: 'https://api.dataplatform.cloud.ibm.com/v2/jobs/af8c7532-a4cb-46a9-abda-97a19b4b5b9b/runs?space_id=dd18eb10-08af-4997-afd8-e23ea057ff93',
    // Endpoint para consultar status del run
    jobStatusEndpoint: 'https://api.dataplatform.cloud.ibm.com/v2/jobs/af8c7532-a4cb-46a9-abda-97a19b4b5b9b/runs',
    // Endpoint para obtener token (actualizado)
    iamUrl: 'https://iam.cloud.ibm.com/identity/token',
    // Grant type correcto para IBM
    grantType: 'urn:ibm:params:oauth:grant-type:apikey'
};

// =============================================================================
// ARCHIVOS SIMPLIFICADOS - NOMBRES LIMPIOS
// =============================================================================

const FILE_MAPPING = {
    input: {
        parameters: 'parameters.csv',
        tasks: 'Tasks.csv', 
        resources: 'TupleCapacity.csv',
        demands: 'TaskResourceDemand.csv',
        precedences: 'Precedences.csv'
    },
    output: {
        stats: 'stats.csv',
        resourceUsage: 'ResourceUsageResults.csv',
        taskSchedule: 'TaskScheduleOutput.csv',
        resourceTimeline: 'ResourceTimelineOutput.csv',
        solutionResults: 'SolutionResults.csv',
        skip: 'skip.csv',
        taskResourceUsage: 'TaskResourceUsageOutput.csv'
    }
};

// =============================================================================
// Configure IBM COS Client
// =============================================================================

const cosClient = new AWS.S3({
    endpoint: COS_CONFIG.endpoint,
    accessKeyId: COS_CONFIG.hmacKeys.accessKeyId,
    secretAccessKey: COS_CONFIG.hmacKeys.secretAccessKey,
    signatureVersion: 'v4',
    region: 'us-south'
});

// =============================================================================
// Middleware Configuration
// =============================================================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// =============================================================================
// IBM COS Helper Functions
// =============================================================================

async function uploadToIBMCOS(fileName, fileContent, contentType = 'text/csv') {
    try {
        console.log(`📤 Uploading ${fileName} to IBM COS...`);
        
        const params = {
            Bucket: COS_CONFIG.bucketName,
            Key: fileName, // Nombre limpio, sin prefijos
            Body: fileContent,
            ContentType: contentType,
            Metadata: {
                'uploaded-by': 'optimization-app',
                'upload-time': new Date().toISOString()
            }
        };

        const result = await cosClient.upload(params).promise();
        console.log(`✅ File uploaded successfully to: ${result.Location}`);
        
        return {
            success: true,
            location: result.Location,
            key: fileName,
            etag: result.ETag
        };
    } catch (error) {
        console.error(`❌ Error uploading ${fileName} to COS:`, error);
        throw new Error(`Failed to upload to COS: ${error.message}`);
    }
}

async function downloadFromIBMCOS(fileName) {
    try {
        console.log(`📥 Downloading ${fileName} from IBM COS...`);
        
        const params = {
            Bucket: COS_CONFIG.bucketName,
            Key: fileName
        };

        const result = await cosClient.getObject(params).promise();
        console.log(`✅ File downloaded successfully from COS`);
        
        return result.Body.toString('utf-8');
    } catch (error) {
        console.error(`❌ Error downloading ${fileName} from COS:`, error);
        throw new Error(`Failed to download from COS: ${error.message}`);
    }
}

async function listCOSFiles(prefix = '') {
    try {
        const params = {
            Bucket: COS_CONFIG.bucketName,
            Prefix: prefix
        };

        const result = await cosClient.listObjectsV2(params).promise();
        return result.Contents || [];
    } catch (error) {
        console.error('❌ Error listing COS files:', error);
        return [];
    }
}

// =============================================================================
// CSV Generation Functions
// =============================================================================

function generateCSVFromJSON(data, headers) {
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.join(','));
    
    // Add data rows
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // Handle values that might contain commas or quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value || '';
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}

function generateOptimizationCSVs(data) {
    console.log('🔄 Generating optimization CSVs with correct format...');
    
    const csvFiles = {};
    
    // Generate parameters CSV
    if (data.parameters && data.parameters.length > 0) {
        csvFiles.parameters = {
            filename: FILE_MAPPING.input.parameters,
            content: generateCSVFromJSON(data.parameters, ['Parameter', 'Value']),
            type: 'parameters'
        };
    }
    
    // Generate tasks CSV
    if (data.tasks && data.tasks.length > 0) {
        csvFiles.tasks = {
            filename: FILE_MAPPING.input.tasks,
            content: generateCSVFromJSON(data.tasks, ['id', 'pt', 'smin', 'emax']),
            type: 'Tasks'
        };
    }
    
    // Generate resources CSV (TupleCapacity format)
    if (data.resources && data.resources.length > 0) {
        csvFiles.resources = {
            filename: FILE_MAPPING.input.resources,
            content: generateCSVFromJSON(data.resources, ['IDresource', 'capacity']),
            type: 'TupleCapacity'
        };
    }
    
    // Generate demands CSV (TaskResourceDemand format)
    if (data.demands && data.demands.length > 0) {
        csvFiles.demands = {
            filename: FILE_MAPPING.input.demands,
            content: generateCSVFromJSON(data.demands, ['taskId', 'resourceId', 'demand']),
            type: 'TaskResourceDemand'
        };
    }
    
    // Generate precedences CSV
    if (data.precedences && data.precedences.length > 0) {
        csvFiles.precedences = {
            filename: FILE_MAPPING.input.precedences,
            content: generateCSVFromJSON(data.precedences, ['beforeId', 'afterId']),
            type: 'Precedences'
        };
    }
    
    console.log('✅ Generated CSV files:', Object.keys(csvFiles));
    return csvFiles;
}

// =============================================================================
// IBM Watson ML Helper Functions - CORREGIDAS PARA EJECUTAR JOB EXISTENTE
// =============================================================================

async function getAccessToken() {
    try {
        console.log('🔑 Getting access token from IBM...');
        console.log('🆔 Group ID:', IBM_CONFIG.groupId);
        
        // Intentar múltiples configuraciones hasta encontrar la correcta
        const authConfigs = [
            {
                url: 'https://iam.cloud.ibm.com/identity/token',
                grantType: 'urn:ibm:params:oauth:grant-type:apikey'
            },
            {
                url: 'https://iam.cloud.ibm.com/v1/token', 
                grantType: 'urn:ibm:params:oauth:grant-type:apikey'
            },
            {
                url: 'https://iam.cloud.ibm.com/identity/token',
                grantType: 'urn:iam:grant-type:apikey'
            }
        ];

        for (let i = 0; i < authConfigs.length; i++) {
            const config = authConfigs[i];
            console.log(`🔄 Trying config ${i + 1}: ${config.url} with ${config.grantType}`);
            
            try {
                // Crear form data exactamente como en PHP
                const formData = new URLSearchParams();
                formData.append('grant_type', config.grantType);
                formData.append('apikey', IBM_CONFIG.apiKey);

                const response = await axios.post(config.url, formData, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json'
                    },
                    timeout: 30000 // 30 segundos timeout
                });

                console.log('✅ Access token obtained successfully with config', i + 1);
                console.log('🔑 Token expires in:', response.data.expires_in, 'seconds');
                console.log('🎯 Token type:', response.data.token_type);
                
                return response.data.access_token;
                
            } catch (error) {
                console.log(`❌ Config ${i + 1} failed:`, error.response?.status, error.response?.data?.errorMessage || error.message);
                
                if (i === authConfigs.length - 1) {
                    // Es el último intento, lanzar el error
                    throw error;
                }
                // Continuar con la siguiente configuración
            }
        }
        
    } catch (error) {
        console.error('❌ Error getting access token (all configs failed):', error.response?.data || error.message);
        console.error('🔍 Final error details:', {
            url: error.config?.url,
            apiKey: IBM_CONFIG.apiKey ? `${IBM_CONFIG.apiKey.substring(0, 10)}...` : 'Missing',
            groupId: IBM_CONFIG.groupId,
            status: error.response?.status,
            statusText: error.response?.statusText,
            errorCode: error.response?.data?.errorCode,
            errorMessage: error.response?.data?.errorMessage,
            errorDetails: error.response?.data?.errorDetails
        });
        throw new Error(`Failed to get access token: ${error.response?.data?.errorMessage || error.message}`);
    }
}

// FUNCIÓN CORREGIDA: Ejecutar job existente con manejo de permisos mejorado
async function executeExistingJob() {
    try {
        console.log('🚀 Executing existing Watson ML job...');
        console.log('🆔 Job ID:', IBM_CONFIG.jobId);
        console.log('🌐 Space ID:', IBM_CONFIG.spaceId);
        
        const accessToken = await getAccessToken();
        
        // Verificar permisos del space primero
        try {
            await verifySpaceAccess(accessToken);
        } catch (permError) {
            if (permError.message.includes('not authorized')) {
                console.error('🚫 CRITICAL: ServiceId not authorized for space');
                console.error('🔧 REQUIRED ACTION: Add ServiceId as collaborator in Watson Studio');
                console.error('   📍 Go to: https://dataplatform.cloud.ibm.com/projects/' + IBM_CONFIG.spaceId);
                console.error('   🔹 Navigate: Manage → Access control → Add collaborators');
                console.error('   🔹 Role: Editor or Admin');
                throw permError;
            }
        }
        
        // Payload mínimo - no incluir parámetros que puedan causar problemas de permisos
        const payload = {};

        console.log('📤 Sending job execution request...');
        console.log('🔗 Endpoint:', IBM_CONFIG.jobRunEndpoint);

        // Enviar POST para ejecutar el job existente
        const response = await axios.post(IBM_CONFIG.jobRunEndpoint, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'X-Watson-User-Agent': 'optimization-app/1.0'
            },
            timeout: 60000
        });

        console.log('✅ Job execution started successfully');
        console.log('📊 Response data:', response.data);
        
        return response.data;
        
    } catch (error) {
        console.error('❌ Error executing job:', error.response?.data || error.message);
        console.error('📊 Response status:', error.response?.status);
        
        // Manejo específico de errores de permisos
        if (error.response?.status === 403) {
            const errorDetails = error.response?.data;
            console.error('🚫 PERMISSION ERROR DETAILS:');
            console.error('   Code:', errorDetails?.code);
            console.error('   Reason:', errorDetails?.reason);
            console.error('   Message:', errorDetails?.message);
            
            // Extraer ServiceId del error si está disponible
            const serviceIdMatch = errorDetails?.reason?.match(/ServiceId-[a-f0-9\-]+/);
            const serviceId = serviceIdMatch ? serviceIdMatch[0] : 'Unknown';
            
            console.error('🆔 ServiceId:', serviceId);
            console.error('🌐 Space ID:', IBM_CONFIG.spaceId);
            
            throw new Error(`PERMISSION DENIED: ServiceId '${serviceId}' not authorized for space '${IBM_CONFIG.spaceId}'. Please add the ServiceId as a collaborator with Editor role in Watson Studio.`);
        }
        
        throw new Error(`Job execution failed: ${error.response?.status || 'Unknown'} - ${error.response?.data?.message || error.response?.data?.error || error.message}`);
    }
}

// FUNCIÓN AUXILIAR: Verificar acceso al space
async function verifySpaceAccess(accessToken) {
    try {
        console.log('🔍 Verifying space access...');
        
        const spaceInfoUrl = `https://api.dataplatform.cloud.ibm.com/v2/spaces/${IBM_CONFIG.spaceId}`;
        
        const response = await axios.get(spaceInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            },
            timeout: 30000
        });
        
        console.log('✅ Space access verified successfully');
        console.log('📋 Space info:', {
            id: response.data.metadata?.id,
            name: response.data.entity?.name,
            status: response.data.entity?.status?.state
        });
        
        return true;
        
    } catch (error) {
        if (error.response?.status === 403) {
            throw new Error('ServiceId not authorized for space');
        }
        console.warn('⚠️ Could not verify space access, but continuing...');
        return false;
    }
}

// FUNCIÓN AUXILIAR: Extraer ServiceId del error
function extractServiceIdFromError(error) {
    try {
        const errorMessage = error.response?.data?.reason || error.response?.data?.message || '';
        const serviceIdMatch = errorMessage.match(/ServiceId-[a-f0-9\-]+/);
        return serviceIdMatch ? serviceIdMatch[0] : 'Not found in error message';
    } catch (e) {
        return 'Could not extract ServiceId';
    }
}

// FUNCIÓN ALTERNATIVA: Ejecutar usando endpoint directo de Watson ML
async function executeJobWithWatsonML() {
    try {
        console.log('🎯 Attempting execution via Watson ML endpoint...');
        
        const accessToken = await getAccessToken();
        
        // Usar el endpoint de Watson ML en lugar del de DataPlatform
        const watsonMLEndpoint = `https://us-south.ml.cloud.ibm.com/ml/v4/jobs/${IBM_CONFIG.jobId}/runs?version=2020-08-01`;
        
        const payload = {
            space_id: IBM_CONFIG.spaceId,
            job_id: IBM_CONFIG.jobId
        };
        
        console.log('📤 Sending Watson ML job execution request...');
        console.log('🔗 Endpoint:', watsonMLEndpoint);
        
        const response = await axios.post(watsonMLEndpoint, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            },
            timeout: 60000
        });
        
        console.log('✅ Watson ML job execution started successfully');
        return response.data;
        
    } catch (error) {
        console.error('❌ Watson ML execution failed:', error.response?.data || error.message);
        throw error;
    }
}

// FUNCIÓN AUXILIAR: Intentar múltiples métodos de ejecución
async function executeJobWithFallbacks() {
    const methods = [
        { name: 'DataPlatform API', func: executeExistingJob },
        { name: 'Watson ML API', func: executeJobWithWatsonML }
    ];
    
    let lastError = null;
    
    for (const method of methods) {
        try {
            console.log(`🔄 Trying method: ${method.name}`);
            const result = await method.func();
            console.log(`✅ Success with method: ${method.name}`);
            return result;
        } catch (error) {
            console.log(`❌ Method ${method.name} failed:`, error.message);
            lastError = error;
            
            // Si es un error 403, no intentar otros métodos
            if (error.response?.status === 403) {
                throw error;
            }
        }
    }
    
    // Si todos los métodos fallan, lanzar el último error
    throw lastError;
}

// FUNCIÓN MODIFICADA: Polling del estado del job run usando runtime_job_id
async function pollJobResults(jobRunResponse, maxAttempts = 30, intervalMs = 10000) {
    try {
        console.log('\n🔄 STARTING JOB POLLING');
        console.log('=' .repeat(50));
        
        // Extraer información del job run response con mejor logging
        console.log('📋 Raw job run response:', JSON.stringify(jobRunResponse, null, 2));
        
        const runtimeJobId = jobRunResponse.runtimeJobId || 
                           jobRunResponse.entity?.job_run?.runtime_job_id ||
                           jobRunResponse.entity?.runtime_job_id;
        
        const runId = jobRunResponse.metadata?.id || 
                     jobRunResponse.id ||
                     runtimeJobId;
        
        const statusUrl = jobRunResponse.statusUrl || 
                         jobRunResponse.href || 
                         jobRunResponse.metadata?.href ||
                         jobRunResponse.entity?.href;
        
        console.log(`📋 Extracted identifiers:`);
        console.log(`   Runtime Job ID: ${runtimeJobId || 'N/A'}`);
        console.log(`   Run ID: ${runId || 'N/A'}`);
        console.log(`   Status URL: ${statusUrl || 'N/A'}`);
        
        if (!runId && !statusUrl) {
            throw new Error('No valid run ID or status URL found in job response');
        }
        
        const accessToken = await getAccessToken();
        
        // Construir URL de polling
        let apiUrl;
        if (statusUrl) {
            apiUrl = statusUrl;
            console.log('🔗 Using provided status URL');
        } else {
            apiUrl = `https://api.dataplatform.cloud.ibm.com/v2/jobs/${IBM_CONFIG.jobId}/runs/${runId}?space_id=${IBM_CONFIG.spaceId}`;
            console.log('🔗 Constructed status URL');
        }
        
        console.log(`📡 Polling URL: ${apiUrl}`);
        console.log('=' .repeat(50) + '\n');

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`📡 Polling attempt ${attempt}/${maxAttempts} - ${new Date().toLocaleTimeString()}`);
            
            try {
                const response = await axios.get(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                const runData = response.data;
                
                // Mejor extracción del estado con múltiples fallbacks
                const currentState = runData.entity?.job_run?.state || 
                                   runData.entity?.status?.state || 
                                   runData.entity?.state ||
                                   runData.state ||
                                   runData.status?.state ||
                                   'unknown';
                
                console.log(`   📊 Current state: "${currentState}"`);
                console.log(`   📊 Response status: ${response.status}`);
                
                // Log más detalles para debugging
                if (runData.entity?.job_run) {
                    console.log(`   📊 Job run details:`, {
                        runtime_job_id: runData.entity.job_run.runtime_job_id,
                        state: runData.entity.job_run.state,
                        created_at: runData.entity.job_run.created_at,
                        completed_at: runData.entity.job_run.completed_at
                    });
                }
                
                // Estados de éxito - más opciones
                const successStates = ['completed', 'success', 'finished', 'succeeded'];
                if (successStates.includes(currentState.toLowerCase())) {
                    console.log('✅ Job run completed successfully!');
                    console.log('📥 Starting results download...\n');
                    
                    // Descargar archivos de resultados desde COS
                    const results = await downloadOptimizationResults();
                    console.log('✅ Results downloaded and processed successfully');
                    return results;
                }
                
                // Estados de fallo
                const failureStates = ['failed', 'error', 'failure'];
                if (failureStates.includes(currentState.toLowerCase())) {
                    console.error('❌ Job run failed!');
                    console.error('   Status details:', runData.entity?.job_run?.status || runData.entity?.status);
                    
                    const errorMessage = runData.entity?.job_run?.status?.message || 
                                       runData.entity?.status?.message || 
                                       'Unknown error occurred';
                    
                    throw new Error(`Job run failed: ${errorMessage}`);
                }
                
                // Estados de cancelación
                const canceledStates = ['canceled', 'cancelled', 'aborted'];
                if (canceledStates.includes(currentState.toLowerCase())) {
                    throw new Error('Job run was canceled');
                }
                
                // Estados en progreso
                const runningStates = ['running', 'pending', 'queued', 'starting', 'initializing', 'in_progress'];
                if (runningStates.includes(currentState.toLowerCase())) {
                    console.log(`   ⏳ Job still ${currentState}, continuing to wait...`);
                } else {
                    console.log(`   🔄 Unknown state "${currentState}", continuing to poll...`);
                }

                // Esperar antes del siguiente intento
                if (attempt < maxAttempts) {
                    console.log(`   ⏰ Waiting ${intervalMs/1000} seconds before next check...\n`);
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                } else {
                    console.log('   ⚠️ Max attempts reached\n');
                }
                
            } catch (error) {
                if (error.response?.status === 404) {
                    console.log(`   ⚠️ Run not found yet (attempt ${attempt}), job might still be starting...`);
                } else if (error.response?.status === 401) {
                    console.error('   ❌ Authentication failed, refreshing token...');
                    // Refresh token for next attempt
                    accessToken = await getAccessToken();
                } else {
                    console.log(`   ⚠️ Polling error (attempt ${attempt}):`, error.response?.status, error.message);
                }
                
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                } else {
                    throw error;
                }
            }
        }

        throw new Error(`Job timeout - maximum attempts (${maxAttempts}) reached after ${(maxAttempts * intervalMs) / 60000} minutes`);
        
    } catch (error) {
        console.error('\n❌ ERROR IN JOB POLLING:');
        console.error('=' .repeat(50));
        console.error('Error message:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        console.error('=' .repeat(50) + '\n');
        
        throw new Error(`Failed to poll job results: ${error.message}`);
    }
}

// =============================================================================
// FUNCIONES PARA MANEJAR RESULTADOS DESDE COS
// =============================================================================

async function downloadOptimizationResults() {
    try {
        console.log('📥 Downloading optimization results from COS...');
        
        const results = {
            solutionSummary: [],
            taskSchedule: [],
            resourceUsage: [],
            resourceTimeline: [],
            stats: [],
            taskResourceUsage: []
        };
        
        // Lista de archivos de salida a buscar
        const outputFiles = [
            { key: 'solutionSummary', filename: FILE_MAPPING.output.solutionResults },
            { key: 'taskSchedule', filename: FILE_MAPPING.output.taskSchedule },
            { key: 'resourceUsage', filename: FILE_MAPPING.output.resourceUsage },
            { key: 'resourceTimeline', filename: FILE_MAPPING.output.resourceTimeline },
            { key: 'stats', filename: FILE_MAPPING.output.stats },
            { key: 'taskResourceUsage', filename: FILE_MAPPING.output.taskResourceUsage }
        ];

        // También buscar en carpeta output/ por si el job guarda ahí
        const outputPrefixes = ['', 'output/', 'results/'];
        
        for (const file of outputFiles) {
            let found = false;
            
            for (const prefix of outputPrefixes) {
                try {
                    const fullPath = prefix + file.filename;
                    console.log(`🔍 Trying to download: ${fullPath}`);
                    
                    const fileData = await downloadFromIBMCOS(fullPath);
                    results[file.key] = parseCSVContent(fileData);
                    console.log(`✅ ${file.key} downloaded successfully from ${fullPath}`);
                    found = true;
                    break;
                } catch (error) {
                    console.log(`⚠️ ${fullPath} not found, trying next location...`);
                }
            }
            
            if (!found) {
                console.log(`⚠️ ${file.key} not found in any location, using default`);
                results[file.key] = [];
            }
        }
        
        // Si no encontramos resultados, generar datos de ejemplo
        if (results.solutionSummary.length === 0) {
            console.log('📊 No solution results found, generating default summary...');
            results.solutionSummary = [{ 
                Makespan: 0, 
                TotalTasks: 0, 
                TotalResources: 0, 
                Status: 'NO_RESULTS_FOUND' 
            }];
        }
        
        console.log('✅ All optimization results processed');
        console.log('📊 Results summary:', {
            solutionSummary: results.solutionSummary.length,
            taskSchedule: results.taskSchedule.length,
            resourceUsage: results.resourceUsage.length,
            resourceTimeline: results.resourceTimeline.length,
            stats: results.stats.length,
            taskResourceUsage: results.taskResourceUsage.length
        });
        
        return results;
        
    } catch (error) {
        console.error('❌ Error downloading optimization results:', error);
        throw new Error('Failed to download optimization results: ' + error.message);
    }
}

function parseCSVContent(csvContent) {
    try {
        const lines = csvContent.trim().split('\n');
        if (lines.length <= 1) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
                let value = values[index] ? values[index].trim() : '';
                // Try to parse as number if possible
                if (!isNaN(value) && value !== '') {
                    value = parseFloat(value);
                }
                row[header] = value;
            });
            data.push(row);
        }
        
        return data;
    } catch (error) {
        console.error('Error parsing CSV content:', error);
        return [];
    }
}

// =============================================================================
// CSV Parser Helper
// =============================================================================

function parseCSVData(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = require('stream');
        const csvStream = new stream.Readable();
        csvStream.push(buffer);
        csvStream.push(null);

        csvStream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// =============================================================================
// Routes
// =============================================================================

// Serve the main HTML file
app.get('/', (req, res) => {
    console.log('🏠 Serving main page');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        server: 'IBM Watson ML Job Executor with COS - FIXED VERSION',
        version: '5.0.0',
        jobId: IBM_CONFIG.jobId,
        spaceId: IBM_CONFIG.spaceId,
        groupId: IBM_CONFIG.groupId,
        jobRunEndpoint: IBM_CONFIG.jobRunEndpoint,
        iamEndpoints: [
            'https://iam.cloud.ibm.com/identity/token',
            'https://iam.cloud.ibm.com/v1/token'
        ],
        features: [
            'Permission verification',
            'Fallback execution methods',
            'Enhanced error handling',
            'ServiceId extraction'
        ]
    });
});

// Nueva ruta para verificar permisos antes de ejecutar
app.get('/verify-permissions', async (req, res) => {
    try {
        console.log('🔍 Verifying space permissions...');
        
        const accessToken = await getAccessToken();
        console.log('✅ Access token obtained successfully');
        
        try {
            await verifySpaceAccess(accessToken);
            console.log('✅ Space access verified successfully');
            
            res.json({
                success: true,
                hasAccess: true,
                spaceId: IBM_CONFIG.spaceId,
                jobId: IBM_CONFIG.jobId,
                message: 'ServiceId has proper permissions for the space',
                status: 'AUTHORIZED'
            });
            
        } catch (permError) {
            console.error('❌ Space access verification failed:', permError.message);
            
            res.status(403).json({
                success: false,
                hasAccess: false,
                spaceId: IBM_CONFIG.spaceId,
                jobId: IBM_CONFIG.jobId,
                error: permError.message,
                status: 'UNAUTHORIZED',
                solution: {
                    description: 'ServiceId needs to be added as a collaborator',
                    steps: [
                        '1. Go to Watson Studio/Cloud Pak for Data',
                        '2. Navigate to your project/space',
                        '3. Go to Manage → Access control',
                        '4. Click "Add collaborators"',
                        '5. Add the ServiceId with Editor or Admin role'
                    ],
                    projectUrl: `https://dataplatform.cloud.ibm.com/projects/${IBM_CONFIG.spaceId}`
                }
            });
        }
        
    } catch (tokenError) {
        console.error('❌ Token verification failed:', tokenError.message);
        
        res.status(401).json({
            success: false,
            hasAccess: false,
            error: 'Failed to obtain access token',
            details: tokenError.message,
            status: 'TOKEN_ERROR',
            solution: 'Check your API key configuration'
        });
    }
});

// Upload CSV files to IBM COS - NOMBRES SIMPLIFICADOS
app.post('/upload-csv', upload.single('file'), async (req, res) => {
    console.log('📁 CSV Upload request received');
    
    try {
        if (!req.file) {
            console.log('❌ No file in request');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('📄 File received:', req.file.originalname, 'Size:', req.file.size);
        
        // Parse CSV data
        const data = await parseCSVData(req.file.buffer);
        console.log('✅ CSV parsed successfully, rows:', data.length);
        
        // Map to correct filename format - NOMBRES LIMPIOS
        let fileName = req.file.originalname;
        
        if (fileName.includes('parameter') || fileName.toLowerCase().includes('param')) {
            fileName = FILE_MAPPING.input.parameters; // parameters.csv
        } else if (fileName.includes('task') && !fileName.includes('demand')) {
            fileName = FILE_MAPPING.input.tasks; // Tasks.csv
        } else if ((fileName.includes('resource') || fileName.includes('capacity')) && !fileName.includes('demand')) {
            fileName = FILE_MAPPING.input.resources; // TupleCapacity.csv
        } else if (fileName.includes('demand')) {
            fileName = FILE_MAPPING.input.demands; // TaskResourceDemand.csv
        } else if (fileName.includes('precedence')) {
            fileName = FILE_MAPPING.input.precedences; // Precedences.csv
        }
        // Si no coincide con ningún patrón, mantener nombre original
        
        console.log(`📝 Mapping ${req.file.originalname} → ${fileName}`);
        
        // Upload file to IBM COS
        const uploadResult = await uploadToIBMCOS(fileName, req.file.buffer, 'text/csv');
        
        console.log('✅ File uploaded to COS:', uploadResult.location);
        
        res.json({ 
            success: true, 
            data: data,
            cosInfo: {
                uploaded: true,
                location: uploadResult.location,
                filename: fileName,
                originalName: req.file.originalname
            }
        });
    } catch (error) {
        console.error('❌ CSV upload/processing error:', error);
        res.status(500).json({ error: 'Failed to process CSV: ' + error.message });
    }
});

// Process manual data and upload to COS - NOMBRES SIMPLIFICADOS
app.post('/upload-manual-data', async (req, res) => {
    console.log('📝 Manual data upload request received');
    
    try {
        const { data } = req.body;
        
        if (!data) {
            return res.status(400).json({ error: 'No data provided' });
        }

        console.log('📊 Converting manual data to optimization CSV format...');
        
        // Generate CSV files from manual data with clean naming
        const csvFiles = generateOptimizationCSVs(data);
        
        console.log('📤 Uploading CSV files to IBM COS...');
        
        const uploadResults = {};
        
        // Upload each CSV file to COS
        for (const [type, fileInfo] of Object.entries(csvFiles)) {
            try {
                const uploadResult = await uploadToIBMCOS(
                    fileInfo.filename, 
                    fileInfo.content, 
                    'text/csv'
                );
                
                uploadResults[type] = {
                    success: true,
                    location: uploadResult.location,
                    filename: fileInfo.filename
                };
                
                console.log(`✅ ${type} CSV uploaded to COS: ${uploadResult.location}`);
            } catch (error) {
                console.error(`❌ Error uploading ${type} CSV:`, error);
                uploadResults[type] = {
                    success: false,
                    error: error.message
                };
            }
        }
        
        res.json({
            success: true,
            message: 'Manual data converted to optimization CSV format and uploaded to COS',
            data: data,
            cosInfo: uploadResults,
            csvFiles: Object.keys(csvFiles)
        });
        
    } catch (error) {
        console.error('❌ Manual data processing error:', error);
        res.status(500).json({ error: 'Failed to process manual data: ' + error.message });
    }
});

// RUTA PRINCIPAL CORREGIDA: Ejecutar job existente con manejo mejorado de permisos
app.post('/optimize', async (req, res) => {
    try {
        const { data, fromManual } = req.body;
        
        console.log('🎯 Starting optimization with existing Watson ML Job...');
        console.log('📊 Data source:', fromManual ? 'Manual Input' : 'CSV Files');
        console.log('🆔 Job ID:', IBM_CONFIG.jobId);
        console.log('🌐 Space ID:', IBM_CONFIG.spaceId);
        
        // Validar datos requeridos
        if (!data || !data.tasks || !data.resources || !data.demands) {
            return res.status(400).json({ error: 'Missing required optimization data' });
        }

        console.log('📋 Data summary:');
        console.log('  - Tasks:', data.tasks.length);
        console.log('  - Resources:', data.resources.length); 
        console.log('  - Demands:', data.demands.length);
        console.log('  - Precedences:', data.precedences?.length || 0);

        // Si es entrada manual, subir archivos a COS primero
        if (fromManual) {
            console.log('📤 Uploading manual data to COS...');
            const csvFiles = generateOptimizationCSVs(data);
            
            for (const [type, fileInfo] of Object.entries(csvFiles)) {
                await uploadToIBMCOS(fileInfo.filename, fileInfo.content, 'text/csv');
                console.log(`✅ ${type} uploaded: ${fileInfo.filename}`);
            }
        }

        // Ejecutar job existente con manejo mejorado de permisos y fallbacks
        console.log('🚀 Executing optimization job with fallback methods...');
        
        let jobRunResult;
        try {
            // Intentar con la función mejorada que incluye fallbacks
            jobRunResult = await executeJobWithFallbacks();
        } catch (error) {
            // Si es error de permisos, enviar respuesta específica
            if (error.response?.status === 403 || error.message.includes('PERMISSION DENIED')) {
                return res.status(403).json({
                    error: 'Permission denied',
                    type: 'PERMISSION_ERROR',
                    message: error.message,
                    solution: {
                        description: 'ServiceId needs to be added as a collaborator in Watson Studio',
                        steps: [
                            '1. Go to Watson Studio/Cloud Pak for Data',
                            '2. Navigate to your project/space',
                            '3. Go to Manage → Access control',
                            '4. Add the ServiceId as a collaborator with Editor role',
                            '5. Retry the optimization'
                        ],
                        serviceId: extractServiceIdFromError(error),
                        spaceId: IBM_CONFIG.spaceId,
                        projectUrl: `https://dataplatform.cloud.ibm.com/projects/${IBM_CONFIG.spaceId}`
                    }
                });
            }
            throw error;
        }
        
        console.log('✅ Job run started successfully');
        console.log('📋 Job details:', {
            id: jobRunResult.metadata?.id || jobRunResult.id,
            state: jobRunResult.entity?.status?.state || jobRunResult.state,
            href: jobRunResult.metadata?.href || jobRunResult.href
        });

        // Hacer polling de resultados del run usando la respuesta completa
        console.log('⏳ Waiting for job run completion...');
        const results = await pollJobResults(jobRunResult);
        
        console.log('✅ Optimization completed successfully');

        res.json({ 
            success: true, 
            results: results,
            jobDetails: {
                runId: jobRunResult.metadata?.id || jobRunResult.id,
                jobId: IBM_CONFIG.jobId,
                state: jobRunResult.entity?.status?.state || jobRunResult.state,
                statusUrl: jobRunResult.metadata?.href || jobRunResult.href,
                createdAt: jobRunResult.metadata?.created_at || new Date().toISOString()
            },
            message: 'Optimization completed successfully with enhanced error handling'
        });
        
    } catch (error) {
        console.error('❌ Optimization error:', error);
        
        // Logging más detallado para debugging
        if (error.response) {
            console.error('📊 Error response status:', error.response.status);
            console.error('📊 Error response data:', JSON.stringify(error.response.data, null, 2));
        }
        
        // Manejo específico de errores comunes
        let errorMessage = error.message;
        let statusCode = 500;
        let errorType = 'EXECUTION_ERROR';
        
        if (error.response?.status === 403) {
            statusCode = 403;
            errorType = 'PERMISSION_ERROR';
            errorMessage = 'Permission denied: ServiceId not authorized for this space';
        } else if (error.response?.status === 404) {
            statusCode = 404;
            errorType = 'NOT_FOUND_ERROR';
            errorMessage = 'Job or space not found';
        } else if (error.response?.status === 401) {
            statusCode = 401;
            errorType = 'AUTH_ERROR';
            errorMessage = 'Authentication failed: Invalid API key';
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            type: errorType,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            troubleshooting: statusCode === 403 ? {
                issue: 'ServiceId lacks permissions',
                solution: 'Add ServiceId as collaborator in Watson Studio',
                spaceId: IBM_CONFIG.spaceId,
                verifyEndpoint: '/verify-permissions'
            } : undefined
        });
    }
});

// List files in COS
app.get('/cos-files', async (req, res) => {
    try {
        console.log('📋 Listing files in IBM COS...');
        const files = await listCOSFiles();
        
        const fileList = files.map(file => ({
            key: file.Key,
            size: file.Size,
            lastModified: file.LastModified,
            etag: file.ETag
        }));
        
        res.json({
            success: true,
            files: fileList,
            count: fileList.length
        });
    } catch (error) {
        console.error('❌ Error listing COS files:', error);
        res.status(500).json({ error: 'Failed to list COS files: ' + error.message });
    }
});

// Download file from COS
app.get('/download-cos-file/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        console.log(`📥 Downloading ${fileName} from COS...`);
        
        const fileContent = await downloadFromIBMCOS(fileName);
        
        res.set({
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${fileName}"`
        });
        
        res.send(fileContent);
    } catch (error) {
        console.error('❌ Error downloading file from COS:', error);
        res.status(500).json({ error: 'Failed to download file: ' + error.message });
    }
});

// Demo endpoint (mantener para testing)
app.post('/optimize-demo', async (req, res) => {
    try {
        const { data } = req.body;
        
        console.log('🎮 Using demo mode - simulating Watson ML optimization...');
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Generate mock results based on actual loaded data
        const numTasks = data.tasks ? data.tasks.length : 5;
        const numResources = data.resources ? data.resources.length : 3;
        
        // Generate realistic task schedule
        const taskSchedule = data.tasks ? data.tasks.map((task, index) => {
            const startTime = index * 5;
            const duration = task.pt || 5;
            return {
                TaskID: task.id,
                StartTime: startTime,
                EndTime: startTime + duration,
                Duration: duration
            };
        }) : [];
        
        const maxEndTime = Math.max(...taskSchedule.map(t => t.EndTime));
        
        // Generate resource usage
        const resourceUsage = data.resources ? data.resources.map((resource, index) => ({
            ResourceID: resource.IDresource || resource.id || index,
            Capacity: resource.capacity || 10,
            MaxUsage: Math.floor((resource.capacity || 10) * (0.6 + Math.random() * 0.3)),
            UtilizationRate: Math.floor(60 + Math.random() * 30)
        })) : [];
        
        const mockResults = {
            solutionSummary: [{
                Makespan: maxEndTime,
                TotalTasks: numTasks,
                TotalResources: numResources,
                Status: 'OPTIMAL'
            }],
            taskSchedule: taskSchedule,
            resourceUsage: resourceUsage,
            resourceTimeline: []
        };
        
        console.log('✅ Demo results generated successfully');
        res.json({ success: true, results: mockResults });
    } catch (error) {
        console.error('❌ Demo error:', error);
        res.status(500).json({ error: 'Demo failed: ' + error.message });
    }
});

// Get sample data
app.get('/sample-data', (req, res) => {
    console.log('📊 Sending sample data');
    
    const sampleData = {
        parameters: [
            { Parameter: 'NumberResources', Value: 3 }
        ],
        tasks: [
            { id: 1, pt: 5, smin: 0, emax: 50 },
            { id: 2, pt: 7, smin: 0, emax: 50 },
            { id: 3, pt: 6, smin: 0, emax: 50 },
            { id: 4, pt: 5, smin: 0, emax: 50 },
            { id: 5, pt: 2, smin: 0, emax: 50 }
        ],
        resources: [
            { IDresource: 0, capacity: 10 },
            { IDresource: 1, capacity: 15 },
            { IDresource: 2, capacity: 8 }
        ],
        demands: [
            { taskId: 1, resourceId: 0, demand: 3 },
            { taskId: 1, resourceId: 1, demand: 2 },
            { taskId: 2, resourceId: 0, demand: 4 },
            { taskId: 2, resourceId: 2, demand: 1 },
            { taskId: 3, resourceId: 1, demand: 5 },
            { taskId: 3, resourceId: 2, demand: 2 },
            { taskId: 4, resourceId: 0, demand: 2 },
            { taskId: 4, resourceId: 1, demand: 3 },
            { taskId: 5, resourceId: 2, demand: 1 }
        ],
        precedences: [
            { beforeId: 1, afterId: 2 },
            { beforeId: 2, afterId: 3 },
            { beforeId: 3, afterId: 4 },
            { beforeId: 4, afterId: 5 }
        ]
    };
    
    res.json(sampleData);
});

// =============================================================================
// Error Handling
// =============================================================================

app.use((error, req, res, next) => {
    console.error('💥 Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error', 
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, () => {
    console.log('\n' + '🚀'.repeat(20));
    console.log(`🌟 IBM WATSON ML JOB EXECUTOR + COS SERVER - FIXED VERSION`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Directory: ${__dirname}`);
    console.log(`🆔 Job ID: ${IBM_CONFIG.jobId}`);
    console.log(`🌐 Space ID: ${IBM_CONFIG.spaceId}`);
    console.log(`👥 Group ID: ${IBM_CONFIG.groupId}`);
    console.log(`🚀 Job Run Endpoint: ${IBM_CONFIG.jobRunEndpoint}`);
    console.log(`🗄️  COS Bucket: ${COS_CONFIG.bucketName}`);
    console.log(`🔑 API Key: ${IBM_CONFIG.apiKey.substring(0, 10)}...`);
    console.log(`📦 Version: 5.0.0 - Enhanced with Permission Management`);
    console.log('🚀'.repeat(20) + '\n');
    
    console.log('🔧 NEW FEATURES IN THIS VERSION:');
    console.log('   ✅ Permission verification before job execution');
    console.log('   ✅ Fallback execution methods');
    console.log('   ✅ Enhanced error handling for 403 errors');
    console.log('   ✅ ServiceId extraction from error messages');
    console.log('   ✅ Detailed troubleshooting information');
    console.log('   ✅ New endpoint: GET /verify-permissions');
    console.log('');
    
    console.log('🧪 TESTING ENDPOINTS:');
    console.log('   🔍 GET  /verify-permissions  - Check if ServiceId has proper access');
    console.log('   🏥 GET  /health             - Server status and configuration');
    console.log('   📋 GET  /cos-files          - List files in COS bucket');
    console.log('   🎯 POST /optimize           - Execute optimization (main endpoint)');
    console.log('   🎮 POST /optimize-demo      - Demo mode with mock results');
    console.log('');
    
    // Test COS connection
    console.log('🧪 Testing COS connection...');
    listCOSFiles().then(files => {
        console.log(`✅ COS connected successfully. Found ${files.length} files.`);
        files.slice(0, 5).forEach(file => {
            console.log(`📄 ${file.Key} (${file.Size} bytes)`);
        });
        if (files.length > 5) {
            console.log(`   ... and ${files.length - 5} more files`);
        }
    }).catch(error => {
        console.log(`❌ COS connection failed: ${error.message}`);
        console.log(`⚠️  You may need to create the bucket: ${COS_CONFIG.bucketName}`);
    });
    
    // Test IAM token
    console.log('🧪 Testing IAM token...');
    getAccessToken().then(token => {
        console.log(`✅ IAM token obtained successfully: ${token.substring(0, 20)}...`);
        
        // Test space access
        console.log('🧪 Testing space access...');
        verifySpaceAccess(token).then(hasAccess => {
            console.log(`✅ Space access verified: ${hasAccess}`);
        }).catch(error => {
            console.log(`❌ Space access failed: ${error.message}`);
            console.log(`🔧 SOLUTION: Use GET /verify-permissions for detailed instructions`);
        });
        
    }).catch(error => {
        console.log(`❌ IAM token failed: ${error.message}`);
    });
});

module.exports = app;