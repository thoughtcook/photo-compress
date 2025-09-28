class PhotoCompress {
    constructor() {
        this.images = new Map();
        this.worker = null;
        this.processingQueue = [];
        this.isProcessing = false;

        this.initializeElements();
        this.bindEvents();
        this.initializeWorker();
    }

    initializeElements() {
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.controls = document.getElementById('controls');
        this.qualitySlider = document.getElementById('quality');
        this.qualityValue = document.getElementById('qualityValue');
        this.maxWidthInput = document.getElementById('maxWidth');
        this.maxHeightInput = document.getElementById('maxHeight');
        this.formatSelect = document.getElementById('format');
        this.compressBtn = document.getElementById('compressBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.progress = document.getElementById('progress');
        this.progressBar = document.getElementById('progressBar');
        this.status = document.getElementById('status');
        this.imagesGrid = document.getElementById('imagesGrid');
    }

    bindEvents() {
        // File upload events
        this.uploadZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Drag and drop events
        this.uploadZone.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadZone.addEventListener('drop', this.handleDrop.bind(this));

        // Control events
        this.qualitySlider.addEventListener('input', this.updateQualityDisplay.bind(this));
        this.compressBtn.addEventListener('click', this.compressAllImages.bind(this));
        this.downloadAllBtn.addEventListener('click', this.downloadAllAsZip.bind(this));
        this.resetBtn.addEventListener('click', this.reset.bind(this));

        // Real-time preview updates
        this.qualitySlider.addEventListener('input', this.debounce(this.updatePreviews.bind(this), 300));
        this.maxWidthInput.addEventListener('input', this.debounce(this.updatePreviews.bind(this), 300));
        this.maxHeightInput.addEventListener('input', this.debounce(this.updatePreviews.bind(this), 300));
        this.formatSelect.addEventListener('change', this.updatePreviews.bind(this));
    }

    initializeWorker() {
        this.worker = new Worker('worker.js');
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = (error) => {
            console.error('Worker error:', error);
            this.showStatus('Worker error occurred', 'error');
        };
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadZone.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadZone.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        this.handleFiles(files);
    }

    async handleFiles(files) {
        if (files.length === 0) return;

        this.showStatus(`Loading ${files.length} image(s)...`, 'processing');

        for (const file of files) {
            if (file.size > 50 * 1024 * 1024) { // 50MB limit
                this.showStatus(`File ${file.name} is too large (max 50MB)`, 'error');
                continue;
            }

            try {
                const imageData = await this.processImageFile(file);
                this.images.set(imageData.id, imageData);
                this.addImageToGrid(imageData);
            } catch (error) {
                console.error('Error processing file:', error);
                this.showStatus(`Error loading ${file.name}: ${error.message}`, 'error');
            }
        }

        this.updateUI();
        this.hideStatus();
    }

    async processImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const img = new Image();

                    img.onload = () => {
                        const imageData = {
                            id: Date.now() + Math.random(),
                            name: file.name,
                            originalBlob: file,
                            originalData: arrayBuffer,
                            originalSize: file.size,
                            originalDimensions: { width: img.width, height: img.height },
                            compressedBlob: null,
                            compressedSize: null,
                            compressedDimensions: null,
                            compressionRatio: null,
                            processed: false
                        };
                        resolve(imageData);
                    };

                    img.onerror = () => reject(new Error('Invalid image file'));
                    img.src = URL.createObjectURL(file);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    addImageToGrid(imageData) {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.id = `image-${imageData.id}`;

        const originalUrl = URL.createObjectURL(imageData.originalBlob);

        card.innerHTML = `
            <div class="image-preview">
                <div class="image-comparison">
                    <div>
                        <img src="${originalUrl}" alt="Original" title="Original">
                        <div class="image-info">Original</div>
                    </div>
                    <div>
                        <img src="${originalUrl}" alt="Compressed" title="Compressed" class="compressed-preview">
                        <div class="image-info">Compressed</div>
                    </div>
                </div>
            </div>

            <div class="image-stats">
                <div class="stat">
                    <div class="stat-label">Original</div>
                    <div class="stat-value original-size">${this.formatFileSize(imageData.originalSize)}</div>
                    <div class="stat-value original-dimensions">${imageData.originalDimensions.width}×${imageData.originalDimensions.height}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Compressed</div>
                    <div class="stat-value compressed-size">-</div>
                    <div class="stat-value compressed-dimensions">-</div>
                </div>
            </div>

            <div class="compression-ratio-container">
                <span class="compression-ratio hidden">-</span>
            </div>

            <div class="action-buttons" style="margin-top: 1rem;">
                <button class="btn btn-primary btn-sm download-single" disabled>
                    💾 Download
                </button>
                <button class="btn btn-secondary btn-sm remove-image">
                    🗑️ Remove
                </button>
            </div>
        `;

        // Bind events
        const downloadBtn = card.querySelector('.download-single');
        const removeBtn = card.querySelector('.remove-image');

        downloadBtn.addEventListener('click', () => this.downloadSingleImage(imageData.id));
        removeBtn.addEventListener('click', () => this.removeImage(imageData.id));

        this.imagesGrid.appendChild(card);
    }

    updateUI() {
        const hasImages = this.images.size > 0;
        this.controls.classList.toggle('active', hasImages);
        this.compressBtn.disabled = !hasImages;

        const hasCompressedImages = Array.from(this.images.values()).some(img => img.processed);
        this.downloadAllBtn.disabled = !hasCompressedImages;
    }

    updateQualityDisplay() {
        const quality = Math.round(this.qualitySlider.value * 100);
        this.qualityValue.textContent = `${quality}%`;
    }

    async updatePreviews() {
        if (this.images.size === 0) return;

        // Only update previews if not currently processing
        if (!this.isProcessing) {
            this.compressAllImages(true); // true for preview mode
        }
    }

    async compressAllImages(previewMode = false) {
        if (this.isProcessing) return;

        this.isProcessing = true;
        const images = Array.from(this.images.values());

        if (!previewMode) {
            this.showProgress(0);
            this.showStatus('Compressing images...', 'processing');
            this.compressBtn.disabled = true;
        }

        let completed = 0;
        const total = images.length;

        // Process all images concurrently
        const promises = images.map(imageData => {
            return new Promise((resolve, reject) => {
                const options = {
                    quality: parseFloat(this.qualitySlider.value),
                    maxWidth: parseInt(this.maxWidthInput.value),
                    maxHeight: parseInt(this.maxHeightInput.value),
                    format: this.formatSelect.value
                };

                // Create a unique callback for this image
                const messageHandler = (e) => {
                    if (e.data.id === imageData.id) {
                        this.worker.removeEventListener('message', messageHandler);

                        if (e.data.error) {
                            reject(new Error(e.data.error));
                        } else {
                            completed++;
                            if (!previewMode) {
                                this.updateProgress((completed / total) * 100);
                            }
                            resolve(e.data);
                        }
                    }
                };

                this.worker.addEventListener('message', messageHandler);

                this.worker.postMessage({
                    imageData: imageData.originalData,
                    options,
                    id: imageData.id
                });
            });
        });

        try {
            await Promise.all(promises);

            this.isProcessing = false;

            if (!previewMode) {
                this.hideProgress();
                this.showStatus(`Successfully compressed ${total} image(s)`, 'complete');
                this.compressBtn.disabled = false;
                setTimeout(() => this.hideStatus(), 3000);
            }

            this.updateUI();
        } catch (error) {
            this.isProcessing = false;
            this.compressBtn.disabled = false;
            this.hideProgress();
            this.showStatus(`Compression error: ${error.message}`, 'error');
            console.error('Compression error:', error);
        }
    }

    handleWorkerMessage(e) {
        const { id, compressedData, error, originalSize, compressedSize, dimensions, originalDimensions, format } = e.data;

        if (error) {
            console.error('Compression error:', error);
            this.showStatus(`Compression error: ${error}`, 'error');
            return;
        }

        const imageData = this.images.get(id);
        if (!imageData) return;

        // Create compressed blob
        const blob = new Blob([compressedData], { type: `image/${format}` });

        // Update image data
        imageData.compressedBlob = blob;
        imageData.compressedSize = compressedSize;
        imageData.compressedDimensions = dimensions;
        imageData.compressionRatio = ((originalSize - compressedSize) / originalSize * 100);
        imageData.processed = true;

        this.updateImageCard(imageData);
    }

    updateImageCard(imageData) {
        const card = document.getElementById(`image-${imageData.id}`);
        if (!card) return;

        // Update compressed preview
        const compressedImg = card.querySelector('.compressed-preview');
        if (imageData.compressedBlob) {
            const compressedUrl = URL.createObjectURL(imageData.compressedBlob);
            compressedImg.src = compressedUrl;
        }

        // Update stats
        const compressedSizeElement = card.querySelector('.compressed-size');
        const compressedDimensionsElement = card.querySelector('.compressed-dimensions');
        const compressionRatioElement = card.querySelector('.compression-ratio');
        const downloadBtn = card.querySelector('.download-single');

        compressedSizeElement.textContent = this.formatFileSize(imageData.compressedSize);
        compressedDimensionsElement.textContent = `${imageData.compressedDimensions.width}×${imageData.compressedDimensions.height}`;

        // Update compression ratio with color coding
        const ratio = Math.round(imageData.compressionRatio);
        compressionRatioElement.textContent = `${ratio}% smaller`;
        compressionRatioElement.classList.remove('hidden', 'good', 'medium', 'low');

        if (ratio >= 50) {
            compressionRatioElement.classList.add('good');
        } else if (ratio >= 20) {
            compressionRatioElement.classList.add('medium');
        } else {
            compressionRatioElement.classList.add('low');
        }

        downloadBtn.disabled = false;
    }

    downloadSingleImage(imageId) {
        const imageData = this.images.get(imageId);
        if (!imageData || !imageData.compressedBlob) return;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(imageData.compressedBlob);

        const extension = this.formatSelect.value === 'jpeg' ? 'jpg' : this.formatSelect.value;
        const baseName = imageData.name.split('.').slice(0, -1).join('.');
        link.download = `${baseName}_compressed.${extension}`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async downloadAllAsZip() {
        const compressedImages = Array.from(this.images.values()).filter(img => img.processed);
        if (compressedImages.length === 0) return;

        this.showStatus('Creating ZIP file...', 'processing');

        try {
            const zip = new JSZip();
            const extension = this.formatSelect.value === 'jpeg' ? 'jpg' : this.formatSelect.value;

            for (const imageData of compressedImages) {
                const baseName = imageData.name.split('.').slice(0, -1).join('.');
                const fileName = `${baseName}_compressed.${extension}`;
                zip.file(fileName, imageData.compressedBlob);
            }

            const content = await zip.generateAsync({ type: 'blob' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'compressed_images.zip';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showStatus(`Downloaded ${compressedImages.length} compressed images`, 'complete');
            setTimeout(() => this.hideStatus(), 3000);
        } catch (error) {
            console.error('ZIP creation error:', error);
            this.showStatus('Error creating ZIP file', 'error');
        }
    }

    removeImage(imageId) {
        const imageData = this.images.get(imageId);
        if (!imageData) return;

        // Clean up object URLs
        if (imageData.originalBlob) URL.revokeObjectURL(URL.createObjectURL(imageData.originalBlob));
        if (imageData.compressedBlob) URL.revokeObjectURL(URL.createObjectURL(imageData.compressedBlob));

        // Remove from map and DOM
        this.images.delete(imageId);
        const card = document.getElementById(`image-${imageId}`);
        if (card) card.remove();

        this.updateUI();
    }

    reset() {
        // Clean up all object URLs
        this.images.forEach(imageData => {
            if (imageData.originalBlob) URL.revokeObjectURL(URL.createObjectURL(imageData.originalBlob));
            if (imageData.compressedBlob) URL.revokeObjectURL(URL.createObjectURL(imageData.compressedBlob));
        });

        this.images.clear();
        this.imagesGrid.innerHTML = '';
        this.fileInput.value = '';
        this.hideProgress();
        this.hideStatus();
        this.updateUI();
    }

    showProgress(percentage) {
        this.progress.classList.remove('hidden');
        this.progressBar.style.width = `${percentage}%`;
    }

    updateProgress(percentage) {
        this.progressBar.style.width = `${percentage}%`;
    }

    hideProgress() {
        this.progress.classList.add('hidden');
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.classList.remove('hidden');
    }

    hideStatus() {
        this.status.classList.add('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new PhotoCompress();
});