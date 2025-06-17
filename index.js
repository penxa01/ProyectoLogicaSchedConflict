// =============================================================================
// Node.js Server with IBM Cloud Object Storage Integration - MODIFICADO
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
    apiKey: 'C3g5p6YQe8rCH9xztTduzstOPz1CVT64fox7Gi5j7xLi',
    jobId: 'af8c7532-a4cb-46a9-abda-97a19b4b5b9b', // Tu Job ID existente
    spaceId: 'dd18eb10-08af-4997-afd8-e23ea057ff93', // Tu Space ID
    groupId: 'b6b35acd-fc65-4966-be66-98499d334c4c', // Tu Group ID
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
// IBM Watson ML Helper Functions - MODIFICADAS PARA EJECUTAR JOB EXISTENTE
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

// NUEVA FUNCIÓN: Ejecutar job existente en lugar de crear uno nuevo
async function executeExistingJob() {
    try {
        console.log('🚀 Executing existing Watson ML job...');
        console.log('🆔 Job ID:', IBM_CONFIG.jobId);
        console.log('🌐 Space ID:', IBM_CONFIG.spaceId);
        
        const accessToken = await getAccessToken();
        
        // Payload para ejecutar el job existente
        const payload = {
            // Configuración para usar archivos de entrada desde COS
            job_input_data_references: [
                {
                    type: "connection_asset",
                    connection: {
                        id: "coss_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: ""
                    }
                }
            ],
            // Configuración para guardar resultados en COS
            job_output_data_references: [
                {
                    type: "connection_asset", 
                    connection: {
                        id: "coss_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: "output/"
                    }
                }
            ]
        };

        console.log('📤 Sending job execution request...');
        console.log('🔗 Endpoint:', IBM_CONFIG.jobRunEndpoint);

        // Enviar POST con body vacío (null) para ejecutar el job existente
        const response = await axios.post(IBM_CONFIG.jobRunEndpoint, {}, {
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
            }
        });

        console.log('✅ Job execution started successfully');
        console.log('📊 Response data:', response.data);
        
        return response.data;
    } catch (error) {
        console.error('❌ Error executing job:', error.response?.data || error.message);
        console.error('📊 Response status:', error.response?.status);
        console.error('📊 Response headers:', error.response?.headers);
        throw new Error(`Job execution failed: ${error.response?.status || 'Unknown'} - ${error.response?.data?.message || error.message}`);
    }
}

// FUNCIÓN MODIFICADA: Polling del estado del job run usando runtime_job_id
async function pollJobResults(jobRunResponse, maxAttempts = 30, intervalMs = 10000) {
    try {
        // Extraer runtime_job_id o usar el ID del metadata como fallback
        const runtimeJobId = jobRunResponse.runtimeJobId || jobRunResponse.entity?.job_run?.runtime_job_id;
        const runId = jobRunResponse.metadata?.id || runtimeJobId;
        const statusUrl = jobRunResponse.statusUrl || jobRunResponse.href;
        
        console.log(`🔄 Polling job run results...`);
        console.log(`📋 Runtime Job ID: ${runtimeJobId}`);
        console.log(`📋 Run ID: ${runId}`);
        console.log(`📋 Status URL: ${statusUrl}`);
        
        const accessToken = await getAccessToken();
        
        // Si tenemos statusUrl, usarlo; sino construir el endpoint
        let apiUrl;
        if (statusUrl) {
            apiUrl = statusUrl;
        } else {
            apiUrl = `https://api.dataplatform.cloud.ibm.com/v2/jobs/${IBM_CONFIG.jobId}/runs/${runId}?space_id=${IBM_CONFIG.spaceId}`;
        }

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`📡 Polling attempt ${attempt}/${maxAttempts}`);
            console.log(`🔗 Checking: ${apiUrl}`);
            
            try {
                const response = await axios.get(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                const runData = response.data;
                const currentState = runData.entity?.job_run?.state || runData.entity?.status?.state || 'unknown';
                
                console.log(`📊 Current state: ${currentState}`);
                console.log(`📊 Runtime Job ID: ${runData.entity?.job_run?.runtime_job_id || 'N/A'}`);

                if (currentState === 'completed' || currentState === 'success') {
                    console.log('✅ Job run completed successfully');
                    
                    // Descargar archivos de resultados desde COS
                    const results = await downloadOptimizationResults();
                    return results;
                    
                } else if (currentState === 'failed' || currentState === 'error') {
                    console.error('❌ Job run failed:', runData.entity?.job_run?.status || runData.entity?.status);
                    throw new Error('Job run failed: ' + (runData.entity?.job_run?.status?.message || runData.entity?.status?.message || 'Unknown error'));
                } else if (currentState === 'canceled' || currentState === 'cancelled') {
                    throw new Error('Job run was canceled');
                } else if (currentState === 'running' || currentState === 'pending' || currentState === 'queued') {
                    console.log(`⏳ Job still ${currentState}, waiting...`);
                } else {
                    console.log(`🔄 Job state: ${currentState}, continuing to poll...`);
                }

                // Wait before next attempt
                if (attempt < maxAttempts) {
                    console.log(`⏳ Waiting ${intervalMs/1000} seconds before next check...`);
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                }
                
            } catch (error) {
                if (error.response?.status === 404) {
                    console.log(`⚠️ Run not found yet (attempt ${attempt}), job might still be starting...`);
                } else {
                    console.log(`⚠️ Polling error (attempt ${attempt}):`, error.response?.status, error.message);
                }
                
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                } else {
                    throw error;
                }
            }
        }

        throw new Error('Job timeout - maximum attempts reached');
    } catch (error) {
        console.error('❌ Error polling job results:', error.response?.data || error.message);
        throw new Error(`Failed to poll job results: ${error.response?.status || error.message}`);
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
        server: 'IBM Watson ML Job Executor with COS',
        version: '4.1.0',
        jobId: IBM_CONFIG.jobId,
        spaceId: IBM_CONFIG.spaceId,
        groupId: IBM_CONFIG.groupId,
        jobRunEndpoint: IBM_CONFIG.jobRunEndpoint,
        iamEndpoints: [
            'https://iam.cloud.ibm.com/identity/token',
            'https://iam.cloud.ibm.com/v1/token'
        ]
    });
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

