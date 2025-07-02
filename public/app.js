// =============================================================================
// Frontend Client for IBM Watson ML + COS Task Optimization - MEJORADO
// =============================================================================

class TaskOptimizer {
    constructor() {
        this.data = {
            parameters: null,
            tasks: null,
            resources: null,
            demands: null,
            precedences: null
        };
        this.charts = {};
        this.cosUploadInfo = {}; // Track COS upload information
        this.validationTimeout = null;
        this.initializeEventListeners();
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    initializeEventListeners() {
        // File upload listeners
        document.getElementById('parametersFile').addEventListener('change', (e) => this.handleFileUpload(e, 'parameters'));
        document.getElementById('tasksFile').addEventListener('change', (e) => this.handleFileUpload(e, 'tasks'));
        document.getElementById('resourcesFile').addEventListener('change', (e) => this.handleFileUpload(e, 'resources'));
        document.getElementById('demandsFile').addEventListener('change', (e) => this.handleFileUpload(e, 'demands'));
        document.getElementById('precedencesFile').addEventListener('change', (e) => this.handleFileUpload(e, 'precedences'));

        // Button listeners
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadDataPreview());
        document.getElementById('optimizeBtn').addEventListener('click', () => this.optimizeWithServer());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());

        // Add sample data button if it exists
        const sampleBtn = document.getElementById('sampleDataBtn');
        if (sampleBtn) {
            sampleBtn.addEventListener('click', () => this.loadSampleData());
        }

