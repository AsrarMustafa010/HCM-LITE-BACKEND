const cloudinary = require('cloudinary').v2;

const isConfigured = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

if (isConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const uploadImage = async (fileBufferOrBase64, folder = 'hcm_lite') => {
  if (!isConfigured()) {
    // If not configured, return as base64 data URI or simulated link
    if (typeof fileBufferOrBase64 === 'string' && fileBufferOrBase64.startsWith('data:image')) {
      return { url: fileBufferOrBase64, public_id: 'local_base64' };
    }
    return { url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', public_id: 'sample_avatar' };
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );

    if (Buffer.isBuffer(fileBufferOrBase64)) {
      uploadStream.end(fileBufferOrBase64);
    } else if (typeof fileBufferOrBase64 === 'string') {
      cloudinary.uploader.upload(fileBufferOrBase64, { folder })
        .then((res) => resolve({ url: res.secure_url, public_id: res.public_id }))
        .catch(reject);
    } else {
      resolve({ url: '', public_id: '' });
    }
  });
};

module.exports = {
  uploadImage,
  isConfigured
};
