const fs = require('fs');
const gltfPipeline = require('gltf-pipeline');

async function compressGLB(inputPath, outputPath) {
  const glb = fs.readFileSync(inputPath);
  const options = { dracoOptions: { compressionLevel: 10 } };
  const results = await gltfPipeline.processGlb(glb, options);
  fs.writeFileSync(outputPath, results.glb);
  console.log('Compression complete:', outputPath);
}

// Example usage: node compress-glb.js input.glb output.glb
if (require.main === module) {
  const [,, input, output] = process.argv;
  if (!input || !output) {
    console.log('Usage: node compress-glb.js input.glb output.glb');
    process.exit(1);
  }
  compressGLB(input, output);
}y