import { Router } from 'express';
import { PaymentArtifactService } from '../services/payment-artifact';

const router = Router();
const artifactService = new PaymentArtifactService();

// Store artifact metadata
router.post('/', async (req, res) => {
  try {
    const artifact = await artifactService.storeArtifact(req.body);
    res.status(201).json(artifact);
  } catch (error: any) {
    console.error('[PaymentArtifact] Error storing artifact:', error);
    res.status(400).json({ error: error.message });
  }
});

// Store multiple artifacts
router.post('/batch', async (req, res) => {
  try {
    const { artifacts } = req.body;
    if (!Array.isArray(artifacts)) {
      return res.status(400).json({ error: 'artifacts must be an array' });
    }
    
    const stored = await artifactService.storeArtifacts(artifacts);
    res.status(201).json({ artifacts: stored });
  } catch (error: any) {
    console.error('[PaymentArtifact] Error storing artifacts:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get artifacts by ingestion ID
router.get('/ingestion/:ingestionId', async (req, res) => {
  try {
    const artifacts = await artifactService.getArtifactsByIngestionId(
      req.params.ingestionId
    );
    res.json({ artifacts });
  } catch (error: any) {
    console.error('[PaymentArtifact] Error fetching artifacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific artifact by ingestion ID and type
router.get('/ingestion/:ingestionId/type/:type', async (req, res) => {
  try {
    const artifact = await artifactService.getArtifactByIngestionAndType(
      req.params.ingestionId,
      req.params.type
    );
    
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }
    
    res.json(artifact);
  } catch (error: any) {
    console.error('[PaymentArtifact] Error fetching artifact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify artifact hash
router.post('/:id/verify', async (req, res) => {
  try {
    const result = await artifactService.verifyArtifactHash(req.params.id);
    res.json(result);
  } catch (error: any) {
    console.error('[PaymentArtifact] Error verifying artifact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete artifacts by ingestion ID (for testing cascade)
router.delete('/ingestion/:ingestionId', async (req, res) => {
  try {
    await artifactService.deleteArtifactsByIngestionId(req.params.ingestionId);
    res.status(204).send();
  } catch (error: any) {
    console.error('[PaymentArtifact] Error deleting artifacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;