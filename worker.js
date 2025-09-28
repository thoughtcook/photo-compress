// Image compression worker to prevent UI blocking
self.onmessage = function(e) {
    const { imageData, options, id } = e.data;

    try {
        compressImage(imageData, options, id);
    } catch (error) {
        self.postMessage({
            id,
            error: error.message
        });
    }
};

async function compressImage(imageData, options, id) {
    const { quality, maxWidth, maxHeight, format } = options;

    try {
        // Create canvas and context
        const canvas = new OffscreenCanvas(1, 1);
        const ctx = canvas.getContext('2d');

        // Create image bitmap from data
        const blob = new Blob([imageData]);
        const imageBitmap = await createImageBitmap(blob);

        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = calculateDimensions(imageBitmap.width, imageBitmap.height, maxWidth, maxHeight);

        // Set canvas size
        canvas.width = width;
        canvas.height = height;

        // Clear canvas and draw image
        ctx.clearRect(0, 0, width, height);

        // Apply image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw the resized image
        ctx.drawImage(imageBitmap, 0, 0, width, height);

        // Convert to blob with specified quality and format
        const compressedBlob = await canvas.convertToBlob({
            type: `image/${format}`,
            quality: format === 'png' ? undefined : quality
        });

        // Convert blob to array buffer for transfer
        const buffer = await compressedBlob.arrayBuffer();

        self.postMessage({
            id,
            compressedData: buffer,
            originalSize: imageData.byteLength,
            compressedSize: buffer.byteLength,
            dimensions: { width, height },
            originalDimensions: { width: imageBitmap.width, height: imageBitmap.height },
            format: format
        });

        // Clean up
        imageBitmap.close();

    } catch (error) {
        self.postMessage({
            id,
            error: error.message
        });
    }
}

function calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
    let width = originalWidth;
    let height = originalHeight;

    // Calculate scale factor to fit within max dimensions
    const scaleX = maxWidth / width;
    const scaleY = maxHeight / height;
    const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

    if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    return { width, height };
}