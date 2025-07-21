const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Draco compression script for AWS Lambda
// This script compresses GLB files using gltf-transform with Draco compression

function compressGLB(inputPath, outputPath) {
  try {
    console.log(`Starting Draco compression for: ${inputPath}`);
    
    // Use gltf-transform to compress with Draco
    const command = `npx gltf-transform draco ${inputPath} ${outputPath} --method edgebreaker --encodeSpeed 5 --decodeSpeed 5`;
    
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
    
    // Get file sizes for comparison
    const originalSize = fs.statSync(inputPath).size;
    const compressedSize = fs.statSync(outputPath).size;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
    
    console.log(`Compression complete!`);
    console.log(`Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Compression ratio: ${compressionRatio}%`);
    
    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: parseFloat(compressionRatio)
    };
  } catch (error) {
    console.error('Compression failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Lambda handler function
exports.handler = async (event) => {
  console.log('Lambda event:', JSON.stringify(event, null, 2));
  
  try {
    // Parse S3 event
    const s3Event = event.Records[0].s3;
    const bucketName = s3Event.bucket.name;
    const objectKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));
    
    console.log(`Processing file: ${bucketName}/${objectKey}`);
    
    // Check if it's a GLB file
    if (!objectKey.toLowerCase().endsWith('.glb')) {
      console.log('Not a GLB file, skipping compression');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Not a GLB file, skipping compression' })
      };
    }
    
    // Download file from S3
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3();
    
    const downloadParams = {
      Bucket: bucketName,
      Key: objectKey
    };
    
    console.log('Downloading file from S3...');
    const fileData = await s3.getObject(downloadParams).promise();
    
    // Create temporary file paths
    const tempDir = '/tmp';
    const inputPath = path.join(tempDir, 'input.glb');
    const outputPath = path.join(tempDir, 'output.glb');
    
    // Write downloaded file to temp directory
    fs.writeFileSync(inputPath, fileData.Body);
    console.log(`File downloaded to: ${inputPath}`);
    
    // Compress the file
    const result = compressGLB(inputPath, outputPath);
    
    if (!result.success) {
      throw new Error(`Compression failed: ${result.error}`);
    }
    
    // Upload compressed file back to S3
    const compressedKey = objectKey.replace('uploads/', 'compressed/');
    const uploadParams = {
      Bucket: bucketName,
      Key: compressedKey,
      Body: fs.readFileSync(outputPath),
      ContentType: 'model/gltf-binary'
    };
    
    console.log(`Uploading compressed file to: ${bucketName}/${compressedKey}`);
    await s3.upload(uploadParams).promise();
    
    // Clean up temporary files
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);
    
    console.log('Compression and upload completed successfully');
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'File compressed and uploaded successfully',
        originalKey: objectKey,
        compressedKey: compressedKey,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: result.compressionRatio
      })
    };
    
  } catch (error) {
    console.error('Lambda execution failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Compression failed',
        message: error.message
      })
    };
  }
};

// For local testing
if (require.main === module) {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3];
  
  if (!inputFile || !outputFile) {
    console.log('Usage: node compress-glb.js <input-file> <output-file>');
    process.exit(1);
  }
  
  const result = compressGLB(inputFile, outputFile);
  if (result.success) {
    console.log('Local compression completed successfully');
  } else {
    console.error('Local compression failed');
    process.exit(1);
  }
}