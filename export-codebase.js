#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Directories and files to include in the export
const INCLUDE_PATTERNS = [
  'client/src/**/*',
  'server/**/*',
  'shared/**/*',
  'migrations/**/*',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.ts',
  'postcss.config.js',
  'drizzle.config.ts',
  'components.json',
  'replit.md',
  '.env.example'
];

// Directories and files to exclude
const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '*.log',
  '.env',
  '.env.local',
  'server/uploads/*',
  '*.sqlite',
  '*.db'
];

async function exportCodebase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputFile = `loanserve-export-${timestamp}.zip`;
  
  console.log('Starting codebase export...');
  console.log(`Output file: ${outputFile}`);
  
  // Create a write stream for the zip file
  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });
  
  // Handle stream events
  output.on('close', () => {
    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`\n✅ Export complete!`);
    console.log(`📦 Archive created: ${outputFile}`);
    console.log(`📊 Size: ${sizeInMB} MB`);
    console.log(`📁 Total files: ${archive.pointer()} bytes written`);
    
    // Also create a file listing
    createFileListing(timestamp);
  });
  
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Warning:', err.message);
    } else {
      throw err;
    }
  });
  
  archive.on('error', (err) => {
    throw err;
  });
  
  // Pipe archive data to the file
  archive.pipe(output);
  
  // Add files based on patterns
  console.log('\nAdding files to archive:');
  
  // Add client files
  if (fs.existsSync('client')) {
    console.log('  ✓ Client application files');
    archive.directory('client/src/', 'client/src');
    archive.directory('client/public/', 'client/public', { name: 'public' });
  }
  
  // Add server files
  if (fs.existsSync('server')) {
    console.log('  ✓ Server application files');
    archive.glob('server/**/*.{ts,js,json}', {
      ignore: ['server/uploads/**', 'server/**/*.log']
    });
  }
  
  // Add shared files
  if (fs.existsSync('shared')) {
    console.log('  ✓ Shared schema and types');
    archive.directory('shared/', 'shared');
  }
  
  // Add migration files
  if (fs.existsSync('migrations')) {
    console.log('  ✓ Database migrations');
    archive.directory('migrations/', 'migrations');
  }
  
  // Add configuration files
  const configFiles = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
    'drizzle.config.ts',
    'components.json',
    'replit.md'
  ];
  
  console.log('  ✓ Configuration files');
  configFiles.forEach(file => {
    if (fs.existsSync(file)) {
      archive.file(file, { name: file });
    }
  });
  
  // Create an .env.example if it doesn't exist
  if (!fs.existsSync('.env.example')) {
    const envExample = `# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Authentication
SESSION_SECRET=your-session-secret-here

# Email Service
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# AI Services
OPENAI_API_KEY=your-openai-api-key
XAI_API_KEY=your-xai-api-key

# Object Storage
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your-bucket-id
PUBLIC_OBJECT_SEARCH_PATHS=/bucket/public
PRIVATE_OBJECT_DIR=/bucket/private
`;
    fs.writeFileSync('.env.example', envExample);
  }
  archive.file('.env.example', { name: '.env.example' });
  
  // Finalize the archive
  await archive.finalize();
}

function createFileListing(timestamp) {
  const listingFile = `loanserve-files-${timestamp}.txt`;
  let fileList = 'LOANSERVE PRO - FILE LISTING\n';
  fileList += '=' .repeat(80) + '\n\n';
  
  function scanDirectory(dir, indent = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    items.forEach(item => {
      const fullPath = path.join(dir, item.name);
      
      // Skip excluded items
      if (item.name === 'node_modules' || 
          item.name === '.git' || 
          item.name === 'dist' ||
          item.name === 'uploads' ||
          item.name.endsWith('.log')) {
        return;
      }
      
      if (item.isDirectory()) {
        fileList += `${indent}📁 ${item.name}/\n`;
        scanDirectory(fullPath, indent + '  ');
      } else {
        const stats = fs.statSync(fullPath);
        const size = (stats.size / 1024).toFixed(1);
        const ext = path.extname(item.name).toLowerCase();
        
        let icon = '📄';
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) icon = '📜';
        else if (['.json', '.md'].includes(ext)) icon = '📋';
        else if (['.css', '.scss'].includes(ext)) icon = '🎨';
        else if (['.sql'].includes(ext)) icon = '🗃️';
        
        fileList += `${indent}${icon} ${item.name} (${size} KB)\n`;
      }
    });
  }
  
  // Scan main directories
  const mainDirs = ['client/src', 'server', 'shared', 'migrations'];
  mainDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fileList += `\n${dir.toUpperCase()}\n`;
      fileList += '-'.repeat(40) + '\n';
      scanDirectory(dir);
    }
  });
  
  fs.writeFileSync(listingFile, fileList);
  console.log(`\n📋 File listing created: ${listingFile}`);
}

// Run the export
exportCodebase().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});