        // Tab listeners
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Input mode tab listeners
        document.querySelectorAll('.input-mode-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchInputMode(e.target.dataset.mode);
            });
        });

        // Add COS files viewer button
        this.addCOSViewerButton();

        // Monitor manual input changes
        this.startManualInputMonitoring();
    }

    switchInputMode(mode) {
        console.log('🔄 Switching input mode to:', mode);
        
        // Update tab appearance
        document.querySelectorAll('.input-mode-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
        
        // Show/hide sections
        const csvSection = document.getElementById('csv-input-section');
        const manualSection = document.getElementById('manual-input-section');
        
        if (mode === 'csv') {
            csvSection.style.display = 'block';
            manualSection.classList.remove('active');
        } else {
            csvSection.style.display = 'none';
            manualSection.classList.add('active');
        }
        
        // Re-check optimization readiness after mode switch
        setTimeout(() => {
            this.checkOptimizationReady();
        }, 100);
    }

    addCOSViewerButton() {
        const actionButtons = document.querySelector('.action-buttons');
        if (actionButtons && !document.getElementById('cosViewerBtn')) {
            const cosBtn = document.createElement('button');
            cosBtn.id = 'cosViewerBtn';
            cosBtn.className = 'btn btn-secondary';
            cosBtn.innerHTML = '<i class="fas fa-cloud"></i> Ver Archivos COS';
            cosBtn.addEventListener('click', () => this.showCOSFiles());
            actionButtons.appendChild(cosBtn);
        }
    }

    // =========================================================================
    // MANUAL INPUT MONITORING - MEJORADO
    // =========================================================================

    startManualInputMonitoring() {
        const manualSection = document.getElementById('manual-input-section');
        if (manualSection) {
            // Monitor all input changes in manual section
            manualSection.addEventListener('input', () => {
                clearTimeout(this.validationTimeout);
                this.validationTimeout = setTimeout(() => {
                    console.log('🔍 Manual input changed, checking optimization readiness...');
                    this.checkOptimizationReady();
                }, 300); // Reduced timeout for better responsiveness
            });

            // Also monitor changes when rows are added/removed
            manualSection.addEventListener('click', (e) => {
                if (e.target.classList.contains('add-row-btn') || 
                    e.target.classList.contains('remove-row-btn') ||
                    e.target.closest('.add-row-btn') ||
                    e.target.closest('.remove-row-btn')) {
                    
                    setTimeout(() => {
                        console.log('🔍 Row added/removed, checking optimization readiness...');
                        this.checkOptimizationReady();
                    }, 100);
                }
            });
        }
    }

    // =========================================================================
    // FILE HANDLING (with COS integration)
    // =========================================================================

    async handleFileUpload(event, dataType) {
        console.log('📁 Handling file upload for:', dataType);
        
        const file = event.target.files[0];
        if (file && file.type === 'text/csv') {
            console.log('📄 File selected:', file.name, 'Size:', file.size);
            
            try {
                const formData = new FormData();
                formData.append('file', file);

                console.log('🚀 Uploading file to server and COS...');
                
                const response = await fetch('/upload-csv', {
                    method: 'POST',
                    body: formData
                });

                console.log('📡 Response status:', response.status);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                console.log('📊 Server response:', result);
                
                if (result.success) {
                    this.data[dataType] = result.data;
                    
                    // Store COS upload information
                    if (result.cosInfo) {
                        this.cosUploadInfo[dataType] = result.cosInfo;
                        console.log(`☁️ File uploaded to COS: ${result.cosInfo.location}`);
                    }
                    
                    this.updateFileStatus(dataType, file.name, true, result.cosInfo);
                    this.checkOptimizationReady();
                    console.log(`✅ ${dataType} data loaded:`, this.data[dataType]);
                    this.showSuccess(`Archivo ${file.name} cargado y subido a COS correctamente`);
                } else {
                    throw new Error(result.error || 'Unknown error');
                }
            } catch (error) {
                console.error('❌ File upload error:', error);
                this.showError(`Error loading ${dataType}: ${error.message}`);
                this.updateFileStatus(dataType, file.name, false);
            }
        } else {
            console.log('❌ Invalid file type or no file selected');
            this.showError('Por favor selecciona un archivo CSV válido');
        }
    }

    updateFileStatus(dataType, fileName, success, cosInfo = null) {
        const infoElement = document.getElementById(`${dataType}Info`);
        if (!infoElement) return;
        
        const uploadGroup = infoElement.closest('.upload-group');
        if (!uploadGroup) return;
        
        if (success) {
            uploadGroup.classList.add('has-file');
            let statusHtml = `<small class="success"><i class="fas fa-check"></i> ${fileName}</small>`;
            
            if (cosInfo && cosInfo.uploaded) {
                statusHtml += `<br><small class="success"><i class="fas fa-cloud"></i> Subido a COS</small>`;
            }
            
            infoElement.innerHTML = statusHtml;
        } else {
            uploadGroup.classList.remove('has-file');
            infoElement.innerHTML = '<small class="error"><i class="fas fa-times"></i> Error al cargar</small>';
        }
    }

    // =========================================================================
    // VALIDATION LOGIC - COMPLETAMENTE REESCRITA
    // =========================================================================

    checkOptimizationReady() {
        console.log('🔄 Checking optimization ready...');
        
        const currentMode = this.getCurrentInputMode();
        console.log('📝 Current mode:', currentMode);
        
        let hasRequiredData = false;
        let validationErrors = [];

        if (currentMode === 'manual') {
            // Para modo manual, recopilar y validar datos
            const manualData = this.collectManualData();
            console.log('📊 Manual data collected:', manualData);
            
            if (manualData) {
                validationErrors = this.validateManualData(manualData);
                console.log('⚠️ Validation errors:', validationErrors);
                
                hasRequiredData = validationErrors.length === 0 && 
                                manualData.tasks.length > 0 && 
                                manualData.resources.length > 0 && 
                                manualData.demands.length > 0;
                
                console.log('✅ Manual - hasRequiredData:', hasRequiredData);
                
                if (hasRequiredData) {
                    // Actualizar datos internos con entrada manual
                    this.data = manualData;
                    console.log('💾 Data updated from manual input');
                }
            }
        } else {
            // Para modo CSV, verificar si los archivos están cargados
            const requiredFiles = ['tasks', 'resources', 'demands'];
            hasRequiredData = requiredFiles.every(type => {
                const hasData = this.data[type] !== null && 
                               this.data[type] !== undefined && 
                               Array.isArray(this.data[type]) && 
                               this.data[type].length > 0;
                console.log(`📋 CSV ${type}:`, hasData ? '✅' : '❌', this.data[type]?.length || 0, 'items');
                return hasData;
            });
            console.log('✅ CSV - hasRequiredData:', hasRequiredData);
        }
        
        // Mostrar errores de validación si los hay
        if (validationErrors.length > 0) {
            console.log('❌ Validation errors found:', validationErrors);
            this.showValidationErrors(validationErrors);
        } else {
            this.clearValidationErrors();
        }
        
        console.log('🎯 Final result - hasRequiredData:', hasRequiredData);
        
        // Actualizar estado de botones
        const optimizeBtn = document.getElementById('optimizeBtn');
        const loadDataBtn = document.getElementById('loadDataBtn');
        
        if (optimizeBtn) {
            optimizeBtn.disabled = !hasRequiredData;
            console.log('🔘 Optimize button disabled:', optimizeBtn.disabled);
        }
        
        if (loadDataBtn) {
            loadDataBtn.disabled = !hasRequiredData;
            console.log('🔘 Load data button disabled:', loadDataBtn.disabled);
        }

        return hasRequiredData;
    }

    showValidationErrors(errors) {
        // Crear o actualizar div de errores
        let errorDiv = document.getElementById('validationErrors');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'validationErrors';
            errorDiv.className = 'validation-errors';
            errorDiv.style.cssText = `
                background: #fef2f2;
                border: 1px solid #f87171;
                border-radius: 6px;
                padding: 1rem;
                margin: 1rem 0;
                color: #dc2626;
            `;
            
            const manualSection = document.getElementById('manual-input-section');
            if (manualSection) {
                manualSection.insertBefore(errorDiv, manualSection.firstChild);
            }
        }
        
        errorDiv.innerHTML = `
            <h4 style="margin: 0 0 0.5rem 0;"><i class="fas fa-exclamation-triangle"></i> Errores de Validación:</h4>
            <ul style="margin: 0; padding-left: 1.5rem;">
                ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
        `;
    }

    clearValidationErrors() {
        const errorDiv = document.getElementById('validationErrors');
        if (errorDiv) {
            errorDiv.remove();
        }
    }

    // =========================================================================
    // MANUAL INPUT FUNCTIONS - MEJORADAS
    // =========================================================================

    getCurrentInputMode() {
        const activeTab = document.querySelector('.input-mode-tab.active');
        return activeTab ? activeTab.dataset.mode : 'csv';
    }

    collectManualData() {
        const data = {
            parameters: [{ Parameter: 'NumberResources', Value: 0 }],
            tasks: [],
            resources: [],
            demands: [],
            precedences: []
        };

        try {
            // Recopilar tareas
            const taskRows = document.querySelectorAll('#tasks-container .form-row');
            taskRows.forEach(row => {
                const inputs = row.querySelectorAll('.form-input');
                const id = parseInt(inputs[0].value);
                const pt = parseInt(inputs[1].value);
                const smin = parseInt(inputs[2].value) || 0;
                const emax = parseInt(inputs[3].value) || 999;
                
                if (!isNaN(id) && !isNaN(pt) && id > 0 && pt > 0) {
                    data.tasks.push({ id, pt, smin, emax });
                }
            });

            // Recopilar recursos
            const resourceRows = document.querySelectorAll('#resources-container .form-row');
            resourceRows.forEach(row => {
                const inputs = row.querySelectorAll('.form-input');
                const IDresource = parseInt(inputs[0].value);
                const capacity = parseInt(inputs[1].value);
                
                if (!isNaN(IDresource) && !isNaN(capacity) && IDresource >= 0 && capacity > 0) {
                    data.resources.push({ IDresource, capacity });
                }
            });

            // Recopilar demandas
            const demandRows = document.querySelectorAll('#demands-container .form-row');
            demandRows.forEach(row => {
                const inputs = row.querySelectorAll('.form-input');
                const taskId = parseInt(inputs[0].value);
                const resourceId = parseInt(inputs[1].value);
                const demand = parseInt(inputs[2].value);
                
                if (!isNaN(taskId) && !isNaN(resourceId) && !isNaN(demand) && 
                    taskId > 0 && resourceId >= 0 && demand > 0) {
                    data.demands.push({ taskId, resourceId, demand });
                }
            });

            // Recopilar precedencias
            const precedenceRows = document.querySelectorAll('#precedences-container .form-row');
            precedenceRows.forEach(row => {
                const inputs = row.querySelectorAll('.form-input');
                const beforeId = parseInt(inputs[0].value);
                const afterId = parseInt(inputs[1].value);
                
                if (!isNaN(beforeId) && !isNaN(afterId) && beforeId > 0 && afterId > 0) {
                    data.precedences.push({ beforeId, afterId });
                }
            });

            // Actualizar parámetro NumberResources
            data.parameters[0].Value = data.resources.length;

            console.log('📋 Collected manual data:', data);
            return data;
        } catch (error) {
            console.error('❌ Error collecting manual data:', error);
            return null;
        }
    }

    validateManualData(data) {
        console.log('🔍 Validating manual data:', data);
        
        const errors = [];

        // Validaciones básicas
        if (!data.tasks || data.tasks.length === 0) {
            errors.push('Debe ingresar al menos una tarea válida');
        }

        if (!data.resources || data.resources.length === 0) {
            errors.push('Debe ingresar al menos un recurso válido');
        }

        if (!data.demands || data.demands.length === 0) {
            errors.push('Debe ingresar al menos una demanda de recurso válida');
        }

        // Solo validar duplicados si tenemos datos
        if (data.tasks && data.tasks.length > 0) {
            const taskIds = data.tasks.map(t => t.id);
            const duplicateTaskIds = taskIds.filter((id, index) => taskIds.indexOf(id) !== index);
            if (duplicateTaskIds.length > 0) {
                errors.push(`IDs de tarea duplicados: ${[...new Set(duplicateTaskIds)].join(', ')}`);
            }
        }

        if (data.resources && data.resources.length > 0) {
            const resourceIds = data.resources.map(r => r.IDresource);
            const duplicateResourceIds = resourceIds.filter((id, index) => resourceIds.indexOf(id) !== index);
            if (duplicateResourceIds.length > 0) {
                errors.push(`IDs de recurso duplicados: ${[...new Set(duplicateResourceIds)].join(', ')}`);
            }
        }

        // Solo validar referencias si tenemos todos los datos necesarios
        if (data.demands && data.demands.length > 0 && 
            data.tasks && data.tasks.length > 0 && 
            data.resources && data.resources.length > 0) {
            
            const taskIds = data.tasks.map(t => t.id);
            const resourceIds = data.resources.map(r => r.IDresource);
            
            data.demands.forEach(demand => {
                if (!taskIds.includes(demand.taskId)) {
                    errors.push(`Demanda referencia tarea inexistente: ${demand.taskId}`);
                }
                if (!resourceIds.includes(demand.resourceId)) {
                    errors.push(`Demanda referencia recurso inexistente: ${demand.resourceId}`);
                }
            });

            if (data.precedences && data.precedences.length > 0) {
                data.precedences.forEach(precedence => {
                    if (!taskIds.includes(precedence.beforeId)) {
                        errors.push(`Precedencia referencia tarea inexistente: ${precedence.beforeId}`);
                    }
                    if (!taskIds.includes(precedence.afterId)) {
                        errors.push(`Precedencia referencia tarea inexistente: ${precedence.afterId}`);
                    }
                    if (precedence.beforeId === precedence.afterId) {
                        errors.push(`Precedencia circular: tarea ${precedence.beforeId} no puede precederse a sí misma`);
                    }
                });
            }
        }

        console.log('⚠️ Validation errors found:', errors);
        return errors;
    }

    // Upload manual data to COS
    async uploadManualDataToCOS() {
        try {
            console.log('☁️ Uploading manual data to COS...');
            
            const response = await fetch('/upload-manual-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: this.data })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('☁️ Manual data uploaded to COS:', result);
            
            if (result.success) {
                this.cosUploadInfo.manual = result.cosInfo;
                this.showSuccess(`Datos manuales convertidos a CSV y subidos a COS (${result.csvFiles.length} archivos)`);
                return result;
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('❌ Error uploading manual data to COS:', error);
            this.showError('Error subiendo datos manuales a COS: ' + error.message);
            throw error;
        }
    }

    // =========================================================================
    // OPTIMIZATION - MEJORADA CON FLUJO COMPLETO
    // =========================================================================

    async optimizeWithServer(useDemo = false) {
        this.showLoading(true);
        
        try {
            const currentMode = this.getCurrentInputMode();
            console.log('🎯 Starting optimization - mode:', currentMode);
            
            // Validar y preparar datos
            if (currentMode === 'manual') {
                const manualData = this.collectManualData();
                if (manualData) {
                    const errors = this.validateManualData(manualData);
                    if (errors.length > 0) {
                        this.showValidationErrors(errors);
                        throw new Error('Errores de validación:\n' + errors.join('\n'));
                    }
                    this.data = manualData;
                    console.log('✅ Manual data validated and updated');
                }
            }
            
            // Validar datos requeridos finales
            if (!this.data.tasks || this.data.tasks.length === 0) {
                throw new Error('No hay datos de tareas cargados');
            }
            if (!this.data.resources || this.data.resources.length === 0) {
                throw new Error('No hay datos de recursos cargados');
            }
            if (!this.data.demands || this.data.demands.length === 0) {
                throw new Error('No hay datos de demandas cargados');
            }

            console.log('📊 Starting optimization with data:', {
                tasks: this.data.tasks.length,
                resources: this.data.resources.length,
                demands: this.data.demands.length,
                precedences: this.data.precedences?.length || 0
            });

            // Elegir endpoint basado en modo demo
            const endpoint = useDemo ? '/optimize-demo' : '/optimize';
            
            // Enviar solicitud de optimización
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    data: this.data,
                    fromManual: currentMode === 'manual',
                    cosInfo: this.cosUploadInfo
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Optimization completed:', result);
                this.displayResults(result.results);
                
                const message = useDemo ? 
                    'Optimización demo completada exitosamente' : 
                    'Optimización con Watson ML completada exitosamente';
                    
                this.showSuccess(message);
                
                if (result.jobId) {
                    console.log('🆔 Watson ML Job ID:', result.jobId);
                }
            } else {
                throw new Error(result.error || 'Unknown error from server');
            }
            
        } catch (error) {
            console.error('❌ Optimization error:', error);
            this.showError('Error en la optimización: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    // =========================================================================
    // COS FILE MANAGEMENT
    // =========================================================================

    async showCOSFiles() {
        try {
            console.log('☁️ Fetching COS files...');
            
            const response = await fetch('/cos-files');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.displayCOSFilesModal(result.files);
            } else {
                throw new Error(result.error || 'Failed to fetch files');
            }
        } catch (error) {
            console.error('❌ Error fetching COS files:', error);
            this.showError('Error obteniendo archivos de COS: ' + error.message);
        }
    }

    displayCOSFilesModal(files) {
        // Create modal HTML
        const modalHtml = `
            <div id="cosFilesModal" class="loading-overlay" style="display: flex; z-index: 10001;">
                <div class="loading-content" style="width: 80%; max-width: 800px; max-height: 80vh; overflow-y: auto;">
                    <h3 style="margin-bottom: 1rem; color: #374151;">
                        <i class="fas fa-cloud"></i> Archivos en IBM Cloud Object Storage
                        <button onclick="closeCOSModal()" style="float: right; background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
                    </h3>
                    
                    <div style="margin-bottom: 1rem;">
                        <strong>Total de archivos:</strong> ${files.length}
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                            <thead>
                                <tr style="background: #f9fafb;">
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb;">Archivo</th>
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb;">Tamaño</th>
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb;">Fecha</th>
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${files.map(file => `
                                    <tr style="border-bottom: 1px solid #f3f4f6;">
                                        <td style="padding: 0.75rem; font-family: monospace;">${file.key}</td>
                                        <td style="padding: 0.75rem;">${this.formatFileSize(file.size)}</td>
                                        <td style="padding: 0.75rem;">${new Date(file.lastModified).toLocaleString()}</td>
                                        <td style="padding: 0.75rem;">
                                            <button onclick="downloadCOSFile('${file.key}')" 
                                                    class="btn btn-secondary" 
                                                    style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
                                                <i class="fas fa-download"></i> Descargar
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div style="margin-top: 1rem; text-align: center;">
                        <button onclick="closeCOSModal()" class="btn btn-secondary">Cerrar</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async downloadCOSFile(fileName) {
        try {
            console.log(`📥 Downloading ${fileName} from COS...`);
            
            const response = await fetch(`/download-cos-file/${encodeURIComponent(fileName)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showSuccess(`Archivo ${fileName} descargado correctamente`);
        } catch (error) {
            console.error('❌ Error downloading file:', error);
            this.showError('Error descargando archivo: ' + error.message);
        }
    }

    // =========================================================================
    // MANUAL INPUT HELPER FUNCTIONS
    // =========================================================================

    populateManualInputs(data) {
        this.clearManualInputs();

        if (data.tasks && data.tasks.length > 0) {
            const tasksContainer = document.getElementById('tasks-container');
            data.tasks.forEach((task, index) => {
                if (index > 0) this.addTaskRow();
                
                const row = tasksContainer.children[index];
                const inputs = row.querySelectorAll('.form-input');
                inputs[0].value = task.id || '';
                inputs[1].value = task.pt || '';
                inputs[2].value = task.smin || 0;
                inputs[3].value = task.emax || 999;
            });
        }

        if (data.resources && data.resources.length > 0) {
            const resourcesContainer = document.getElementById('resources-container');
            data.resources.forEach((resource, index) => {
                if (index > 0) this.addResourceRow();
                
                const row = resourcesContainer.children[index];
                const inputs = row.querySelectorAll('.form-input');
                inputs[0].value = resource.IDresource || resource.id || '';
                inputs[1].value = resource.capacity || '';
            });
        }

        if (data.demands && data.demands.length > 0) {
            const demandsContainer = document.getElementById('demands-container');
            data.demands.forEach((demand, index) => {
                if (index > 0) this.addDemandRow();
                
                const row = demandsContainer.children[index];
                const inputs = row.querySelectorAll('.form-input');
                inputs[0].value = demand.taskId || '';
                inputs[1].value = demand.resourceId || '';
                inputs[2].value = demand.demand || '';
            });
        }

        if (data.precedences && data.precedences.length > 0) {
            const precedencesContainer = document.getElementById('precedences-container');
            data.precedences.forEach((precedence, index) => {
                if (index > 0) this.addPrecedenceRow();
                
                const row = precedencesContainer.children[index];
                const inputs = row.querySelectorAll('.form-input');
                inputs[0].value = precedence.beforeId || '';
                inputs[1].value = precedence.afterId || '';
            });
        }
        
        // Trigger validation after populating
        setTimeout(() => {
            this.checkOptimizationReady();
        }, 100);
    }

    clearManualInputs() {
        const tasksContainer = document.getElementById('tasks-container');
        if (tasksContainer) {
            tasksContainer.innerHTML = `
                <div class="form-row">
                    <input type="number" class="form-input" placeholder="ID" name="task-id">
                    <input type="number" class="form-input" placeholder="Duración (pt)" name="task-pt">
                    <input type="number" class="form-input" placeholder="Inicio Mín" name="task-smin" value="0">
                    <input type="number" class="form-input" placeholder="Fin Máx" name="task-emax" value="999">
                    <div class="row-controls">
                        <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const resourcesContainer = document.getElementById('resources-container');
        if (resourcesContainer) {
            resourcesContainer.innerHTML = `
                <div class="form-row">
                    <input type="number" class="form-input" placeholder="ID Recurso" name="resource-id">
                    <input type="number" class="form-input" placeholder="Capacidad" name="resource-capacity">
                    <div class="row-controls">
                        <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const demandsContainer = document.getElementById('demands-container');
        if (demandsContainer) {
            demandsContainer.innerHTML = `
                <div class="form-row">
                    <input type="number" class="form-input" placeholder="ID Tarea" name="demand-taskid">
                    <input type="number" class="form-input" placeholder="ID Recurso" name="demand-resourceid">
                    <input type="number" class="form-input" placeholder="Demanda" name="demand-demand">
                    <div class="row-controls">
                        <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const precedencesContainer = document.getElementById('precedences-container');
        if (precedencesContainer) {
            precedencesContainer.innerHTML = `
                <div class="form-row">
                    <input type="number" class="form-input" placeholder="Tarea Anterior" name="precedence-before">
                    <input type="number" class="form-input" placeholder="Tarea Posterior" name="precedence-after">
                    <div class="row-controls">
                        <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    addTaskRow() {
        const container = document.getElementById('tasks-container');
        if (!container) return;
        
        const newRow = document.createElement('div');
        newRow.className = 'form-row';
        newRow.innerHTML = `
            <input type="number" class="form-input" placeholder="ID" name="task-id">
            <input type="number" class="form-input" placeholder="Duración (pt)" name="task-pt">
            <input type="number" class="form-input" placeholder="Inicio Mín" name="task-smin" value="0">
            <input type="number" class="form-input" placeholder="Fin Máx" name="task-emax" value="999">
            <div class="row-controls">
                <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(newRow);
    }

    addResourceRow() {
        const container = document.getElementById('resources-container');
        if (!container) return;
        
        const newRow = document.createElement('div');
        newRow.className = 'form-row';
        newRow.innerHTML = `
            <input type="number" class="form-input" placeholder="ID Recurso" name="resource-id">
            <input type="number" class="form-input" placeholder="Capacidad" name="resource-capacity">
            <div class="row-controls">
                <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(newRow);
    }

    addDemandRow() {
        const container = document.getElementById('demands-container');
        if (!container) return;
        
        const newRow = document.createElement('div');
        newRow.className = 'form-row';
        newRow.innerHTML = `
            <input type="number" class="form-input" placeholder="ID Tarea" name="demand-taskid">
            <input type="number" class="form-input" placeholder="ID Recurso" name="demand-resourceid">
            <input type="number" class="form-input" placeholder="Demanda" name="demand-demand">
            <div class="row-controls">
                <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(newRow);
    }

    addPrecedenceRow() {
        const container = document.getElementById('precedences-container');
        if (!container) return;
        
        const newRow = document.createElement('div');
        newRow.className = 'form-row';
        newRow.innerHTML = `
            <input type="number" class="form-input" placeholder="Tarea Anterior" name="precedence-before">
            <input type="number" class="form-input" placeholder="Tarea Posterior" name="precedence-after">
            <div class="row-controls">
                <button type="button" class="remove-row-btn" onclick="taskOptimizer.removeRow(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(newRow);
    }

    removeRow(button) {
        const row = button.closest('.form-row');
        const container = row.parentNode;
        
        if (container.children.length > 1) {
            row.remove();
        } else {
            const inputs = row.querySelectorAll('.form-input');
            inputs.forEach(input => {
                if (input.name.includes('smin')) {
                    input.value = '0';
                } else if (input.name.includes('emax')) {
                    input.value = '999';
                } else {
                    input.value = '';
                }
            });
        }
        
        // Trigger validation after removing row
        setTimeout(() => {
            this.checkOptimizationReady();
        }, 100);
    }

    // =========================================================================
    // DATA PREVIEW
    // =========================================================================

    loadDataPreview() {
        try {
            const currentMode = this.getCurrentInputMode();
            
            if (currentMode === 'manual') {
                const manualData = this.collectManualData();
                if (manualData) {
                    const errors = this.validateManualData(manualData);
                    if (errors.length > 0) {
                        this.showValidationErrors(errors);
                        throw new Error('Errores de validación encontrados');
                    }
                    this.data = manualData;
                    this.clearValidationErrors();
                }
            }

            this.populatePreviewTables();
            document.getElementById('previewSection').style.display = 'block';
            this.showSuccess('Vista previa de datos cargada correctamente');
        } catch (error) {
            this.showError('Error al cargar vista previa: ' + error.message);
        }
    }

    populatePreviewTables() {
        if (this.data.tasks) {
            this.populateTable('tasksTable', this.data.tasks, ['id', 'pt', 'smin', 'emax']);
        }

        if (this.data.resources) {
            this.populateTable('resourcesTable', this.data.resources, ['IDresource', 'capacity']);
        }

        if (this.data.demands) {
            this.populateTable('demandsTable', this.data.demands, ['taskId', 'resourceId', 'demand']);
        }

        if (this.data.precedences) {
            this.populateTable('precedencesTable', this.data.precedences, ['beforeId', 'afterId']);
        }
    }

    populateTable(tableId, data, columns) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        tbody.innerHTML = '';

        data.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
                const td = document.createElement('td');
                td.textContent = row[col] || '';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }
    async loadSampleData() {
        try {
            const response = await fetch('/sample-data');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const sampleData = await response.json();
            console.log('📦 Sample data received:', sampleData);
            
            // Load sample data into the application
            this.data = sampleData;
            
            // IMPORTANTE: También actualizar csvFiles para que la optimización use estos datos
            this.csvFiles = {
                parameters: sampleData.parameters,
                tasks: sampleData.tasks,
                resources: sampleData.resources,
                demands: sampleData.demands,
                precedences: sampleData.precedences
            };
            
            console.log('✅ Sample data loaded into both this.data and this.csvFiles');
            
            // Check current input mode and populate accordingly
            const currentMode = this.getCurrentInputMode();
            
            if (currentMode === 'manual') {
                // Populate manual input forms
                this.populateManualInputs(sampleData);
                this.showSuccess('Datos de ejemplo cargados en formularios manuales');
            } else {
                // Update CSV file status indicators
                this.updateFileStatus('parameters', 'sample_parameters.csv', true);
                this.updateFileStatus('tasks', 'sample_tasks.csv', true);
                this.updateFileStatus('resources', 'sample_resources.csv', true);
                this.updateFileStatus('demands', 'sample_demands.csv', true);
                this.updateFileStatus('precedences', 'sample_precedences.csv', true);
                this.showSuccess('Datos de ejemplo cargados correctamente');
            }
            
            this.checkOptimizationReady();
            
        } catch (error) {
            console.error('❌ Error loading sample data:', error);
            this.showError('Error cargando datos de ejemplo: ' + error.message);
        }
    }

    // =========================================================================
    // RESULTS DISPLAY
    // =========================================================================

    displayResults(results) {
        try {
            console.log('📊 Displaying results:', results);
            
            // DEBUGGING: Verificar qué está llegando
            console.log('🔍 results.solutionSummary:', results.solutionSummary);
            console.log('🔍 Type of solutionSummary:', typeof results.solutionSummary);
            console.log('🔍 Is array?', Array.isArray(results.solutionSummary));
            if (results.solutionSummary && results.solutionSummary.length > 0) {
                console.log('🔍 First element:', results.solutionSummary[0]);
            }
            
            this.updateSolutionSummary(results.solutionSummary);
            this.createScheduleTable(results.taskSchedule);
            this.createGanttChart(results.taskSchedule);
            this.createResourceChart(results.resourceUsage);
            
            document.getElementById('resultsSection').style.display = 'block';
            
            // Scroll to results
            document.getElementById('resultsSection').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
        } catch (error) {
            console.error('❌ Error displaying results:', error);
            this.showError('Error al mostrar resultados: ' + error.message);
        }
    }

    updateSolutionSummary(solutionData) {
        console.log('📋 Updating solution summary:', solutionData);

        // Helper to clean value (removes quotes if present)
        const cleanValue = (val) => {
            if (typeof val === 'string') {
                val = val.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
                // Try to convert to number if possible
                const num = Number(val);
                if (!isNaN(num)) return num;
                return val;
            }
            return val;
        };

        // Helper to format numbers: remove .0 for integers
        const formatNumber = (val) => {
            if (typeof val === 'number' && Number.isFinite(val)) {
                return Number.isInteger(val) ? val : val;
            }
            return val;
        };

        if (Array.isArray(solutionData) && solutionData.length > 0) {
            const solution = solutionData[0];
            console.log('📋 Solution object:', solution);
            console.log('📋 Solution keys:', Object.keys(solution));

            // Las keys tienen comillas, así que las accedemos con comillas
            let makespan = cleanValue(solution['"Makespan"'] || solution['Makespan'] || solution.makespan || '--');
            let totalTasks = cleanValue(solution['"TotalTasks"'] || solution['TotalTasks'] || solution.totalTasks || '--');
            let totalResources = cleanValue(solution['"TotalResources"'] || solution['TotalResources'] || solution.totalResources || '--');
            let status = cleanValue(solution['"Status"'] || solution['Status'] || solution.status || '--');

            // Formatear números: sacar .0 si es entero
            makespan = formatNumber(makespan);
            totalTasks = formatNumber(totalTasks);
            totalResources = formatNumber(totalResources);

            console.log('📋 Values extracted:', { makespan, totalTasks, totalResources, status });

            // Actualizar DOM
            document.getElementById('makespanValue').textContent = makespan;
            document.getElementById('totalTasksValue').textContent = totalTasks;
            document.getElementById('totalResourcesValue').textContent = totalResources;
            document.getElementById('statusValue').textContent = status;

            console.log('✅ All values updated successfully!');

        } else {
            console.warn('⚠️ solutionData is not a valid array or is empty:', solutionData);
            document.getElementById('makespanValue').textContent = '--';
            document.getElementById('totalTasksValue').textContent = '--';
            document.getElementById('totalResourcesValue').textContent = '--';
            document.getElementById('statusValue').textContent = '--';
        }
    }

    // Tabla de programacion detallada
    createScheduleTable(scheduleData) {
        console.log('📅 Creating schedule table with data:', scheduleData);
        
        const tbody = document.querySelector('#scheduleTable tbody');
        if (!tbody) {
            console.error('❌ Table tbody not found');
            return;
        }
        
        tbody.innerHTML = '';

        if (!Array.isArray(scheduleData) || scheduleData.length === 0) {
            console.warn('⚠️ No schedule data available');
            return;
        }

        // Helper to format numbers: remove .0 for integers
        const formatNumber = (val) => {
            if (typeof val === 'string' && val.trim() !== '') {
                const num = Number(val);
                if (!isNaN(num)) val = num;
            }
            if (typeof val === 'number' && Number.isFinite(val)) {
                return Number.isInteger(val) ? val : val;
            }
            return val;
        };

        scheduleData.forEach((task, index) => {
            // Helper function to get task value with different key variations
            const getTaskValue = (key) => {
                const variations = [
                    key,                    // TaskID
                    `"${key}"`,            // "TaskID"
                    key.toLowerCase(),      // taskid
                    key.charAt(0).toLowerCase() + key.slice(1)  // taskID
                ];
                
                for (const variation of variations) {
                    if (task[variation] !== undefined && task[variation] !== null) {
                        let value = task[variation];
                        // Clean quotes if it's a string
                        if (typeof value === 'string') {
                            value = value.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
                        }
                        return value;
                    }
                }
                return null;
            };

            // Extract values using the helper function
            let taskId = getTaskValue('TaskID') || (index + 1);
            let startTime = getTaskValue('StartTime') || 0;
            let endTime = getTaskValue('EndTime') || 0;
            let duration = getTaskValue('Duration') || 1;

            // Format numbers: remove .0 for integers
            taskId = formatNumber(taskId);
            startTime = formatNumber(startTime);
            endTime = formatNumber(endTime);
            duration = formatNumber(duration);

            // If float but integer, show as integer (remove .0)
            const display = (val) => (typeof val === 'number' && Number.isInteger(val)) ? val : val;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>Tarea ${display(taskId)}</td>
                <td>${display(startTime)}</td>
                <td>${display(endTime)}</td>
                <td>${display(duration)}</td>
                <td>
                    <div style="background: #e5e7eb; height: 18px; position: relative; width: 100%; min-width: 120px;">
                        <div style="
                            position: absolute;
                            left: ${(startTime || 0) * 3}px;
                            width: ${(duration || 1) * 3}px;
                            height: 100%;
                            background: ${this.getTaskColor(taskId)};
                            border-radius: 4px;
                            ">
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        console.log('✅ Schedule table created successfully');
    }

    // Diagrama de Gantt
    createGanttChart(scheduleData) {
        console.log('📊 Creating REAL Gantt chart with data:', scheduleData);

        const ctx = document.getElementById('ganttChart').getContext('2d');

        if (this.charts.gantt) {
            this.charts.gantt.destroy();
        }

        // Helper function to get task value
        const getTaskValue = (task, key) => {
            const variations = [key, `"${key}"`, key.toLowerCase(), key.charAt(0).toLowerCase() + key.slice(1)];
            for (const variation of variations) {
                if (task[variation] !== undefined && task[variation] !== null) {
                    let value = task[variation];
                    if (typeof value === 'string') {
                        value = value.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
                        // Convert to number if possible
                        const num = parseFloat(value);
                        return !isNaN(num) ? num : value;
                    }
                    return value;
                }
            }
            return null;
        };

        // Process data for Gantt chart
        const ganttData = scheduleData.map((task, index) => {
            const taskId = getTaskValue(task, 'TaskID') || (index + 1);
            const startTime = getTaskValue(task, 'StartTime') || 0;
            const endTime = getTaskValue(task, 'EndTime');
            const duration = getTaskValue(task, 'Duration') || 1;
            const calculatedEndTime = endTime || (startTime + duration);
            return {
                taskId: taskId,
                taskName: `${taskId}`,
                startTime: startTime,
                endTime: calculatedEndTime,
                duration: calculatedEndTime - startTime
            };
        });

        console.log('📊 Processed Gantt data:', ganttData);

        // Create labels with only task IDs for y-axis (one per row)
        const labels = ganttData.map(item => item.taskName);

        // Create datasets - each task gets two bars: invisible spacer + visible task bar
        const datasets = [
            {
                label: 'Inicio (invisible)',
                data: ganttData.map(item => item.startTime),
                backgroundColor: 'rgba(0,0,0,0)', // Transparent
                borderColor: 'rgba(0,0,0,0)',     // Transparent
                borderWidth: 0,
                barPercentage: 0.8,
                categoryPercentage: 0.9,
            },
            {
                label: 'Duración',
                data: ganttData.map(item => item.duration),
                backgroundColor: ganttData.map((item, index) => this.getTaskColor(item.taskId)),
                borderColor: ganttData.map((item, index) => this.getTaskColorDark(item.taskId)),
                borderWidth: 1,
                barPercentage: 0.8,
                categoryPercentage: 0.9,
            }
        ];

        this.charts.gantt = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                indexAxis: 'y', // Horizontal bars
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Diagrama de Gantt - Programación de Tareas',
                        font: { size: 16 }
                    },
                    legend: {
                        display: false // Hide legend since we have invisible bars
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const index = context[0].dataIndex;
                                return `Tarea ${ganttData[index].taskName}`;
                            },
                            label: function(context) {
                                const index = context.dataIndex;
                                const task = ganttData[index];
                                if (context.datasetIndex === 1) { // Only show tooltip for visible bars
                                    return [
                                        `Inicio: ${task.startTime}`,
                                        `Fin: ${task.endTime}`,
                                        `Duración: ${task.duration}`
                                    ];
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Tiempo'
                        },
                        beginAtZero: true
                    },
                    y: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Tareas'
                        },
                        ticks: {
                            display: false // Hide y-axis labels (task IDs/numbers)
                        },
                        grid: {
                            display: false // Optionally hide grid lines
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        console.log('✅ Real Gantt chart created successfully');
    }

    // Helper method for darker colors
    getTaskColorDark(taskId) {
        const darkColors = [
            '#1E40AF', '#B91C1C', '#047857', '#B45309', '#6D28D9',
            '#BE185D', '#0E7490', '#4D7C0F', '#C2410C', '#3730A3'
        ];
        
        const index = typeof taskId === 'string' ? 
            taskId.replace(/\D/g, '') % darkColors.length : 
            taskId % darkColors.length;
        
        return darkColors[index] || darkColors[0];
    }

    //tabla de recursos
    // Utiliza la misma lógica que las tareas, pero con datos de recursos
    createResourceChart(resourceData) {
        console.log('📈 Creating resource chart with data:', resourceData);

        const ctx = document.getElementById('resourceChart').getContext('2d');

        if (this.charts.resource) {
            this.charts.resource.destroy();
        }

        // Helper function to get resource value (same logic as tasks)
        const getResourceValue = (resource, key) => {
            const variations = [
                key,                    // ResourceID
                `"${key}"`,            // "ResourceID"
                key.toLowerCase(),      // resourceid
                key.charAt(0).toLowerCase() + key.slice(1)  // resourceID
            ];

            for (const variation of variations) {
                if (resource[variation] !== undefined && resource[variation] !== null) {
                    let value = resource[variation];
                    // Clean quotes if it's a string
                    if (typeof value === 'string') {
                        value = value.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
                    }
                    // Remove .0 for integers
                    if (!isNaN(value) && Number(value) % 1 === 0) {
                        value = Number(value);
                    }
                    return value;
                }
            }
            return null;
        };

        // Helper to format numbers: remove .0 for integers
        const formatNumber = (val) => {
            if (typeof val === 'string' && val.trim() !== '') {
                const num = Number(val);
                if (!isNaN(num)) val = num;
            }
            if (typeof val === 'number' && Number.isFinite(val)) {
                return Number.isInteger(val) ? val : val;
            }
            return val;
        };

        // Agrupar por resourceId único
        const resourceMap = new Map();
        resourceData.forEach(r => {
            const resourceId = getResourceValue(r, 'ResourceID') ?? getResourceValue(r, 'IDresource');
            if (resourceId !== null && !resourceMap.has(resourceId)) {
                resourceMap.set(resourceId, r);
            }
        });

        // Ordenar por resourceId numérico ascendente
        const sortedResourceIds = Array.from(resourceMap.keys()).sort((a, b) => Number(a) - Number(b));
        const uniqueResources = sortedResourceIds.map(id => resourceMap.get(id));

        const labels = sortedResourceIds.map(id => `Recurso ${formatNumber(id)}`);

        const capacityData = uniqueResources.map(r => {
            return formatNumber(getResourceValue(r, 'Capacity') ?? getResourceValue(r, 'capacity') ?? 0);
        });

        const usageData = uniqueResources.map(r => {
            return formatNumber(
                getResourceValue(r, 'MaxUsage') ??
                getResourceValue(r, 'Usage') ??
                getResourceValue(r, 'maxUsage') ??
                getResourceValue(r, 'usage') ??
                0
            );
        });

        console.log('📊 Chart data prepared:', { labels, capacityData, usageData });

        this.charts.resource = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Capacidad',
                        data: capacityData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Uso Máximo',
                        data: usageData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Utilización de Recursos'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Cantidad'
                        }
                    }
                }
            }
        });

        console.log('✅ Resource chart created successfully');
    }

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    getTaskColor(index) {
        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
            '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
        ];
        return colors[index % colors.length];
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    showLoading(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    showSuccess(message) {
        console.log('✅ Success:', message);
        this.showToast(message, 'success');
    }

    showError(message) {
        console.error('❌ Error:', message);
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 350px;
            word-wrap: break-word;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;

        if (type === 'success') {
            toast.style.backgroundColor = '#10b981';
        } else if (type === 'error') {
            toast.style.backgroundColor = '#ef4444';
        } else {
            toast.style.backgroundColor = '#6b7280';
        }

        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);

        toast.addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        });
    }

    clearAll() {
        // Clear file inputs
        document.querySelectorAll('.file-input').forEach(input => {
            input.value = '';
        });

        // Clear manual inputs
        this.clearManualInputs();

        // Clear data and COS info
        Object.assign(this.data, {
            parameters: [],
            tasks: [],
            resources: [],
            demands: [],
            precedences: []
        });

        // Clear validation errors
        this.clearValidationErrors();

        // Reset file status
        document.querySelectorAll('.upload-group').forEach(group => {
            group.classList.remove('has-file');
        });

        // Reset info elements
        const infoElements = [
            'parametersInfo', 'tasksInfo', 'resourcesInfo', 
            'demandsInfo', 'precedencesInfo'
        ];
        
        const infoTexts = [
            '<small>Formato: Parameter, Value</small>',
            '<small>Formato: id, pt, smin, emax</small>',
            '<small>Formato: IDresource, capacity</small>',
            '<small>Formato: taskId, resourceId, demand</small>',
            '<small>Formato: beforeId, afterId</small>'
        ];

        infoElements.forEach((id, index) => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = infoTexts[index];
            }
        });

        // Hide sections
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'none';

        // Disable buttons
        document.getElementById('optimizeBtn').disabled = true;
        document.getElementById('loadDataBtn').disabled = true;

        // Destroy charts
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};

        // Restore demo button if it was replaced
        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            // Create the original sampleDataBtn
            const sampleBtn = document.createElement('button');
            sampleBtn.id = 'sampleDataBtn';
            sampleBtn.className = 'btn btn-secondary';
            sampleBtn.innerHTML = '<i class="fas fa-database"></i> Cargar Datos de Ejemplo';
            sampleBtn.disabled = false;
            
            // Agregar el event listener CORRECTO para cargar datos de ejemplo
            sampleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // PRIMERO: Cargar los datos de ejemplo
                this.loadSampleData(); // Asegúrate de que este método existe y carga los datos
                
                // SEGUNDO: Crear y mostrar el botón de optimizar demo
                const newDemoBtn = document.createElement('button');
                newDemoBtn.id = 'demoBtn';
                newDemoBtn.className = 'btn btn-primary';
                newDemoBtn.innerHTML = '<i class="fas fa-rocket"></i> Optimizar Demo';
                newDemoBtn.disabled = false;
                newDemoBtn.addEventListener('click', () => window.taskOptimizer.optimizeDemo());

                // TERCERO: Reemplazar el botón
                sampleBtn.parentNode.replaceChild(newDemoBtn, sampleBtn);
                
                // NO llamar optimizeDemo() aquí - eso debe hacerlo el usuario al hacer click en "Optimizar Demo"
            });
            
            demoBtn.parentNode.replaceChild(sampleBtn, demoBtn);
        }

        // Re-check if optimization is ready (reenable buttons if CSV files are present)
        this.checkOptimizationReady();

        this.showSuccess('Datos y archivos limpiados correctamente');
    }

    // =========================================================================
    // DEMO FUNCTIONS
    // =========================================================================

    async optimizeDemo() {
        return this.optimizeWithServer(true);
    }
}

// =========================================================================
// GLOBAL FUNCTIONS (for HTML onclick handlers)
// =========================================================================

function addTaskRow() {
    if (window.taskOptimizer) {
        window.taskOptimizer.addTaskRow();
    }
}

function addResourceRow() {
    if (window.taskOptimizer) {
        window.taskOptimizer.addResourceRow();
    }
}

function addDemandRow() {
    if (window.taskOptimizer) {
        window.taskOptimizer.addDemandRow();
    }
}

function addPrecedenceRow() {
    if (window.taskOptimizer) {
        window.taskOptimizer.addPrecedenceRow();
    }
}

function removeRow(button) {
    if (window.taskOptimizer) {
        window.taskOptimizer.removeRow(button);
    }
}

function collectManualData() {
    if (window.taskOptimizer) {
        return window.taskOptimizer.collectManualData();
    }
    return null;
}

function validateManualData(data) {
    if (window.taskOptimizer) {
        return window.taskOptimizer.validateManualData(data);
    }
    return [];
}

function populateManualInputs(data) {
    if (window.taskOptimizer) {
        window.taskOptimizer.populateManualInputs(data);
    }
}

function clearManualInputs() {
    if (window.taskOptimizer) {
        window.taskOptimizer.clearManualInputs();
    }
}

function getCurrentInputMode() {
    if (window.taskOptimizer) {
        return window.taskOptimizer.getCurrentInputMode();
    }
    return 'csv';
}

// COS-specific global functions
function closeCOSModal() {
    const modal = document.getElementById('cosFilesModal');
    if (modal) {
        modal.remove();
    }
}

function downloadCOSFile(fileName) {
    if (window.taskOptimizer) {
        window.taskOptimizer.downloadCOSFile(fileName);
    }
}

// =========================================================================
// ENHANCED INITIALIZATION
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    window.taskOptimizer = new TaskOptimizer();

    // Helper function to disable optimize button
    const disableOptimizeBtn = () => {
        const optimizeBtn = document.getElementById('optimizeBtn');
        if (optimizeBtn) {
            optimizeBtn.disabled = true;
        }
    };

    // Cuando se hace click en sampleDataBtn, reemplaza el botón por demoBtn y ejecuta optimizeDemo
    const sampleBtn = document.getElementById('sampleDataBtn');
    if (sampleBtn) {
        sampleBtn.addEventListener('click', (e) => {
            e.preventDefault();

            // Crear demoBtn
            const demoBtn = document.createElement('button');
            demoBtn.id = 'demoBtn';
            demoBtn.className = 'btn btn-primary';
            demoBtn.innerHTML = '<i class="fas fa-rocket"></i> Optimizar Demo';
            demoBtn.disabled = false;
            demoBtn.addEventListener('click', () => {
                // Deshabilitar el botón de Optimizar CSV Seleccionados
                disableOptimizeBtn();
                
                // Ejecutar la demo
                window.taskOptimizer.optimizeDemo();
                
                // Asegurarse de que el botón sigue deshabilitado después de la demo
                setTimeout(() => {
                    disableOptimizeBtn();
                }, 100);
            });

            // Reemplazar sampleBtn por demoBtn
            sampleBtn.parentNode.replaceChild(demoBtn, sampleBtn);

            // Deshabilitar el botón de Optimizar CSV Seleccionados al cargar demo
            disableOptimizeBtn();

            // Ejecutar la demo inicialmente
            window.taskOptimizer.optimizeDemo();
            
            // Asegurarse de que el botón sigue deshabilitado después de la primera ejecución
            setTimeout(() => {
                disableOptimizeBtn();
            }, 100);
        });
    }

    console.log('🚀 Task Optimizer initialized successfully');
});
