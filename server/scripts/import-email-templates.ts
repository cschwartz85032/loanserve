/**
 * Script to import email templates from JSON file
 * Run with: tsx server/scripts/import-email-templates.ts
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '../db';
import { emailTemplateFolders, emailTemplates } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface TemplateData {
  version: string;
  generated_at: string;
  tokens: string[];
  layout: {
    header_md: string;
    footer_md: string;
    remittance_md: string;
  };
  sequences: Array<{
    key: string;
    folder: string;
    trigger: Record<string, any>;
  }>;
  templates: Array<{
    id: string;
    key: string;
    folder: string;
    format: string;
    subject: string;
    body_md: string;
    flags: Record<string, any>;
  }>;
}

async function importEmailTemplates() {
  try {
    console.log('Starting email template import...');
    
    // Read the JSON file
    const jsonPath = join(process.cwd(), 'attached_assets', 'loanserve_letters_v1_1755981044105.json');
    const jsonContent = await readFile(jsonPath, 'utf-8');
    const data: TemplateData = JSON.parse(jsonContent);
    
    console.log(`Found ${data.templates.length} templates to import`);
    
    // Create a map to store folder IDs
    const folderMap = new Map<string, number>();
    
    // Get unique folder names from templates
    const uniqueFolders = [...new Set(data.templates.map(t => t.folder))];
    console.log(`Creating ${uniqueFolders.length} folders: ${uniqueFolders.join(', ')}`);
    
    // Create or get folders
    for (const folderName of uniqueFolders) {
      // Check if folder already exists
      const existing = await db.select()
        .from(emailTemplateFolders)
        .where(eq(emailTemplateFolders.name, folderName))
        .limit(1);
      
      let folderId: number;
      
      if (existing.length > 0) {
        folderId = existing[0].id;
        console.log(`Folder '${folderName}' already exists with ID ${folderId}`);
      } else {
        // Create new folder
        const result = await db.insert(emailTemplateFolders)
          .values({
            name: folderName,
            createdBy: 1 // System user
          })
          .returning();
        
        folderId = result[0].id;
        console.log(`Created folder '${folderName}' with ID ${folderId}`);
      }
      
      folderMap.set(folderName, folderId);
    }
    
    // Store layout templates in system settings
    const layoutTemplates = [
      {
        key: 'email.layout.header',
        name: 'Email Header Template',
        subject: 'Header Layout',
        body: data.layout.header_md,
        folder: 'System'
      },
      {
        key: 'email.layout.footer',
        name: 'Email Footer Template',
        subject: 'Footer Layout',
        body: data.layout.footer_md,
        folder: 'System'
      },
      {
        key: 'email.layout.remittance',
        name: 'Remittance Instructions Template',
        subject: 'Remittance Layout',
        body: data.layout.remittance_md,
        folder: 'System'
      }
    ];
    
    // Create System folder if needed
    const systemFolderExists = await db.select()
      .from(emailTemplateFolders)
      .where(eq(emailTemplateFolders.name, 'System'))
      .limit(1);
    
    let systemFolderId: number;
    if (systemFolderExists.length > 0) {
      systemFolderId = systemFolderExists[0].id;
    } else {
      const result = await db.insert(emailTemplateFolders)
        .values({
          name: 'System',
          createdBy: 1
        })
        .returning();
      systemFolderId = result[0].id;
      console.log(`Created System folder with ID ${systemFolderId}`);
    }
    
    // Import layout templates
    for (const layout of layoutTemplates) {
      // Check if template already exists
      const existing = await db.select()
        .from(emailTemplates)
        .where(eq(emailTemplates.templateKey, layout.key))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing template
        await db.update(emailTemplates)
          .set({
            name: layout.name,
            subject: layout.subject,
            body: layout.body,
            format: 'markdown',
            isActive: true,
            updatedAt: new Date()
          })
          .where(eq(emailTemplates.templateKey, layout.key));
        
        console.log(`Updated layout template: ${layout.key}`);
      } else {
        // Insert new template
        await db.insert(emailTemplates)
          .values({
            templateKey: layout.key,
            name: layout.name,
            subject: layout.subject,
            body: layout.body,
            folderId: systemFolderId,
            format: 'markdown',
            isActive: true,
            createdBy: 1
          });
        
        console.log(`Created layout template: ${layout.key}`);
      }
    }
    
    // Find matching sequence for each template to get trigger info
    const sequenceMap = new Map<string, any>();
    for (const seq of data.sequences) {
      sequenceMap.set(seq.key, seq.trigger);
    }
    
    // Import regular templates
    let importedCount = 0;
    let updatedCount = 0;
    
    for (const template of data.templates) {
      const folderId = folderMap.get(template.folder);
      
      if (!folderId) {
        console.error(`Folder ID not found for template ${template.key} in folder ${template.folder}`);
        continue;
      }
      
      // Get trigger from sequence if available
      const trigger = sequenceMap.get(template.key) || null;
      
      // Check if template already exists
      const existing = await db.select()
        .from(emailTemplates)
        .where(eq(emailTemplates.templateKey, template.key))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing template
        await db.update(emailTemplates)
          .set({
            name: template.key,
            subject: template.subject,
            body: template.body_md,
            folderId: folderId,
            format: template.format || 'markdown',
            flags: template.flags,
            trigger: trigger,
            tokens: data.tokens, // Store all available tokens
            isActive: true,
            updatedAt: new Date()
          })
          .where(eq(emailTemplates.templateKey, template.key));
        
        updatedCount++;
        console.log(`Updated template: ${template.key}`);
      } else {
        // Insert new template
        await db.insert(emailTemplates)
          .values({
            templateKey: template.key,
            name: template.key,
            subject: template.subject,
            body: template.body_md,
            folderId: folderId,
            format: template.format || 'markdown',
            flags: template.flags,
            trigger: trigger,
            tokens: data.tokens, // Store all available tokens
            isActive: true,
            createdBy: 1 // System user
          });
        
        importedCount++;
        console.log(`Imported template: ${template.key}`);
      }
    }
    
    console.log('\n=== Import Summary ===');
    console.log(`Total templates processed: ${data.templates.length}`);
    console.log(`New templates imported: ${importedCount}`);
    console.log(`Existing templates updated: ${updatedCount}`);
    console.log(`Layout templates processed: ${layoutTemplates.length}`);
    console.log(`Folders created/verified: ${uniqueFolders.length + 1}`); // +1 for System folder
    
    console.log('\nEmail template import completed successfully!');
    
  } catch (error) {
    console.error('Error importing email templates:', error);
    process.exit(1);
  }
}

// Run the import
importEmailTemplates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });