import { Router } from 'express';
import { sendReleaseNotes } from '../controllers/releaseNotesController';

const router = Router();

router.post('/send', sendReleaseNotes);

export default router;