// RUTA PRINCIPAL MODIFICADA: Ejecutar job existente
app.post('/optimize', async (req, res) => {
    try {
        const { data, fromManual } = req.body;
        
        console.log('🎯 Starting optimization with existing Watson ML Job...');
        console.log('📊 Data source:', fromManual ? 'Manual Input' : 'CSV Files');
        console.log('🆔 Job ID:', IBM_CONFIG.jobId);
        
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

        // Ejecutar job existente
        console.log('🚀 Executing existing Watson ML job...');
        const jobRunResult = await executeExistingJob();
        
        console.log('✅ Job run started successfully');
        console.log('📋 Runtime Job ID:', jobRunResult.runtimeJobId);
        console.log('📋 Job State:', jobRunResult.state);

        // Hacer polling de resultados del run usando la respuesta completa
        console.log('⏳ Waiting for job run completion...');
        const results = await pollJobResults(jobRunResult);
        
        console.log('✅ Optimization completed successfully');

        res.json({ 
            success: true, 
            results: results,
            runtimeJobId: jobRunResult.runtimeJobId,
            runId: jobRunResult.metadata?.id,
            jobId: IBM_CONFIG.jobId,
            state: jobRunResult.state,
            statusUrl: jobRunResult.statusUrl,
            message: 'Optimization completed with existing Watson ML job'
        });
        
    } catch (error) {
        console.error('❌ Optimization error:', error);
        res.status(500).json({ 
            error: 'Optimization failed: ' + error.message,
            details: error.stack 
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
        message: error.message 
    });
});

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, () => {
    console.log('\n' + '🚀'.repeat(20));
    console.log(`🌟 IBM WATSON ML JOB EXECUTOR + COS SERVER`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Directory: ${__dirname}`);
    console.log(`🆔 Job ID: ${IBM_CONFIG.jobId}`);
    console.log(`🌐 Space ID: ${IBM_CONFIG.spaceId}`);
    console.log(`👥 Group ID: ${IBM_CONFIG.groupId}`);
    console.log(`🚀 Job Run Endpoint: ${IBM_CONFIG.jobRunEndpoint}`);
    console.log(`🗄️  COS Bucket: ${COS_CONFIG.bucketName}`);
    console.log(`🔑 API Key: ${IBM_CONFIG.apiKey.substring(0, 10)}...`);
    console.log('🚀'.repeat(20) + '\n');
    
    // Test COS connection
    console.log('🧪 Testing COS connection...');
    listCOSFiles().then(files => {
        console.log(`✅ COS connected successfully. Found ${files.length} files.`);
        files.forEach(file => {
            console.log(`📄 ${file.Key} (${file.Size} bytes)`);
        });
    }).catch(error => {
        console.log(`❌ COS connection failed: ${error.message}`);
        console.log(`⚠️  You may need to create the bucket: ${COS_CONFIG.bucketName}`);
    });
    
    // Test IAM token
    console.log('🧪 Testing IAM token...');
    getAccessToken().then(token => {
        console.log(`✅ IAM token obtained successfully: ${token.substring(0, 20)}...`);
    }).catch(error => {
        console.log(`❌ IAM token failed: ${error.message}`);
    });
});

module.exports = app;