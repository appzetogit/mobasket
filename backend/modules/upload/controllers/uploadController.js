import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { initializeCloudinary } from '../../../config/cloudinary.js';

export const uploadSingleMedia = async (req, res) => {
  try {
    await initializeCloudinary();

    if (!req.file) {
      return errorResponse(res, 400, 'No file provided');
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 400, 'File buffer is empty or invalid');
    }

    const folder = req.body.folder || 'mobasket/uploads';

    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'auto',
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    if (!result || !result.secure_url) {
      throw new Error('Media upload failed: No secure_url in response');
    }

    return successResponse(res, 200, 'File uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      bytes: result.bytes,
      format: result.format
    });
  } catch (error) {
    const errorMessage = error.message || 'Failed to upload file';
    const providerStatus = Number(error?.http_code || error?.response?.status || 0);
    const statusCode = Number.isInteger(providerStatus) && providerStatus >= 400
      ? providerStatus
      : 500;

    return errorResponse(res, statusCode, `File upload failed: ${errorMessage}`);
  }
};
