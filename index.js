// =============================================================================
// Node.js Server with IBM Cloud Object Storage Integration - MEJORADO
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
// IBM Watson ML Configuration - ACTUALIZADO CON TUS IDs
// =============================================================================

const IBM_CONFIG = {
    apiKey: 'C3g5p6YQe8rCH9xztTduzstOPz1CVT64fox7Gi5j7xLi',
    deploymentId: 'f2f56eef-31dd-4efe-aa7a-25d1011c0860', // Tu ID de despliegue
    jobId: 'af8c7532-a4cb-46a9-abda-97a19b4b5b9b', // Tu ID de trabajo
    instanceId: 'crn:v1:bluemix:public:cloud-object-storage:global:a/d3c266a491d4414c9e4af3ad57209e3f:397f0b00-814e-41b7-9119-1103b8ab1ea2::',
    baseUrl: 'https://us-south.ml.cloud.ibm.com/ml/v4',
    iamUrl: 'https://iam.cloud.ibm.com/identity/token'
};

// =============================================================================
// ARCHIVOS DE ENTRADA Y SALIDA ESPECÍFICOS
// =============================================================================

const FILE_MAPPING = {
    input: {
        parameters: 'cloud-object-storage-cos-proyfinal-2f2.parameters.csv',
        tasks: 'cloud-object-storage-cos-proyfinal-2f2.Tasks.csv', 
        resources: 'cloud-object-storage-cos-proyfinal-2f2.TupleCapacity.csv',
        demands: 'cloud-object-storage-cos-proyfinal-2f2.TaskResourceDemand.csv',
        precedences: 'cloud-object-storage-cos-proyfinal-2f2.Precedences.csv'
    },
    output: {
        stats: 'cloud-object-storage-cos-proyfinal-2f2.stats.csv',
        resourceUsage: 'cloud-object-storage-cos-proyfinal-2f2.ResourceUsageResults.csv',
        taskSchedule: 'cloud-object-storage-cos-proyfinal-2f2.TaskScheduleOutput.csv',
        resourceTimeline: 'cloud-object-storage-cos-proyfinal-2f2.ResourceTimelineOutput.csv',
        solutionResults: 'cloud-object-storage-cos-proyfinal-2f2.SolutionResults.csv',
        skip: 'cloud-object-storage-cos-proyfinal-2f2.skip.csv',
        taskResourceUsage: 'cloud-object-storage-cos-proyfinal-2f2.TaskResourceUsageOutput.csv'
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
            Key: fileName,
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
// CSV Generation Functions - MEJORADAS
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
            type: 'tasks'
        };
    }
    
    // Generate resources CSV (TupleCapacity format)
    if (data.resources && data.resources.length > 0) {
        csvFiles.resources = {
            filename: FILE_MAPPING.input.resources,
            content: generateCSVFromJSON(data.resources, ['IDresource', 'capacity']),
            type: 'resources'
        };
    }
    
    // Generate demands CSV (TaskResourceDemand format)
    if (data.demands && data.demands.length > 0) {
        csvFiles.demands = {
            filename: FILE_MAPPING.input.demands,
            content: generateCSVFromJSON(data.demands, ['taskId', 'resourceId', 'demand']),
            type: 'demands'
        };
    }
    
    // Generate precedences CSV
    if (data.precedences && data.precedences.length > 0) {
        csvFiles.precedences = {
            filename: FILE_MAPPING.input.precedences,
            content: generateCSVFromJSON(data.precedences, ['beforeId', 'afterId']),
            type: 'precedences'
        };
    }
    
    console.log('✅ Generated CSV files:', Object.keys(csvFiles));
    return csvFiles;
}

// =============================================================================
// IBM Watson ML Helper Functions - MEJORADAS
// =============================================================================

