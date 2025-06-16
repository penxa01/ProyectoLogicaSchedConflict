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

    // =========================================================================
    // SAMPLE DATA (with COS upload)
    // =========================================================================

    async loadSampleData() {
        try {
            const response = await fetch('/sample-data');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const sampleData = await response.json();
            
            // Load sample data into the application
            this.data = sampleData;
            
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
            this.showError('Error cargando datos de ejemplo: ' + error.message);
        }
    }

    // =========================================================================
    // RESULTS DISPLAY
    // =========================================================================

    displayResults(results) {
        try {
            console.log('📊 Displaying results:', results);
            
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
        if (solutionData && solutionData.length > 0) {
            const solution = solutionData[0];
            document.getElementById('makespanValue').textContent = solution.Makespan || '--';
            document.getElementById('totalTasksValue').textContent = solution.TotalTasks || '--';
            document.getElementById('totalResourcesValue').textContent = solution.TotalResources || '--';
            document.getElementById('statusValue').textContent = solution.Status || '--';
        }
    }

    createScheduleTable(scheduleData) {
        const tbody = document.querySelector('#scheduleTable tbody');
        tbody.innerHTML = '';

        scheduleData.forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>Tarea ${task.TaskID}</td>
                <td>${task.StartTime}</td>
                <td>${task.EndTime}</td>
                <td>${task.Duration}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    createGanttChart(scheduleData) {
        const ctx = document.getElementById('ganttChart').getContext('2d');
        
        if (this.charts.gantt) {
            this.charts.gantt.destroy();
        }

        this.charts.gantt = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: scheduleData.map(task => `Tarea ${task.TaskID}`),
                datasets: [{
                    label: 'Duración',
                    data: scheduleData.map(task => ({
                        x: task.StartTime,
                        y: `Tarea ${task.TaskID}`,
                        width: task.Duration
                    })),
                    backgroundColor: scheduleData.map((_, index) => this.getTaskColor(index)),
                    borderColor: scheduleData.map((_, index) => this.getTaskColor(index)),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Diagrama de Gantt - Programación de Tareas'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tiempo'
                        }
                    }
                }
            }
        });
    }

    createResourceChart(resourceData) {
        const ctx = document.getElementById('resourceChart').getContext('2d');
        
        if (this.charts.resource) {
            this.charts.resource.destroy();
        }

        const labels = resourceData.map(r => `Recurso ${r.ResourceID}`);
        const capacityData = resourceData.map(r => r.Capacity);
        const usageData = resourceData.map(r => r.MaxUsage);

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
        Object.keys(this.data).forEach(key => {
            this.data[key] = null;
        });
        this.cosUploadInfo = {};

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
    
    // Add demo button functionality
    const addDemoButton = () => {
        const actionButtons = document.querySelector('.action-buttons');
        if (actionButtons && !document.getElementById('demoBtn')) {
            const demoBtn = document.createElement('button');
            demoBtn.id = 'demoBtn';
            demoBtn.className = 'btn btn-secondary';
            demoBtn.innerHTML = '<i class="fas fa-play"></i> Demo';
            demoBtn.addEventListener('click', () => window.taskOptimizer.optimizeDemo());
            
            // Insert before the optimize button
            const optimizeBtn = document.getElementById('optimizeBtn');
            if (optimizeBtn) {
                actionButtons.insertBefore(demoBtn, optimizeBtn);
            } else {
                actionButtons.appendChild(demoBtn);
            }
        }
    };
    
    // Add demo button after a short delay to ensure DOM is ready
    setTimeout(addDemoButton, 100);
    
    console.log('🚀 Task Optimizer initialized successfully');
});