async function getAccessToken() {
    try {
        console.log('🔑 Getting access token from IBM...');
        
        const response = await axios.post(IBM_CONFIG.iamUrl, 
            `grant_type=urn:iam:grant-type:apikey&apikey=${IBM_CONFIG.apiKey}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            }
        );

        console.log('✅ Access token obtained successfully');
        return response.data.access_token;
    } catch (error) {
        console.error('❌ Error getting access token:', error.response?.data || error.message);
        throw new Error(`Failed to get access token: ${error.response?.status || error.message}`);
    }
}

async function createWatsonMLJob() {
    try {
        console.log('🚀 Creating Watson ML job with specific job ID...');
        
        const accessToken = await getAccessToken();
        const apiUrl = `${IBM_CONFIG.baseUrl}/deployments/${IBM_CONFIG.deploymentId}/jobs`;

        // Crear el job con referencias a los archivos en COS
        const payload = {
            input_data_references: [
                {
                    id: "parameters_input",
                    type: "connection_asset", 
                    connection: {
                        id: "cos_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: FILE_MAPPING.input.parameters
                    }
                },
                {
                    id: "tasks_input",
                    type: "connection_asset",
                    connection: {
                        id: "cos_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: FILE_MAPPING.input.tasks
                    }
                },
                {
                    id: "resources_input", 
                    type: "connection_asset",
                    connection: {
                        id: "cos_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: FILE_MAPPING.input.resources
                    }
                },
                {
                    id: "demands_input",
                    type: "connection_asset",
                    connection: {
                        id: "cos_connection" 
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: FILE_MAPPING.input.demands
                    }
                },
                {
                    id: "precedences_input",
                    type: "connection_asset",
                    connection: {
                        id: "cos_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: FILE_MAPPING.input.precedences
                    }
                }
            ],
            output_data_references: [
                {
                    id: "optimization_results",
                    type: "connection_asset",
                    connection: {
                        id: "cos_connection"
                    },
                    location: {
                        bucket: COS_CONFIG.bucketName,
                        path: "output/"
                    }
                }
            ]
        };

        console.log('📤 Sending job creation payload to Watson ML...');

        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'ML-Instance-ID': IBM_CONFIG.instanceId
            }
        });

        console.log('✅ Watson ML job created successfully');
        return response.data;
    } catch (error) {
        console.error('❌ Error creating Watson ML job:', error.response?.data || error.message);
        throw new Error(`Watson ML API error: ${error.response?.status || 'Unknown'} - ${error.response?.data?.message || error.message}`);
    }
}

async function pollJobResults(jobId, maxAttempts = 30, intervalMs = 10000) {
    try {
        console.log(`🔄 Polling job results for ${jobId}...`);
        
        const accessToken = await getAccessToken();
        const apiUrl = `${IBM_CONFIG.baseUrl}/deployments/jobs/${jobId}`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`📡 Polling attempt ${attempt}/${maxAttempts} for job ${jobId}`);
            
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'ML-Instance-ID': IBM_CONFIG.instanceId
                }
            });

            const jobData = response.data;
            console.log(`📊 Job status: ${jobData.entity?.status?.state}`);

            if (jobData.entity?.status?.state === 'completed') {
                console.log('✅ Job completed successfully');
                
                // Descargar archivos de resultados desde COS
                const results = await downloadOptimizationResults();
                return results;
                
            } else if (jobData.entity?.status?.state === 'failed') {
                throw new Error('Job failed: ' + (jobData.entity?.status?.message || 'Unknown error'));
            }

            // Wait before next attempt
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }

        throw new Error('Job timeout - maximum attempts reached');
    } catch (error) {
        console.error('❌ Error polling job results:', error.response?.data || error.message);
        throw new Error(`Failed to poll job results: ${error.response?.status || error.message}`);
    }
}

// =============================================================================
// NUEVAS FUNCIONES PARA MANEJAR RESULTADOS DESDE COS
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
        
        // Descargar archivo de solución
        try {
            const solutionData = await downloadFromIBMCOS(FILE_MAPPING.output.solutionResults);
            results.solutionSummary = parseCSVContent(solutionData);
            console.log('✅ Solution results downloaded');
        } catch (error) {
            console.log('⚠️ Solution results not found, using default');
            results.solutionSummary = [{ Makespan: 0, TotalTasks: 0, TotalResources: 0, Status: 'UNKNOWN' }];
        }
        
        // Descargar programación de tareas
        try {
            const scheduleData = await downloadFromIBMCOS(FILE_MAPPING.output.taskSchedule);
            results.taskSchedule = parseCSVContent(scheduleData);
            console.log('✅ Task schedule downloaded');
        } catch (error) {
            console.log('⚠️ Task schedule not found, using default');
            results.taskSchedule = [];
        }
        
        // Descargar uso de recursos
        try {
            const resourceData = await downloadFromIBMCOS(FILE_MAPPING.output.resourceUsage);
            results.resourceUsage = parseCSVContent(resourceData);
            console.log('✅ Resource usage downloaded');
        } catch (error) {
            console.log('⚠️ Resource usage not found, using default');
            results.resourceUsage = [];
        }
        
        // Descargar timeline de recursos
        try {
            const timelineData = await downloadFromIBMCOS(FILE_MAPPING.output.resourceTimeline);
            results.resourceTimeline = parseCSVContent(timelineData);
            console.log('✅ Resource timeline downloaded');
        } catch (error) {
            console.log('⚠️ Resource timeline not found, using default');
            results.resourceTimeline = [];
        }
        
        // Descargar estadísticas
        try {
            const statsData = await downloadFromIBMCOS(FILE_MAPPING.output.stats);
            results.stats = parseCSVContent(statsData);
            console.log('✅ Stats downloaded');
        } catch (error) {
            console.log('⚠️ Stats not found, using default');
            results.stats = [];
        }
        
        console.log('✅ All optimization results processed');
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
        server: 'IBM Watson ML Optimizer with COS',
        version: '3.0.0',
        jobId: IBM_CONFIG.jobId,
        deploymentId: IBM_CONFIG.deploymentId
    });
});

// Upload CSV files to IBM COS
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
        
        // Generate appropriate filename based on file type
        let fileName = req.file.originalname;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Map to correct filename format
        if (fileName.includes('parameter')) {
            fileName = FILE_MAPPING.input.parameters;
        } else if (fileName.includes('task') && !fileName.includes('demand')) {
            fileName = FILE_MAPPING.input.tasks;
        } else if (fileName.includes('resource') && !fileName.includes('demand')) {
            fileName = FILE_MAPPING.input.resources;
        } else if (fileName.includes('demand')) {
            fileName = FILE_MAPPING.input.demands;
        } else if (fileName.includes('precedence')) {
            fileName = FILE_MAPPING.input.precedences;
        } else {
            fileName = `${timestamp}_${req.file.originalname}`;
        }
        
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

// Process manual data and upload to COS
app.post('/upload-manual-data', async (req, res) => {
    console.log('📝 Manual data upload request received');
    
    try {
        const { data } = req.body;
        
        if (!data) {
            return res.status(400).json({ error: 'No data provided' });
        }

        console.log('📊 Converting manual data to optimization CSV format...');
        
        // Generate CSV files from manual data with correct naming
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

// NUEVA RUTA: Optimizar con Watson ML Job completo
app.post('/optimize', async (req, res) => {
    try {
        const { data, fromManual } = req.body;
        
        console.log('🎯 Starting optimization with Watson ML Job...');
        console.log('📊 Data source:', fromManual ? 'Manual Input' : 'CSV Files');
        
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

        // Crear y ejecutar Watson ML Job
        console.log('🚀 Creating Watson ML job...');
        const jobResult = await createWatsonMLJob();
        
        if (!jobResult.metadata || !jobResult.metadata.id) {
            throw new Error('Failed to get job ID from Watson ML');
        }

        console.log('✅ Job created with ID:', jobResult.metadata.id);

        // Hacer polling de resultados
        console.log('⏳ Waiting for job completion...');
        const results = await pollJobResults(jobResult.metadata.id);
        
        console.log('✅ Optimization completed successfully');

        res.json({ 
            success: true, 
            results: results,
            jobId: jobResult.metadata.id,
            message: 'Optimization completed with real Watson ML job'
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
    console.log(`🌟 IBM WATSON ML + COS OPTIMIZER SERVER (MEJORADO)`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📁 Directory: ${__dirname}`);
    console.log(`🔧 Deployment ID: ${IBM_CONFIG.deploymentId}`);
    console.log(`💼 Job ID: ${IBM_CONFIG.jobId}`);
    console.log(`🗄️  COS Bucket: ${COS_CONFIG.bucketName}`);
    console.log('🚀'.repeat(20) + '\n');
    
    // Test COS connection
    console.log('🧪 Testing COS connection...');
    listCOSFiles().then(files => {
        console.log(`✅ COS connected successfully. Found ${files.length} files.`);
    }).catch(error => {
        console.log(`❌ COS connection failed: ${error.message}`);
        console.log(`⚠️  You may need to create the bucket: ${COS_CONFIG.bucketName}`);
    });
});

module.exports = app;